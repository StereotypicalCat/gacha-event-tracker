# Exact End Times Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A live Genshin or Miliastra row shows the end its Fandom article states, to the minute, and otherwise behaves as today.

**Architecture:** The refresh stores the lead section of each listed event's article beside the other snapshots. The feed build parses those offline: `fandom.ts` uses them only to decide currency, and a pure step after `mergeEvents` writes the stated end onto the merged survivor.

**Tech Stack:** Bun 1.3, TypeScript strict, `bun test`. No new dependency.

**Spec:** `docs/superpowers/specs/2026-11-07-exact-end-times-design.md`

## Global Constraints

- `id`, `startsAt`, `sourceUrl`, `sourceId` and `classification` are never changed by this work.
- Only `genshin-fandom-events` rows are read. Other games are out of scope.
- The build and all tests never touch the network. Tests never need build output.
- No time is invented: only the `data-source="time_end"` infobox cell, in one of two printed shapes.
- Stored times are as printed (14:59, not 15:00).
- Article failures never affect a source's failure streak, health or broken-source count.
- Stage by path; a commit is its own command, never chained with an edit (AGENTS.md).

## Review Focus

- A percent-encoded title (`The_Forge_Realm%27s_Temper/2026-11-04`) must reach the API decoded and keep one stable file name. Test in Task 2.
- Two table rows linking the same article make one request per cycle. Test in Task 2.
- A row with no article link, whose `sourceUrl` is the API URL, makes no request and stays on fallback. Test in Task 2.
- An empty or unparsable source snapshot deletes no stored articles and throws nothing. Test in Task 2.
- A build with no `snapshots/articles` directory, as on a clean checkout, works and changes nothing. Test in Task 1.

---

### Task 1: Read and apply a stated end, and keep a live row live

**Files:**
- Create: `src/ingest/articleEnds.ts`
- Create: `fixtures/genshin/articles/hour-of-ruin-2026-11-07.html` (server time), `raiment-collection-2026-11-04-2026-11-07.html` (GMT+8): `section=0` API responses, captured once
- Modify: `src/ingest/adapters/types.ts` (`ParseContext`), `src/ingest/parsers/fandom.ts` (`parseGenshinEvents` currency check)
- Test: `test/article-ends.test.ts`

**Interfaces:**
- Produces, from `src/ingest/articleEnds.ts`:
  - `interface StatedEnd { day: string /* YYYY-MM-DD as printed */; endsAt: string; regionEnds: Record<Region, string> | null }`
  - `parseArticleEnd(body: string): StatedEnd | null`: `body` is the API's JSON; anything malformed is `null`
  - `articleTitle(sourceUrl: string): string | null`: decoded page title for a `genshin-impact.fandom.com/wiki/…` URL, else `null`
  - `latestStatedMs(end: StatedEnd): number`
  - `applyArticleEnds(merged: GachaEvent[], listed: GachaEvent[], ends: ReadonlyMap<string, StatedEnd>, warn: (line: string) => void): GachaEvent[]`, where `listed` is the Fandom parse before merging and `ends` is keyed by `articleTitle`
- Produces on `ParseContext`: optional `articleEnds?: ReadonlyMap<string, StatedEnd>`

- [ ] **Step 1: Capture the two fixtures** with one request each, using the `section=0` URL from spec decision 5.

- [ ] **Step 2: Write the failing tests** in `test/article-ends.test.ts`

```ts
test("server time gives every region its own end", () => {
  const end = parseArticleEnd(hourOfRuinFixture)!;
  expect(end.day).toBe("2026-12-15");
  expect(end.regionEnds).toEqual({
    asia: "2026-12-15T06:59:00.000Z",
    europe: "2026-12-15T13:59:00.000Z",
    america: "2026-12-15T19:59:00.000Z",
  });
  expect(end.endsAt).toBe("2026-12-15T06:59:00.000Z"); // earliest, as wikigg.ts does
});
test("GMT+8 is one instant", () => {
  const end = parseArticleEnd(raimentFixture)!;
  expect(end).toEqual({ day: "2026-12-16", endsAt: "2026-12-15T21:59:00.000Z", regionEnds: null });
});
test.each(["December 15, 2026", "TBA", "December 15, 2026 14:59 UTC", "December 15, 2026 14:59 GMT+9", ""])(
  "%s is no usable time", /* fixture with the cell text replaced → null */);
test("malformed JSON and a page with no infobox are null");
test("the End header cell is not mistaken for the value"); // the <th> carries data-source too
test("a merged Game8 survivor takes the end through mergedIds");
// survivor id differs, mergedIds holds the Fandom id; regionScoped true, endPrecision "exact"
test("id, startsAt, sourceUrl, sourceId and classification never change");
test("a table date that disagrees keeps the row and warns");
test("a survivor date that disagrees with the table keeps the row and warns");
test("a survivor already at exact precision is left alone");
test("no articles means the same array contents as merged");
test("a live row outlives the table's day on its stated end", () => {
  // parse the Fandom fixture row for an event at now = just past latestBoundaryMs of its date:
  // with articleEnds holding a later stated end it is emitted; without, it is not.
});
```

