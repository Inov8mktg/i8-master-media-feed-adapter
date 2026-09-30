import { mkdir, writeFile } from "node:fs/promises";
import { generateMergedFeed } from "./merge.mjs";
import { SOURCES } from "./sources.mjs";

const selfUrl = process.env.FEED_SELF_URL
  || "https://inov8mktg.github.io/i8-master-media-feed-adapter/feed.atom";

const result = await generateMergedFeed({ sources: SOURCES, selfUrl });
await mkdir("dist", { recursive: true });
await writeFile("dist/feed.atom", result.xml, "utf8");

console.log(JSON.stringify({
  status: "PASS",
  entries: result.entries.length,
  creators: [...new Set(result.entries.map((entry) => entry.creator))],
  newest: result.entries[0]?.published,
  sourceErrors: result.sourceErrors,
  output: "dist/feed.atom",
}));
