# Version routines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Built-in routines can reset with a game's version, from a hand-kept, cited table of version
timers; WuWa's three shop-pull lines are the first.

**Architecture:** A new `src/shared/versions.ts` holds `VERSIONS`, `VERSION_DAYS` and a pure
`versionWindow(game, now)`. Built-in routines gain a `{ unit: "version" }` period (never in the stored
`PeriodSchema`); `taskStatus` resolves it through `versionWindow` and reports it as scope `cycle`. The
About tab of a game in *Your games* shows the version row.

**Tech Stack:** Bun, TypeScript, zod, React 19, `bun test`.

**Spec:** `docs/superpowers/specs/2026-10-22-version-routines-design.md`

## Global Constraints

- The stored `PeriodSchema`, `TaskSchema`, `gacha-tracker:v1:tasks` and the export format do not change.
- A routine resets only at a **recorded** `end`; an estimate is displayed, never acted on (decision 3).
- Version `start`/`end` are ISO UTC instants; `end` is when the next version's stock appears.
- WuWa 3.7: `end` = `2026-11-11T10:30:00Z`, `next` = `"3.8"`; `VERSION_DAYS.wuwa` = 42.
- Version routines are amount measures only; scope reported as `"cycle"`.
- The period key is the start instant's UTC date, bare `YYYY-MM-DD` (`AmountLog` keys are free
  strings, but `PinnedRoutine` and the catch-up code compare `periodStart` with day keys, so a date
  stays comparable).
- Captions (exact): `resets with 3.8 · 11 Nov`; `resets with next version (3.9) · expected ~23 Dec`;
  `resets with next version · expected ~23 Dec`; past the estimate append `, not yet confirmed`.
- Every figure cites an https page; an in-game figure's note says `Confirmed in game, YYYY-MM-DD.`

## Review Focus

- **The moment of the switch:** one minute before `end`, the old count is shown; at `end` exactly, 0/7. Pinned in Task 1 and Task 2.
- **Past the estimate with no recorded end:** the count holds and the key does not move. Task 1 tests the same key on 2027-02-01.
- **A routine row with `daysLeft` null:** the chip shows `n/7` with no `· 0d`. Task 2 `goalCount` test.
- **Catch-up "Last version:":** without a `periodOf` for version, the Dailies catch-up would throw. Task 2 skips amount catch-up for version items, with a test.
- **The timeline band for an open-ended version:** `routinePeriod` must not throw or draw a zero-width band. Task 2 test: it ends at the estimate.

---

### Task 1: Version table and window

**Files:**
- Create: `src/shared/versions.ts`
- Modify: `src/shared/period.ts` (add `RoutinePeriodSchema`, `RoutinePeriod`)
- Test: `test/versions.test.ts`

**Interfaces:**
- Produces:
  - `period.ts`: `export const RoutinePeriodSchema = PeriodSchema.or(z.object({ unit: z.literal("version") }))`; `export type RoutinePeriod`.
  - `versions.ts`: `interface GameVersion` (fields as the spec § Shape), `VERSIONS: readonly GameVersion[]`, `VERSION_DAYS: Partial<Record<GameId, number>>`,
    `interface VersionWindow { number?: string; key: string; start: number; end?: number; estimate?: number; nextNumber?: string }`,
    `versionWindow(game: string, now: number, versions = VERSIONS, days = VERSION_DAYS): VersionWindow | undefined`,
    `versionCaption(w: VersionWindow, now: number): string` (the exact caption strings; dates as `asOfLabel` minus the year, e.g. `11 Nov`).

