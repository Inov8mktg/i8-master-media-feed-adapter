import { XMLParser, XMLValidator } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => name === "entry" || name === "link",
});

function text(value) {
  if (value == null) return "";
  if (typeof value === "object" && "#text" in value) return String(value["#text"]);
  return String(value);
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function canonicalVideoUrl(videoId) {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

export function parseYoutubeFeed(xml, source) {
  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    throw new Error(`Invalid upstream XML for ${source.name}: ${validation.err.msg}`);
  }

  const feed = parser.parse(xml)?.feed;
  if (!feed || !Array.isArray(feed.entry)) {
    throw new Error(`Missing Atom feed entries for ${source.name}`);
  }

  return feed.entry.map((entry) => {
    const alternate = (entry.link ?? []).find((link) => link?.["@_rel"] === "alternate");
    const rawUrl = text(alternate?.["@_href"]);
    const videoId = text(entry["yt:videoId"]) || new URL(rawUrl).searchParams.get("v") || "";
    const published = text(entry.published);
    const publishedMs = Date.parse(published);

    if (!videoId || !text(entry.title) || !Number.isFinite(publishedMs)) {
      throw new Error(`Malformed YouTube entry from ${source.name}`);
    }

    return {
      id: `youtube:${videoId}`,
      videoId,
      title: text(entry.title),
      creator: source.name,
      sourceKey: source.key,
      sourceChannelId: source.channelId,
      published,
      publishedMs,
      updated: text(entry.updated) || published,
      url: canonicalVideoUrl(videoId),
    };
  });
}

export function mergeEntries(entryGroups) {
  const byVideoId = new Map();
  for (const entry of entryGroups.flat()) {
    const current = byVideoId.get(entry.videoId);
    if (!current || entry.updated > current.updated) byVideoId.set(entry.videoId, entry);
  }
  return [...byVideoId.values()].sort(
    (a, b) => b.publishedMs - a.publishedMs || a.videoId.localeCompare(b.videoId),
  );
}

export function renderAtom(entries, { selfUrl, sourceErrors = [] } = {}) {
  if (!entries.length) throw new Error("Cannot render an empty merged feed");
  const updated = entries.reduce(
    (latest, entry) => (entry.updated > latest ? entry.updated : latest),
    entries[0].updated,
  );
  const subtitle = sourceErrors.length
    ? `Two-source I8 media feed; temporarily unavailable: ${sourceErrors.map((x) => x.source).join(", ")}`
    : "Deterministic merged YouTube feed for Nate Herk and Dominic Baptist";

  const itemXml = entries.map((entry) => `  <entry>
    <id>urn:youtube:video:${escapeXml(entry.videoId)}</id>
    <title>${escapeXml(entry.title)}</title>
    <published>${escapeXml(entry.published)}</published>
    <updated>${escapeXml(entry.updated)}</updated>
    <link rel="alternate" type="text/html" href="${escapeXml(entry.url)}" />
    <author><name>${escapeXml(entry.creator)}</name></author>
    <category scheme="urn:i8:creator" term="${escapeXml(entry.sourceKey)}" label="${escapeXml(entry.creator)}" />
    <yt:videoId>${escapeXml(entry.videoId)}</yt:videoId>
    <yt:channelId>${escapeXml(entry.sourceChannelId)}</yt:channelId>
  </entry>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015">
  <id>urn:i8:media-feed:nate-herk+dominic-baptist</id>
  <title>I8 Master Media Feed — Nate Herk + Dominic Baptist</title>
  <subtitle>${escapeXml(subtitle)}</subtitle>
  <updated>${escapeXml(updated)}</updated>
  <link rel="self" type="application/atom+xml" href="${escapeXml(selfUrl)}" />
${itemXml}
</feed>
`;
}

async function fetchSource(source, fetchImpl, timeoutMs) {
  const response = await fetchImpl(source.url, {
    headers: { "user-agent": "I8-Master-Media-Feed-Adapter/1.0" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseYoutubeFeed(await response.text(), source);
}

export async function generateMergedFeed({
  sources,
  selfUrl,
  fetchImpl = fetch,
  timeoutMs = 15_000,
} = {}) {
  const settled = await Promise.allSettled(
    sources.map((source) => fetchSource(source, fetchImpl, timeoutMs)),
  );
  const entryGroups = [];
  const sourceErrors = [];

  settled.forEach((result, index) => {
    if (result.status === "fulfilled") entryGroups.push(result.value);
    else sourceErrors.push({ source: sources[index].name, error: result.reason?.message ?? "Unknown error" });
  });

  if (!entryGroups.length) {
    throw new AggregateError(
      settled.filter((x) => x.status === "rejected").map((x) => x.reason),
      "All upstream feeds failed",
    );
  }

  const entries = mergeEntries(entryGroups);
  return {
    xml: renderAtom(entries, { selfUrl, sourceErrors }),
    entries,
    sourceErrors,
  };
}