Use `toEqual` against the input for the no-articles and unchanged-fields cases. The disagreeing-date cases use the real fixture with the End cell's date replaced.

- [ ] **Step 3: Run:** `bun test test/article-ends.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 4: Implement `src/ingest/articleEnds.ts`.** Read `parse.text`, take `<td …data-source="time_end"…>…</td>`, flatten with `html.ts`'s `text`, then match only:

```ts
/^([A-Z][a-z]+ \d{1,2}, \d{4}) (\d{1,2}):(\d{2}) (\(Server Time\)|GMT\+8)$/
```

`(Server Time)` offsets come from `REGION_RESET_UTC_OFFSET`, not from `resetShiftMs`, whose game overrides concern resets. `applyArticleEnds` skips a survivor unless it has `endPrecision === "day"` (agent's call: an end another source stated exactly is not overridden) and both `listed.endsAt` and the survivor's `endsAt` start with `end.day`. It sets `endPrecision: "exact"`, `endsAt`, and `regionScoped`/`regionEnds` from the `StatedEnd`.

- [ ] **Step 5: Add `articleEnds?` to `ParseContext`, and in `parseGenshinEvents`** compute the row's retirement on `latestStatedMs` when `ctx.articleEnds?.get(articleTitle(href))` exists and its `day` equals the table's date, else `latestBoundaryMs` as now. Emit the same row either way; the parser never writes the stated end.

- [ ] **Step 6: Run:** `bun test test/article-ends.test.ts test/adapters/game8.test.ts`. Expected: PASS, including unchanged `.expected.json` rows.

- [ ] **Step 7: Commit** `src/ingest/articleEnds.ts`, `src/ingest/adapters/types.ts`, `src/ingest/parsers/fandom.ts`, `test/article-ends.test.ts`, `fixtures/genshin/articles/` as `feat(ingest): read a stated end from a Genshin article`.

### Task 2: Keep the articles fresh during a refresh

**Files:**
- Create: `src/ingest/articleStore.ts`, `scripts/refresh-articles.ts`
- Modify: `src/ingest/snapshots.ts` (export `writeAtomic`), `scripts/refresh-sources.ts` (`RefreshOptions`, `runRefresh`, `main`), `.gitignore`, `snapshots/README.md`
- Test: `test/article-refresh.test.ts`

**Interfaces:**
- Consumes: `articleTitle`, `parseArticleEnd` (Task 1).
- Produces, from `src/ingest/articleStore.ts`:
  - `interface ArticleMeta { title: string; lastAttemptAt: string; lastReadAt: string | null; statesTime: boolean }`
  - `class ArticleStore { constructor(root: string) /* <root>/articles/genshin-fandom */; readMeta(title); readBody(title); saveRead(title, body, at); recordAttempt(title, at); remove(title); listed(): Promise<string[]>; readEnds(): Promise<Map<string, StatedEnd>> }`
  - `articleFileName(title: string): string`: unsafe characters as `_` plus the first 8 hex of the title's hash
  - `articleDue(meta: ArticleMeta | null, nowMs: number): boolean`
- Produces, from `scripts/refresh-articles.ts`:
  - `refreshArticles(input: { titles: string[]; store: ArticleStore; robots: RobotsGate; fetchImpl: FetchLike; userAgent: string; now: () => Date; sleep: (ms: number) => Promise<void>; dryRun: boolean; timeoutMs: number; log: (line: string) => void; requestedHosts: Set<string> }): Promise<{ changed: number; warnings: string[] }>`
- Produces on `RefreshOptions`: optional `articleSourceId?: string`; on `RefreshSummary`: `articlesChanged: number`

- [ ] **Step 1: Write the failing tests** in `test/article-refresh.test.ts`, driving `refreshArticles` with a stub fetch and a temp root:

```ts
test("due: never read"); // articleDue(null, now) === true
test("due: no time found, only after 6 hours");
test("due: time found, only 7 days after the last read that worked");
test("due: a failed attempt inside 6 hours is not due, even past 7 days");
test.each([500, 403])("HTTP %i keeps the body and the time, and warns");
test("a network error keeps the body and the time, and warns");
test("robots refusal makes no request, keeps the body, and warns");
test("404 removes the stored article and warns");
test("a 200 with a missingtitle API error removes the stored article and warns");
test("a 200 with no usable End overwrites the body, sets statesTime false, and logs without warning");
test("lastReadAt moves only on a successful read; lastAttemptAt on every attempt");
test("the requested URL carries the decoded title, section=0, and the runner User-Agent");
test("the same title twice is one request");
test("per-host spacing applies when the host was already asked this cycle");
test("a dry run requests and writes nothing");
test("a stored article no longer listed is removed");
```

And driving `runRefresh`:

```ts
test("article reads run only with articleSourceId set; existing callers are unaffected");
test("a row with no article link makes no article request");
test("an empty source snapshot removes nothing and does not throw");
test("article failures leave broken, hardFailure and the source's streak untouched");
test("a changed article triggers the rebuild even when no source page changed");
```

- [ ] **Step 2: Run:** `bun test test/article-refresh.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement `articleStore.ts`.** `articleDue` is true when `meta` is null, or when at least 6h have passed since `lastAttemptAt` and either `statesTime` is false or at least 7 days have passed since `lastReadAt`. Body before meta, each through `writeAtomic`. `readEnds` skips a file `parseArticleEnd` returns null for, and returns an empty map when the directory does not exist.

