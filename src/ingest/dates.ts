/**
 * Deterministic date parsing for adapter sources.
 *
 * Every function here returns null rather than guessing. A source that does not
 * state a year, a month, or an end does not get one invented — see
 * docs/PRD.md § Quality bar. Returning null is a correct outcome.
 */

import type { Precision } from "../shared/schema.ts";

export interface ParsedInstant {
  /** UTC ISO 8601. */
  iso: string;
  precision: Extract<Precision, "exact" | "day">;
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  // Game8 abbreviates in some tables ("Apr. 29 - May 13, 2026"). Without these
  // such rows parse as null and the events vanish silently, which is a worse
  // failure than a wrong date because nothing surfaces it.
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7,
  aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function monthNumber(name: string): number | null {
  return MONTHS[name.toLowerCase().replace(/\.$/, "")] ?? null;
}

function iso(
  y: number,
  m: number,
  d: number,
  hh = 0,
  mm = 0,
): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || hh > 23 || mm > 59) return null;
  const date = new Date(Date.UTC(y, m - 1, d, hh, mm, 0, 0));
  // Rejects impossible calendar dates such as February 30.
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString();
}

/** "August 12, 2026" → 2026-08-12T00:00:00.000Z, day precision. */
export function parseMonthDayYear(input: string): ParsedInstant | null {
  const m = /([A-Za-z]+)\.?\s+(\d{1,2}),\s*(\d{4})/.exec(input);
  if (!m) return null;
  const month = monthNumber(m[1] ?? "");
  if (month === null) return null;
  const value = iso(Number(m[3]), month, Number(m[2]));
  return value === null ? null : { iso: value, precision: "day" };
}

/**
 * "2026-08-04" → 2026-08-04T00:00:00.000Z, day precision.
 *
 * A whole cell, anchored at both ends, because this is the least distinctive
 * shape here: unanchored it would find a date inside a version string or an
 * article slug. Blue Archive's wiki gives each boundary its own column and
 * writes it as a bare ISO date, so unlike every range above there is nothing to
 * split and no field order to infer.
 *
 * Rejects an impossible calendar date (`2026-02-30`) through `iso`, and states
 * `day` rather than `exact` because the source publishes no time of day.
 */
export function parseIsoDay(input: string): ParsedInstant | null {
  const m = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/.exec(input);
  if (!m) return null;
  const value = iso(Number(m[1]), Number(m[2]), Number(m[3]));
  return value === null ? null : { iso: value, precision: "day" };
}

/**
 * "August 12 - September 21, 2026" → both instants, year taken from the end.
 * A range whose end carries no year is unresolvable and returns null.
 */
export function parseMonthDayRange(
  input: string,
): { start: ParsedInstant; end: ParsedInstant } | null {
  const m =
    /([A-Za-z]+)\.?\s+(\d{1,2})\s*[-–—]\s*([A-Za-z]+)\.?\s+(\d{1,2}),\s*(\d{4})/.exec(
      input,
    );
  if (!m) return null;
  const startMonth = monthNumber(m[1] ?? "");
  const endMonth = monthNumber(m[3] ?? "");
  if (startMonth === null || endMonth === null) return null;

  const year = Number(m[5]);
  // A range that crosses New Year renders as "December 28 - January 4, 2027",
  // where the stated year belongs to the end. Roll the start back a year.
  const startYear = startMonth > endMonth ? year - 1 : year;

  const startIso = iso(startYear, startMonth, Number(m[2]));
  const endIso = iso(year, endMonth, Number(m[4]));
  if (startIso === null || endIso === null) return null;

  return {
    start: { iso: startIso, precision: "day" },
    end: { iso: endIso, precision: "day" },
  };
}

/**
 * "Aug. 14, 2026 - Aug. 24, 2026" → both instants.
 *
 * Distinct from parseMonthDayRange, where the single stated year belongs to the
 * end. Here both sides carry their own year, so nothing has to be inferred.
 * Trailing prose after the range is ignored.
 */