- [ ] **Step 1: Write failing tests** in `test/versions.test.ts`:
  - table invariants over `VERSIONS`: per game sorted, non-overlapping; `end > start`; recorded `end` equals the next entry's `start`; https source; both instants parse; `checked` is a date.
  - `versionWindow("wuwa", Date.parse("2026-10-22T14:30:00Z"))` → `{ number: "3.7", key: "2026-09-30", end: Date.parse("2026-11-11T10:30:00Z"), nextNumber: "3.8", estimate: undefined }`.
  - at `2026-11-11T10:29:00Z` → number `"3.7"`; at `2026-11-11T10:30:00Z` → `{ number: "3.8", key: "2026-11-11", end: undefined, estimate: Date.parse("2026-12-23T10:30:00Z"), nextNumber: undefined }`.
  - at `2027-02-01T00:00:00Z` → still `number: "3.8"`, `key: "2026-11-11"`.
  - a fixture table with one entry and no `end` → window is that entry, `estimate = start + 42d`.
  - `versionWindow("genshin", now)` → `undefined`; with `days` lacking the game → `estimate` undefined.
  - `versionCaption`: `"resets with 3.8 · 11 Nov"`; `"resets with next version (3.9) · expected ~23 Dec"` (fixture with `next: "3.9"`); `"resets with next version · expected ~23 Dec"`; past the estimate → `"…expected ~23 Dec, not yet confirmed"`; no estimate → `"resets with next version"`.
- [ ] **Step 2: Run** `bun test test/versions.test.ts` — expect FAIL (module missing).
- [ ] **Step 3: Implement.** First entry per the spec § First entry. Before writing it, check a page for 3.7's start (Game8 / Fandom / Prydwen). If one states it, cite it; otherwise use `2026-09-30T10:30:00Z` and say in `note` that the start is 42 days before the in-game end. Comment on `VERSION_DAYS.wuwa` citing 3.7's length and AGENTS.md's six weeks. Window rules exactly as the spec § Shape.
- [ ] **Step 4: Run** `bun test test/versions.test.ts` — PASS.
- [ ] **Step 5: Commit** `feat(versions): a cited table of version timers, and the window holding now`.

### Task 2: Routines can follow a version

**Files:**
- Modify: `src/shared/routines.ts` (schema period → `RoutinePeriodSchema`), `src/shared/task.ts` (`TaskShape.period: RoutinePeriod`; `taskStatus`; `taskCaption`), `src/shared/goal.ts` (`goalCount`), `src/client/state/reader/routines.ts`, `src/client/components/Dailies.tsx`, `src/client/components/redesign/TimelinePage.tsx`, `src/client/components/redesign/RoutinesPage.tsx`, `src/client/components/redesign/RoutineDrawer.tsx` (period line), plus whatever else `bun run typecheck` names.
- Test: `test/task.test.ts`, `test/routines.test.ts`, `test/reader-routines.test.ts`, `test/redesign-routines.test.tsx`

**Interfaces:**
- Consumes: Task 1's `RoutinePeriod`, `versionWindow`, `versionCaption`.
- Produces: `taskStatus` accepts `task.period: RoutinePeriod`; for `version` it returns `scope: "cycle"`, `periodStart: window.key`, `daysLeft`/`open` = `Math.ceil((end - now) / DAY)` when `end` is recorded, else `null`. `taskCaption(task, now?)` uses `versionCaption` for version. A `routineVersioned(r): boolean` helper in `routines.ts`.