- [ ] **Step 4: Implement `refresh-articles.ts`** to spec decision 12's table. Sends no conditional headers: the API does not offer validators worth the state. Uses the `api.php` URL from spec decision 5 and the same 200-only, read-body-in-a-try discipline as `refreshOne`. Removes stored articles not in `titles` only when `titles` is non-empty.

- [ ] **Step 5: Wire `runRefresh`.** After the source loop and before the hard-failure returns, when `articleSourceId` is among `selected`, parse that source's stored snapshot with the adapter at `now`, map rows through `articleTitle`, drop nulls, and call `refreshArticles`, sharing `cycle.requestedHosts`. Wrap the whole step in `try`, turning a throw into one warning. Push its warnings to `summary.warnings`. Rebuild when `summary.changed > 0 || summary.articlesChanged > 0`. `main` passes `articleSourceId: "genshin-fandom-events"`. `--force` is not forwarded. A dry run lists what is due.

- [ ] **Step 6: Add `snapshots/articles/**/*.tmp-*` to `.gitignore`** and document the directory in `snapshots/README.md`, including why it holds no `.state.json`.

- [ ] **Step 7: Run:** `bun test test/article-refresh.test.ts test/refresh.test.ts test/snapshots.test.ts`. Expected: PASS.

- [ ] **Step 8: Commit** those paths as `feat(refresh): keep Genshin event articles beside the snapshots`.

### Task 3: Build it into the feed and record it

**Files:**
- Modify: `scripts/build-feed.ts`, `src/shared/changelog.ts`, `AGENTS.md`, `docs/INGESTION.md`, `docs/PRD.md`, `docs/2026-11-01-genshin-event-audit.md`, the spec's status line
- Test: `test/article-feed.test.ts`

**Interfaces:**
- Consumes: `ArticleStore.readEnds` (Task 2), `applyArticleEnds` and `ParseContext.articleEnds` (Task 1).

- [ ] **Step 1: Write the failing test** `test/article-feed.test.ts`: run `scripts/build-feed.ts` as a subprocess against a temp `SNAPSHOT_DIR` holding `genshin-fandom-events.html` and `.meta.json`, copied from a pinned `fixtures/genshin/articles/event-table-2026-11-06.html`, plus an `articles/genshin-fandom` copy of the Hour of Ruin fixture. Add two environment overrides to `build-feed.ts`, each defaulting to today's behaviour: `EVENT_FEED_OUT` for the output path, and `EVENT_FEED_NOW` pinned to `2026-11-07T00:00:00.000Z`, without which this test would fail once the fixture's events end. Assert Hour of Ruin's `regionEnds.europe` is `2026-12-15T13:59:00.000Z`, its `id` is `genshin:hour-of-ruin:2026-11-04`, and the feed still passes `EventFeed.parse`.

- [ ] **Step 2: Run:** `bun test test/article-feed.test.ts`. Expected: FAIL, row still at day precision.

- [ ] **Step 3: Wire `build-feed.ts`.** Read `ArticleStore.readEnds` once. Pass `articleEnds` in the context for `genshin-fandom-events` only. Keep that source's parsed rows. After `mergeEvents` for its game, apply `applyArticleEnds`, logging warnings as `  ! article: …`. Sort after applying.

- [ ] **Step 4: Run:** `bun test && bun run typecheck`. Expected: all pass.

- [ ] **Step 5: Check it for real, without touching the repo's data.** Copy `snapshots/` to a scratch directory, run `bun run refresh --snapshots <scratch> --only genshin-fandom-events`, then build from it with `SNAPSHOT_DIR=<scratch>` from an export. Expected: Test Run 17:59 server, Hour of Ruin 14:59 server, Raiment 05:59 GMT+8, passes 03:59 server. In a real browser on an HTTP test hostname: same countdowns on Europe, Raiment 38d 21h-style, and the detail sheet's "gave a date but no time" note gone from those rows but still shown for a Game8-only row.

- [ ] **Step 6: Update docs:** `AGENTS.md` § Domain rules (a Fandom article may state the end) and the Genshin § Fandom bullets; `docs/INGESTION.md` (article step, decision 12's table); PRD § Quality bar; the audit doc gets the Forge Realm reading and marks open item 1 done; the spec's status.

- [ ] **Step 7: Review:** run `schema-guardian` and fix what it finds.

- [ ] **Step 8: Commit** the feature paths as `feat(feed): show the end a Genshin article states`, then the changelog separately as `chore(changelog): note exact Genshin end times (<hash>)`, after `bun run scripts/check-changelog.ts`.
