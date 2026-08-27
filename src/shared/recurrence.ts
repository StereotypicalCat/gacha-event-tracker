import { z } from "zod";
import type { Precision } from "./schema.ts";

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

/**
 * What separates a rule from one of its occurrences.
 *
 * Deliberately outside `[a-z0-9]`, and therefore outside `CustomEventId`. An
 * occurrence id is derived on read and must never be storable: the store holds
 * rules, and a suffixed id round-tripping into it would put a frozen copy of
 * today's schedule beside the rule that generates it. `validRecords` drops what
 * fails the schema, so the guardrail is the regex rather than a code path
 * anybody has to remember. `test/recurrence.test.ts` pins it.
 */
export const OCCURRENCE_SEP = "#";

/**
 * A stable id for one occurrence of a rule.
 *
 * The rule's token identifies *which* recurring thing, and the local start day
 * identifies *which time round*. Both halves matter: marks, ignores, progress
 * and daily ticks all key off this string, so an occurrence carries its own
 * completion and its own streak rather than sharing the rule's.
 *
 * The day is read with local accessors because the reader typed a local date
 * and `fields()` shows them a local date back. A UTC reading would label some
 * occurrences with the previous day for every reader west of UTC.
 *
 * **Renaming a rule does not move these** — the token is random, exactly as
 * `mintCustomEventId` describes. **Rescheduling one does**, and that strands
 * the marks under the old ids. That is accepted and warned about rather than
 * migrated; see the spec's § 2 and `removeEvent`'s reasoning for the same
 * trade.
 */
export function occurrenceId(ruleId: string, startsAtMs: number): string {
  const d = new Date(startsAtMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `${ruleId}${OCCURRENCE_SEP}${day}`;
}

/**
 * The rule behind an id, or the id itself when it is not an occurrence.
 *
 * Total on purpose. Callers hold an id off a row and have no reason to know
 * which kind it is — the detail sheet looking up the record to edit is the
 * motivating case, and a feed id passing through unchanged is what keeps it
 * from needing a branch.
 */
export function ruleIdOf(id: string): string {
  const at = id.indexOf(OCCURRENCE_SEP);
  return at === -1 ? id : id.slice(0, at);
}

/** Whether this id names one occurrence of a rule rather than an event. */
export function isOccurrenceId(id: string): boolean {
  return id.includes(OCCURRENCE_SEP);
}

/**
 * Whether a schedule edit would re-key the occurrences it generates.
 *
 * The anchor and the interval are both halves of every occurrence id, so
 * changing either strands the marks stored under the old ones. `until` is not:
 * it truncates the series without moving anything already in it, so a reader
 * who only sets an end date should not be warned about ticks that are in no
 * danger.
 *
 * Nothing here rewrites a mark. This is what the form asks in order to *say*
 * what an edit costs — see the spec's § 2 for why it is told rather than
 * migrated.
 */
export function movesOccurrences(
  before: { startsAt: string; repeat: Repeat | null },
  after: { startsAt: string; repeat: Repeat | null },
): boolean {
  if (before.startsAt !== after.startsAt) return true;
  return (
    before.repeat?.unit !== after.repeat?.unit ||
    before.repeat?.interval !== after.repeat?.interval
  );
}

/**
 * The fields a rule is expanded from — everything else is irrelevant.
 *
 * Structural rather than `CustomEvent` on purpose, and not only for the usual
 * reason: `custom.ts` imports this module, so importing it back would be
 * circular. It also means the ingest side can adopt this without a second
 * implementation when `GachaEvent` grows the same field (see the spec's
 * Phase B).
 */
export interface RepeatingEvent {
  id: string;
  startsAt: string;
  startPrecision: Precision;
  endsAt: string | null;
  endPrecision: Precision;
  repeat: Repeat | null;
}

/** One time round. Both boundaries are resolved; neither is ever null. */
export interface Occurrence {
  id: string;
  /** How many times round this is, counting the anchor as 0. */
  index: number;
  startsAt: string;
  startPrecision: Precision;
  endsAt: string;
  endPrecision: Precision;
}

/**
 * How far the walk will seek before giving up looking for the window.
 *
 * Occurrences are walked from the anchor rather than jumped to arithmetically,
 * because month stepping clamps and so has no closed form to jump with. Fifty
 * years of a daily rule is a fraction of a millisecond and the result is
 * memoised, so the simple walk is worth more than the arithmetic would save.
 */
const MAX_SEEK = 20_000;

/**
 * Every occurrence overlapping `[fromMs, toMs]`, oldest first.
 *
 * A non-repeating event yields nothing: callers keep their existing
 * single-event path, so nothing about an event that already exists changes.
 *
 * **An occurrence with no stated end runs until the next one opens.** That is
 * the boundary a bare rotation was missing — `docs/SOURCES.md` § arustats
 * declines to publish one precisely because nothing bounded it — and it is
 * derived from the interval the reader typed rather than invented for them. The
 * store still holds `endsAt: null`; only this projection resolves it.
 */
export function occurrencesOf(
  event: RepeatingEvent,
  fromMs: number,
  toMs: number,
  cap: number = MAX_OCCURRENCES,
): Occurrence[] {
  const repeat = event.repeat;
  if (repeat === null) return [];

  const anchor = Date.parse(event.startsAt);
  if (Number.isNaN(anchor)) return [];

  // Held constant and slid forward, rather than recomputed per occurrence: the
  // reader stated one window's length, not a rule for deriving lengths.
  const stated = event.endsAt === null ? null : Date.parse(event.endsAt) - anchor;
  const untilMs = repeat.until === null ? Infinity : Date.parse(repeat.until);

  const out: Occurrence[] = [];
  for (let n = 0; n < MAX_SEEK && out.length < cap; n += 1) {
    const startsMs = addUnits(anchor, repeat.unit, n * repeat.interval);
    if (startsMs > untilMs || startsMs > toMs) break;

    // Always defined, even for the last occurrence of a terminating series: the
    // window still closes on schedule, it simply is not followed by another.
    const nextOpening = addUnits(startsMs, repeat.unit, repeat.interval);
    const endsMs = stated === null ? nextOpening : startsMs + stated;

    // Overlapping the window at either edge counts — a bar half off the left of
    // the board is still on the board.
    if (endsMs >= fromMs) {
      out.push({
        id: occurrenceId(event.id, startsMs),
        index: n,
        startsAt: new Date(startsMs).toISOString(),
        startPrecision: event.startPrecision,
        endsAt: new Date(endsMs).toISOString(),
        // A derived end is exactly as well known as the anchor it was derived
        // from; a stated one keeps the precision the reader stated it to.
        endPrecision: stated === null ? event.startPrecision : event.endPrecision,
      });
    }
  }
  return out;
}

/**
 * The next `count` occurrences that have not finished, oldest first.
 *
 * "Not finished" rather than "running", so a rule between cycles answers
 * "opens Saturday" instead of answering nothing — a gap in a rotation is not
 * the rotation being over, and the lists would otherwise lose the rule for the
 * whole of its off week.
 */
export function nextOccurrences(
  event: RepeatingEvent,
  nowMs: number,
  count: number,
): Occurrence[] {
  if (event.repeat === null || count <= 0) return [];
  // Bounded rather than open-ended: `count` occurrences can never span more
  // than `count` intervals past now, whatever the unit.
  const horizon = addUnits(
    nowMs,
    event.repeat.unit,
    event.repeat.interval * (count + 1),
  );
  return occurrencesOf(event, nowMs, horizon, count);
}
