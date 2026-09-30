import { readFile } from "node:fs/promises";
import { XMLParser, XMLValidator } from "fast-xml-parser";

const xml = await readFile("dist/feed.atom", "utf8");
const validation = XMLValidator.validate(xml);
if (validation !== true) throw new Error(`Generated XML is invalid: ${validation.err.msg}`);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  isArray: (name) => name === "entry",
});
const entries = parser.parse(xml)?.feed?.entry ?? [];
const ids = entries.map((entry) => String(entry["yt:videoId"]));
const creators = entries.map((entry) => String(entry.author?.name));
const dates = entries.map((entry) => Date.parse(String(entry.published)));
const ordered = dates.every((date, index) => index === 0 || dates[index - 1] >= date);

const checks = {
  xmlValid: true,
  entryCount: entries.length,
  creators: [...new Set(creators)].sort(),
  bothCreatorsPresent: creators.includes("Nate Herk") && creators.includes("Dominic Baptist"),
  duplicateVideoIds: ids.length - new Set(ids).size,
  newestFirst: ordered,
  canonicalUrls: entries.every((entry) => String(entry.link?.["@_href"] ?? "").startsWith("https://www.youtube.com/watch?v=")),
};

if (!checks.entryCount || !checks.bothCreatorsPresent || checks.duplicateVideoIds || !checks.newestFirst || !checks.canonicalUrls) {
  throw new Error(`Feed validation failed: ${JSON.stringify(checks)}`);
}
console.log(JSON.stringify(checks));
