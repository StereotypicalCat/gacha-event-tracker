# Battle pass windows as feed events — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Five new sources put the current battle pass windows of Star Rail, ZZZ, Genshin (Miliastra), Endfield and Infinity Nikki into the feed.

**Architecture:** One `SOURCES` entry per page; two new site templates (a Fandom dated history table, a version table on Fandom and wiki.gg); each source pinned by a fixture and `.expected.json`. No schema change.

**Tech Stack:** Bun, TypeScript, bun:test; the ingest pipeline in `src/ingest/`.

**Spec:** `docs/superpowers/specs/2026-10-16-pass-windows-design.md`

## Global Constraints

- AGENTS.md § Working on parsers and § Scraping conduct govern every task: parsers pure (`ctx.now` only); skip, never guess; `canParse` structural; robots read and recorded before any fetch beyond robots.txt; each page fetched once for its fixture.
- Fandom pages via `https://<wiki>.fandom.com/api.php?action=parse&page=<Page>&prop=text&formatversion=2&format=json`, as the existing Fandom sources.
- Type `other`. Day precision where the page gives no time. No new `EventType`.
- Rows that ended before `ctx.now` are not emitted.
- Titles exactly as the spec's § Sources table. Event IDs from `eventId` (game + title + start).
- Every commit green: `bun test`, `bun run typecheck`. Messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work on branch `feat/pass-windows` in a worktree; push to `origin` only.

## Review Focus

1. A history table whose current row has an end later than `now` but a start in the past — emitted; a row wholly in the past — not; a future row — emitted (upcoming). Pinned per source by a fixture at a fixed `now`.
2. A table where a row lacks an end date — skipped, never given an invented end.
3. `canParse` of each new template false on every other stored fixture (no template steals another's page).
4. Endfield's version window carries per-server ends (UTC+8 Asia; UTC-5 America/Europe) and is the *current* version, not the previous one, at the fixture's `now`.
5. `bun run build:feed` against fixtures: exactly the new events appear; no existing event ID changes (diff the built feed's ids before/after).

---

### Task 1: Star Rail — Nameless Honor (first Fandom history-table source)

Dispatch the `adapter-author` agent with: source id `hsr-fandom-nameless-honor`, game `hsr`, URL `https://honkai-star-rail.fandom.com/api.php?action=parse&page=Nameless_Honor&prop=text&formatversion=2&format=json`, title "Nameless Honor", the spec path, and these requirements:

- [ ] Robots for honkai-star-rail.fandom.com read and recorded in the entry's comment (as `genshin-fandom-events`' comment does).
- [ ] Fixture captured; structure dumped; the dated table identified by its headings.
- [ ] A history-table reader for Fandom (new module if it shares nothing with `fandom.ts`'s event templates), registered under a new parser id, with `canParse` on the table's headings.
- [ ] `.expected.json` at the fixture's `now` holds exactly the current row: start 2026-09-28, end 2026-11-09, day precision; earlier rows absent.
- [ ] The source added to the shared fixture test cases (see the agent's step 5) so the common assertions apply.
- [ ] `docs/SOURCES.md` section; `docs/INGESTION.md` template note.
- [ ] Commit `feat(sources): Star Rail's Nameless Honor pass windows from Fandom`.

Verify myself: `bun test`, `bun run typecheck`, `bun run parse hsr-fandom-nameless-honor <fixture> --json` matches the quote in the spec.

### Task 2: ZZZ — New Eridu City Fund

Same reader as Task 1 (reuse; extend only if the table differs). Source `zzz-fandom-city-fund`, URL on zenless-zone-zero.fandom.com, page `New_Eridu_City_Fund`, title "New Eridu City Fund". Expected current row 2026-09-09 → 2026-10-19. Commit `feat(sources): ZZZ's City Fund pass windows from Fandom`.

### Task 3: Genshin — Miliastra Pass

Same reader. Source `genshin-fandom-miliastra-pass`, page `Miliastra_Pass`, title "Miliastra Pass: <name>" with the row's name (today "Silvery Moonlight Chronicle"), 2026-09-23 → 2026-11-02. **Fixture name must not collide** with `genshin-fandom-events`' fixtures in `build-feed`'s `<site>-*` selection — follow the agent's naming rule and check `scripts/build-feed.ts`. Commit `feat(sources): Genshin's Miliastra Pass windows from Fandom`.

### Task 4: Infinity Nikki — Mira Journey from the Version table

Source `nikki-fandom-mira-journey`, page `Version` on infinity-nikki.fandom.com. A version-table reader: the current row (start ≤ now < end, or the next upcoming row) becomes one event titled "Mira Journey", with summary "Follows the version (2.10: The Feather of Justice); that the pass ends with the version was confirmed in game, 2026-10-16." built from the row. The title and evidence come from a per-source table in the module (spec § Shape in code), entry for `nikki-fandom-mira-journey` citing the owner's reading. Expected: 2026-09-23 → 2026-10-29, day precision. `canParse` false on `nikki-fandom-events`' fixture. Commit `feat(sources): Infinity Nikki's Mira Journey window, from its version`.

### Task 5: Endfield — Protocol Pass from the version

Source `endfield-wikigg-protocol-pass` on endfield.wiki.gg via its api.php (robots: `/` allowed for `*`; re-read). Find a **stable** page dating versions (the `Version` page, or another stable one) — never a per-version URL. Emit "Protocol Pass" for the current version with per-server timers if the page states them (Asia 2026-10-15 12:00 → 2026-11-25 06:00 UTC+8; America/Europe 2026-10-14 23:00 → 2026-11-24 17:00 UTC-5), else day precision; evidence entry quotes the Protocol Pass page's "available until end of version". If no stable page dates the version, stop and report — do not ship from a per-version URL. Commit `feat(sources): Endfield's Protocol Pass window, from its version`.

### Task 6: Whole-feed check, docs, TODO, changelog

- [ ] `bun run build:feed` (offline, fixtures) before and after the branch; diff event ids — only the five new ones added.
- [ ] AGENTS.md § Working on parsers: update the parser count/list sentence.
- [ ] TODO.md: sub-project 3 done with a pointer to the spec; follow-ups: Wuwa Pioneer Podcast and Oscillated Coral, NTE Circle Bounty (spec § Not shipped).
- [ ] Changelog: one `games` entry naming the last source commit, plus a release note `pass-windows`; `bun run scripts/check-changelog.ts`.
- [ ] Final whole-branch review (fresh reviewer, most capable model) with the Review Focus above; fix Critical/Important with a failing test first.
- [ ] Fast-forward `main`, push to `origin`.
