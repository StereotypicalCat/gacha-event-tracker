import type { ResetTiming } from "./time.ts";
import { z } from "zod";
import type { LaneId } from "./custom.ts";
import { dayKey } from "./daily.ts";
import { AmountTarget, type AmountLog, type GoalStatus } from "./goal.ts";
import { periodOf, PeriodSchema, type RoutinePeriod } from "./period.ts";
import { versionCaption, versionWindow } from "./versions.ts";
import { DAY } from "./time.ts";
import type { Region } from "./schema.ts";

/**
 * Weekly, monthly and every-N-days chores the reader sets up per game — ZZZ's weekly
 * activity points, Endfield's weekly routine.
 *
 * Not events: no window, no end, no done or ignored. A task is a period that
 * rolls on the game's own reset (`periodOf`) and a measure that fills it —
 * days ticked, or a number entered against a target. Its status is the same
 * `GoalStatus` an event's goal produces, so the dailies strip draws, counts and
 * labels both with one set of rules.
 *
 * Reader-authored, so its id lives in its own reserved space and its `game` is
 * any lane, for the reason `CustomEvent.game` is: narrowing it to `GameId`
 * would arm every future game removal to hide a reader's row.
 */

const TASK_PREFIX = "mytask";

export const TaskId = z.string().regex(/^mytask:[a-z0-9]{6,32}$/);

/** Random, like `mintCustomEventId`: renaming a task never moves its ticks or numbers. */
export function mintTaskId(random: () => number = Math.random): string {
  let token = "";
  while (token.length < 10) {
    token += Math.floor(random() * 36 ** 6)
      .toString(36)
      .padStart(6, "0");
  }
  return `${TASK_PREFIX}:${token.slice(0, 10)}`;
}

export const MeasureSchema = z.union([
  /** N distinct game-days ticked in the period; 1 is "done this week". */
  z.object({ kind: z.literal("days"), required: z.number().int().min(1).max(31) }),
  /** A number entered against a target, with an optional unit to print. */
  z.object({
    kind: z.literal("amount"),
    target: AmountTarget,
    unit: z.string().trim().max(24).optional(),
  }),
]);
export type Measure = z.infer<typeof MeasureSchema>;

export const TaskSchema = z.object({
  id: TaskId,
  game: z.string().min(1),
  title: z.string().trim().min(1).max(80),
  period: PeriodSchema,
  measure: MeasureSchema,
  /** The built-in routine this was copied from, when it was (phase 2b). */
  from: z.string().optional(),
  /**
   * Its own reset hour, in server time, instead of the game's. Moves only this
   * routine's day boundary; its log stays under the account's clock revision.
   */
  resetHour: z.number().int().min(0).max(23).optional(),
  note: z.string().trim().max(500).optional(),
  /** Rendered as a link, so only web addresses. */
  link: z
    .string()
    .trim()
    .max(500)
    .url()
    .refine((u) => /^https?:\/\//i.test(u))
    .optional(),
  at: z.string(),
  updatedAt: z.string(),
});
export type Task = z.infer<typeof TaskSchema>;

/**
 * What the strip and `taskStatus` need from a task — a reader's own, or a
 * built-in routine (routines.ts), which shares this shape under its own id.
 */
export type TaskShape = Pick<Task, "id" | "game" | "title" | "measure"> & { period: RoutinePeriod };

/** Where the reader is with a task this period. Pure; `now` explicit. */
export function taskStatus(input: {
  /** `clock`: a built-in's server, when it rolls on one server's reset for everyone. */
  task: Pick<Task, "game" | "measure"> & { period: RoutinePeriod; clock?: Region | undefined };
  region: Region;
  now: number;
  logged: readonly string[];
  amounts?: AmountLog | undefined;
  timing?: ResetTiming;
}): GoalStatus {
  const { task, region, now, logged, amounts } = input;
  if (task.period.unit === "version") return versionStatus(task.game, task.measure, now, amounts);
  const today = dayKey(now, task.clock ?? region, task.game as LaneId, task.clock === undefined ? input.timing : undefined);
  const { start, days } = periodOf(task.period, today);
  const scope = task.period.unit;
  const left = days.filter((k) => k >= today);

  if (task.measure.kind === "amount") {
    const count = amounts?.[start]?.value ?? 0;
    const required = task.measure.target;
    return {
      scope, measure: "amount", periodStart: start, required, count,
      met: count >= required, needed: Math.max(0, required - count),
      open: left.length, shortfall: false, daysLeft: left.length,
    };
  }

  const ticked = new Set(logged);
  const count = days.filter((k) => k <= today && ticked.has(k)).length;
  // A count saved for a month cannot ask for a 31st day in February.
  const required = Math.min(task.measure.required, days.length);
  const open = left.filter((k) => !ticked.has(k)).length;
  const needed = Math.max(0, required - count);
  return {
    scope, measure: "days", periodStart: start, required, count,
    met: count >= required, needed, open, shortfall: needed > open,
    daysLeft: left.length,
  };
}

/**
 * A built-in that resets with its game's version (spec 2026-10-22): the number
 * under the version's key, and whole days to a **recorded** end — none when
 * only an estimate exists, since an estimate is never acted on. Amounts only
 * (routines.test.ts holds every version routine to that); shown as a cycle.
 */
function versionStatus(game: string, measure: Measure, now: number, amounts: AmountLog | undefined): GoalStatus {
  const w = versionWindow(game, now);
  const key = w?.key ?? "";
  const count = amounts?.[key]?.value ?? 0;
  const required = measure.kind === "amount" ? measure.target : measure.required;
  const daysLeft = w?.end === undefined ? null : Math.ceil((w.end - now) / DAY);
  return {
    scope: "cycle", measure: "amount", periodStart: key, required, count,
    met: count >= required, needed: Math.max(0, required - count),
    open: daysLeft, shortfall: false, daysLeft,
  };
}

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `2025-12-02` → `2 Dec 2025`: the same in every locale, so it reads the same wherever it is quoted. */
export function asOfLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`;
}

/** One line saying when it rolls and what it wants. */
export function taskCaption(
  task: Pick<Task, "measure"> & { period: RoutinePeriod; game?: string },
  now: number = Date.now(),
): string {
  const version = task.period.unit === "version" && task.game !== undefined ? versionWindow(task.game, now) : undefined;
  const when =
    task.period.unit === "version"
      ? version === undefined ? "resets with the version" : versionCaption(version, now)
      : task.period.unit === "day"
      ? "every day"
      : task.period.unit === "week"
      ? `every week from ${WEEKDAYS[task.period.startsOn - 1]}`
      : task.period.unit === "month"
        ? `every month from the ${ordinal(task.period.startsOn)}`
        : `every ${task.period.days} days from ${asOfLabel(task.period.from)}`;
  const m = task.measure;
  const what =
    m.kind === "amount"
      ? `reach ${m.target.toLocaleString("en-US")}${m.unit ? ` ${m.unit}` : ""}`
      : m.required === 1
        ? "tick it off"
        : `${m.required} days`;
  return `${when} · ${what}`;
}
