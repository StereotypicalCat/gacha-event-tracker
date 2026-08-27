import { describe, expect, test } from "bun:test";
import { addUnits, comesRoundEarly, Repeat, repeatSpanning, repeatModeOf, isOccurrenceId, occurrenceId, occurrenceForId, ruleIdOf, movesOccurrences, nextOccurrences, occurrencesOf, strandedOccurrences, type RepeatingEvent } from "../src/shared/recurrence.ts";
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

describe("occurrencesOf", () => {
  function rule(over: Partial<RepeatingEvent> = {}): RepeatingEvent {
    return {
      id: "myevent:k3f9qa2m01",
      startsAt: new Date("2026-09-01T09:00:00").toISOString(),
      startPrecision: "exact",
      endsAt: new Date("2026-09-08T09:00:00").toISOString(),
      endPrecision: "exact",
      repeat: { unit: "weeks", interval: 2, until: null },
      ...over,
    };
  }

  const day = (local: string) => new Date(local).getTime();

  test("a non-repeating event yields nothing", () => {
    // Callers keep the existing single-event path; this function is only ever
    // about rules, which keeps the blast radius off events that already exist.
    expect(occurrencesOf(rule({ repeat: null }), day("2026-01-01T00:00:00"), day("2027-01-01T00:00:00"))).toEqual([]);
  });

  test("slides the stated window forward by the interval", () => {
    const got = occurrencesOf(rule(), day("2026-09-01T00:00:00"), day("2026-10-01T00:00:00"));
    expect(got.map((o) => o.id)).toEqual([
      "myevent:k3f9qa2m01#2026-09-01",
      "myevent:k3f9qa2m01#2026-09-15",
      "myevent:k3f9qa2m01#2026-09-29",
    ]);
    // The duration is held constant, not recomputed.
    expect(new Date(got[1]!.endsAt).getTime() - new Date(got[1]!.startsAt).getTime())
      .toBe(7 * 24 * 60 * 60 * 1000);
  });

  test("with no stated end, each occurrence runs until the next opens", () => {
    // The point of the whole design: a rule supplies the boundary the rotation
    // was missing, so `endsAt: null` here is not the unbounded case
    // docs/SOURCES.md refuses. Occurrences are contiguous, with no gap.
    const got = occurrencesOf(
      rule({ endsAt: null, endPrecision: "unknown", repeat: { unit: "weeks", interval: 1, until: null } }),
      day("2026-09-01T00:00:00"),
      day("2026-09-23T00:00:00"),
    );
    expect(got).toHaveLength(4);
    expect(got[0]!.endsAt).toBe(got[1]!.startsAt);
    expect(got[1]!.endsAt).toBe(got[2]!.startsAt);
    // Derived from the reader's own anchor, so it inherits that precision
    // rather than claiming to be exact when their start was only a day.
    expect(got[0]!.endPrecision).toBe("exact");
  });

  test("a derived end inherits the anchor's start precision", () => {
    const got = occurrencesOf(
      rule({ startPrecision: "day", endsAt: null, endPrecision: "unknown" }),
      day("2026-09-01T00:00:00"),
      day("2026-09-20T00:00:00"),
    );
    expect(got[0]!.endPrecision).toBe("day");
  });

  test("until stops the series, and the last window still closes on schedule", () => {
    const got = occurrencesOf(
      rule({
        endsAt: null,
        endPrecision: "unknown",
        repeat: { unit: "weeks", interval: 1, until: new Date("2026-09-16T00:00:00").toISOString() },
      }),
      day("2026-09-01T00:00:00"),
      day("2026-12-01T00:00:00"),
    );
    // Opens 1, 8, 15 Sep. The 22nd is past `until`, so it never opens — but the
    // 15th's window still runs its full week rather than being truncated.
    expect(got.map((o) => o.id)).toEqual([
      "myevent:k3f9qa2m01#2026-09-01",
      "myevent:k3f9qa2m01#2026-09-08",
      "myevent:k3f9qa2m01#2026-09-15",
    ]);
    expect(got[2]!.endsAt).toBe(new Date("2026-09-22T09:00:00").toISOString());
  });

  test("an occurrence overlapping the window at either edge is included", () => {
    // A bar half off the left of the board is still on the board.
    const got = occurrencesOf(rule(), day("2026-09-03T00:00:00"), day("2026-09-04T00:00:00"));
    expect(got.map((o) => o.id)).toEqual(["myevent:k3f9qa2m01#2026-09-01"]);
  });

  test("monthly rules clamp and do not accumulate", () => {
    const got = occurrencesOf(
      rule({
        startsAt: new Date("2026-01-31T09:00:00").toISOString(),
        endsAt: null,
        endPrecision: "unknown",
        repeat: { unit: "months", interval: 1, until: null },
      }),
      day("2026-01-01T00:00:00"),
      day("2026-04-15T00:00:00"),
    );
    expect(got.map((o) => o.id)).toEqual([
      "myevent:k3f9qa2m01#2026-01-31",
      "myevent:k3f9qa2m01#2026-02-28",
      "myevent:k3f9qa2m01#2026-03-31",
    ]);
  });

  test("the cap bounds what one call can allocate", () => {
    const got = occurrencesOf(
      rule({ endsAt: null, endPrecision: "unknown", repeat: { unit: "days", interval: 1, until: null } }),
      day("2026-01-01T00:00:00"),
      day("2030-01-01T00:00:00"),
      10,
    );
    expect(got).toHaveLength(10);
  });

  test("an ancient anchor still reaches a window years later", () => {
    const got = occurrencesOf(
      rule({
        startsAt: new Date("2020-09-01T09:00:00").toISOString(),
        endsAt: null,
        endPrecision: "unknown",
        repeat: { unit: "days", interval: 1, until: null },
      }),
      day("2026-09-01T00:00:00"),
      day("2026-09-04T00:00:00"),
    );
    // The anchor's 09:00 wall clock does not line up with the window's
    // midnight boundary, so 31 August's occurrence — which, having no stated
    // end, runs until 1 September 09:00 opens the next one — overlaps the
    // window's first nine hours. Same edge rule as the test above, just
    // reached from six years back instead of a few days.
    expect(got.map((o) => o.id)).toEqual([
      "myevent:k3f9qa2m01#2026-08-31",
      "myevent:k3f9qa2m01#2026-09-01",
      "myevent:k3f9qa2m01#2026-09-02",
      "myevent:k3f9qa2m01#2026-09-03",
    ]);
  });
});

