import test from "node:test";
import assert from "node:assert/strict";
import { XMLValidator } from "fast-xml-parser";
import { generateMergedFeed } from "./merge.mjs";

const sources = [
  { key: "nate-herk", name: "Nate Herk", channelId: "nate-channel", url: "https://test/nate" },
  { key: "dominic-baptist", name: "Dominic Baptist", channelId: "dominic-channel", url: "https://test/dominic" },
];

function atom(entries) {
  return `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015">${entries.map((entry) => `
    <entry><id>yt:video:${entry.id}</id><yt:videoId>${entry.id}</yt:videoId><title>${entry.title}</title><published>${entry.published}</published><updated>${entry.published}</updated><link rel="alternate" href="https://www.youtube.com/watch?v=${entry.id}" /></entry>`).join("")}</feed>`;
}

const upstream = new Map([
  [sources[0].url, atom([
    { id: "shared", title: "Shared newest", published: "2026-09-30T18:00:00Z" },
    { id: "nate-1", title: "Nate older", published: "2026-09-28T18:00:00Z" },
  ])],
  [sources[1].url, atom([
    { id: "dominic-1", title: "Dominic middle", published: "2026-09-29T18:00:00Z" },
    { id: "shared", title: "Shared newest", published: "2026-09-30T18:00:00Z" },
  ])],
]);

const okFetch = async (url) => new Response(upstream.get(url), { status: 200 });

test("merges, deduplicates, orders, preserves creators, and renders valid Atom", async () => {
  const result = await generateMergedFeed({ sources, selfUrl: "https://example.test/feed.atom", fetchImpl: okFetch });
  assert.equal(XMLValidator.validate(result.xml), true);
  assert.deepEqual(result.entries.map((entry) => entry.videoId), ["shared", "dominic-1", "nate-1"]);
  assert.equal(new Set(result.entries.map((entry) => entry.videoId)).size, result.entries.length);
  assert.deepEqual([...new Set(result.entries.map((entry) => entry.creator))].sort(), ["Dominic Baptist", "Nate Herk"]);
  assert.match(result.xml, /type="application\/atom\+xml"/);
});

test("one upstream failure still produces valid XML from the healthy source", async () => {
  const fetchImpl = async (url) => {
    if (url === sources[1].url) return new Response("unavailable", { status: 503 });
    return new Response(upstream.get(url), { status: 200 });
  };
  const result = await generateMergedFeed({ sources, selfUrl: "https://example.test/feed.atom", fetchImpl });
  assert.equal(XMLValidator.validate(result.xml), true);
  assert.equal(result.sourceErrors.length, 1);
  assert.equal(result.sourceErrors[0].source, "Dominic Baptist");
  assert.ok(result.entries.every((entry) => entry.creator === "Nate Herk"));
});

test("both upstream failures fail closed instead of emitting malformed XML", async () => {
  await assert.rejects(
    generateMergedFeed({
      sources,
      selfUrl: "https://example.test/feed.atom",
      fetchImpl: async () => new Response("unavailable", { status: 503 }),
    }),
    /All upstream feeds failed/,
  );
});
