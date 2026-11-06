# Catch up Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (the owner's standing
> instruction: no review stops between design and execution). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the nested *Catch up & recorded history* dropdowns with an always-open, one-game-at-a-time Catch up section on the Routines page, reachable by a button from the Checklist.

**Architecture:** A pure model (`state/reader/catchUp.ts`) turns an account into titled rows, day cells, values and a count, so every rule is tested without React. `CatchUpSection.tsx` draws it. `ReaderApp` passes a one-shot request to `RoutinesPage`, which scrolls and focuses.

**Tech Stack:** React 19, TypeScript strict, Bun test, plain CSS in `src/client/redesign.css`.

**Spec:** `docs/superpowers/specs/2026-11-06-catch-up-section-design.md`

## Global Constraints

- No change to stored data or keys; ticks go through the existing `day` action.
- Colours are tokens plus the game hue; both themes must read.
- `zod` stays the only runtime dependency. Puppeteer only in the scratch directory.
- Commits wait for the owner to ask (`AGENTS.md`), so this plan has no commit steps, and the changelog entry, which must name a commit, lands in the follow-up.

## Review Focus

1. A selected account retired or hidden while the page is open: fall back to the default, do not crash. Test in Task 2.
2. Ticking the last unticked day: the selection must not jump to another game. Test in Task 2.
3. Logged days later than today on the current clock (after a reset change): shown disabled, never lost. Test in Task 1.
4. Unreadable stored values (`days` not an array, `value` not a number): rendered as a safe label, no throw. Test in Task 1.
5. Two accounts on one game: chips stay distinct. Test in Task 2.

---

### Task 1: The model

**Files:**
- Create: `src/client/state/reader/catchUp.ts`
- Test: `test/catch-up.test.tsx`

**Interfaces:**
- Produces:
```ts
export interface CatchUpDay { key: string; ticked: boolean; today: boolean; disabled: boolean }
export interface CatchUpValue { period: string; label: string; text: string }
export interface CatchUpItem {
  id: string; revisionId: string; title: string; kind: string;
  /** null for number-measured and timer rows. */
  days: CatchUpDay[] | null;
  earlier: CatchUpDay[];
  values: CatchUpValue[] | null;
  behind: number;
}
export interface CatchUpGroup { id: string; title: string; note: string | null; items: CatchUpItem[] }
export interface AccountCatchUp { accountId: string; items: CatchUpItem[]; older: CatchUpGroup[]; behind: number }
export function catchUpTitle(state: ReaderState, account: Account, id: string, rows: readonly RoutineRow[]): string;
export function catchUpFor(state: ReaderState, account: Account, now: number): AccountCatchUp;
export function defaultCatchUpAccount(list: readonly AccountCatchUp[]): string | null;
```

- [ ] **Step 1: Write failing tests** (migrated state via `migrateLegacy`, as `test/redesign-routines.test.tsx` does), named and asserting:
  - `a followed battle pass is titled, not a slug, and gets no strip`: `catchUpTitle` of a `feed-cycle:` id with no live row is `Battle pass`; a pass row is absent from `items`.
  - `an unknown id reads Removed item`.
  - `dailies use the name Today's dailies uses`: `dailies:endfield` is `Daily missions`.
  - `a daily strip holds 14 days ending today`: last has `today: true`, none later than today.
  - `an amount routine gets values, not days`: `routine:endfield:weekly-routine` with `{ "2026-11-02": { value: 8 } }` gives `days: null`, text `8 of 10 points`, label `Week of 2 Nov`.
  - `a banner routine has no strip`: `routine:endfield:aic-quota-permits`, `days: null`.
  - `behind counts unticked days since the first tick, not today`: ticks on 3 and 5 Nov with now on 6 Nov give `behind: 1`.
  - `a never-ticked routine counts nothing`, `a weekly counts nothing`, `an event with a goal counts nothing`.
  - `a tick before the strip is under earlier`; `a tick after today is disabled`.
  - `unreadable logs do not throw`: `days: "x"` gives no ticks; `value: "x"` gives text `unreadable amount`.
  - `a logged item no longer followed lands in Older records`, with recorded days only.
  - `an earlier reset timing is its own older group`, with its region line.
  - `an item with nothing logged is not in older`.
  - `defaultCatchUpAccount picks the first behind, else first, else null`.

