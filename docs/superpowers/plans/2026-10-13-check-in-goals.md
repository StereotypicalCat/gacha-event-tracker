# Event Check-in Goals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the reader give a repeating event a check-in goal — N days each week, or N days across the event — that keeps it in Dailies, counts their ticks against it, and never marks the event done on its own.

**Architecture:** Two pure shared modules — `period.ts` (week/month periods in day-key space) and `goal.ts` (schema, `readGoal`, `goalStatus`, copy helpers). The goal is stored unparsed on the existing `progress` record and validated where it is used. The client wires goal status into the Dailies chips and the detail sheet's checklist and new goal control.

**Tech Stack:** Bun, TypeScript, React 19 (static-render tests), Zod 3, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-10-03-check-in-goals-design.md`

## Global Constraints

- No change to `GachaEvent`, event IDs, day-log keys, the `YYYY-MM-DD` game-day format, reset mapping or any localStorage key.
- All calculations take `now` explicitly; a day key later than today never counts.
- A goal never writes `status: "done"`; only the reader's explicit action does.
- Never strip or drop a stored goal on load or import; an unreadable one behaves as no goal.
- Zod is the source of truth for the goal type (`z.infer`).
- Colour is a token; game hues arrive inline as today. No literal colours.
- Commits: one coherent change each, typecheck and `bun test` green at every commit, plain-English subject, body says why, pathspec commits (`git commit -- <paths>`), check `git status --porcelain` first, one command per Bash call.

## Review Focus

1. **Ticks just before and at a game's reset** — a tick at 03:59 Europe server time on Monday belongs to last week; at 04:00 to this week. Pinned in Task 1 through `dayKey` + `periodOf`.
2. **A goal-only progress record** (no status, note, effort) — must survive every patch and export/import. Pinned in Task 3.
3. **A future-shaped goal** (`measure: "amount"` from spec 2) loaded by this build — must leave the record intact and behave as no goal. Pinned in Tasks 2 and 3.
4. **Meeting the week by backfilling** a past day in Catch up — the strip completes but must not celebrate. Pinned in Task 4.
5. **Event not yet started / week cut by the event start** — no negative counts, target not lowered, `shortfall` set. Pinned in Task 2.

---

### Task 1: Period engine

**Files:**
- Create: `src/shared/period.ts`
- Test: `test/period.test.ts`

**Interfaces:**
- Produces: `PeriodSchema`, `type Period`, `WeekdaySchema`, `isoWeekday(key: string): number`, `addDays(key: string, n: number): string`, `periodOf(period: Period, today: string): { start: string; days: string[] }`.

- [ ] **Step 1: Write the failing test** — `test/period.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import { dayKey, nextResetMs } from "../src/shared/daily.ts";
import { addDays, isoWeekday, periodOf } from "../src/shared/period.ts";

describe("isoWeekday", () => {
  test("Monday is 1 and Sunday is 7", () => {
    expect(isoWeekday("2026-10-12")).toBe(1);
    expect(isoWeekday("2026-10-18")).toBe(7);
  });
});

