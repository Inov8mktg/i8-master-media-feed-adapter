# I8 Master Media Feed Adapter — Two-Source Proof

Deterministically merges exactly two approved YouTube Atom feeds into one public Atom feed:

- Nate Herk
- Dominic Baptist

The merger fetches both sources, parses XML with `fast-xml-parser`, normalizes entries, deduplicates by YouTube video ID, sorts newest first, and renders standards-valid Atom. If one source fails, the healthy source is still published with a source-error note. If both fail, generation fails closed and the previous successful GitHub Pages deployment remains live.

## Commands

```sh
npm ci
npm run verify
```

Output: `dist/feed.atom`

Public feed target: `https://inov8mktg.github.io/i8-master-media-feed-adapter/feed.atom`

GitHub Actions refreshes the static feed twice per hour because GitHub Pages cannot fetch upstream data at request time. This schedule is the minimum runtime mechanism needed for the packet-authorized static-hosting fallback.

## Security

No application secrets, tokens, cookies, databases, or user inputs are used. The workflow needs only GitHub's built-in, short-lived Pages permissions. `.env*`, logs, build output, and dependencies are excluded from Git.

## Manual Transcript.LOL acceptance gate

In Transcript.LOL, replace the currently monitored direct creator RSS URL with the public merged `feed.atom` URL, save it as one automation, then confirm the accepted feed imports at least one Nate Herk item and one Dominic Baptist item.

## Bounded expansion path — do not execute in this proof

Add each remaining approved creator as one object in `sources.mjs`; no other code or architecture change is required. Re-run the same tests and live validation before deployment. This proof intentionally contains only the two approved sources above.
