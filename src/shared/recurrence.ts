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
 * The rule whose next opening lands exactly on `toMs`, or null if none does.
 *
 * The form asks the reader to choose between never repeating, repeating
 * forever, and repeating after a delay — and in the last two it measures the
 * cadence rather than asking for it. Both reduce to this one question: which
 * `{unit, interval}` steps from the anchor to the instant the next occurrence
 * should open? Forever passes the instant this one closes; a delay passes that
 * instant pushed further out.
 *
 * **Searched with `addUnits` rather than divided out of a millisecond span.**
 * A month is not a fixed number of days and a week is not always 168 hours —
 * across a DST transition it is 167 or 169 — so arithmetic on the raw span
 * would miss the exact answers this is looking for. Stepping the calendar and
 * comparing is the only reading that agrees with how the occurrences are
 * actually generated.
 *
 * Largest honest unit wins, which is why the ladder runs months before weeks
 * before days: a reader who typed 1 July to 1 August meant the month, and
 * storing "every 31 days" would drift out of step by February. The bounds are
 * the schema's own ceiling — nothing here can return an interval `Repeat`
 * would reject.
 *
 * Null is a real answer, not a failure: two exact times a few hours apart span
 * no whole number of any unit, and rounding to the nearest day would move a
 * boundary the reader chose. The form asks them instead of guessing.
 */
export function repeatSpanning(fromMs: number, toMs: number): Repeat | null {
  if (toMs <= fromMs) return null;

  const ladder: Array<{ unit: RepeatUnit; max: number }> = [
    { unit: "months", max: 12 },
    { unit: "weeks", max: 52 },
    { unit: "days", max: 365 },
  ];

  for (const { unit, max } of ladder) {
    for (let interval = 1; interval <= max; interval += 1) {
      if (addUnits(fromMs, unit, interval) === toMs) {
        return { unit, interval, until: null };
      }
    }
  }
  return null;
}

/** The three answers the form offers for "does this come round again?". */
export type RepeatMode = "never" | "forever" | "delay";

/** The five answers the form offers for "how often is this?". */
export type Cadence = "one-off" | "daily" | "weekly" | "monthly" | "custom";

const PRESET_OF: Record<RepeatUnit, Cadence> = {
  days: "daily",
  weeks: "weekly",
  months: "monthly",
};

/**
 * The unit each preset stands for — the inverse of the map above, kept beside
 * it so the two cannot drift apart. A preset is always an interval of one:
 * that is what makes it a preset rather than a cycle length.
 */
export const PRESET_UNIT: Record<"daily" | "weekly" | "monthly", RepeatUnit> = {
  daily: "days",
  weekly: "weeks",
  monthly: "months",
};

/**
 * Which of the form's five answers describes a saved event.
 *
 * Derived rather than stored, for the reason `repeatModeOf` is: a rule made
 * before this control existed, or one that arrived by import, has to open in
 * whichever answer actually fits it rather than in whichever happens to be the
 * default.
 *
 * **A preset carries no window.** Choosing daily, weekly or monthly says the
 * period *is* the window — each occurrence runs until the next opens — so an
 * event that states its own end is saying something no preset can, and belongs
 * under `custom` where that is sayable. The same goes for a series that stops:
 * there is no control for `until` in a preset, and opening one there would
 * offer to save a rule quietly stripped of the date it ends on.
 */
export function cadenceOf(
  endsAt: string | null,
  repeat: Repeat | null,
): Cadence {
  if (repeat === null) return "one-off";
  if (endsAt !== null || repeat.until !== null || repeat.interval !== 1) {
    return "custom";
  }
  return PRESET_OF[repeat.unit];
}

/**
 * Which of the three states a saved rule belongs to.
 *
 * Derived rather than stored beside the rule, because "repeats forever" and "a
 * delay of zero" are the same rule — remembering which control produced it
 * would be remembering something that makes no difference to a single
 * occurrence. It also means a rule that arrived by import opens in whichever
 * state describes it, rather than in whichever state happens to be the
 * default.
 *
 * **`contiguousMs` is the instant a successor would open if it opened the
 * moment this one closed — which is not always the stored end.** A boundary
 * the reader gave a time to is an instant, and a successor opens on it. One
 * they gave only a date to is stored as the last second of that day, so its
 * successor opens a second later, at the following midnight. Passing the
 * stored end for both would read every day-precision rule as having a gap it
 * does not have. The caller owns that convention because the caller is what
 * wrote the boundary.
 *
 * An unstated end is `forever`: the reader gave a cadence and no end, so each
 * occurrence runs until the next opens. There is no gap to describe, and a
 * delay would have nothing to be measured from.
 */