describe("addDays", () => {
  test("crosses month and year ends", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("periodOf: weeks", () => {
  const week = (startsOn: number) => ({ unit: "week" as const, startsOn });

  test("a Monday week holds Monday to Sunday", () => {
    const p = periodOf(week(1), "2026-10-15");
    expect(p.start).toBe("2026-10-12");
    expect(p.days).toEqual([
      "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15",
      "2026-10-16", "2026-10-17", "2026-10-18",
    ]);
  });

  test("the start day is its own week's first day", () => {
    expect(periodOf(week(1), "2026-10-12").start).toBe("2026-10-12");
    expect(periodOf(week(1), "2026-10-18").start).toBe("2026-10-12");
  });

  test("every start weekday lands on that weekday, on or before today", () => {
    for (let s = 1; s <= 7; s++) {
      const p = periodOf(week(s), "2026-10-15");
      expect(isoWeekday(p.start)).toBe(s);
      expect(p.start <= "2026-10-15").toBe(true);
      expect(p.days).toHaveLength(7);
      expect(p.days).toContain("2026-10-15");
    }
  });

  test("a week can span a year end", () => {
    expect(periodOf(week(1), "2027-01-01").days[0]).toBe("2026-12-28");
  });

  test("the week rolls at each region's Genshin reset, not at midnight", () => {
    // Monday 2026-10-12's reset: 20:00Z Sunday in Asia, 03:00Z in Europe,
    // 09:00Z in America.
    for (const region of ["asia", "europe", "america"] as const) {
      const reset = nextResetMs(Date.parse("2026-10-11T12:00:00Z"), region, "genshin");
      const before = periodOf(week(1), dayKey(reset - 1, region, "genshin"));
      const at = periodOf(week(1), dayKey(reset, region, "genshin"));
      expect(before.start).toBe("2026-10-05");
      expect(at.start).toBe("2026-10-12");
    }
  });

  test("a game with a reset override rolls on its own hour", () => {
    // hololive Dreams rolls at 05:00 JST (resetHourLocal), not the 04:00 default.
    const reset = nextResetMs(Date.parse("2026-10-11T12:00:00Z"), "asia", "holodori");
    expect(new Date(reset).toISOString()).toBe("2026-10-11T20:00:00.000Z");
    expect(periodOf(week(1), dayKey(reset - 1, "asia", "holodori")).start).toBe("2026-10-05");
    expect(periodOf(week(1), dayKey(reset, "asia", "holodori")).start).toBe("2026-10-12");
  });
});

describe("periodOf: months", () => {
  const month = (startsOn: number) => ({ unit: "month" as const, startsOn });

  test("a month from the 1st", () => {
    const p = periodOf(month(1), "2026-10-15");
    expect(p.start).toBe("2026-10-01");
    expect(p.days).toHaveLength(31);
    expect(p.days.at(-1)).toBe("2026-10-31");
  });

  test("before this month's start day, the period began last month", () => {
    const p = periodOf(month(16), "2026-10-15");
    expect(p.start).toBe("2026-09-16");
    expect(p.days.at(-1)).toBe("2026-10-15");
  });

  test("a start day past the month's end clamps to its last day", () => {
    expect(periodOf(month(31), "2026-09-30").start).toBe("2026-09-30");
    expect(periodOf(month(31), "2026-09-29").start).toBe("2026-08-31");
    expect(periodOf(month(31), "2026-10-05").days[0]).toBe("2026-09-30");
    expect(periodOf(month(30), "2027-02-28").start).toBe("2027-02-28");
  });
});
```

Note: the holodori assertion `20:00Z` comes from `resetHourLocal.asia = 5` at UTC+9. If `games.ts` gives a different instant, correct the expected ISO string from `nextResetMs` output — the period assertions are the point.

- [ ] **Step 2: Run it to see it fail**

Run: `bun test test/period.test.ts`
Expected: FAIL — cannot find module `../src/shared/period.ts`.

- [ ] **Step 3: Implement** — `src/shared/period.ts`

```ts
import { z } from "zod";
import { DAY } from "./time.ts";

/**
 * Periods longer than a day — a week, a month — in day-key space.
 *
 * Every key here is a `YYYY-MM-DD` game-day that `dayKey` already cut on a
 * game's own reset clock for the reader's region. Working on keys rather than
 * instants means a period inherits every per-game, per-region reset rule for
 * free: the week rolls when the game's day rolls, and nowhere else. `streakOf`
 * and `catchUpDays` walk keys for the same reason.
 *
 * Pure, and takes "today" as an argument, so it is tested at fixed instants.
 */

/** ISO weekday: Monday is 1, Sunday is 7. */
export const WeekdaySchema = z.number().int().min(1).max(7);

export const PeriodSchema = z.union([
  z.object({ unit: z.literal("week"), startsOn: WeekdaySchema }),
  /** Day of month; 31 means "the last day" in a shorter month. */
  z.object({ unit: z.literal("month"), startsOn: z.number().int().min(1).max(31) }),
]);
export type Period = z.infer<typeof PeriodSchema>;

const msOf = (key: string) => Date.parse(`${key}T00:00:00Z`);
const keyOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** A key is a date, not an instant, so its weekday is its UTC weekday. */
export function isoWeekday(key: string): number {
  const d = new Date(msOf(key)).getUTCDay();
  return d === 0 ? 7 : d;
}

export function addDays(key: string, n: number): string {
  return keyOf(msOf(key) + n * DAY);
}

/** The month's start key, with `startsOn` clamped to the month's last day. */
function monthStart(year: number, month0: number, startsOn: number): string {
  // Date.UTC normalises an out-of-range month, so month0 may be -1 or 12.
  const first = new Date(Date.UTC(year, month0, 1));
  const y = first.getUTCFullYear();
  const m = first.getUTCMonth();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return keyOf(Date.UTC(y, m, Math.min(startsOn, last)));
}

/** The period containing `today`: its first key, and every key in it, oldest first. */
export function periodOf(
  period: Period,
  today: string,
): { start: string; days: string[] } {
  let start: string;
  let next: string;
  if (period.unit === "week") {
    start = addDays(today, -((isoWeekday(today) - period.startsOn + 7) % 7));
    next = addDays(start, 7);
  } else {
    const t = new Date(msOf(today));
    const y = t.getUTCFullYear();
    const m = t.getUTCMonth();
    const here = monthStart(y, m, period.startsOn);
    const startMonth = today >= here ? m : m - 1;
    start = today >= here ? here : monthStart(y, m - 1, period.startsOn);
    next = monthStart(y, startMonth + 1, period.startsOn);
  }
  const days: string[] = [];
  for (let k = start; k < next; k = addDays(k, 1)) days.push(k);
  return { start, days };
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test test/period.test.ts`
Expected: PASS. Then `bun run typecheck` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/shared/period.ts test/period.test.ts
git commit -m "feat(period): cut weeks and months on each game's reset clock" -- src/shared/period.ts test/period.test.ts
```
(Body: goals and weekly tasks both need a period longer than a day; working in day keys inherits every reset rule. Co-Authored-By trailer.)

---

### Task 2: Goal model and status

**Files:**
- Create: `src/shared/goal.ts`
- Test: `test/goal.test.ts`

**Interfaces:**
- Consumes: `periodOf`, `addDays`, `WeekdaySchema` (Task 1); `dailyDays`, `dayKey` from `daily.ts`; `LaneId` from `custom.ts`; `Region` from `schema.ts`.
- Produces:
  - `GoalSchema`, `type Goal`
  - `readGoal(stored: unknown): Goal | undefined`
  - `interface GoalStatus { scope: "week" | "event"; required: number; count: number; met: boolean; needed: number; open: number | null; shortfall: boolean }`
  - `goalStatus(input: { goal: Goal; startsMs: number; endsMs: number | null; region: Region; game: LaneId; now: number; logged: readonly string[] }): GoalStatus`
  - `goalCaption(s: GoalStatus): string`, `goalCount(s: GoalStatus): string`, `goalLabel(s: GoalStatus): string`
  - `clampRequired(period: "week" | "event", n: number, maxDays: number | null): number`

- [ ] **Step 1: Write the failing test** — `test/goal.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import {
  clampRequired,
  goalCaption,
  goalCount,
  goalLabel,
  goalStatus,
  readGoal,
  type Goal,
} from "../src/shared/goal.ts";

// Genshin, Europe: the day rolls at 03:00Z. Noon is safely inside a game-day.
const noon = (key: string) => Date.parse(`${key}T12:00:00Z`);
const START = Date.parse("2026-08-10T03:00:00Z"); // Monday's reset
const END = Date.parse("2026-11-02T03:00:00Z"); // twelve weeks later
const weekly: Goal = { period: "week", measure: "days", required: 5, weekStartsOn: 1 };
const base = { startsMs: START, endsMs: END, region: "europe" as const, game: "genshin" };

describe("readGoal", () => {
  test("reads a valid goal", () => {
    expect(readGoal(weekly)).toEqual(weekly);
  });
  test("absent, malformed or future-shaped is undefined, and never throws", () => {
    expect(readGoal(undefined)).toBeUndefined();
    expect(readGoal({ period: "week", required: 9 })).toBeUndefined();
    expect(readGoal({ period: "week", measure: "amount", target: 2100, weekStartsOn: 1 }))
      .toBeUndefined();
    expect(readGoal("five")).toBeUndefined();
  });
});

describe("goalStatus: each week", () => {
  test("three distinct ticks this week read 3 of 5", () => {
    const s = goalStatus({
      ...base, goal: weekly, now: noon("2026-10-15"),
      logged: ["2026-10-12", "2026-10-13", "2026-10-15"],
    });
    expect(s).toMatchObject({ scope: "week", count: 3, required: 5, met: false, needed: 2 });
    // Thursday unticked is gone; today (Thu, ticked) and Fri–Sun remain: 3 open.
    expect(s.open).toBe(3);
    expect(s.shortfall).toBe(false);
  });

  test("five non-consecutive days meet the week", () => {
    const s = goalStatus({
      ...base, goal: weekly, now: noon("2026-10-18"),
      logged: ["2026-10-12", "2026-10-14", "2026-10-15", "2026-10-17", "2026-10-18"],
    });
    expect(s.met).toBe(true);
    expect(s.needed).toBe(0);
  });

  test("last week's ticks and backfills never count toward this week", () => {
    const s = goalStatus({
      ...base, goal: weekly, now: noon("2026-10-19"),
      logged: ["2026-10-12", "2026-10-14", "2026-10-15", "2026-10-17", "2026-10-18"],
    });
    expect(s.count).toBe(0);
    expect(s.met).toBe(false);
  });

  test("a future tick never counts", () => {
    const s = goalStatus({
      ...base, goal: weekly, now: noon("2026-10-13"),
      logged: ["2026-10-12", "2026-10-16"],
    });
    expect(s.count).toBe(1);
  });

  test("removing a tick below target unmeets the week", () => {
    const five = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"];
    const now = noon("2026-10-16");
    expect(goalStatus({ ...base, goal: weekly, now, logged: five }).met).toBe(true);
    expect(goalStatus({ ...base, goal: weekly, now, logged: five.slice(1) }).met).toBe(false);
  });

  test("the last, short week keeps its target and reports the shortfall", () => {
    // Event ends Monday 2 Nov at reset, so the last week is Mon 26 Oct – Sun 1 Nov.
    // Same shape, cut short: an event ending Thursday 29 Oct at reset.
    const s = goalStatus({
      ...base, endsMs: Date.parse("2026-10-29T03:00:00Z"), goal: weekly,
      now: noon("2026-10-27"), logged: ["2026-10-26"],
    });
    expect(s.required).toBe(5);
    expect(s.needed).toBe(4);
    expect(s.open).toBe(2); // Tue 27 and Wed 28
    expect(s.shortfall).toBe(true);
  });

  test("the first week is cut at the event start, not padded", () => {
    // An event opening on Thursday: Mon–Wed are not claimable.
    const s = goalStatus({
      ...base, startsMs: Date.parse("2026-10-15T03:00:00Z"), goal: weekly,
      now: noon("2026-10-15"), logged: ["2026-10-12", "2026-10-15"],
    });
    expect(s.count).toBe(1); // the Monday tick predates the event
    expect(s.open).toBe(3); // Thu (ticked) .. Sun: Fri, Sat, Sun unticked
    expect(s.shortfall).toBe(true);
  });

  test("an unknown end still has this week's boundary", () => {
    const s = goalStatus({
      ...base, endsMs: null, goal: weekly, now: noon("2026-10-15"), logged: [],
    });
    expect(s.open).toBe(4);
  });

  test("before the event starts, nothing counts and nothing is negative", () => {
    const s = goalStatus({
      ...base, goal: weekly, now: noon("2026-08-05"), logged: ["2026-08-05"],
    });
    expect(s.count).toBe(0);
    expect(s.needed).toBe(5);
  });
});

describe("goalStatus: across the event", () => {
  const seven = {
    ...base,
    startsMs: Date.parse("2026-10-12T03:00:00Z"),
    endsMs: Date.parse("2026-10-19T03:00:00Z"),
  };
  const total: Goal = { period: "event", measure: "days", required: 5 };

  test("reaches its target on the fifth recorded day", () => {
    const logged = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"];
    expect(goalStatus({ ...seven, goal: total, now: noon("2026-10-15"), logged }).met)
      .toBe(false);
    const s = goalStatus({
      ...seven, goal: total, now: noon("2026-10-16"), logged: [...logged, "2026-10-16"],
    });
    expect(s).toMatchObject({ scope: "event", count: 5, met: true });
  });

  test("an unknown end counts ticks but cannot say how many days are left", () => {
    const s = goalStatus({
      ...seven, endsMs: null, goal: total, now: noon("2026-10-14"),
      logged: ["2026-10-12", "2026-10-14", "2026-10-20"],
    });
    expect(s.count).toBe(2);
    expect(s.open).toBeNull();
    expect(s.shortfall).toBe(false);
  });

  test("a tick outside the window does not count", () => {
    const s = goalStatus({
      ...seven, goal: total, now: noon("2026-10-14"), logged: ["2026-10-11", "2026-10-13"],
    });
    expect(s.count).toBe(1);
  });
});

describe("copy", () => {
  const status = (over: Partial<ReturnType<typeof goalStatus>>) => ({
    scope: "week" as const, required: 5, count: 3, met: false, needed: 2,
    open: 4, shortfall: false, ...over,
  });

  test("captions", () => {
    expect(goalCaption(status({}))).toBe("3 of 5 this week · 2 needed · 4 days left this week");
    expect(goalCaption(status({ open: 1, needed: 2, shortfall: true })))
      .toBe("3 of 5 this week · 2 needed, 1 day left this week");
    expect(goalCaption(status({ count: 5, met: true, needed: 0 }))).toBe("5 of 5 · Done this week");
    expect(goalCaption(status({ scope: "event", open: 9 }))).toBe("3 of 5 · 2 needed · 9 days left");
    expect(goalCaption(status({ scope: "event", open: null }))).toBe("3 of 5 · 2 needed");
    expect(goalCaption(status({ scope: "event", count: 5, met: true, needed: 0 })))
      .toBe("5 of 5 · Goal reached");
  });

  test("chip count and label", () => {
    expect(goalCount(status({}))).toBe("3/5 wk");
    expect(goalCount(status({ scope: "event" }))).toBe("3/5");
    expect(goalLabel(status({}))).toBe("3 of 5 this week");
    expect(goalLabel(status({ met: true }))).toBe("done this week");
    expect(goalLabel(status({ scope: "event", met: true }))).toBe("goal reached");
    expect(goalLabel(status({ scope: "event" }))).toBe("3 of 5");
  });
});

describe("clampRequired", () => {
  test("weekly is 1–7; event-wide is capped by known days", () => {
    expect(clampRequired("week", 9, null)).toBe(7);
    expect(clampRequired("week", 0, null)).toBe(1);
    expect(clampRequired("event", 30, 14)).toBe(14);
    expect(clampRequired("event", 30, null)).toBe(30);
    expect(clampRequired("event", Number.NaN, 14)).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bun test test/goal.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `src/shared/goal.ts`

```ts
import { z } from "zod";
import type { LaneId } from "./custom.ts";
import { dailyDays, dayKey } from "./daily.ts";
import { addDays, periodOf, WeekdaySchema } from "./period.ts";
import type { Region } from "./schema.ts";

/**
 * A check-in goal: the event wants N distinct game-days, per week or across its
 * whole run, rather than every day.
 *
 * Always the reader's input — nothing here reads a title or a source. Meeting
 * a goal never finishes the event: reaching a count may not have claimed the
 * rewards, so only the reader marks an event done.
 *
 * A plain union rather than discriminatedUnion("period"): weekly-tasks work
 * adds amount variants sharing a period with these, so no one field
 * discriminates.
 */
export const GoalSchema = z.union([
  z.object({
    period: z.literal("week"),
    measure: z.literal("days"),
    required: z.number().int().min(1).max(7),
    weekStartsOn: WeekdaySchema,
  }),
  z.object({
    period: z.literal("event"),
    measure: z.literal("days"),
    required: z.number().int().min(1).max(366),
  }),
]);
export type Goal = z.infer<typeof GoalSchema>;

/**
 * A stored goal, or undefined when absent or unreadable.
 *
 * **Validated here, never stripped from storage.** Dropping an unreadable field
 * on load would delete it on the next write, and the likeliest unreadable goal
 * is a newer shape read by an older cached bundle — see AGENTS.md § Events the
 * reader entered themselves.
 */
export function readGoal(stored: unknown): Goal | undefined {
  const parsed = GoalSchema.safeParse(stored);
  return parsed.success ? parsed.data : undefined;
}

export interface GoalStatus {
  scope: "week" | "event";
  required: number;
  /** Distinct ticked game-days in scope, never later than today. */
  count: number;
  met: boolean;
  needed: number;
  /** Unticked days in scope from today on; null when the end is unannounced. */
  open: number | null;
  /** Fewer days left than check-ins needed. The target is never lowered. */
  shortfall: boolean;
}

/** Bounds a walk over keys when the end is unknown; matches daily.ts. */
const MAX_DAYS = 200;

function keysFrom(first: string, last: string): string[] {
  const out: string[] = [];
  for (let k = first; k <= last && out.length < MAX_DAYS; k = addDays(k, 1)) out.push(k);
  return out;
}

export function goalStatus(input: {
  goal: Goal;
  startsMs: number;
  endsMs: number | null;
  region: Region;
  game: LaneId;
  now: number;
  logged: readonly string[];
}): GoalStatus {
  const { goal, startsMs, endsMs, region, game, now, logged } = input;
  const today = dayKey(now, region, game);
  const first = dayKey(startsMs, region, game);
  const run = dailyDays(startsMs, endsMs, region, game);

  let scope: string[];
  if (goal.period === "week") {
    // The rule defines this week's boundary even when the event's end is
    // unknown; the start still clips it, because a day before the event opened
    // was never claimable.
    const week = periodOf({ unit: "week", startsOn: goal.weekStartsOn }, today).days;
    scope = run === null ? week.filter((k) => k >= first) : week.filter((k) => run.includes(k));
  } else {
    scope = run ?? keysFrom(first, today);
  }

  const ticked = new Set(logged);
  const count = scope.filter((k) => k <= today && ticked.has(k)).length;
  const open =
    goal.period === "event" && run === null
      ? null
      : scope.filter((k) => k >= today && !ticked.has(k)).length;
  const needed = Math.max(0, goal.required - count);

  return {
    scope: goal.period,
    required: goal.required,
    count,
    met: count >= goal.required,
    needed,
    open,
    shortfall: open !== null && needed > open,
  };
}

const days = (n: number) => (n === 1 ? "1 day" : `${n} days`);

/** The checklist's line. An unticked past day is not "missed" here: every day was never required. */
export function goalCaption(s: GoalStatus): string {
  const tally = `${s.count} of ${s.required}`;
  if (s.met) return `${tally} · ${s.scope === "week" ? "Done this week" : "Goal reached"}`;
  const head = s.scope === "week" ? `${tally} this week` : tally;
  const left = s.scope === "week" ? " this week" : "";
  if (s.open === null) return `${head} · ${s.needed} needed`;
  if (s.shortfall) return `${head} · ${s.needed} needed, ${days(s.open)} left${left}`;
  return `${head} · ${s.needed} needed · ${days(s.open)} left${left}`;
}

/** The Dailies chip's short count. */
export function goalCount(s: GoalStatus): string {
  return `${s.count}/${s.required}${s.scope === "week" ? " wk" : ""}`;
}

/** Spoken state for the chip, after "done today" / "not done today". */
export function goalLabel(s: GoalStatus): string {
  if (s.met) return s.scope === "week" ? "done this week" : "goal reached";
  return s.scope === "week" ? `${s.count} of ${s.required} this week` : `${s.count} of ${s.required}`;
}

/** Keeps an edited count inside what the goal can mean. */
export function clampRequired(
  period: "week" | "event",
  n: number,
  maxDays: number | null,
): number {
  const max = period === "week" ? 7 : (maxDays ?? 366);
  if (!Number.isFinite(n)) return 1;
  return Math.min(max, Math.max(1, Math.round(n)));
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test test/goal.test.ts` → PASS; `bun run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/shared/goal.ts test/goal.test.ts
git commit -m "feat(goal): count check-ins against a weekly or event-wide target" -- src/shared/goal.ts test/goal.test.ts
```

---

### Task 3: Store goals on progress

**Files:**
- Modify: `src/client/state/useProgress.ts`
- Test: `test/progress.test.ts`

**Interfaces:**
- Consumes: `type Goal` (Task 2).
- Produces: `Progress.goal?: unknown`; exported pure `applyPatch(prev: ProgressMap, id: string, next: Partial<Progress>, at: string): ProgressMap` and `goalPatch(current: Progress | undefined, goal: Goal | undefined): Partial<Progress>`; hook returns `setGoal(id: string, goal: Goal | undefined)`; `setDaily` now also clears the goal.

- [ ] **Step 1: Write the failing tests** — append to `test/progress.test.ts`

```ts
import { applyPatch, goalPatch } from "../src/client/state/useProgress.ts";
// (merge into the existing import line from useProgress.ts)

const goal = { period: "week", measure: "days", required: 5, weekStartsOn: 1 } as const;
const T = "2026-10-13T12:00:00.000Z";

describe("goals on progress", () => {
  test("a goal-only record is kept", () => {
    const next = applyPatch({}, "e", { goal }, T);
    expect(next.e).toEqual({ goal, at: T });
  });

  test("clearing the only field drops the record", () => {
    const next = applyPatch({ e: { goal, at: T } }, "e", { goal: undefined }, T);
    expect(next.e).toBeUndefined();
  });

  test("setting a goal clears a stored 'not daily', and nothing else", () => {
    expect(goalPatch({ daily: false, at: T }, goal)).toEqual({ goal, daily: undefined });
    expect(goalPatch({ daily: true, at: T }, goal)).toEqual({ goal });
    expect(goalPatch(undefined, undefined)).toEqual({ goal: undefined });
  });

  test("an unreadable stored goal is left exactly as it was", () => {
    const future = { period: "week", measure: "amount", target: 2100, weekStartsOn: 1 };
    const next = applyPatch({ e: { goal: future, at: T } }, "e", { note: "hi" }, T);
    expect(next.e?.goal).toEqual(future);
  });

  test("goals survive export and import, and the later record wins", () => {
    const device: ProgressMap = { e: { status: "doing", at: at("10") } };
    const file = parseImportData(
      JSON.parse(JSON.stringify(buildExportData(
        { e: { goal, at: at("11") } }, {}, {}, { games: {}, events: {} },
      ))),
    );
    expect(mergeProgress(device, file!.progress!).e).toEqual({ goal, at: at("11") });
  });

  test("an export from before goals imports unchanged", () => {
    const old = { format: "gacha-tracker-export", version: 1, progress: { e: { status: "done", at: at("10") } } };
    expect(parseImportData(old)!.progress).toEqual({ e: { status: "done", at: at("10") } });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bun test test/progress.test.ts` → FAIL: `applyPatch` is not exported.

- [ ] **Step 3: Implement** in `src/client/state/useProgress.ts`

Add to `Progress`:

```ts
  /**
   * A check-in goal (shared/goal.ts), stored as the reader set it and read
   * through `readGoal`. Typed `unknown` on purpose: this store is never
   * validated on load, so a goal of a newer shape than this build understands
   * is kept rather than stripped on the next write.
   */
  goal?: unknown;
```

Add `p.goal === undefined &&` to `isEmpty`. Replace the body of `patch` with a pure exported function and use it:

```ts
/** One edit to one record, stamped `at`. Pure, so tests reach it directly. */
export function applyPatch(
  prev: ProgressMap,
  id: string,
  next: Partial<Progress>,
  at: string,
): ProgressMap {
  const merged: Progress = { ...prev[id], ...next, at };
  // An entry with nothing recorded is not worth keeping; drop it so the
  // store stays a set of things the reader actually said something about.
  if (isEmpty(merged)) {
    const { [id]: _removed, ...rest } = prev;
    return rest;
  }
  return { ...prev, [id]: merged };
}

/**
 * Setting a goal makes the event a daily; a stored `daily: false` would
 * contradict it, so that alone is cleared. Any other `daily` answer stays, so
 * removing the goal later restores exactly what was there before.
 */
export function goalPatch(
  current: Progress | undefined,
  goal: Goal | undefined,
): Partial<Progress> {
  if (goal === undefined) return { goal: undefined };
  return current?.daily === false ? { goal, daily: undefined } : { goal };
}
```

```ts
  const patch = useCallback((id: string, next: Partial<Progress>) => {
    setProgress((prev) => applyPatch(prev, id, next, new Date().toISOString()));
  }, []);

  // "This isn't a daily event" must not leave a goal hidden in storage that
  // contradicts it, so any daily answer clears the goal in the same write. The
  // other direction — "it repeats daily" — only ever runs on an event that has
  // no goal, because a goal already makes it daily.
  const setDaily = useCallback(
    (id: string, daily: boolean | undefined) => patch(id, { daily, goal: undefined }),
    [patch],
  );

  const setGoal = useCallback((id: string, goal: Goal | undefined) => {
    setProgress((prev) =>
      applyPatch(prev, id, goalPatch(prev[id], goal), new Date().toISOString()),
    );
  }, []);
```

Import `type Goal` from `../../shared/goal.ts`; add `setGoal` to the returned object.

- [ ] **Step 4: Run** `bun test test/progress.test.ts` → PASS; `bun test` → all pass; `bun run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(progress): keep a check-in goal on the reader's progress record" -- src/client/state/useProgress.ts test/progress.test.ts
```

---

### Task 4: Goals in the Dailies strip

**Files:**
- Modify: `src/client/components/Dailies.tsx`, `src/client/App.tsx`
- Test: `test/views.test.tsx`

**Interfaces:**
- Consumes: `GoalStatus`, `goalCount`, `goalLabel`, `readGoal`, `goalStatus` (Task 2); `prog.progress[id].goal` (Task 3).
- Produces: `DailyItem.goal?: GoalStatus | undefined`; `dailyGroups(..., showChores = true, goalFor: (id: string) => GoalStatus | undefined = () => undefined)`; exported `dailyTally(items: DailyItem[], daysFor: (id: string) => string[]): { total: number; complete: number; tickedToday: number }`; exported `chipLabel(base: string, isDone: boolean, goal: GoalStatus | undefined): string`; `Dailies` prop `goalFor?: (id: string) => GoalStatus | undefined`.

- [ ] **Step 1: Write the failing tests** — in `test/views.test.tsx`, extend the import from `Dailies.tsx` with `chipLabel, dailyTally`, and add inside/after `describe("dailyGroups")`:

```ts
describe("goals in the dailies strip", () => {
  const NOW = Date.parse("2026-10-15T12:00:00.000Z");
  const meta = (id: string) => metaFor(id, {});
  const startOf = (e: { startsAt: string }) => Date.parse(e.startsAt);
  const ev = {
    id: "g1", game: "genshin", title: "To Temper Thyself", type: "other", summary: null,
    startsAt: "2026-08-10T00:00:00.000Z", startPrecision: "day",
    endsAt: "2026-11-02T00:00:00.000Z", endPrecision: "day",
    regionScoped: false, regionEnds: null, sourceUrl: "https://example.test",
  } as never;
  const status = (over = {}) => ({
    scope: "week" as const, required: 5, count: 3, met: false, needed: 2,
    open: 4, shortfall: false, ...over,
  });

  test("an event's item carries its goal status", () => {
    const [group] = dailyGroups(["genshin"], [ev], NOW, "europe", meta, startOf, false,
      (id) => (id === "g1" ? status() : undefined));
    expect(group!.items[0]!.goal).toEqual(status());
  });

  test("a met goal completes the item without a tick, and is not a tick", () => {
    const [group] = dailyGroups(["genshin"], [ev], NOW, "europe", meta, startOf, false,
      () => status({ count: 5, met: true, needed: 0 }));
    expect(dailyTally(group!.items, () => [])).toEqual({ total: 1, complete: 1, tickedToday: 0 });
  });

  test("labels separate done today, done this week and goal reached", () => {
    expect(chipLabel("X", true, status())).toBe("X, done today, 3 of 5 this week");
    expect(chipLabel("X", false, status())).toBe("X, not done today, 3 of 5 this week");
    expect(chipLabel("X", false, status({ met: true }))).toBe("X, done this week");
    expect(chipLabel("X", false, status({ scope: "event", met: true }))).toBe("X, goal reached");
    expect(chipLabel("X", false, undefined)).toBe("X, not done today");
  });

  test("the chip shows the count", () => {
    const html = render(
      <Dailies games={["genshin"]} events={[ev]} region="europe" now={NOW}
        daysFor={() => []} onToggleDay={() => {}} showChores={false}
        goalFor={() => status()} />,
    );
    expect(html).toContain("3/5 wk");
    expect(html).toContain("Today&#x27;s dailies · 0/1");
  });

  test("a met week counts as complete in the header", () => {
    const html = render(
      <Dailies games={["genshin"]} events={[ev]} region="europe" now={NOW}
        daysFor={() => []} onToggleDay={() => {}} showChores={false}
        goalFor={() => status({ count: 5, met: true, needed: 0 })} />,
    );
    expect(html).toContain("Today&#x27;s dailies · 1/1");
  });
});
```

(If the header assertion's apostrophe encoding differs, match whatever `renderToStaticMarkup` emits for the existing header in this file.)

- [ ] **Step 2: Run** `bun test test/views.test.tsx` → FAIL: `chipLabel`/`dailyTally` not exported.

- [ ] **Step 3: Implement** in `Dailies.tsx`

1. Import `goalCount, goalLabel, type GoalStatus` from `../../shared/goal.ts`.
2. `DailyItem` gains:
   ```ts
   /** The event's check-in goal, when the reader set one. Chores have none. */
   goal?: GoalStatus | undefined;
   ```
3. `dailyGroups` gains a trailing parameter `goalFor: (id: string) => GoalStatus | undefined = () => undefined`, and the event item sets `goal: goalFor(event.id)`.
4. Add:
   ```ts
   /**
    * How much of the strip is finished. An item is complete when ticked today
    * or when its goal is already met — nothing is ticked on its behalf.
    * `tickedToday` is kept apart because only a real tick celebrates.
    */
   export function dailyTally(
     items: readonly DailyItem[],
     daysFor: (id: string) => string[],
   ): { total: number; complete: number; tickedToday: number } {
     let complete = 0;
     let tickedToday = 0;
     for (const i of items) {
       const ticked = daysFor(i.key).includes(i.today);
       if (ticked) tickedToday += 1;
       if (ticked || i.goal?.met === true) complete += 1;
     }
     return { total: items.length, complete, tickedToday };
   }

   /** The chip's accessible name: today's tick and the goal are separate facts. */
   export function chipLabel(
     base: string,
     isDone: boolean,
     goal: GoalStatus | undefined,
   ): string {
     if (!isDone && goal?.met === true) return `${base}, ${goalLabel(goal)}`;
     const today = isDone ? "done today" : "not done today";
     return goal === undefined ? `${base}, ${today}` : `${base}, ${today}, ${goalLabel(goal)}`;
   }
   ```
5. In `Dailies`, accept `goalFor` (optional, documented) and pass it to `dailyGroups`. Replace the `complete`/`total` lines with `const { total, complete, tickedToday } = dailyTally(items, daysFor);` and track `tickedToday` in `previous`:
   ```ts
   const previous = useRef<{ total: number; tickedToday: number } | null>(null);
   useEffect(() => {
     const was = previous.current;
     previous.current = { total, tickedToday };
     if (was === null || !allDone) return;
     // Celebrate a tick that finished the strip, and only that. A list that got
     // shorter, a backfilled day, or a week met by an earlier day all complete
     // the strip without a tick today, and a burst there congratulates the
     // reader for something they did not just do.
     if (was.total === total && tickedToday > was.tickedToday) setBurst((n) => n + 1);
   }, [total, tickedToday, allDone]);
   ```
   Keep the existing comment's reasoning, merged into the one above.
6. Pass `goal={item.goal}` to `TickChip`. In `TickChip`, add the prop and:
   ```ts
   const met = !isDone && goal?.met === true;
   ```
   - `aria-label={chipLabel(ariaLabel, isDone, goal)}`
   - `borderColor: isDone || met ? hue : …`, `color: isDone || met ? hue : "var(--color-muted)"`, background unchanged (only a real tick gets the wash).
   - Check path: `stroke={isDone || met ? "currentColor" : hue}`, `opacity={isDone || met ? 1 : 0.25}`, and when `met` add `strokeDasharray="2 2"` so the satisfied-week check reads as outlined rather than solid.
   - After the label: `{goal !== undefined && <span className="tnum shrink-0 text-[0.625rem] opacity-70">{goalCount(goal)}</span>}`; keep the streak span only when there is no goal (two counters on one pill is noise; the goal count is the one that answers the question).

Then in `App.tsx`:

```ts
import { goalStatus, readGoal, type GoalStatus } from "../shared/goal.ts";

  /** The reader's check-in goal for an event, if they set a readable one. */
  const goalOf = (id: string) => readGoal(prog.progress[id]?.goal);

  // A goal makes an event a daily whatever detection says: the reader has
  // told us they come back to it.
  const repeatsDaily = (row: RowEvent): boolean =>
    goalOf(row.event.id) !== undefined ||
    resolveDaily(row.event, prog.progress[row.event.id]?.daily, prefs.detectDaily);

  const goalStatusOf = (row: RowEvent): GoalStatus | undefined => {
    const goal = goalOf(row.event.id);
    if (goal === undefined) return undefined;
    return goalStatus({
      goal,
      startsMs: row.clock.startsMs,
      endsMs: row.clock.endsMs,
      region: prefs.region,
      game: row.event.game,
      now,
      logged: daily.daysFor(row.event.id),
    });
  };
```

and on `<Dailies …>` add:

```tsx
            goalFor={(id) => {
              const row = todo.find((r) => r.event.id === id);
              return row === undefined ? undefined : goalStatusOf(row);
            }}
```

- [ ] **Step 4: Run** `bun test` → PASS; `bun run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(dailies): show check-in goals and count a met week as done" -- src/client/components/Dailies.tsx src/client/App.tsx test/views.test.tsx
```

---

### Task 5: Set a goal in the detail sheet

**Files:**
- Create: `src/client/components/GoalControl.tsx`
- Modify: `src/client/components/DailyChecklist.tsx`, `src/client/components/EventDetail.tsx`, `src/client/App.tsx`
- Test: `test/views.test.tsx`

**Interfaces:**
- Consumes: `Goal`, `GoalStatus`, `goalStatus`, `goalCaption`, `clampRequired` (Task 2); `isoWeekday` (Task 1); `dailyDays`, `dayKey`; `prog.setGoal` (Task 3); `goalOf` in App (Task 4).
- Produces: `GoalControl({ goal, defaultWeekStartsOn, maxDays, onChange })`; `DailyChecklist` prop `goal?: GoalStatus`; `EventDetail` props `goal: Goal | undefined`, `onGoal: (id: string, goal: Goal | undefined) => void`.

- [ ] **Step 1: Write the failing tests** — `test/views.test.tsx`

```ts
import { GoalControl } from "../src/client/components/GoalControl.tsx";
import { DailyChecklist } from "../src/client/components/DailyChecklist.tsx";

describe("GoalControl", () => {
  test("off shows the three choices with Off pressed", () => {
    const html = render(<GoalControl goal={undefined} defaultWeekStartsOn={1} maxDays={84} onChange={() => {}} />);
    expect(html).toContain("Check-in goal");
    expect(html).toMatch(/aria-pressed="true"[^>]*>Off</);
    expect(html).toContain("Each week");
    expect(html).toContain("Across the event");
  });

  test("a weekly goal shows its count and start day", () => {
    const html = render(
      <GoalControl goal={{ period: "week", measure: "days", required: 5, weekStartsOn: 1 }}
        defaultWeekStartsOn={1} maxDays={84} onChange={() => {}} />,
    );
    expect(html).toContain('value="5"');
    expect(html).toMatch(/<option value="1" selected="">Monday<\/option>/);
  });
});

describe("DailyChecklist with a goal", () => {
  test("the caption reports the goal, not missed days", () => {
    const html = render(
      <DailyChecklist startsMs={Date.parse("2026-10-12T03:00:00Z")}
        endsMs={Date.parse("2026-11-02T03:00:00Z")} region="europe" game="genshin"
        now={Date.parse("2026-10-15T12:00:00Z")} logged={["2026-10-12"]} onToggleDay={() => {}}
        goal={{ scope: "week", required: 5, count: 1, met: false, needed: 4, open: 4, shortfall: false }} />,
    );
    expect(html).toContain("1 of 5 this week · 4 needed · 4 days left this week");
    expect(html).not.toContain("missed");
  });
});
```

- [ ] **Step 2: Run** `bun test test/views.test.tsx` → FAIL (module not found).

- [ ] **Step 3: Implement**

`src/client/components/GoalControl.tsx`:

```tsx
import { clampRequired, type Goal } from "../../shared/goal.ts";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const MODES = [
  { id: "off", label: "Off" },
  { id: "week", label: "Each week" },
  { id: "event", label: "Across the event" },
] as const;

/**
 * How many check-ins the event actually wants.
 *
 * Some events ask for five days out of seven, not every day. The reader says
 * so here — nothing is read off the title — and the checklist and the dailies
 * strip count against it. Meeting it never marks the event done.
 */
export function GoalControl({
  goal,
  defaultWeekStartsOn,
  maxDays,
  onChange,
}: {
  goal: Goal | undefined;
  /** The weekday of the event's first game-day: its weeks most likely start there. */
  defaultWeekStartsOn: number;
  /** Claimable days in the run, or null when the end is unannounced. */
  maxDays: number | null;
  onChange: (goal: Goal | undefined) => void;
}) {
  const mode = goal?.period ?? "off";
  const required = goal?.required ?? 5;

  const choose = (id: (typeof MODES)[number]["id"]) => {
    if (id === "off") return onChange(undefined);
    if (id === "week") {
      return onChange({
        period: "week",
        measure: "days",
        required: clampRequired("week", required, null),
        weekStartsOn: goal?.period === "week" ? goal.weekStartsOn : defaultWeekStartsOn,
      });
    }
    onChange({ period: "event", measure: "days", required: clampRequired("event", required, maxDays) });
  };

  const setRequired = (raw: string) => {
    if (goal === undefined) return;
    const n = clampRequired(goal.period, Number.parseInt(raw, 10), maxDays);
    onChange({ ...goal, required: n });
  };

  return (
    <div className="mt-3">
      <p className="eyebrow">Check-in goal</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {MODES.map((m) => {
          const on = mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => choose(m.id)}
              aria-pressed={on}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                on
                  ? "border-near/70 bg-near/15 text-near"
                  : "border-hairline text-faint hover:text-muted"
              }`}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {goal !== undefined && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          <input
            type="number"
            aria-label="Days needed"
            min={1}
            max={goal.period === "week" ? 7 : (maxDays ?? 366)}
            value={goal.required}
            onChange={(e) => setRequired(e.target.value)}
            className="tnum w-14 rounded-lg border border-hairline bg-ground px-2 py-1 text-sm text-ink focus:border-faint focus:outline-none"
          />
          <span>{goal.period === "week" ? "days each week, weeks start" : "days across the event"}</span>
          {goal.period === "week" && (
            <select
              aria-label="Week starts on"
              value={goal.weekStartsOn}
              onChange={(e) => onChange({ ...goal, weekStartsOn: Number(e.target.value) })}
              className="rounded-lg border border-hairline bg-ground px-2 py-1 text-sm text-ink focus:border-faint focus:outline-none"
            >
              {WEEKDAYS.map((name, i) => (
                <option key={name} value={i + 1}>{name}</option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}
```

`DailyChecklist.tsx`: add optional prop `goal?: GoalStatus | undefined` (documented: "When set, the caption counts against it instead of reporting missed days"). In the known-days branch render `{goal !== undefined ? goalCaption(goal) : caption(summary, todayInWindow)}`. In the unknown-end branch, when `goal !== undefined`, render a `<p className="mt-2.5 text-xs leading-relaxed text-faint">{goalCaption(goal)}</p>` before the existing paragraph.

`EventDetail.tsx`: add props `goal: Goal | undefined` and `onGoal: (id: string, goal: Goal | undefined) => void`, destructure them. Inside the `daily ?` branch:

```tsx
            {(() => {
              const run = dailyDays(clock.startsMs, clock.endsMs, region, event.game);
              const status =
                goal === undefined
                  ? undefined
                  : goalStatus({
                      goal, startsMs: clock.startsMs, endsMs: clock.endsMs,
                      region, game: event.game, now, logged: dailyDays_,
                    });
              return (
                <>
                  <DailyChecklist … existing props … goal={status} />
                  <GoalControl
                    goal={goal}
                    defaultWeekStartsOn={isoWeekday(dayKey(clock.startsMs, region, event.game))}
                    maxDays={run === null ? null : run.length}
                    onChange={(g) => onGoal(event.id, g)}
                  />
                  {/* Reaching the count may not have claimed the rewards, so
                      the event is never finished for them — this is the way to
                      say it is, offered at the moment it becomes true. */}
                  {status?.scope === "event" && status.met && status_ !== "done" && (
                    <button type="button" onClick={() => onStatus(event.id, "done")}
                      className="mt-2 rounded-full border border-near/70 bg-near/15 px-3 py-1.5 text-xs font-medium text-near">
                      Mark event done
                    </button>
                  )}
                </>
              );
            })()}
```

The existing prop named `dailyDays` (the logged ticks) collides with the imported `dailyDays` function: rename the import (`import { dailyDays as runDays, dayKey } from "../../shared/daily.ts"`) rather than the prop, and use `runDays(...)` above and `logged: dailyDays`; likewise use the existing `status` prop name and call the goal status `progress` or `goalState` — pick names that do not shadow. The intended bindings: logged ticks = prop `dailyDays`; reader status = prop `status`; computed goal = `goalState`.

Change the not-daily button's text to `{goal === undefined ? "This isn't a daily event" : "This isn't a daily event — removes the goal"}`.

`App.tsx` on `<EventDetail …>`: add `goal={goalOf(openRow.event.id)}` and `onGoal={prog.setGoal}`.

- [ ] **Step 4: Run** `bun test` → PASS; `bun run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(detail): set a check-in goal from the event's checklist" -- src/client/components/GoalControl.tsx src/client/components/DailyChecklist.tsx src/client/components/EventDetail.tsx src/client/App.tsx test/views.test.tsx
```

---

### Task 6: Docs, and look at it

**Files:**
- Modify: `docs/PRD.md` (F12), `docs/DATA-MODEL.md` (§ Client-side storage key comment and `progress` table, § Daily checklists, § Export format), `AGENTS.md` (§ Events that repeat daily), `docs/DESIGN.md` (chip met state, goal control), spec status line.

- [ ] **Step 1: PRD F12** — add a paragraph after the catch-up rules: check-in goals (each week / across the event), reader input only, a met week stays in Dailies as done this week, never marks the event done, Mark event done offered when an event-wide goal is reached.
- [ ] **Step 2: DATA-MODEL** — key comment `{ status?, effort?, daily?, note?, goal?, at }`; `progress` table row `goal` | `{ period: "week", measure: "days", required 1–7, weekStartsOn 1–7 }` \| `{ period: "event", measure: "days", required }` \| absent | read via `readGoal`, never stripped; fix "none of the three set" to name every field; § Export: goals ride `progress`, no new key.
- [ ] **Step 3: AGENTS.md § Events that repeat daily** — one bullet: a goal makes an event a daily regardless of detection; meeting it never marks done; an unreadable goal is kept and ignored.
- [ ] **Step 4: DESIGN.md** — the goal-met chip (full hue border, dashed check, no wash) vs ticked (wash, solid check); the goal control reuses the status pill style.
- [ ] **Step 5: Spec status** → `implemented 2026-10-13`.
- [ ] **Step 6: Verify** `bun test` and `bun run typecheck`; build (`bun run build:css`, `bun run build:js`, `bun run build:static` — not `build:feed`, which needs no change) and screenshot the Dailies strip and the detail sheet with a weekly goal at 3/5 and at 5/5, in dark and light, per memory `headless-chrome-screenshots` (fresh distinctive port, own PID).
- [ ] **Step 7: Commit** docs by pathspec: `docs: record check-in goals`.