export function parseFullRange(
  input: string,
): { start: ParsedInstant; end: ParsedInstant } | null {
  const re =
    /([A-Za-z]+)\.?\s+(\d{1,2}),\s*(\d{4})\s*[-–—]\s*([A-Za-z]+)\.?\s+(\d{1,2}),\s*(\d{4})/;
  const m = re.exec(input);
  if (!m) return null;

  const startMonth = monthNumber(m[1] ?? "");
  const endMonth = monthNumber(m[4] ?? "");
  if (startMonth === null || endMonth === null) return null;

  const startIso = iso(Number(m[3]), startMonth, Number(m[2]));
  const endIso = iso(Number(m[6]), endMonth, Number(m[5]));
  if (startIso === null || endIso === null) return null;

  return {
    start: { iso: startIso, precision: "day" },
    end: { iso: endIso, precision: "day" },
  };
}

/**
 * "08/09/26 - 08/30/26" → both instants. Also accepts a four-digit year.
 *
 * Month-first ordering is not assumed lightly: Game8 writes long dates
 * US-style ("August 12, 2026"), and Endfield's own version grid reads 01/22,
 * 04/17, 07/16 for versions 1.0, 1.2 and 1.4 — chronological only if the month
 * comes first. A day-first reading would make 04/17 an invalid month.
 *
 * Two-digit years pivot at 70: 26 → 2026. The validator's sanity window
 * (start within [now-2y, now+1y]) catches anything this gets wrong.
 */
