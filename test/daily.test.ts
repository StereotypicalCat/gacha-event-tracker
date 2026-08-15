import { describe, expect, test } from "bun:test";
import {
  dailiesId,
  dailyDays,
  dailySummary,
  dayKey,
  isDaily,
  msUntilReset,
  nextResetMs,
  streakOf,
} from "../src/shared/daily.ts";
import { DAY, HOUR } from "../src/shared/time.ts";

const at = (iso: string) => Date.parse(iso);

describe("isDaily", () => {
  const base = { type: "other" as const, title: "", summary: null };

  test("a login campaign always repeats", () => {
    expect(isDaily({ ...base, type: "login", title: "Traveler's Log" })).toBe(true);
  });

  test("reads the phrasing sources actually use", () => {
    for (const title of [
      "Daily Check-In Rewards",
      "Sign-in Event",
      "7-Day Login Bonus",
      "Log-in Campaign: Frostlands",
    ]) {
      expect(isDaily({ ...base, title })).toBe(true);
    }
  });

  test("finds it in the summary when the title is a codename", () => {
    expect(
      isDaily({
        ...base,
        title: "Mutual Aid in Bloom",
        summary: "Complete a task each day to earn Primogems.",
      }),
    ).toBe(true);
  });

  test("an ordinary event gets no checklist", () => {
    // A false positive puts a twenty-box checklist on a story chapter, which
    // the reader then has to work out and dismiss.
    expect(
      isDaily({
        ...base,
        type: "banner",
        title: "Mutual Aid in Bloom",
        summary: "Limited character banner rerun.",
      }),
    ).toBe(false);
    expect(isDaily({ ...base, type: "challenge", title: "Spiral Abyss" })).toBe(false);
  });
});

describe("dayKey", () => {
  test("the game day rolls at 04:00 server time, not midnight", () => {
    // Asia is UTC+8, so its 04:00 reset is 20:00 UTC the day before. Someone
    // playing at 02:00 local is still on the previous day's dailies, and a
    // naive UTC date would tick the wrong box for four hours every night.
    expect(dayKey(at("2026-08-15T19:59:00Z"), "asia")).toBe("2026-08-15");
    expect(dayKey(at("2026-08-15T20:00:00Z"), "asia")).toBe("2026-08-16");
  });

  test("each region rolls at its own instant", () => {
    const instant = at("2026-08-16T02:00:00Z");
    // Europe (UTC+1) resets at 03:00 UTC, so 02:00 is still the 15th there,
    // while Asia rolled over six hours earlier.
    expect(dayKey(instant, "europe")).toBe("2026-08-15");
    expect(dayKey(instant, "asia")).toBe("2026-08-16");
  });

  test("survives a UTC month boundary", () => {
    expect(dayKey(at("2026-09-01T00:30:00Z"), "america")).toBe("2026-08-31");
  });
});

describe("nextResetMs", () => {
  test("is the next reset strictly after the instant given", () => {
    const reset = at("2026-08-15T20:00:00Z"); // asia
    expect(nextResetMs(reset - 1, "asia")).toBe(reset);
    // Standing exactly on a reset, the next one is tomorrow's — otherwise the
    // countdown would read "0s" for a whole tick.
    expect(nextResetMs(reset, "asia")).toBe(reset + DAY);
  });

  test("msUntilReset never exceeds a day", () => {
    for (const region of ["asia", "america", "europe"] as const) {
      const left = msUntilReset(at("2026-08-15T11:22:33Z"), region);
      expect(left).toBeGreaterThan(0);
      expect(left).toBeLessThanOrEqual(DAY);
    }
  });
});