describe("occurrenceForId", () => {
  function rule(over: Partial<RepeatingEvent> = {}): RepeatingEvent {
    return {
      id: "myevent:k3f9qa2m01",
      startsAt: new Date("2026-09-01T09:00:00").toISOString(),
      startPrecision: "exact",
      endsAt: new Date("2026-09-08T09:00:00").toISOString(),
      endPrecision: "exact",
      repeat: { unit: "weeks", interval: 2, until: null },
      ...over,
    };
  }

  test("an id off a real occurrence round-trips to that occurrence", () => {
    const got = occurrenceForId(rule(), "myevent:k3f9qa2m01#2026-09-15");
    expect(got?.id).toBe("myevent:k3f9qa2m01#2026-09-15");
    expect(got?.startsAt).toBe(new Date("2026-09-15T09:00:00").toISOString());
  });

  test("this is exactly what click-to-open needs beyond the list's first two",
    () => {
      // LIST_OCCURRENCES only ever carries the first two; the third is exactly
      // the case a timeline bar can name but `allRows.find` cannot resolve.
      const got = occurrenceForId(rule(), "myevent:k3f9qa2m01#2026-09-29");
      expect(got?.id).toBe("myevent:k3f9qa2m01#2026-09-29");
    });

  test("a bogus suffix returns null", () => {
    expect(occurrenceForId(rule(), "myevent:k3f9qa2m01#not-a-date")).toBeNull();
    expect(occurrenceForId(rule(), "myevent:k3f9qa2m01#2026-02-30")).toBeNull();
    expect(occurrenceForId(rule(), "myevent:k3f9qa2m01")).toBeNull();
  });

  test("a suffix that names no occurrence of this rule returns null", () => {
    // 2026-09-08 falls between two fortnightly openings (1st and 15th) and
    // matches none of them.
    expect(occurrenceForId(rule(), "myevent:k3f9qa2m01#2026-09-08")).toBeNull();
    // A day inside a running occurrence's window but not that occurrence's
    // own start day — ids are keyed by start day only.
    expect(occurrenceForId(rule(), "myevent:k3f9qa2m01#2026-09-04")).toBeNull();
  });

  test("a non-repeating rule has no occurrences to resolve", () => {
    expect(occurrenceForId(rule({ repeat: null }), "myevent:k3f9qa2m01#2026-09-01")).toBeNull();
  });
});

