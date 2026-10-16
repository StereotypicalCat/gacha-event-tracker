# Built-ins on longer cycles — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tasks and built-ins can repeat every N days from a dated start, and the endgame cycles the owner approved ship as built-ins.

**Architecture:** A third `PeriodSchema` member, `{ unit: "cycle", days, from }`, cut in day-key space by `periodOf` like weeks and months. `GoalStatus.scope`, the strip's cadence, its tally and its switches gain a `cycle` case. Built-ins may name a server `clock` whose reset they follow. Entries come last and wait on the owner.

**Tech Stack:** Bun, TypeScript, React, Zod, bun:test.

**Spec:** `docs/superpowers/specs/2026-10-16-cycle-routines-design.md`

## Global Constraints

- Every commit passes `bun test` and `bun run typecheck` on its own (AGENTS.md).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `days`: integer 2–366. `from`: `YYYY-MM-DD`. `showCycleTasks` defaults to `true`.
- Copy: "this cycle", "done this cycle", short count `n/m · Nd`, "Every N days", "Last cycle:".
- Never invent a figure: entries are exactly the spec's § Entries table.
- Work happens on branch `feat/cycle-routines` in a worktree; the entries commits are last, and the branch is not merged until the owner confirms the spec's owner checks.
- Push to `origin` only.

## Review Focus

1. A date before the anchor — `periodOf` must still give the cycle holding it (negative `k`), never the anchor's cycle. Pinned in Task 1.
2. A cycle task whose length is under the `days` measure's `required` (a 3-day cycle asking 5 days) — `taskStatus` clamps to the cycle's length as it does for February. Pinned in Task 1.
3. A clocked built-in for a Europe reader at Wednesday 20:59 vs 21:01 UTC — the day key and countdown must follow Asia, and the tick lands on Asia's key. Pinned in Task 3.
4. Editing a reader's cycle task in the form must keep `days` and `from`, never silently turn it into a week. Pinned in Task 2.
5. An older stored prefs blob without `showCycleTasks` reads as on; junk reads as on. Pinned in Task 1.

---

### Task 1: The cycle period, read everywhere

One commit: `feat(tasks): a task can repeat every N days from a dated start`.

**Files:**
- Modify: `src/shared/period.ts`, `src/shared/goal.ts`, `src/shared/task.ts`
- Modify: `src/client/components/Dailies.tsx`, `EditPanel.tsx`, `Controls.tsx`, `TaskForm.tsx` (guard only), `src/client/state/usePrefs.ts`, `src/client/App.tsx`
- Test: `test/period.test.ts`, `test/goal.test.ts`, `test/task.test.ts`, `test/prefs.test.ts`, `test/views.test.tsx`, `test/edit-dailies.test.tsx`, `test/controls.test.tsx`

**Interfaces — produces:**
- `PeriodSchema` member `{ unit: "cycle"; days: number; from: string }`.
- `GoalStatus.scope: "week" | "month" | "cycle" | "event"`.
- `DailyItem.cadence: "day" | "week" | "month" | "cycle" | "event"`.
- `tasksShown(tasks, { weekly, monthly, cycle })`; `dailyTally(...)` returns `{ …, week, month, cycle }`.
- `Prefs.showCycleTasks: boolean`; `EditPanel` `shown.cycle`, `hasTasks.cycle`; `onShown({ cycle })`.
- `longerHeading(cadences: ReadonlySet<"week" | "month" | "cycle">): string` exported from `Dailies.tsx`.

- [ ] **Step 1: Failing tests for `periodOf`** — in `test/period.test.ts`:

```ts
describe("periodOf: cycles", () => {
  const cycle = (days: number, from: string) => ({ unit: "cycle" as const, days, from });

  test("the anchor starts its own cycle, which holds `days` keys", () => {
    const p = periodOf(cycle(14, "2026-10-16"), "2026-10-16");
    expect(p.start).toBe("2026-10-16");
    expect(p.days.length).toBe(14);
    expect(p.days.at(-1)).toBe("2026-10-29");
  });

  test("the last day is in it; the day after starts the next", () => {
    expect(periodOf(cycle(14, "2026-10-16"), "2026-10-29").start).toBe("2026-10-16");
    expect(periodOf(cycle(14, "2026-10-16"), "2026-10-30").start).toBe("2026-10-30");
  });

  test("a day before the anchor is in the cycle before it, not the anchor's", () => {
    expect(periodOf(cycle(42, "2026-11-16"), "2026-10-16").start).toBe("2026-10-05");
    expect(periodOf(cycle(14, "2026-10-16"), "2026-10-15").start).toBe("2026-10-02");
  });

  test("lengths 2 and 366", () => {
    expect(periodOf(cycle(2, "2026-01-01"), "2026-01-04").days).toEqual(["2026-01-03", "2026-01-04"]);
    expect(periodOf(cycle(366, "2026-01-01"), "2027-01-01").days.length).toBe(366);
  });

  test("the schema bounds", () => {
    expect(PeriodSchema.safeParse(cycle(1, "2026-01-01")).success).toBe(false);
    expect(PeriodSchema.safeParse(cycle(367, "2026-01-01")).success).toBe(false);
    expect(PeriodSchema.safeParse(cycle(14, "16 Oct")).success).toBe(false);
  });
});
```

(import `PeriodSchema` beside `periodOf`.)

- [ ] **Step 2: Run** `bun test test/period.test.ts` — expect FAIL (schema refuses / `periodOf` falls into the month branch).

- [ ] **Step 3: Implement** in `src/shared/period.ts`:

```ts
const DayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const PeriodSchema = z.union([
  z.object({ unit: z.literal("week"), startsOn: WeekdaySchema }),
  /** Day of month; 31 means "the last day" in a shorter month. */
  z.object({ unit: z.literal("month"), startsOn: z.number().int().min(1).max(31) }),
  /**
   * Every `days` game-days, counted from `from`, a game-day on which a cycle
   * began — any one, not necessarily the first: cycles run both ways from it.
   */
  z.object({ unit: z.literal("cycle"), days: z.number().int().min(2).max(366), from: DayKey }),
]);
```

and in `periodOf`, before the month branch:

```ts
  } else if (period.unit === "cycle") {
    const since = Math.round((msOf(today) - msOf(period.from)) / DAY);
    start = addDays(period.from, Math.floor(since / period.days) * period.days);
    next = addDays(start, period.days);
  } else {
```

Update the file's header comment: "Periods longer than a day — a week, a month, a cycle of N days".

- [ ] **Step 4: Run** `bun test test/period.test.ts` — PASS. Then `bun run typecheck` and note each error; Steps 5–10 fix them.

