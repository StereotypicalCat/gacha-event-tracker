import { describe, expect, test } from "bun:test";
import { addUnits, comesRoundEarly, Repeat } from "../src/shared/recurrence.ts";

// Pinned so the DST cases mean something. Copenhagen is UTC+1 in winter and
// UTC+2 in summer, so a step across 29 March 2026 crosses a real transition;
// on a UTC runner these tests would pass without ever exercising the case.
process.env.TZ = "Europe/Copenhagen";

/** Local wall-clock components, which is what a reader typed and reads back. */
function wall(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function at(local: string): number {
  return new Date(local).getTime();
}

describe("addUnits", () => {
  test("days and weeks step the calendar, not 24-hour blocks", () => {
    expect(wall(addUnits(at("2026-08-20T09:00:00"), "days", 1))).toBe("2026-08-21 09:00");
    expect(wall(addUnits(at("2026-08-20T09:00:00"), "weeks", 2))).toBe("2026-09-03 09:00");
  });

  test("a DST transition does not shift the wall-clock time", () => {
    // 29 March 2026 is the spring-forward. A reader whose weekly reset is at
    // 09:00 means 09:00 on both sides of it; stepping in fixed milliseconds
    // would land 08:00 or 10:00 and quietly move their whole series.
    expect(wall(addUnits(at("2026-03-28T09:00:00"), "days", 1))).toBe("2026-03-29 09:00");
    expect(wall(addUnits(at("2026-03-25T09:00:00"), "weeks", 1))).toBe("2026-04-01 09:00");
    // And the autumn fall-back, in the other direction.
    expect(wall(addUnits(at("2026-10-24T09:00:00"), "days", 1))).toBe("2026-10-25 09:00");
  });

  test("months clamp to the last valid day rather than rolling over", () => {
    // Date.parse and setMonth both roll 31 February forward into March. A date
    // that silently moves is the one thing this codebase does not ship —
    // readerInstant guards the same hazard on the way in.
    expect(wall(addUnits(at("2026-01-31T09:00:00"), "months", 1))).toBe("2026-02-28 09:00");
    expect(wall(addUnits(at("2028-01-31T09:00:00"), "months", 1))).toBe("2028-02-29 09:00");
    expect(wall(addUnits(at("2026-03-31T09:00:00"), "months", 1))).toBe("2026-04-30 09:00");
  });

  test("clamping does not accumulate — the anchor day is restored", () => {
    // Stepping one month at a time from 31 January must reach 31 March, not 28
    // March: each step is measured from the anchor, so a February clamp is not
    // allowed to shorten every later occurrence.
    const anchor = at("2026-01-31T09:00:00");
    expect(wall(addUnits(anchor, "months", 2))).toBe("2026-03-31 09:00");
  });

  test("a zero step is the identity", () => {
    const anchor = at("2026-08-20T09:00:00");
    expect(addUnits(anchor, "months", 0)).toBe(anchor);
  });
});

describe("comesRoundEarly", () => {
  // One predicate, exported, because two callers ask this question — the
  // CustomEvent refine and the form that has to explain the refusal. Two
  // copies would drift, and the form would start refusing saves the schema
  // accepts or waving through ones it rejects.
  test("a window closing before the next opening is fine", () => {
    const start = at("2026-09-01T09:00:00");
    const end = at("2026-09-08T09:00:00");
    expect(comesRoundEarly(start, end, { unit: "weeks", interval: 2, until: null })).toBe(false);
  });

  test("closing exactly as the next opens is fine — they do not overlap", () => {
    const start = at("2026-09-01T09:00:00");
    const end = at("2026-09-08T09:00:00");
    expect(comesRoundEarly(start, end, { unit: "weeks", interval: 1, until: null })).toBe(false);
  });

  test("a window still open when the next one starts is not", () => {
    const start = at("2026-09-01T09:00:00");
    const end = at("2026-09-15T09:00:00");
    expect(comesRoundEarly(start, end, { unit: "weeks", interval: 1, until: null })).toBe(true);
  });

  test("no rule, or no stated end, has nothing to overlap", () => {
    const start = at("2026-09-01T09:00:00");
    expect(comesRoundEarly(start, at("2026-10-01T09:00:00"), null)).toBe(false);
    expect(comesRoundEarly(start, null, { unit: "weeks", interval: 1, until: null })).toBe(false);
  });
});

describe("Repeat", () => {
  test("accepts a well-formed rule", () => {
    const parsed = Repeat.parse({ unit: "weeks", interval: 2, until: null });
    expect(parsed.interval).toBe(2);
  });

  test("rejects an interval outside 1..365", () => {
    expect(Repeat.safeParse({ unit: "days", interval: 0, until: null }).success).toBe(false);
    expect(Repeat.safeParse({ unit: "days", interval: 366, until: null }).success).toBe(false);
    expect(Repeat.safeParse({ unit: "days", interval: 1.5, until: null }).success).toBe(false);
  });

  test("rejects an unknown unit", () => {
    expect(Repeat.safeParse({ unit: "fortnights", interval: 1, until: null }).success).toBe(false);
  });
});