export function parseShortSlashRange(
  input: string,
): { start: ParsedInstant; end: ParsedInstant } | null {
  const re =
    /(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*[-–—]\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/;
  const m = re.exec(input);
  if (!m) return null;

  const year = (raw: string) => {
    const n = Number(raw);
    return raw.length <= 2 ? (n < 70 ? 2000 + n : 1900 + n) : n;
  };
  const n = (i: number) => Number(m[i]);

  const startIso = iso(year(m[3] ?? ""), n(1), n(2));
  const endIso = iso(year(m[6] ?? ""), n(4), n(5));
  if (startIso === null || endIso === null) return null;

  return {
    start: { iso: startIso, precision: "day" },
    end: { iso: endIso, precision: "day" },
  };
}

/**
 * "July 30, 2026 August 13, 2026" → both instants.
 *
 * Game8 separates the two halves of a duration cell with `<hr>` rather than a
 * dash on some templates, and a tag-stripping reader sees only whitespace
 * between them. Both anchors and both years are required: without the anchors
 * this would happily read "August 12, 2026 Day 3 rewards" as a range, and a
 * bare "Month D" second half could belong to any year.
 */
export function parseAdjacentFullRange(
  input: string,
): { start: ParsedInstant; end: ParsedInstant } | null {
  const re =
    /^\s*([A-Za-z]+)\.?\s+(\d{1,2}),\s*(\d{4})\s+([A-Za-z]+)\.?\s+(\d{1,2}),\s*(\d{4})\s*$/;
  const m = re.exec(input);
  if (!m) return null;

  const startMonth = monthNumber(m[1] ?? "");
  const endMonth = monthNumber(m[4] ?? "");
  if (startMonth === null || endMonth === null) return null;

  const startIso = iso(Number(m[3]), startMonth, Number(m[2]));
  const endIso = iso(Number(m[6]), endMonth, Number(m[5]));
  if (startIso === null || endIso === null) return null;

  return {
    start: { iso: startIso, precision: "day" },
    end: { iso: endIso, precision: "day" },
  };
}

/**
 * "Start: January 24, 2025 End: Permanent" → the start, and whatever the end
 * half turns out to be.
 *
 * A labelled cell rather than a range: the two halves are separated by a `<br>`
 * and each carries its own word. The colons are required, which is what stops
 * the word "end" inside a description from splitting a cell that is really
 * prose.
 *
 * An end half that is not a date ("Permanent", "TBD", "After maintenance")
 * yields a null end rather than an invented one — the same outcome as
 * `parseOpenRange`, and for the same reason.
 */
export function parseLabelledStartEnd(
  input: string,
): { start: ParsedInstant; end: ParsedInstant | null } | null {
  const m = /^\s*start\s*[:：]\s*(.+?)(?:\s+end\s*[:：]\s*(.*?))?\s*$/i.exec(
    input,
  );
  if (!m) return null;

  const start = parseMonthDayYear(m[1] ?? "");
  if (start === null) return null;

  const endHalf = m[2];
  return { start, end: endHalf === undefined ? null : parseMonthDayYear(endHalf) };
}

/**
 * A range whose start is a real date but whose end is not: "July 10, 2026 -
 * Permanent", "Jul. 24, 2026 - End of 4.6", or a lone start date.
 *
 * Returns a null end rather than inventing one. These are common and correct —
 * the source genuinely has not announced an end — and the UI renders them
 * distinctly from an event ending far in the future.
 *
 * Deliberately the last parser tried, because it is the most permissive.
 */
export function parseOpenRange(
  input: string,
): { start: ParsedInstant; end: null } | null {
  const start = parseMonthDayYear(input);
  return start === null ? null : { start, end: null };
}

/**
 * "2026/07/30 – 2026/08/20" → both instants, day precision.
 *
 * Year-first, unlike `parseShortSlashRange`'s MM/DD/YY, so there is nothing to
 * infer about field order: a four-digit leading number can only be the year.
 * The Arknights wiki writes its release windows this way, one line per server.
 *
 * Anchored on the four-digit year at both ends deliberately. Without it the
 * looser MM/DD/YY reader matches the tail of "2026/07/30" as "26/07/30" and
 * calls month 26 an invalid date — null either way, but by accident rather than
 * by rule.
 */
export function parseYearFirstSlashRange(
  input: string,
): { start: ParsedInstant; end: ParsedInstant } | null {
  const re =
    /(\d{4})\/(\d{1,2})\/(\d{1,2})\s*[-–—]\s*(\d{4})\/(\d{1,2})\/(\d{1,2})/;
  const m = re.exec(input);
  if (!m) return null;

  const n = (i: number) => Number(m[i]);
  const startIso = iso(n(1), n(2), n(3));
  const endIso = iso(n(4), n(5), n(6));
  if (startIso === null || endIso === null) return null;

  return {
    start: { iso: startIso, precision: "day" },
    end: { iso: endIso, precision: "day" },
  };
}

/**
 * "November 9th, 05:00 - December 4th, 2023, 04:59 (UTC-5)" → both instants,
 * exact precision, converted from the stated offset to UTC.
 *
 * The Reverse: 1999 wiki writes every window this way. Three things make it
 * worth its own reader rather than a variant of one above:
 *
 * - **Ordinal days** (`9th`, `23rd`, `04th`). Required on both halves, and they
 *   are what anchors this pattern: without them the looser readers above would
 *   have first claim on the text.
 * - **The offset is stated, so nothing is assumed.** `parseSlashDateTimeRange`
 *   has to read its wall-clock times as UTC and says so; here `(UTC-5)` is
 *   part of the format, and a cell without one returns null rather than being
 *   read as UTC. A missing timezone is a missing fact like any other.
 * - **The year sits on the end half**, and only sometimes on the start. A range
 *   crossing New Year reads "December 28th, 05:00 - January 18th, 2024, 04:59",
 *   so the start year rolls back exactly as in `parseMonthDayRange`.
 *
 * Anchored at both ends: this is a whole-cell format, and letting it match
 * mid-prose is how a reader starts finding ranges in sentences.
 */
export function parseOrdinalDateTimeRange(
  input: string,
): { start: ParsedInstant; end: ParsedInstant } | null {
  const re =
    /^\s*([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th),\s*(?:(\d{4}),\s*)?(\d{1,2}):(\d{2})\s*[-–—~]\s*([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th),\s*(\d{4}),\s*(\d{1,2}):(\d{2})\s*\(UTC\s*([+-]\d{1,2})(?::(\d{2}))?\)\s*$/;
  const m = re.exec(input);
  if (!m) return null;

  const startMonth = monthNumber(m[1] ?? "");
  const endMonth = monthNumber(m[6] ?? "");
  if (startMonth === null || endMonth === null) return null;

  const endYear = Number(m[8]);
  // The start states its own year only sometimes. Absent, it belongs to the same
  // year as the end unless the range crosses New Year.
  const startYear =
    m[3] !== undefined
      ? Number(m[3])
      : startMonth > endMonth
        ? endYear - 1
        : endYear;

  const offsetMs = offsetMilliseconds(m[11] ?? "", m[12]);
  if (offsetMs === null) return null;

  const startIso = offsetIso(
    startYear,
    startMonth,
    Number(m[2]),
    Number(m[4]),
    Number(m[5]),
    offsetMs,
  );
  const endIso = offsetIso(
    endYear,
    endMonth,
    Number(m[7]),
    Number(m[9]),
    Number(m[10]),
    offsetMs,
  );
  if (startIso === null || endIso === null) return null;

  return {
    start: { iso: startIso, precision: "exact" },
    end: { iso: endIso, precision: "exact" },
  };
}

/**
 * A stated `(UTC±H[:MM])` offset in milliseconds.
 *
 * The minutes are written unsigned, so `-3:30` means three and a half hours
 * behind UTC rather than three behind and thirty ahead. Signing the whole
 * magnitude is what gets that right, and `-0:30` — a sign with a zero hour —
 * only works because the sign is read from the text rather than from `Number`,
 * which cannot tell `-0` from `0`.
 */
function offsetMilliseconds(
  hours: string,
  minutes: string | undefined,
): number | null {
  const magnitude = Math.abs(Number(hours));
  const mins = minutes === undefined ? 0 : Number(minutes);
  if (!Number.isFinite(magnitude) || magnitude > 14 || mins > 59) return null;
  const sign = hours.trimStart().startsWith("-") ? -1 : 1;
  return sign * (magnitude * 60 + mins) * 60_000;
}

/**
 * A local wall-clock reading plus the offset it was stated in, as a UTC ISO
 * string.
 *
 * The calendar validation happens on the stated local fields, before the offset
 * shifts anything: "February 30th, 23:00 (UTC-5)" is an impossible date in the
 * timezone the source wrote it in, and converting first would quietly turn it
 * into a real instant in March.
 */
function offsetIso(
  y: number,
  m: number,
  d: number,
  hh: number,
  mm: number,
  offsetMs: number,
): string | null {
  const local = iso(y, m, d, hh, mm);
  if (local === null) return null;
  return new Date(Date.parse(local) - offsetMs).toISOString();
}

/**
 * "2021/01/16 04:00 - 2021/01/31 03:59" → both instants, exact precision.
 * Trailing prose after the range (e.g. "Currently Unavailable") is ignored.
 *
 * NOTE: the source states a wall-clock time but not a timezone. These are read
 * as UTC. See the timezone caveat in the Genshin adapter.
 */
export function parseSlashDateTimeRange(
  input: string,
): { start: ParsedInstant; end: ParsedInstant } | null {
  const re =
    /(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/;
  const m = re.exec(input);
  if (!m) return null;

  const n = (i: number) => Number(m[i]);
  const startIso = iso(n(1), n(2), n(3), n(4), n(5));
  const endIso = iso(n(6), n(7), n(8), n(9), n(10));
  if (startIso === null || endIso === null) return null;

  return {
    start: { iso: startIso, precision: "exact" },
    end: { iso: endIso, precision: "exact" },
  };
}