describe("dailyDays", () => {
  const start = at("2026-08-12T20:00:00Z"); // an asia reset instant

  test("one entry per claimable day", () => {
    const days = dailyDays(start, start + 7 * DAY, "asia");
    expect(days).toEqual([
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
      "2026-08-16",
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
    ]);
  });

  test("an end landing on a reset gives you nothing that day", () => {
    // Ending at 04:00 means the final day was never claimable; listing it
    // would show a box that can only ever be a miss.
    const days = dailyDays(start, start + 3 * DAY, "asia");
    expect(days).toHaveLength(3);
    expect(days?.at(-1)).toBe("2026-08-15");
  });

  test("an unannounced end yields no checklist rather than a made-up one", () => {
    // This is the endsAt: null rule. Filling twenty boxes from a guessed end
    // date is exactly the fabrication the schema exists to prevent.
    expect(dailyDays(start, null, "asia")).toBeNull();
  });

  test("a nonsense window still returns something finite", () => {
    expect(dailyDays(start, start + 400 * DAY, "asia")).toHaveLength(200);
    expect(dailyDays(start, start - DAY, "asia")).toEqual(["2026-08-13"]);
  });
});

describe("dailySummary", () => {
  const start = at("2026-08-12T20:00:00Z");
  const week = { startsMs: start, endsMs: start + 7 * DAY, region: "asia" as const };

  test("counts what is left including today", () => {
    const s = dailySummary({
      ...week,
      now: at("2026-08-15T12:00:00Z"),
      logged: ["2026-08-13", "2026-08-15"],
    });
    expect(s.today).toBe("2026-08-15");
    expect(s.doneToday).toBe(true);
    expect(s.logged).toBe(2);
    expect(s.remaining).toBe(5); // 15th through 19th
    expect(s.missed).toBe(1); // the 14th
  });

  test("a day the reader missed is reported, not hidden", () => {
    const s = dailySummary({
      ...week,
      now: at("2026-08-16T12:00:00Z"),
      logged: [],
    });
    expect(s.doneToday).toBe(false);
    expect(s.missed).toBe(3);
    expect(s.remaining).toBe(4);
  });

  test("an unannounced end still counts the ticks", () => {
    const s = dailySummary({
      ...week,
      endsMs: null,
      now: at("2026-08-16T12:00:00Z"),
      logged: ["2026-08-14", "2026-08-15"],
    });
    expect(s.days).toBeNull();
    expect(s.remaining).toBeNull();
    expect(s.missed).toBeNull();
    expect(s.logged).toBe(2);
  });

  test("ticks outside the published window are never discarded", () => {
    // If a source quietly moves a date, the reader's own record of having
    // played still stands — nothing else holds a copy of it.
    const s = dailySummary({
      ...week,
      endsMs: null,
      now: at("2026-08-16T12:00:00Z"),
      logged: ["2020-01-01"],
    });
    expect(s.logged).toBe(1);
  });

  test("resets are reported against the reader's own region", () => {
    const evening = at("2026-08-15T21:00:00Z");
    expect(dailySummary({ ...week, now: evening, logged: [] }).msUntilReset).toBe(
      23 * HOUR,
    );
  });
});

describe("streakOf", () => {
  test("counts back from yesterday when today is not done yet", () => {
    // Otherwise a fortnight's run reads as broken every morning, which is the
    // one time the number actually matters to the reader.
    expect(
      streakOf(["2026-08-10", "2026-08-11", "2026-08-12"], "2026-08-13"),
    ).toBe(3);
  });

  test("includes today once it is done", () => {
    expect(streakOf(["2026-08-12", "2026-08-13"], "2026-08-13")).toBe(2);
  });

  test("a gap ends the run", () => {
    expect(streakOf(["2026-08-09", "2026-08-11"], "2026-08-12")).toBe(1);
    expect(streakOf([], "2026-08-12")).toBe(0);
  });

  test("skips a month boundary correctly", () => {
    expect(streakOf(["2026-07-31", "2026-08-01"], "2026-08-01")).toBe(2);
  });
});

describe("dailiesId", () => {
  test("cannot collide with an event ID", () => {
    // Event IDs are `game:slug:date`; these are deliberately two segments.
    expect(dailiesId("genshin")).toBe("dailies:genshin");
    expect(dailiesId("genshin").split(":")).toHaveLength(2);
  });
});
