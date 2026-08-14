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