- [ ] **Step 2: Run** `bun test test/catch-up.test.tsx`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement.** `items` come from `routineRows` filtered on `placement.followed` with no `placementId`. A row's timer check uses `isTimerPeriod` on its built-in or task period. Strip via `catchUpDays(now, row.clock.region, game, floor, 14, row.clock)`, with `floor` the later of the revision's effective time (null for `1970`) and `row.window?.start` or the event's start. `kind`: event rows (`row.source` from `seenEvents`, id not a routine, task or `dailies:`) are `Event`; otherwise Dailies, Weeklies, Monthlies or Cycles by cadence. Day and period labels parse the key as UTC with `en-GB`.

- [ ] **Step 4: Run** `bun test test/catch-up.test.tsx`. Expected: PASS.

### Task 2: The section

**Files:**
- Create: `src/client/components/redesign/CatchUpSection.tsx`
- Delete: `src/client/components/redesign/RoutineHistory.tsx`
- Modify: `src/client/components/redesign/RoutinesPage.tsx` (import, bottom `<details>`, top-bar button), `src/client/redesign.css` (retire `.routine-histories`, `.routine-history`, `.history-days`; add `.catch-up*`)
- Test: `test/catch-up.test.tsx`

**Interfaces:**
- Consumes: `catchUpFor`, `defaultCatchUpAccount` from Task 1.
- Produces: `CatchUpSection({ accounts, state, now, onAction, headingRef }: { accounts: Account[]; state: ReaderState; now: number; onAction: ActionHandler; headingRef?: RefObject<HTMLHeadingElement | null> })`.

- [ ] **Step 1: Write failing tests:**
  - `Routines has one Catch up heading and no nested dropdowns`: the old summary text is gone, `<h2 ...>Catch up` appears.
  - `chips name the game and follow Game order`.
  - `two servers of one game have distinct chips`.
  - `a day cell says weekday and date, and aria-pressed tracks the tick`.
  - `the first game with something behind is chosen`.
  - `pickAccount keeps a live selection, and falls back when it is gone`: export `pickAccount(selected: string | null, list: readonly AccountCatchUp[]): string | null`; a live selection with `behind: 0` stays; a missing one returns the default.

- [ ] **Step 2: Run** `bun test test/catch-up.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.** Selection via `useState` initialised once from `defaultCatchUpAccount`, resolved each render through `pickAccount`. Chips reuse `.focus-pills` and `.focus-pill` with `--hue`. Ticks dispatch the same `day` action with `actionMeta()`. Strip is a 14-column grid, 7 columns on a phone. `h2` has `tabIndex={-1}`, and `scroll-margin-top`.

- [ ] **Step 4: Run** `bun test && bun run typecheck`. Expected: all pass.

### Task 3: Getting there

**Files:**
- Modify: `src/client/ReaderApp.tsx` (~809, ~822, ~1012), `src/client/components/redesign/DailyPanel.tsx` (heading, new `onCatchUp` prop), `src/client/components/redesign/RoutinesPage.tsx`
- Test: `test/catch-up.test.tsx`

**Interfaces:**
- Produces: `RoutinesPage` props `catchUpRequested?: boolean`, `onCatchUpShown?: () => void`; `DailyPanel` prop `onCatchUp?: () => void`.

- [ ] **Step 1: Write failing tests:** `Today's dailies offers Catch up beside Edit pins`, and `the Routines top bar offers Catch up`.

- [ ] **Step 2: Run** `bun test test/catch-up.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.** `ReaderApp` holds `catchUpRequested` state, set with `changePage("routines")`. `RoutinesPage`'s effect scrolls the heading into view (`block: "start"`, `behavior: "auto"` under reduced motion, else `"smooth"`), focuses with `preventScroll`, then calls `onCatchUpShown`, which clears the state, so later visits do not scroll.

- [ ] **Step 4: Run** `bun test && bun run typecheck`. Expected: all pass.

- [ ] **Step 5: Browser check** per `AGENTS.md` § Looking at the built app, on `http://10.20.20.2:<fresh port>`: both Checklist buttons land on the section, normal navigation does not scroll, ticking toggles and persists across reload, both themes read, phone width has no horizontal scroll, no raw IDs, no console errors.

### Task 4: Docs

**Files:** Modify `docs/PRD.md` (F17 and the *Catch up* disclosure sentence), `docs/DESIGN.md` (Other pages: Routines).

- [ ] **Step 1:** State where Catch up lives and how it is reached; remove *Catch up & recorded history* and the *disclosure* wording.
- [ ] **Step 2: Run** `grep -rn "recorded history\|routine-histor\|history-days\|RoutineHistory" src test docs/PRD.md docs/DESIGN.md`. Expected: only unrelated Archive strings.