- [ ] **Step 5: `goal.ts`** — `scope: "week" | "month" | "cycle" | "event"` (update its comment: month and cycle are a task's period). `goalCount`:

```ts
export function goalCount(s: GoalStatus): string {
  // "cy" means nothing; a cycle's days left say where it is.
  if (s.scope === "cycle") return `${num(s.count)}/${num(s.required)} · ${s.open ?? 0}d`;
  const unit = s.scope === "week" ? " wk" : s.scope === "month" ? " mo" : "";
  return `${num(s.count)}/${num(s.required)}${unit}`;
}
```

`within` and `doneLabel` already read `this ${s.scope}`, which gives "this cycle". Test in `test/goal.test.ts`:

```ts
test("a cycle reads 'this cycle', and its short count is the days left", () => {
  const s: GoalStatus = { scope: "cycle", measure: "days", periodStart: "2026-10-16", required: 1, count: 0, met: false, needed: 1, open: 9, shortfall: false };
  expect(goalCount(s)).toBe("0/1 · 9d");
  expect(goalLabel(s)).toBe("0 of 1 this cycle");
  expect(goalLabel({ ...s, count: 1, met: true, needed: 0 })).toBe("done this cycle");
});
```

- [ ] **Step 6: `task.ts`** — `taskStatus`'s `scope = task.period.unit` already types as the new union. `taskCaption`:

```ts
  const when =
    task.period.unit === "week"
      ? `every week from ${WEEKDAYS[task.period.startsOn - 1]}`
      : task.period.unit === "month"
        ? `every month from the ${ordinal(task.period.startsOn)}`
        : `every ${task.period.days} days from ${asOfLabel(task.period.from)}`;
```

Move `asOfLabel` and `MONTHS` from `routines.ts` to `task.ts` and re-export from `routines.ts` (`export { asOfLabel } from "./task.ts";`) — `routines.ts` imports `task.ts` already, the reverse would cycle. Tests in `test/task.test.ts`:

```ts
test("a cycle task: status by its cycle, caption with its start", () => {
  const t = task({ period: { unit: "cycle", days: 14, from: "2026-10-16" }, measure: { kind: "days", required: 5 } });
  expect(TaskSchema.safeParse(t).success).toBe(true);
  expect(taskCaption(t)).toBe("every 14 days from 16 Oct 2026 · 5 days");
  const s = taskStatus({ task: t, region: "europe", now: noon("2026-10-20"), logged: ["2026-10-15", "2026-10-16", "2026-10-18"] });
  expect(s).toMatchObject({ scope: "cycle", periodStart: "2026-10-16", count: 2, required: 5, open: 10 });
});

test("a short cycle never asks for more days than it holds", () => {
  const t = task({ period: { unit: "cycle", days: 3, from: "2026-10-16" }, measure: { kind: "days", required: 5 } });
  expect(taskStatus({ task: t, region: "europe", now: noon("2026-10-16"), logged: [] }).required).toBe(3);
});
```

- [ ] **Step 7: `usePrefs.ts`** — add after `showMonthlyTasks`:

```ts
  /** The same for tasks that repeat every N days (period.ts). */
  showCycleTasks: boolean;
```

default `showCycleTasks: true`, and in the restore normaliser:

```ts
  result.showCycleTasks = typeof result.showCycleTasks === "boolean" ? result.showCycleTasks : base.showCycleTasks;
```

Test in `test/prefs.test.ts` beside the existing weekly/monthly one:

```ts
test("showCycleTasks is on when absent or unreadable", () => {
  expect(defaults().showCycleTasks).toBe(true);
  expect(restorePrefsValue({}).showCycleTasks).toBe(true);
  expect(restorePrefsValue({ showCycleTasks: "no" }).showCycleTasks).toBe(true);
  expect(restorePrefsValue({ showCycleTasks: false }).showCycleTasks).toBe(false);
});
```

- [ ] **Step 8: `Dailies.tsx`**
  - `cadence: "day" | "week" | "month" | "cycle" | "event"`; doc comment says weekly, monthly and cycle tasks.
  - `tasksShown(tasks, shown: { weekly: boolean; monthly: boolean; cycle: boolean })`:
    ```ts
    const on = { week: shown.weekly, month: shown.monthly, cycle: shown.cycle } as const;
    return tasks.filter((t) => on[t.period.unit]);
    ```
  - `splitByCadence`: `longer = (i) => i.cadence === "week" || i.cadence === "month" || i.cadence === "cycle"`.
  - `dailyTally` gains `cycle: PeriodTally`; the branch picks `i.cadence === "week" ? week : i.cadence === "month" ? month : cycle`.
  - New, exported:
    ```ts
    /** The lower row's heading: the periods it holds, in order. */
    export function longerHeading(cadences: ReadonlySet<"week" | "month" | "cycle">): string {
      const names = (["week", "month", "cycle"] as const).filter((c) => cadences.has(c));
      if (names.length === 0) return "";
      const last = names.at(-1)!;
      const head = names.slice(0, -1).join(", ");
      return `This ${head === "" ? last : `${head} & ${last}`}`;
    }
    ```
    Render `{longerHeading(new Set(longer.map((i) => i.cadence as "week" | "month" | "cycle")))}` in place of `This week &amp; month`.
  - Header tally: add `{cycle.total > 0 && <>Cycles {cycle.complete}/{cycle.total}</>}` with " · " separators between any two present (build the parts as an array and join).
  - Footer: replace the two week/month sentences with ones over `const longerOpen = week.total + month.total + cycle.total - week.complete - month.complete - cycle.complete;` and a period phrase `periodsPhrase(week, month, cycle)` = the present ones joined with ", " and " or " ("this week or month", "this week, month or cycle"); "All done for this week and month." becomes `All done for ${…joined with " and "}.` Keep the existing strings exactly when only week and month are present (existing tests pin them).
  - Amount editor label: `this ${scope}` already yields "this cycle".
  - Catch up label: `Last ${item.period.unit}:` already yields "Last cycle:".
  Tests in `test/views.test.tsx` (next to the existing `dailyTally` tests; update the `toEqual` at line ~1387 to include `cycle: { total: 0, complete: 0 }`):
  ```ts
  test("the lower row names the periods it holds", () => {
    expect(longerHeading(new Set(["week"]))).toBe("This week");
    expect(longerHeading(new Set(["week", "month"]))).toBe("This week & month");
    expect(longerHeading(new Set(["week", "month", "cycle"]))).toBe("This week, month & cycle");
    expect(longerHeading(new Set(["cycle"]))).toBe("This cycle");
  });
  test("cycle tasks are tallied apart and switched apart", () => {
    const t = (unit: "week" | "cycle") => ({ period: unit === "week" ? { unit, startsOn: 1 } : { unit, days: 14, from: "2026-10-16" } });
    expect(tasksShown([t("week"), t("cycle")], { weekly: true, monthly: true, cycle: false })).toHaveLength(1);
  });
  ```
  plus a render test that a cycle task in the strip shows `0/1 · …d` and the heading "This week & cycle" (use the file's existing `dailyGroups`/render helpers with a cycle `StripTask`).

- [ ] **Step 9: Switches** — `EditPanel.tsx`: `shown` and `hasTasks` gain `cycle`; a third `Switch label="Cycle tasks"` under `hasTasks.cycle`. `Controls.tsx`: `taskPeriods.cycle = periods.includes("cycle")`; a third `Check` under it:
  ```tsx
  <Check
    checked={prefs.showCycleTasks}
    onChange={(showCycleTasks) => onUpdate({ showCycleTasks })}
    label="Show cycle tasks under the dailies"
    hint="Tasks that repeat every so many days, like a two-week endgame mode. Off hides them from the strip and its counts; your ticks and numbers are kept."
  />
  ```
  `App.tsx`: pass `cycle: prefs.showCycleTasks` in both `shown` and `tasksShown`, `hasTasks.cycle: stripTasks.some((t) => t.period.unit === "cycle")`, and `...(patch.cycle !== undefined ? { showCycleTasks: patch.cycle } : {})`. Update fixtures in `test/edit-dailies.test.tsx` (`hasTasks`, `shown`) and `test/controls.test.tsx` (`showCycleTasks: true`); add one test per file that the cycle switch appears only with a cycle task and writes `showCycleTasks`.

- [ ] **Step 10: `TaskForm.tsx` guard** (replaced in Task 2): the initial `unit` reads `initial?.period.unit === "month" ? "month" : "week"`. No reader can hold a cycle task yet in this commit.

- [ ] **Step 11: Run** `bun test` and `bun run typecheck` — all pass (print the summary lines, not a tail that can hide a fail count).

- [ ] **Step 12: Commit** `feat(tasks): a task can repeat every N days from a dated start`.

### Task 2: Add a task offers "Every N days"

Commit: `feat(tasks): set up a task that repeats every N days`.

**Files:** Modify `src/client/components/TaskForm.tsx`; Test `test/form-examples.test.tsx` (or the file holding `taskDraftFrom` tests — `grep -ln taskDraftFrom test/`).

**Interfaces — consumes** Task 1's `PeriodSchema` cycle member. **Produces** `TaskFields.unit: "week" | "month" | "cycle"`, `TaskFields.cycleDays: string`, `TaskFields.cycleFrom: string`.

- [ ] **Step 1: Failing tests**

```ts
const base: TaskFields = { game: "zzz", title: "Shiyu Defense", unit: "cycle", weekday: 1, monthDay: "1", cycleDays: "14", cycleFrom: "2026-10-16", kind: "days", required: "1", target: "", amountUnit: "" };

test("every N days becomes a cycle period", () => {
  expect(taskDraftFrom(base)?.period).toEqual({ unit: "cycle", days: 14, from: "2026-10-16" });
});
test("a cycle needs a length of 2–366 and a start date", () => {
  expect(taskStillNeeded({ ...base, cycleDays: "1" })).toContain("a length of 2 to 366 days");
  expect(taskStillNeeded({ ...base, cycleDays: "" })).toContain("a length of 2 to 366 days");
  expect(taskStillNeeded({ ...base, cycleFrom: "" })).toContain("a start date");
});
test("days needed is bounded by the cycle and by 31", () => {
  expect(taskStillNeeded({ ...base, cycleDays: "3", required: "4" })).toContain("how many days");
  expect(taskStillNeeded({ ...base, cycleDays: "42", required: "32" })).toContain("how many days");
});
test("editing a cycle task keeps its length and start", () => {
  // render <TaskForm initial={{ game: "zzz", title: "x", period: { unit: "cycle", days: 14, from: "2026-10-16" }, measure: { kind: "days", required: 1 } }} …/>,
  // press Save, and expect onSave's draft.period to equal the initial period.
});
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement**
  - `TaskFields`: `unit: "week" | "month" | "cycle"`, `cycleDays: string`, `cycleFrom: string`.
  - Initial state: `unit: initial?.period.unit ?? "week"`, `cycleDays: initial?.period.unit === "cycle" ? String(initial.period.days) : "14"`, `cycleFrom: initial?.period.unit === "cycle" ? initial.period.from : ""`.
  - `parseCycleDays(raw): number | null` — integer 2–366 or null.
  - `taskStillNeeded`: for `cycle`, push `"a length of 2 to 366 days"` when `parseCycleDays` is null and `"a start date"` when `cycleFrom` is not `YYYY-MM-DD`; days bound `most = unit === "week" ? 7 : unit === "month" ? 31 : Math.min(31, parseCycleDays(cycleDays) ?? 31)`.
  - `taskDraftFrom`: period for cycle `{ unit: "cycle", days: parseCycleDays(f.cycleDays)!, from: f.cycleFrom }` (still-needed already guarantees both).
  - UI: a third pill **Every N days** after *Every month*; when chosen, `every [number 2–366, aria-label "Cycle length in days"] days, from [<input type="date" aria-label="Cycle starts on">]`; the hint under it for cycle: "Pick a day a cycle began — the day after one ended. It rolls at the game's daily reset, on your server." The days-needed caption: `this ${f.unit}` reads "this cycle".
  - `withTaskTemplate` unchanged (templates set week or month).

- [ ] **Step 4: Run** the form tests, then `bun test` and `bun run typecheck` — PASS.

- [ ] **Step 5: Browser check** — build (`bun run build:css && bun run build:js && bun run build:static`), serve on a fresh port (`PORT=<free> bun run serve.ts`, backgrounded, PID noted), drive with puppeteer-core (`/usr/bin/google-chrome-stable`) at 390×844: open *Your own* → *Add a task*, choose Every N days, fill 14 / a date, save; the strip shows the chip with `· Nd` under "This … cycle"; open it again in the form and see 14 and the date. Screenshot to the scratchpad. Stop only that PID.

- [ ] **Step 6: Commit** `feat(tasks): set up a task that repeats every N days`.

### Task 3: A built-in can follow another server's clock

Commit: `feat(routines): a built-in can roll on one server's reset for everyone`.

**Files:** Modify `src/shared/routines.ts`, `src/shared/task.ts`, `src/client/components/Dailies.tsx`, `src/client/App.tsx` (if `taskStatusOf` drops fields); Test `test/routines.test.ts`, `test/task.test.ts`, `test/views.test.tsx`.

**Interfaces — produces:** `RoutineSchema.clock?: Region`; `taskStatus({ task: Pick<Task,"game"|"period"|"measure"> & { clock?: Region } , … })`; `StripTask = TaskShape & { asOf?: string; clock?: Region }`; `DailyItem.clock?: Region`.

- [ ] **Step 1: Failing tests**
  - `task.test.ts`:
    ```ts
    test("a clocked task's day is cut on that server's reset", () => {
      const t = { game: "nte", period: { unit: "cycle" as const, days: 14, from: "2026-10-22" }, measure: { kind: "days" as const, required: 1 }, clock: "asia" as const };
      const before = taskStatus({ task: t, region: "europe", now: Date.parse("2026-10-21T20:59:00Z"), logged: [] });
      const after = taskStatus({ task: t, region: "europe", now: Date.parse("2026-10-21T21:01:00Z"), logged: [] });
      expect(before.periodStart).toBe("2026-10-08");
      expect(after.periodStart).toBe("2026-10-22");
    });
    ```
    (Asia NTE resets 05:00 UTC+8 = 21:00 UTC — check `games.ts` for NTE's Asia offset before relying on it; if it is not 21:00 UTC, stop and report.)
  - `views.test.tsx`: `dailyGroups` with a clocked `StripTask` at 2026-10-21T21:01Z for a Europe reader gives that item `today: "2026-10-22"` and `clock: "asia"`, while the game's chore keeps `today: "2026-10-21"`.
  - `routines.test.ts`: `test("a clock is only on cycles", () => { for (const r of ROUTINES) if (r.clock !== undefined) expect(r.period.unit).toBe("cycle"); })`.

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement**
  - `RoutineSchema`: `clock: Region.optional()` with doc: "The server whose reset this rolls on for every reader — a cycle that ends at one instant everywhere (spec 2026-10-16, decision 3). Code only, never stored; *Make it mine* drops it." Import `Region` from `schema.ts`.
  - `taskStatus`: `const today = dayKey(now, task.clock ?? region, task.game as LaneId);`.
  - `Dailies.tsx` task loop: `const clock = task.clock; const itemToday = clock === undefined ? today : dayKey(now, clock, lane); const itemResets = clock === undefined ? resetsIn : msUntilReset(now, clock, lane);` and set `today: itemToday, resetsIn: itemResets, ...(clock === undefined ? {} : { clock })`.
  - `DailyItem.clock?: Region | undefined` — "the server whose reset this item follows, when not the reader's".
  - `CatchUpPanel`: `catchUpDays(now, item.clock ?? region, item.game, item.notBefore)`.
  - `mineFrom` already lists fields explicitly, so `clock` is not copied; add a test in `routines.test.ts` § making a built-in your own that `"clock" in mineFrom({...r, clock: "asia"})` is false.

- [ ] **Step 4: Run** `bun test`, `bun run typecheck` — PASS.

- [ ] **Step 5: Commit**.

### Task 4: Docs

Commit: `docs: record every-N-days periods, their switch and built-in clocks`.

- [ ] `docs/DATA-MODEL.md`: the tasks storage line (`period: … | { unit: "cycle", days: 2–366, from: "YYYY-MM-DD" }`), the prefs list (`showCycleTasks`), the § on how periods are cut (cycles: `from + k·days`, both ways), and the stored-shape note from the spec (an older bundle skips a cycle task on display and deletes nothing).
- [ ] `docs/PRD.md` tasks section (~line 578): "every week, every month, or every N days from a start date"; the switches sentence names `showCycleTasks`; F17 mentions longer cycles and `clock`.
- [ ] Run `bun test` (docs tests, if any, e.g. changelog/doc link checks). Commit.

### Task 5: Schema review

- [ ] Run the `schema-guardian` agent on the branch diff (`git diff main...HEAD`) — stored keys `gacha-tracker:v1:tasks`, `gacha-tracker:v1:prefs`, `amounts` keyed by cycle start. Fix anything it finds in its own commit before the entries.

### Task 6: The entries (one commit per game; held for the owner)

Each entry exactly as the spec's § Entries; `checked: "2026-10-16"`; ids as listed. Add each to `ROUTINES` after that game's existing items, and extend that game's line in the `"each game's, as sourced"` test with `["<title>", { unit: "cycle", days: N, from: "<key>" }, <measure>]`. Commits, in order:

- [ ] `feat(routines): Star Rail's endgame modes and weekly points` — Pure Fiction / Memory of Chaos / Apocalyptic Shadow (cycle 42; from 2026-10-19 / 2026-11-02 / 2026-11-16; `{ kind: "days", required: 1 }`; source `https://honkai-star-rail.fandom.com/wiki/Interastral_Peace_Guide/Treasures_Lightward`, `asOf: "2026-08-15"`; note on each "Six-week rotation, one mode every two weeks.") and *Divergent Universe & Currency Wars points* (week Monday; `{ kind: "amount", target: 18000, unit: "points" }`; source `https://honkai-star-rail.fandom.com/wiki/Version/4.2`, `asOf: "2026-09-07"`; note "One cap shared by both modes; weekly since 4.2. Confirmed in game, 2026-10-14.").
- [ ] `feat(routines): ZZZ's Shiyu Defense and Deadly Assault` — cycle 14 from 2026-10-16 (`https://zenless-zone-zero.fandom.com/wiki/Shiyu_Defense/Critical_Node`, `asOf: "2026-01-02"`, note "Fridays, alternating weeks with Deadly Assault.") and from 2026-10-23 (`https://zenless-zone-zero.fandom.com/wiki/Deadly_Assault`, `asOf: "2026-07-31"`, note "Fridays, alternating weeks with Shiyu Defense.").
- [ ] `feat(routines): Wuthering Waves' Tower of Adversity` — cycle 28 from 2026-11-09, `https://gamemarket.gg/news/wuthering-waves/wuthering-waves-tower-of-adversity-guide-zones-vigor-rewards`, `asOf: "2026-08-25"`, note "The Hazard Zone; the source says roughly 28 days."
- [ ] `feat(routines): NTE's Beyond the Rails and Tycoon Incentive Fund` — Beyond the Rails: cycle 14 from 2026-10-22, `clock: "asia"`, `https://gamewith.net/nte/74216`, `asOf: "2026-08-13"`, note "Ends at the Asia server's reset on every server, as read on Europe 2026-10-16."; Tycoon Incentive Fund: cycle 14 from 2026-10-26, `{ kind: "amount", target: 1000000, unit: "fons" }`, `https://allthings.how/neverness-to-everness-tycoon-encouragement-fund-what-changed-for-pink-paws-heist/`, `asOf: "2026-08-15"`, note "The base cap; the Puka Membership Program raises yours. Make it mine to set it."
- [ ] Every note ≤ 140 chars (the schema enforces it; the test suite parses `ROUTINES`). `bun test` + typecheck after each.
- [ ] Spec § Entries / built-in routines spec § Not shipped rows: move the shipped items out of the older spec's *Not shipped* table into a line pointing at the new spec, in the HSR commit (DU/CW, the three modes), ZZZ commit, Wuwa commit (Tower only — Whimpering Wastes stays), NTE commit.

### Task 7: Browser check of the entries, TODO, changelog

- [ ] Build and serve on a fresh port; with built-ins on for Star Rail, ZZZ, Wuwa and NTE at phone width, see the cycle chips and their day counts, the heading, the header tally; screenshot. Stop only that PID.
- [ ] `TODO.md`: sub-project 2 marked done with a pointer to the spec; new open items: Whimpering Wastes (needs a "last Monday of the month" period, or a source for a fixed length) and Nikki's Pinnacle Contest (the 1st and 16th — a half-month period). Commit `docs(todo): …`.
- [ ] `src/shared/changelog.ts`: entries for the period, the form, and the new built-ins, in a `chore(changelog)` commit naming the feature commits; run `bun run scripts/check-changelog.ts`.
- [ ] Ask the owner for the spec's four in-game checks; merge (fast-forward) and push to `origin` only once they are confirmed.
