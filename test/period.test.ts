import { describe, expect, test } from "bun:test";
import { dayKey, nextResetMs } from "../src/shared/daily.ts";
import { addDays, isoWeekday, periodOf, PeriodSchema } from "../src/shared/period.ts";

describe("isoWeekday", () => {
  test("Monday is 1 and Sunday is 7", () => {
    expect(isoWeekday("2026-10-12")).toBe(1);
    expect(isoWeekday("2026-10-18")).toBe(7);
  });
});

describe("addDays", () => {
  test("crosses month and year ends", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("periodOf: weeks", () => {
  const week = (startsOn: number) => ({ unit: "week" as const, startsOn });

  test("a Monday week holds Monday to Sunday", () => {
    const p = periodOf(week(1), "2026-10-15");
    expect(p.start).toBe("2026-10-12");
    expect(p.days).toEqual([
      "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15",
      "2026-10-16", "2026-10-17", "2026-10-18",
    ]);
  });

  test("the start day is its own week's first day", () => {
    expect(periodOf(week(1), "2026-10-12").start).toBe("2026-10-12");
    expect(periodOf(week(1), "2026-10-18").start).toBe("2026-10-12");
  });

  test("every start weekday lands on that weekday, on or before today", () => {
    for (let s = 1; s <= 7; s++) {
      const p = periodOf(week(s), "2026-10-15");
      expect(isoWeekday(p.start)).toBe(s);
      expect(p.start <= "2026-10-15").toBe(true);
      expect(p.days).toHaveLength(7);
      expect(p.days).toContain("2026-10-15");
    }
  });

  test("a week can span a year end", () => {
    expect(periodOf(week(1), "2027-01-01").days[0]).toBe("2026-12-28");
  });

  test("the week rolls at each region's Genshin reset, not at midnight", () => {
    // Monday 2026-10-12's reset: 20:00Z Sunday in Asia, 03:00Z in Europe,
    // 09:00Z in America.
    for (const region of ["asia", "europe", "america"] as const) {
      const reset = nextResetMs(Date.parse("2026-10-11T12:00:00Z"), region, "genshin");
      const before = periodOf(week(1), dayKey(reset - 1, region, "genshin"));
      const at = periodOf(week(1), dayKey(reset, region, "genshin"));
      expect(before.start).toBe("2026-10-05");
      expect(at.start).toBe("2026-10-12");
    }
  });

  test("a game with a reset override rolls on its own hour", () => {
    // hololive Dreams rolls at 05:00 JST (resetHourLocal), not the 04:00 default.
    const reset = nextResetMs(Date.parse("2026-10-11T12:00:00Z"), "asia", "holodori");
    expect(new Date(reset).toISOString()).toBe("2026-10-11T20:00:00.000Z");
    expect(periodOf(week(1), dayKey(reset - 1, "asia", "holodori")).start).toBe("2026-10-05");
    expect(periodOf(week(1), dayKey(reset, "asia", "holodori")).start).toBe("2026-10-12");
  });
});

describe("periodOf: months", () => {
  const month = (startsOn: number) => ({ unit: "month" as const, startsOn });

  test("a month from the 1st", () => {
    const p = periodOf(month(1), "2026-10-15");
    expect(p.start).toBe("2026-10-01");
    expect(p.days).toHaveLength(31);
    expect(p.days.at(-1)).toBe("2026-10-31");
  });

  test("before this month's start day, the period began last month", () => {
    const p = periodOf(month(16), "2026-10-15");
    expect(p.start).toBe("2026-09-16");
    expect(p.days.at(-1)).toBe("2026-10-15");
  });

  test("a start day past the month's end clamps to its last day", () => {
    expect(periodOf(month(31), "2026-09-30").start).toBe("2026-09-30");
    expect(periodOf(month(31), "2026-09-29").start).toBe("2026-08-31");
    expect(periodOf(month(31), "2026-10-05").days[0]).toBe("2026-09-30");
    expect(periodOf(month(30), "2027-02-28").start).toBe("2027-02-28");
  });
});

describe("periodOf: cycles", () => {
  const cycle = (days: number, from: string) => ({ unit: "cycle" as const, days, from });

  test("the anchor starts its own cycle, which holds `days` keys", () => {
    const p = periodOf(cycle(14, "2026-10-16"), "2026-10-16");
    expect(p.start).toBe("2026-10-16");
    expect(p.days.length).toBe(14);
    expect(p.days.at(-1)).toBe("2026-10-29");
  });

  test("the last day is in it; the day after starts the next", () => {
    expect(periodOf(cycle(14, "2026-10-16"), "2026-10-29").start).toBe("2026-10-16");
    expect(periodOf(cycle(14, "2026-10-16"), "2026-10-30").start).toBe("2026-10-30");
  });

  test("a day before the anchor is in the cycle before it, not the anchor's", () => {
    expect(periodOf(cycle(42, "2026-11-16"), "2026-10-16").start).toBe("2026-10-05");
    expect(periodOf(cycle(14, "2026-10-16"), "2026-10-15").start).toBe("2026-10-02");
  });

  test("lengths 2 and 366", () => {
    expect(periodOf(cycle(2, "2026-01-01"), "2026-01-04").days).toEqual(["2026-01-03", "2026-01-04"]);
    expect(periodOf(cycle(366, "2026-01-01"), "2027-01-01").days.length).toBe(366);
  });

  test("the schema bounds", () => {
    expect(PeriodSchema.safeParse(cycle(14, "2026-10-16")).success).toBe(true);
    expect(PeriodSchema.safeParse(cycle(1, "2026-01-01")).success).toBe(false);
    expect(PeriodSchema.safeParse(cycle(367, "2026-01-01")).success).toBe(false);
    expect(PeriodSchema.safeParse(cycle(14, "16 Oct")).success).toBe(false);
  });

  test("a start that is not a real date is refused, not rolled over or thrown on later", () => {
    // A corrupt import is stored verbatim; the schema is what keeps it off screen.
    expect(PeriodSchema.safeParse(cycle(14, "2026-13-01")).success).toBe(false);
    expect(PeriodSchema.safeParse(cycle(14, "2026-02-30")).success).toBe(false);
    expect(PeriodSchema.safeParse(cycle(14, "2028-02-29")).success).toBe(true);
  });
});