export function repeatModeOf(
  startsMs: number,
  contiguousMs: number | null,
  repeat: Repeat | null,
): RepeatMode {
  if (repeat === null) return "never";
  if (contiguousMs === null) return "forever";
  return addUnits(startsMs, repeat.unit, repeat.interval) === contiguousMs
    ? "forever"
    : "delay";
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
 * The one occurrence a row's id names, or null.
 *
 * The lists and the timeline's own click-to-open lookup only ever hold the
 * first two occurrences of a rule (`LIST_OCCURRENCES`), but the timeline
 * draws every occurrence the board window admits. A bar past the second is an
 * id nothing else can resolve, so this is the other half: parse the local day
 * the id names, bracket it with a window one interval wide on each side, and
 * let `occurrencesOf` regenerate just that neighbourhood — cheap, and no
 * caller has to walk a whole series to open one sheet.
 *
 * One interval each way is enough because `occurrencesOf` admits an
 * occurrence whose *window* overlaps the range, not only one that *starts*
 * inside it — an unstated end runs a full interval past its own start, so the
 * occurrence naming a given day can start up to one interval before or after
 * that day and still be the one the id points at.
 */
export function occurrenceForId(rule: RepeatingEvent, id: string): Occurrence | null {
  if (rule.repeat === null) return null;
  const sepAt = id.indexOf(OCCURRENCE_SEP);
  if (sepAt === -1) return null;

  const suffix = id.slice(sepAt + 1);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(suffix);
  if (m === null) return null;
  const [, y, mo, d] = m as unknown as [string, string, string, string];
  const day = new Date(Number(y), Number(mo) - 1, Number(d));
  // Same silent-rollover hazard `readerInstant` refuses on the way in: "30
  // February" parses to a real Date, just not the one the id claims to name.
  if (
    day.getFullYear() !== Number(y) ||
    day.getMonth() !== Number(mo) - 1 ||
    day.getDate() !== Number(d)
  ) {
    return null;
  }

  const dayStartMs = day.getTime();
  const spanMs = addUnits(dayStartMs, rule.repeat.unit, rule.repeat.interval) - dayStartMs;
  const window = occurrencesOf(rule, dayStartMs - spanMs, dayStartMs + spanMs);
  return window.find((o) => o.id === id) ?? null;
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

/**
 * The occurrence to open when the reader asks for the rule itself.
 *
 * The settings index lists rules, but the detail sheet opens rows, and a
 * rule's own id is never a row — the lists hold its occurrences, keyed
 * `myevent:<token>#<date>`. This is the bridge between the two.
 *
 * Running or next where there is one. Where there is not — a series whose
 * `until` has passed — it falls back to the first occurrence rather than
 * giving up, and that fallback is the point rather than a nicety: a finished
 * rule with no future occurrence would otherwise be exactly as unreachable as
 * the ended one-off this index exists to rescue, and just as impossible to
 * delete. Which time round it lands on does not matter, because the reader
 * has come to edit or delete the rule, not to inspect an occurrence.
 *
 * Null only when nothing repeats, and the caller has a row already: a
 * non-repeating event's own id is in the lists unchanged.
 */
export function nearestOccurrence(
  event: RepeatingEvent,
  nowMs: number,
): Occurrence | null {
  if (event.repeat === null) return null;

  const upcoming = nextOccurrences(event, nowMs, 1);
  if (upcoming.length > 0) return upcoming[0]!;

  const anchor = Date.parse(event.startsAt);
  if (Number.isNaN(anchor)) return null;
  return occurrencesOf(event, anchor, anchor, 1)[0] ?? null;
}

/**
 * How many of a rule's ids the reader has actually recorded something
 * against — what a schedule edit that re-keys ids would strand.
 *
 * **A plain event has exactly one id at risk: its own.** That is the
 * transition that matters most, and the one a `repeat === null` short-circuit
 * used to hide entirely: a reader who has already marked a plain event done
 * or ticked days against it, then edits it to add a repeat, moves every row
 * from `id` to `id#<date>` on save — orphaning marks the form never warned
 * about. A rule already repeating checks its next `count` occurrences
 * instead, since those are the ids the same edit would re-key.
 */
export function strandedOccurrences(
  record: RepeatingEvent,
  nowMs: number,
  hasMark: (id: string) => boolean,
  count = 12,
): number {
  const ids =
    record.repeat === null
      ? [record.id]
      : nextOccurrences(record, nowMs, count).map((o) => o.id);
  return ids.filter(hasMark).length;
}