describe("strandedOccurrences", () => {
  function rule(over: Partial<RepeatingEvent> = {}): RepeatingEvent {
    return {
      id: "myevent:k3f9qa2m01",
      startsAt: new Date("2026-09-01T09:00:00").toISOString(),
      startPrecision: "exact",
      endsAt: new Date("2026-09-08T09:00:00").toISOString(),
      endPrecision: "exact",
      repeat: { unit: "weeks", interval: 2, until: null },
      ...over,
    };
  }

  test("a plain event checks its own bare id, not the empty occurrence list", () => {
    // This is the transition that matters most: a reader marks a plain event
    // done, then edits it to add a repeat. `record.repeat === null` used to
    // short-circuit straight to 0 here, hiding the warning on exactly the
    // save that re-keys every row out from under the mark.
    const plain = rule({ repeat: null });
    expect(strandedOccurrences(plain, Date.now(), (id) => id === "myevent:k3f9qa2m01")).toBe(1);
    expect(strandedOccurrences(plain, Date.now(), () => false)).toBe(0);
  });

  test("a repeating rule checks its next occurrences, not its own bare id", () => {
    const now = new Date("2026-09-03T12:00:00").getTime();
    const marked = new Set(["myevent:k3f9qa2m01#2026-09-15"]);
    expect(strandedOccurrences(rule(), now, (id) => marked.has(id))).toBe(1);
    // The bare id is never at risk once a rule repeats — nothing is stored
    // under it.
    expect(strandedOccurrences(rule(), now, (id) => id === "myevent:k3f9qa2m01")).toBe(0);
  });

  test("counts every marked id among the next `count` occurrences", () => {
    const now = new Date("2026-09-03T12:00:00").getTime();
    const marked = new Set([
      "myevent:k3f9qa2m01#2026-09-15",
      "myevent:k3f9qa2m01#2026-09-29",
    ]);
    expect(strandedOccurrences(rule(), now, (id) => marked.has(id), 3)).toBe(2);
  });
});

describe("nextOccurrences", () => {
  function rule(over: Partial<RepeatingEvent> = {}): RepeatingEvent {
    return {
      id: "myevent:k3f9qa2m01",
      startsAt: new Date("2026-09-01T09:00:00").toISOString(),
      startPrecision: "exact",
      endsAt: new Date("2026-09-08T09:00:00").toISOString(),
      endPrecision: "exact",
      repeat: { unit: "weeks", interval: 2, until: null },
      ...over,
    };
  }

  test("returns the running occurrence and the one after it", () => {
    const now = new Date("2026-09-03T12:00:00").getTime();
    const got = nextOccurrences(rule(), now, 2);
    expect(got.map((o) => o.id)).toEqual([
      "myevent:k3f9qa2m01#2026-09-01",
      "myevent:k3f9qa2m01#2026-09-15",
    ]);
  });

  test("between cycles it returns the next to open, plus the one after", () => {
    // A rule with a gap has nothing running on 10 September. "Opens Saturday"
    // is the honest answer; showing nothing would read as the rule being over.
    const now = new Date("2026-09-10T12:00:00").getTime();
    const got = nextOccurrences(rule(), now, 2);
    expect(got.map((o) => o.id)).toEqual([
      "myevent:k3f9qa2m01#2026-09-15",
      "myevent:k3f9qa2m01#2026-09-29",
    ]);
  });

  test("a series past its until yields nothing", () => {
    const got = nextOccurrences(
      rule({ repeat: { unit: "weeks", interval: 2, until: new Date("2026-09-02T00:00:00").toISOString() } }),
      new Date("2027-01-01T00:00:00").getTime(),
      2,
    );
    expect(got).toEqual([]);
  });
});

