import { describe, expect, test } from "bun:test";
import {
  parseMonthDayRange,
  parseMonthDayYear,
  parseSlashDateTimeRange,
} from "../src/ingest/dates.ts";

describe("parseMonthDayYear", () => {
  test("parses a full date at day precision", () => {
    expect(parseMonthDayYear("August 12, 2026")).toEqual({
      iso: "2026-08-12T00:00:00.000Z",
      precision: "day",
    });
  });

  test("accepts abbreviated months with and without a period", () => {
    expect(parseMonthDayYear("Apr. 29, 2026")?.iso).toBe(
      "2026-04-29T00:00:00.000Z",
    );
    expect(parseMonthDayYear("Sept 3, 2026")?.iso).toBe(
      "2026-09-03T00:00:00.000Z",
    );
  });

  test("returns null rather than guessing a missing year", () => {
    expect(parseMonthDayYear("August 12")).toBeNull();
  });

  test("rejects impossible calendar dates", () => {
    expect(parseMonthDayYear("February 30, 2026")).toBeNull();
  });

  test("rejects an unknown month name", () => {
    expect(parseMonthDayYear("Smarch 3, 2026")).toBeNull();
  });
});

describe("parseMonthDayRange", () => {
  test("applies the stated year to both ends", () => {
    expect(parseMonthDayRange("August 12 - September 21, 2026")).toEqual({
      start: { iso: "2026-08-12T00:00:00.000Z", precision: "day" },
      end: { iso: "2026-09-21T00:00:00.000Z", precision: "day" },
    });
  });

  test("rolls the start back a year when the range crosses New Year", () => {
    // "December 28 - January 4, 2027" — the stated year belongs to the end.
    const r = parseMonthDayRange("December 28 - January 4, 2027");
    expect(r?.start.iso).toBe("2026-12-28T00:00:00.000Z");
    expect(r?.end.iso).toBe("2027-01-04T00:00:00.000Z");
  });

  test("handles en dash and abbreviated months", () => {
    const r = parseMonthDayRange("Apr. 29 – May 13, 2026");
    expect(r?.start.iso).toBe("2026-04-29T00:00:00.000Z");
    expect(r?.end.iso).toBe("2026-05-13T00:00:00.000Z");
  });

  test("returns null for a year-less range", () => {
    // Game8 summary tables render "08/12 - 08/24". Guessing the year here is
    // exactly the failure the product exists to prevent.
    expect(parseMonthDayRange("08/12 - 08/24")).toBeNull();
  });
});

describe("parseSlashDateTimeRange", () => {
  test("parses a timed range at exact precision", () => {
    expect(
      parseSlashDateTimeRange("2021/01/16 04:00 - 2021/01/31 03:59"),
    ).toEqual({
      start: { iso: "2021-01-16T04:00:00.000Z", precision: "exact" },
      end: { iso: "2021-01-31T03:59:00.000Z", precision: "exact" },
    });
  });

  test("ignores trailing prose after the range", () => {
    const r = parseSlashDateTimeRange(
      "2021/01/16 04:00 - 2021/01/31 03:59 Currently Unavailable",
    );
    expect(r?.end.iso).toBe("2021-01-31T03:59:00.000Z");
  });

  test("returns null for non-date prose", () => {
    expect(parseSlashDateTimeRange("Permanently Available")).toBeNull();
  });
});
