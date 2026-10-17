import type { ResetTiming } from "./time.ts";
import { z } from "zod";
import type { LaneId } from "./custom.ts";
import { dailyDays, dayKey } from "./daily.ts";
import { addDays, periodOf, WeekdaySchema } from "./period.ts";
import type { Region } from "./schema.ts";

/** A whole, positive number; anything a game would plausibly count to. */
export const AmountTarget = z.number().int().min(1).max(1_000_000_000);

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
  // A number against a target — 2,100 activity points a week — entered by the
  // reader per period and stored in the amounts store, not the day log.
  z.object({
    period: z.literal("week"),
    measure: z.literal("amount"),
    target: AmountTarget,
    weekStartsOn: WeekdaySchema,
  }),
  z.object({
    period: z.literal("event"),
    measure: z.literal("amount"),
    target: AmountTarget,
  }),
]);
export type Goal = z.infer<typeof GoalSchema>;

/** What a goal asks for, in its own measure: days, or the target number. */
export function goalRequired(goal: Goal): number {
  return goal.measure === "days" ? goal.required : goal.target;
}

/**
 * A reader's numbers for one item, by the start key of the period they were
 * entered for. One value per period; a new period starts with none.
 */
export type AmountLog = Record<string, { value: number; at: string }>;

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
  /** Month and cycle are a task's period (task.ts); an event's goal is a week or the event. */
  scope: "day" | "week" | "month" | "cycle" | "event";
  measure: "days" | "amount";
  /** The period's first game-day: the key an amount is stored under. */
  periodStart: string;
  required: number;
  /** Distinct ticked game-days in scope, never later than today — or, for an amount, the value entered for this period. */
  count: number;
  met: boolean;
  needed: number;
  /** Unticked days in scope from today on; null when the end is unannounced. */
  open: number | null;
  /** Fewer days left than check-ins needed. The target is never lowered. */
  shortfall: boolean;
  /** A task's days left in its period from today, ticked or not — what a cycle's chip shows. */
  daysLeft?: number | undefined;
}

/** Bounds a walk over keys when the end is unknown; matches daily.ts. */
const MAX_DAYS = 200;

function keysFrom(first: string, last: string): string[] {
  const out: string[] = [];
  for (let k = first; k <= last && out.length < MAX_DAYS; k = addDays(k, 1)) out.push(k);
  return out;
}

/**
 * Where the reader is against their goal, recomputed from the day log on every
 * call — so a backfilled or removed tick needs no bookkeeping, and a week
 * rolling over clears nothing.
 */
export function goalStatus(input: {
  goal: Goal;
  startsMs: number;
  endsMs: number | null;
  region: Region;
  game: LaneId;
  now: number;
  logged: readonly string[];
  /** This item's entered numbers, for an amount goal. */
  amounts?: AmountLog | undefined;
  timing?: ResetTiming;
}): GoalStatus {
  const { goal, startsMs, endsMs, region, game, now, logged, amounts, timing } = input;
  const today = dayKey(now, region, game, timing);
  const first = dayKey(startsMs, region, game, timing);
  const run = dailyDays(startsMs, endsMs, region, game, timing);

  let scope: string[];
  let periodStart: string;
  if (goal.period === "week") {
    // The rule defines this week's boundary even when the event's end is
    // unknown; the start still clips it, because a day before the event opened
    // was never claimable.
    const week = periodOf({ unit: "week", startsOn: goal.weekStartsOn }, today);
    periodStart = week.start;
    scope =
      run === null ? week.days.filter((k) => k >= first) : week.days.filter((k) => run.includes(k));
  } else {
    periodStart = first;
    scope = run ?? keysFrom(first, today);
  }

  const unknowable = goal.period === "event" && run === null;
  if (goal.measure === "amount") {
    const count = amounts?.[periodStart]?.value ?? 0;
    return {
      scope: goal.period,
      measure: "amount",
      periodStart,
      required: goal.target,
      count,
      met: count >= goal.target,
      needed: Math.max(0, goal.target - count),
      open: unknowable ? null : scope.filter((k) => k >= today).length,
      // How much is left to earn per day is the game's business, not ours;
      // a number cannot be short of days the way a check-in count can.
      shortfall: false,
    };
  }

  const ticked = new Set(logged);
  const count = scope.filter((k) => k <= today && ticked.has(k)).length;
  const open = unknowable ? null : scope.filter((k) => k >= today && !ticked.has(k)).length;
  const needed = Math.max(0, goal.required - count);

  return {
    scope: goal.period,
    measure: "days",
    periodStart,
    required: goal.required,
    count,
    met: count >= goal.required,
    needed,
    open,
    shortfall: open !== null && needed > open,
  };
}

const days = (n: number) => (n === 1 ? "1 day" : `${n} days`);
/** Thousands grouped: 2,100 reads as a number of points, 2100 as a year. */
const num = (n: number) => n.toLocaleString("en-US");
/** " today", " this week", " this month", " this cycle", or nothing for a whole event. */
const within = (s: GoalStatus) =>
  s.scope === "event" ? "" : s.scope === "day" ? " today" : ` this ${s.scope}`;
const doneLabel = (s: GoalStatus) =>
  s.scope === "event" ? "goal reached" : s.scope === "day" ? "done today" : `done this ${s.scope}`;

/**
 * The checklist's line. An unticked past day is not "missed" here: every day
 * was never required, and calling it a failure would be the app inventing one.
 */
export function goalCaption(s: GoalStatus): string {
  const tally = `${num(s.count)} of ${num(s.required)}`;
  if (s.met) {
    const done = doneLabel(s);
    return `${tally} · ${done[0]!.toUpperCase()}${done.slice(1)}`;
  }
  const head = `${tally}${within(s)}`;
  if (s.measure === "amount") return `${head} · ${num(s.needed)} to go`;
  const left = within(s);
  if (s.open === null) return `${head} · ${s.needed} needed`;
  if (s.shortfall) return `${head} · ${s.needed} needed, ${days(s.open)} left${left}`;
  return `${head} · ${s.needed} needed · ${days(s.open)} left${left}`;
}

/**
 * What a goal asks for, in a few words — the Edit panel's line for an event
 * whose goal is not open. Says nothing about progress: that is the chip's job.
 */
export function goalSummary(goal: Goal | undefined): string {
  if (goal === undefined) return "No goal";
  const what = goal.measure === "days" ? days(goal.required) : `${num(goal.target)} points`;
  return `${what} ${goal.period === "week" ? "each week" : "across the event"}`;
}

/** The Dailies chip's short count. */
export function goalCount(s: GoalStatus): string {
  // "cy" means nothing; the days left in a cycle say where it is.
  if (s.scope === "cycle") return `${num(s.count)}/${num(s.required)} · ${s.daysLeft ?? s.open ?? 0}d`;
  const unit = s.scope === "week" ? " wk" : s.scope === "month" ? " mo" : "";
  return `${num(s.count)}/${num(s.required)}${unit}`;
}

/** Spoken state for the chip, after "done today" / "not done today". */
export function goalLabel(s: GoalStatus): string {
  if (s.met) return doneLabel(s);
  return `${num(s.count)} of ${num(s.required)}${within(s)}`;
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