describe("repeatSpanning", () => {
  // The three-state repeat control ("never / forever / with a delay") never
  // asks the reader for a cadence when it can measure one. Forever asks for
  // the next opening to land exactly where this occurrence closes; a delay
  // pushes that target later. Both reduce to the same question, which is what
  // this function answers: which {unit, interval} steps from the anchor to
  // that target exactly.

  test("a window that is a calendar month reads as every month", () => {
    // Not "every 31 days" — a fixed day count drifts out of step by February,
    // and the reader who typed 1 Jul to 1 Aug meant the month.
    expect(repeatSpanning(at("2026-07-01T09:00:00"), at("2026-08-01T09:00:00")))
      .toEqual({ unit: "months", interval: 1, until: null });
  });

  test("whole weeks read as weeks, not days", () => {
    expect(repeatSpanning(at("2026-07-01T09:00:00"), at("2026-08-12T09:00:00")))
      .toEqual({ unit: "weeks", interval: 6, until: null });
    expect(repeatSpanning(at("2026-07-01T09:00:00"), at("2026-07-15T09:00:00")))
      .toEqual({ unit: "weeks", interval: 2, until: null });
  });

  test("anything else falls back to days", () => {
    // The walkthrough case: 1 Jul to 26 Jul is 25 days, which is neither a
    // month nor whole weeks, so it stays in the unit the reader can verify.
    expect(repeatSpanning(at("2026-07-01T09:00:00"), at("2026-07-26T09:00:00")))
      .toEqual({ unit: "days", interval: 25, until: null });
  });

  test("a delayed target is the same question asked later", () => {
    // A 7-day window with a 21-day delay: the next opening is 28 days after
    // the anchor, which is four whole weeks.
    const anchor = at("2026-07-01T09:00:00");
    const closes = at("2026-07-08T09:00:00");
    const delayed = addUnits(closes, "days", 21);
    expect(repeatSpanning(anchor, delayed))
      .toEqual({ unit: "weeks", interval: 4, until: null });
  });

  test("a span crossing a DST transition is still exact", () => {
    // Spring forward is 29 March 2026. Measured in milliseconds this span is
    // an hour short of four weeks and would fall through to no answer at all.
    expect(repeatSpanning(at("2026-03-15T09:00:00"), at("2026-04-12T09:00:00")))
      .toEqual({ unit: "weeks", interval: 4, until: null });
  });

  test("a target at or before the anchor has no answer", () => {
    const anchor = at("2026-07-01T09:00:00");
    expect(repeatSpanning(anchor, anchor)).toBe(null);
    expect(repeatSpanning(anchor, at("2026-06-30T09:00:00"))).toBe(null);
  });

  test("a span that is not whole days has no answer", () => {
    // Two exact times a few hours apart. Rounding to a day would move the
    // reader's boundary, so the form asks them instead of guessing.
    expect(repeatSpanning(at("2026-07-01T09:00:00"), at("2026-07-08T14:30:00"))).toBe(null);
  });

  test("a span past the schema's ceiling has no answer", () => {
    // `interval` is capped at 365, so a span no unit can express within that
    // returns null rather than a rule the schema would reject.
    expect(repeatSpanning(at("2026-07-01T09:00:00"), at("2030-07-01T09:00:00"))).toBe(null);
  });
});

describe("repeatModeOf", () => {
  // Which of the three states the form should open in. Deliberately derived
  // from the rule rather than stored beside it: "forever" and "a delay of
  // zero" are the same rule, so remembering which button was pressed would be
  // remembering something that makes no difference to the reader's schedule.
  const start = at("2026-07-01T09:00:00");
  const close = at("2026-07-08T09:00:00");

  test("no rule is never", () => {
    expect(repeatModeOf(start, close, null)).toBe("never");
  });

  test("a window that reopens exactly as it closes is forever", () => {
    expect(repeatModeOf(start, close, { unit: "weeks", interval: 1, until: null }))
      .toBe("forever");
  });

  test("a gap between closing and reopening is a delay", () => {
    expect(repeatModeOf(start, close, { unit: "weeks", interval: 4, until: null }))
      .toBe("delay");
  });

  test("an unstated end is forever, because there is no gap to describe", () => {
    // "Weekly missions, resets Monday": the reader gave a cadence and no end,
    // so each occurrence runs until the next opens. Contiguous by definition,
    // and a delay would have nothing to be measured from.
    expect(repeatModeOf(start, null, { unit: "weeks", interval: 1, until: null }))
      .toBe("forever");
  });
});
