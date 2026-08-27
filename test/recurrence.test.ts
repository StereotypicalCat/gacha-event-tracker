import { describe, expect, test } from "bun:test";
import { addUnits, comesRoundEarly, Repeat, isOccurrenceId, occurrenceId, ruleIdOf, movesOccurrences } from "../src/shared/recurrence.ts";
import { CustomEventId, isCustomEventId } from "../src/shared/custom.ts";

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

describe("occurrence ids", () => {
  const RULE = "myevent:k3f9qa2m01";

  test("suffixes the rule id with the occurrence's own local start day", () => {
    const id = occurrenceId(RULE, new Date("2026-09-01T09:00:00").getTime());
    expect(id).toBe("myevent:k3f9qa2m01#2026-09-01");
  });

  test("the day is the reader's local day, not UTC's", () => {
    // 00:30 local on 2 September is 22:30Z on the 1st, so the two readings
    // disagree about which day this is. That disagreement is the whole point:
    // the reader typed a local date and is shown a local date back, and a UTC
    // reading would file this occurrence under the previous day for every
    // reader east of UTC. Asserted with an instant where the two differ,
    // because an instant where they agree proves nothing.
    const id = occurrenceId(RULE, new Date("2026-09-02T00:30:00").getTime());
    expect(id).toBe("myevent:k3f9qa2m01#2026-09-02");
  });

  test("the rule id is recoverable, and a plain id is its own rule", () => {
    expect(ruleIdOf("myevent:k3f9qa2m01#2026-09-01")).toBe(RULE);
    expect(ruleIdOf(RULE)).toBe(RULE);
    // A feed id is colon-separated and carries no separator, so it survives.
    expect(ruleIdOf("genshin:some-event:2026-09-01")).toBe("genshin:some-event:2026-09-01");
  });

  test("an occurrence is recognisable as one", () => {
    expect(isOccurrenceId("myevent:k3f9qa2m01#2026-09-01")).toBe(true);
    expect(isOccurrenceId(RULE)).toBe(false);
  });

  test("an occurrence id still reads as the reader's own", () => {
    // isCustomEventId is a startsWith check on the first segment, so lane
    // logic, RESERVED_ID_SEGMENTS and "never attributed to a source" all hold.
    expect(isCustomEventId("myevent:k3f9qa2m01#2026-09-01")).toBe(true);
  });

  test("CustomEventId REJECTS an occurrence id", () => {
    // The guardrail, asserted rather than assumed. '#' is outside [a-z0-9], so
    // an occurrence cannot be written back into the customEvents store and
    // cannot survive an import if one ever appears in a file. validRecords
    // drops what fails this schema, which is exactly the behaviour we want.
    expect(CustomEventId.safeParse(RULE).success).toBe(true);
    expect(CustomEventId.safeParse("myevent:k3f9qa2m01#2026-09-01").success).toBe(false);
  });
});

describe("movesOccurrences", () => {
  const rule = (startsAt: string, interval: number) => ({
    startsAt,
    repeat: { unit: "weeks" as const, interval, until: null },
  });

  test("a changed anchor or interval re-keys every occurrence", () => {
    const a = rule("2026-09-01T07:00:00.000Z", 2);
    expect(movesOccurrences(a, rule("2026-09-02T07:00:00.000Z", 2))).toBe(true);
    expect(movesOccurrences(a, rule("2026-09-01T07:00:00.000Z", 3))).toBe(true);
  });

  test("changing only `until` does not", () => {
    // It truncates the series; it does not move what is already in it, so no
    // mark is stranded and the reader should not be warned that one is.
    const a = rule("2026-09-01T07:00:00.000Z", 2);
    const b = {
      startsAt: "2026-09-01T07:00:00.000Z",
      repeat: { unit: "weeks" as const, interval: 2, until: "2027-01-01T00:00:00.000Z" },
    };
    expect(movesOccurrences(a, b)).toBe(false);
  });

  test("adding or dropping a rule entirely counts as a move", () => {
    const plain = { startsAt: "2026-09-01T07:00:00.000Z", repeat: null };
    expect(movesOccurrences(plain, rule("2026-09-01T07:00:00.000Z", 2))).toBe(true);
    expect(movesOccurrences(rule("2026-09-01T07:00:00.000Z", 2), plain)).toBe(true);
  });

  test("an untouched schedule moves nothing", () => {
    const a = rule("2026-09-01T07:00:00.000Z", 2);
    expect(movesOccurrences(a, rule("2026-09-01T07:00:00.000Z", 2))).toBe(false);
  });
});
