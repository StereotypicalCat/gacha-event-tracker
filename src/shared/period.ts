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
    start = monthStart(y, startMonth, period.startsOn);
    next = monthStart(y, startMonth + 1, period.startsOn);
  }
  const days: string[] = [];
  for (let k = start; k < next; k = addDays(k, 1)) days.push(k);
  return { start, days };
}
