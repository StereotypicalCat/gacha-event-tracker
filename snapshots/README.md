# Snapshots

Raw pages, exactly as fetched. `scripts/refresh-sources.ts` writes them; nothing else fetches.

```
<source-id>.html        the body verbatim — tracked
<source-id>.meta.json   hash, size, charset, ETag, Last-Modified, contentChangedAt, lastConfirmedAt — tracked
<source-id>.state.json  transient run bookkeeping: last attempt and failure streak — gitignored
```

"Verbatim" means the bytes as served, not text we re-encoded. `charset` in the metadata records
what those bytes are in — the `Content-Type` header, else a `<meta charset>` in the page, else
UTF-8 — and `bytes` is the served length. A page in Shift_JIS or Latin-1 decoded as UTF-8 would be
stored as a field of U+FFFD with the original bytes gone; re-parsing could never recover it, and the
mojibake would reach `slugify`, moving every event ID for that source (AGENTS.md § Event IDs are
localStorage keys).

Every file is written to a sibling `.tmp-*` and renamed into place, body before metadata, so an
interrupted run leaves a stray temp file rather than a truncated snapshot or metadata describing
bytes that were never stored. Those temp files are gitignored: `refresh.yml` commits the whole
directory, so otherwise a run killed mid-write would pin a half-page in git forever.

Three reasons this is committed rather than cached:

- **Re-parsing never re-fetches.** Iterating on a parser reads these files, not the wikis
  (AGENTS.md § Scraping conduct).
- **A refresh is reviewable.** The commit diff is the page diff, so "an event vanished" is a
  question you can answer from git rather than from a wiki that has since changed again.
- **The build stays offline.** `bun run build:feed` parses whichever of these exists and falls back
  to `fixtures/` otherwise, so a clean checkout and the container build work with no network.

The `.state.json` files track transient check attempts and failure streaks. When a source is
confirmed (200 or 304), `lastConfirmedAt` is recorded in `<source-id>.meta.json` so downstream builds
(including GitHub Pages, which deploys from git without access to the Gitea Actions cache) know the
exact time the source was confirmed current.

The metadata is also rewritten on an unchanged page when the server rotates an `ETag` or
`Last-Modified` while serving the same bytes. Keeping the old validator would mean sending a stale
`If-None-Match` forever and being served the whole page every cycle, so that diff is worth the
commit — `contentChangedAt` and the body stay put, so it is still visibly not a content change.

Fixtures are not the same thing. A fixture is pinned to a date and kept forever as the regression
test for a page shape; a snapshot is the current page and is overwritten each time it changes.