- [ ] **Step 1: Write failing tests:**
  - `task.test.ts`: a wuwa version routine (amount 7) with `amounts = { "2026-09-30": { value: 3, at } }` at 2026-10-22T14:30Z → `count 3, required 7, scope "cycle", periodStart "2026-09-30", daysLeft 20`; at `2026-11-11T10:30Z` → `count 0, periodStart "2026-11-11", daysLeft null, open null`.
  - `goalCount({ scope: "cycle", count: 3, required: 7, daysLeft: null, open: null, ... })` → `"3/7"`; with `daysLeft: 20` → `"3/7 · 20d"`.
  - `routines.test.ts`: every routine with `period.unit === "version"` has `measure.kind === "amount"`; `RoutineSchema` accepts `{ unit: "version" }`; `TaskSchema` still refuses it.
  - `reader-routines.test.ts`: a version routine row has `cadence "cycle"`.
  - Dailies catch-up renders no "Last version" editor for a version item (render test in the existing Dailies/edit tests' style).
  - `routinePeriod` for an open-ended version row ends at the estimate; with a recorded end, at `end`.
  - `redesign-routines.test.tsx`: *Make it mine* is absent for a version routine.
- [ ] **Step 2: Run** those files — FAIL.
- [ ] **Step 3: Implement.** In `taskStatus`, branch on `version` before `dayKey`. `goalCount`'s cycle form drops `· Nd` when both `daysLeft` and `open` are null. Cadence: `version` → `"cycle"`. Dailies: amount catch-up returns `null` for a version period. `routinePeriod`: version → `[window.start, end ?? estimate ?? now + DAY]`. RoutinesPage: hide *Make it mine* when `routineVersioned`. RoutineDrawer's read-only period line: the caption. Run `bun run typecheck` and fix every site it lists the same way (`version` never reaches `periodOf`).
- [ ] **Step 4: Run** `bun test` and `bun run typecheck` — all PASS.
- [ ] **Step 5: Commit** `feat(routines): a routine can reset with its game's version`.

### Task 3: WuWa's shop pulls

**Files:**
- Modify: `src/shared/routines.ts` (three entries after Tower of Adversity), `test/routines.test.ts` (the "each game's, as sourced" wuwa expectation)

- [ ] **Step 1: Find the source.** One page describing the shop's Tide stock (prefer one naming the shop and its currency). Record its date as `asOf`, `checked: "2026-10-22"`. Title `Shop: <Tide>`, or `<Shop name>: <Tide>` if the page names the shop.
- [ ] **Step 2: Update the test** expecting, after Tower of Adversity, the three rows with `{ unit: "version" }` and `{ kind: "amount", target: 7, unit: "<Tide name>" }`; Radiant and Forging `pulls: "premium"`, Lustrous `"standard"`. Run — FAIL.
- [ ] **Step 3: Add the entries** (ids `routine:wuwa:shop-radiant-tide`, `-forging-tide`, `-lustrous-tide`; note ends `Confirmed in game, 2026-10-22.`, ≤140 chars). Run `bun test` — PASS.
- [ ] **Step 4: Commit** `feat(routines): Wuthering Waves' shop pulls, each version`.

### Task 4: The version row in Your games

**Files:**
- Modify: `src/client/components/redesign/GameSettings.tsx` (About group, after the reset rows)
- Test: `test/game-settings.test.tsx`

- [ ] **Step 1: Failing test:** WuWa's About tab at 2026-10-22T14:30Z shows a row `Version 3.7` with `ends 11 Nov 2026` (formatted with `formatInZone` in the reader's zone), `(in 19d)`, a link to the source, and the note. At 2026-11-12 it shows `Version 3.8` and `next version expected ~23 Dec 2026 (estimate)`. Genshin's About has no version row.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** with `versionWindow` and the existing `trow` markup. **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(settings): show a game's version timer on its About tab`.

### Task 5: Docs, browser check, changelog

- [ ] **Step 1:** `docs/DATA-MODEL.md` (version period built-in only; amounts under the version's start date), `docs/PRD.md` F17, AGENTS.md bullet (versions hand-kept and cited; estimates shown, never acted on; add each version's end when known), TODO.md (Oscillated Coral partly addressed; follow-ups from spec § Not in this change; "record WuWa 3.8's end"), spec status → shipped with commit range. Commit `docs: version routines`.
- [ ] **Step 2:** `bun run build` and drive the app (run skill): WuWa routines show `0/7 · 20d` and the caption; About shows the version row. Fix anything found.
- [ ] **Step 3:** Changelog entry in `src/shared/changelog.ts` in a follow-up commit naming the feature commits, matching recent `chore(changelog): …` commits; `bun test test/changelog*.ts*`.
