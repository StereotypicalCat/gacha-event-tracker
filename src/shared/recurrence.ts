import { z } from "zod";

/**
 * Events that come round again (PRD F13).
 *
 * The rest of this app measures a window closing, and `daily.ts` measures one
 * repeating every day. Nothing measured a fortnight. This is that rung: a rule
 * the reader states, from which concrete occurrences are derived on read and
 * never stored.
 *
 * Everything here is pure and takes its clock as an argument, for the same
 * reason the parsers and `daily.ts` do: a function that reads `Date.now()`
 * cannot be tested against a fixed instant.
 */

export const RepeatUnit = z.enum(["days", "weeks", "months"]);
export type RepeatUnit = z.infer<typeof RepeatUnit>;

export const Repeat = z.object({
  unit: RepeatUnit,
  /** Units between one occurrence opening and the next. */
  interval: z.number().int().min(1).max(365),
  /**
   * When repetition stops. Null means it does not.
   *
   * Distinct from an occurrence's own end, which is a different question with a
   * different answer — see the spec's § The two ends.
   */
  until: z.string().datetime().nullable(),
});
export type Repeat = z.infer<typeof Repeat>;

/**
 * The most occurrences any one rule may produce for one call.
 *
 * Mirrors `daily.ts`'s `MAX_DAYS` and exists for the same reason: a corrupt
 * interval must not be able to make the client allocate without bound.
 */
export const MAX_OCCURRENCES = 200;

/**
 * Step an instant by whole calendar units, preserving the local wall clock.
 *
 * **Local, not UTC, and calendar units rather than milliseconds.** A reader's
 * own event is local throughout — `readerInstant` builds the instant from their
 * wall time and `fields()` reads it back with local accessors — so a weekly
 * reset they set for 09:00 has to stay at 09:00 across a DST transition. Adding
 * `7 * DAY` milliseconds would move it to 08:00 or 10:00 and drag every later
 * occurrence with it.
 *
 * Months clamp to the last valid day: 31 January plus a month is 28 February,
 * not 3 March. `setMonth` rolls over by default, which is the same silent date
 * shift `readerInstant` already refuses on the way in.
 */
export function addUnits(ms: number, unit: RepeatUnit, n: number): number {
  const d = new Date(ms);

  if (unit === "days") {
    d.setDate(d.getDate() + n);
    return d.getTime();
  }
  if (unit === "weeks") {
    d.setDate(d.getDate() + n * 7);
    return d.getTime();
  }

  // Pinned to the 1st before moving the month, because setting the month first
  // is what performs the rollover we are trying to avoid: 31 January with the
  // month advanced is 31 February, which resolves to 3 March before we ever get
  // a chance to clamp it.
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d.getTime();
}

/**
 * Whether a window is still open when its next occurrence starts.
 *
 * Two live occurrences of one rule leave "what ends soonest" without an
 * answer, so this is refused — by the `CustomEvent` schema, so an imported
 * file cannot carry one in, and by the form, so the reader is told rather than
 * having a save silently rejected. Exported precisely because both ask it: two
 * copies would drift, and a form that disagrees with its schema either refuses
 * saves that would succeed or promises ones that will not.
 *
 * Closing exactly as the next opens is fine — that is contiguous, not
 * overlapping, and it is the shape a reset-to-reset chore has.
 *
 * No rule, or no stated end, has nothing to overlap: an unstated end runs to
 * the next opening by definition.
 */
export function comesRoundEarly(
  startsMs: number,
  endsMs: number | null,
  repeat: Repeat | null,
): boolean {
  if (repeat === null || endsMs === null) return false;
  return endsMs > addUnits(startsMs, repeat.unit, repeat.interval);
}
