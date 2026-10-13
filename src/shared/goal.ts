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

/**
 * The checklist's line. An unticked past day is not "missed" here: every day
 * was never required, and calling it a failure would be the app inventing one.
 */
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
  const tally = `${s.count} of ${s.required}`;
  return s.scope === "week" ? `${tally} this week` : tally;
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
