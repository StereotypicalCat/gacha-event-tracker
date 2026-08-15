# Snapshots

Raw pages, exactly as fetched. `scripts/refresh-sources.ts` writes them; nothing else fetches.

```
<source-id>.html        the body verbatim — tracked
<source-id>.meta.json   hash, size, ETag, Last-Modified, when the bytes last changed — tracked
<source-id>.state.json  when we last checked, and failure streak — gitignored
```

Three reasons this is committed rather than cached:

- **Re-parsing never re-fetches.** Iterating on a parser reads these files, not the wikis
  (CLAUDE.md § Scraping conduct).
- **A refresh is reviewable.** The commit diff is the page diff, so "an event vanished" is a
  question you can answer from git rather than from a wiki that has since changed again.
- **The build stays offline.** `bun run build:feed` parses whichever of these exists and falls back
  to `fixtures/` otherwise, so a clean checkout and the container build work with no network.

The `.state.json` files are the exception: they change every cycle whether or not a page did, and
committing them would mean a commit per run saying nothing happened. CI keeps them in the actions
cache instead.

Fixtures are not the same thing. A fixture is pinned to a date and kept forever as the regression
test for a page shape; a snapshot is the current page and is overwritten each time it changes.
