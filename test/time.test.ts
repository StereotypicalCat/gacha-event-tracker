import { describe, expect, test } from "bun:test";
import type { GachaEvent } from "../src/shared/schema.ts";
import { dailyDays, dayKey } from "../src/shared/daily.ts";
import {
  clockFor,
  DAY,
  dayStartMs,
  endingSoonestFirst,
  formatRemaining,
  HOUR,
  urgency,
} from "../src/shared/time.ts";

const NOW = Date.parse("2026-08-15T12:00:00.000Z");

function event(overrides: Partial<GachaEvent> = {}): GachaEvent {
  return {
    id: "genshin:x:2026-08-10",
    game: "genshin",
    title: "X",
    type: "other",
    summary: null,
    startsAt: "2026-08-10T00:00:00.000Z",
    startPrecision: "day",
    endsAt: "2026-08-20T00:00:00.000Z",
    endPrecision: "day",
    regionScoped: false,
    regionEnds: null,
    sourceUrl: "https://example.test/a",
    sourceId: "s",
    status: "published",
    confidence: 0.9,
    extractionMethod: "parser",
    version: 1,
    firstSeenAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("formatRemaining", () => {
  test("drops to a finer unit as the deadline closes", () => {
    // Days are useless once minutes decide whether you make it.
    expect(formatRemaining(9 * DAY + 3 * HOUR)).toBe("9d 3h");
    expect(formatRemaining(4 * HOUR + 12 * 60_000)).toBe("4h 12m");
    expect(formatRemaining(90_000)).toBe("1m 30s");
    expect(formatRemaining(0)).toBe("ended");
    expect(formatRemaining(-5)).toBe("ended");
  });
});

describe("urgency", () => {
  test("is driven by absolute time left, not proportion", () => {
    expect(urgency(2 * HOUR)).toBe("critical");
    expect(urgency(2 * DAY)).toBe("soon");
    expect(urgency(5 * DAY)).toBe("near");
    expect(urgency(40 * DAY)).toBe("calm");
    expect(urgency(-1)).toBe("expired");
  });
});

describe("clockFor", () => {
  test("reports progress through the window", () => {
    // Both boundaries are day-precision, so both land on the Europe reset
    // (04:00 on a UTC+1 server = 03:00Z) rather than on UTC midnight. The
    // window is still ten days; it just starts and finishes three hours later.
    const c = clockFor(event(), "europe", NOW);
    expect(c.live).toBe(true);
    expect(c.progress).toBeCloseTo(0.5375, 3);
    expect(c.msRemaining).toBe(Date.parse("2026-08-20T03:00:00.000Z") - NOW);
  });

  test("an unannounced end is never urgent and has no progress", () => {
    // "We don't know" and "loads of time" are different facts. Treating an
    // unknown end as a deadline would be inventing one.
    const c = clockFor(
      event({ endsAt: null, endPrecision: "unknown" }),
      "europe",
      NOW,
    );
    expect(c.msRemaining).toBeNull();
    expect(c.progress).toBeNull();
    expect(c.urgency).toBe("calm");
    expect(c.ended).toBe(false);
  });

  test("resolves a region-scoped end to the reader's region", () => {
    // Note the event is day-precision: a `regionEnds` value is still taken
    // verbatim, because the map only exists when a source printed a timer per
    // server. Re-anchoring it to a reset would throw that instant away.
    const c = clockFor(
      event({
        regionScoped: true,
        regionEnds: {
          asia: "2026-08-20T00:00:00.000Z",
          europe: "2026-08-20T07:00:00.000Z",
          america: "2026-08-20T13:00:00.000Z",
        },
      }),
      "america",
      NOW,
    );
    expect(c.endsMs).toBe(Date.parse("2026-08-20T13:00:00.000Z"));
  });

  test("marks an event that has not started as upcoming", () => {
    const c = clockFor(
      event({ startsAt: "2026-09-01T00:00:00.000Z", endsAt: "2026-09-10T00:00:00.000Z" }),
      "europe",
      NOW,
    );
    expect(c.upcoming).toBe(true);
    expect(c.live).toBe(false);
  });
});

describe("endingSoonestFirst", () => {
  test("live before upcoming, soonest end first, unknown ends last", () => {
    const rows = [
      { key: "upcoming", clock: clockFor(event({ startsAt: "2026-09-01T00:00:00.000Z", endsAt: "2026-09-10T00:00:00.000Z" }), "europe", NOW) },
      { key: "unknown", clock: clockFor(event({ endsAt: null, endPrecision: "unknown" }), "europe", NOW) },
      { key: "later", clock: clockFor(event({ endsAt: "2026-08-25T00:00:00.000Z" }), "europe", NOW) },
      { key: "soonest", clock: clockFor(event({ endsAt: "2026-08-16T00:00:00.000Z" }), "europe", NOW) },
    ];
    expect([...rows].sort(endingSoonestFirst).map((r) => r.key)).toEqual([
      "soonest",
      "later",
      "unknown",
      "upcoming",
    ]);
  });
});

describe("a day-precision boundary", () => {
  /**
   * The bug this describes: a source that prints "August 19, 2026" and no time
   * is stored as 00:00Z, and counting down to that literally expires the event
   * at the moment the *UTC* day opens. A European Wuthering Waves player's day
   * opens at 04:00 on a UTC+1 server, so the app called an event over three
   * hours before the game did — and the game was the one the reader believed.
   */
  const dated = (endsAt: string, overrides: Partial<GachaEvent> = {}) =>
    event({ endsAt, endPrecision: "day", ...overrides });

  test("resolves to the game's reset, not to UTC midnight", () => {
    const c = clockFor(dated("2026-08-19T00:00:00.000Z"), "europe", NOW);
    expect(c.endsMs).toBe(Date.parse("2026-08-19T03:00:00.000Z"));
    expect(c.endsMs! - Date.parse("2026-08-19T00:00:00.000Z")).toBe(3 * HOUR);
  });

  test("lands on a different instant in each region, from the same date", () => {
    const at = (region: "asia" | "america" | "europe") =>
      clockFor(dated("2026-08-19T00:00:00.000Z"), region, NOW).endsMs;
    // 04:00 local on UTC+8, UTC-5 and UTC+1 servers respectively. Reading the
    // printed date as UTC is wrong for all three, and by up to nine hours.
    expect(at("asia")).toBe(Date.parse("2026-08-18T20:00:00.000Z"));
    expect(at("america")).toBe(Date.parse("2026-08-19T09:00:00.000Z"));
    expect(at("europe")).toBe(Date.parse("2026-08-19T03:00:00.000Z"));
  });

  test("follows a game that states its own server map or reset hour", () => {
    // Endfield serves Europe off the Americas machine (UTC-5), and Reverse:
    // 1999 rolls at 05:00 on a single UTC-5 server. Both already move day keys;
    // an end date printed for those games moves with them.
    const end = "2026-08-19T00:00:00.000Z";
    expect(clockFor(dated(end, { game: "endfield" }), "europe", NOW).endsMs).toBe(
      Date.parse("2026-08-19T09:00:00.000Z"),
    );
    expect(clockFor(dated(end, { game: "r1999" }), "europe", NOW).endsMs).toBe(
      Date.parse("2026-08-19T10:00:00.000Z"),
    );
  });

  test("leaves an exact boundary exactly where the source put it", () => {
    const c = clockFor(
      event({
        startsAt: "2026-08-10T11:00:00.000Z",
        startPrecision: "exact",
        endsAt: "2026-08-19T10:59:59.000Z",
        endPrecision: "exact",
      }),
      "europe",
      NOW,
    );
    expect(c.startsMs).toBe(Date.parse("2026-08-10T11:00:00.000Z"));
    expect(c.endsMs).toBe(Date.parse("2026-08-19T10:59:59.000Z"));
  });

  test("leaves an event the reader typed in alone", () => {
    // `readerInstant` already resolved this to the instant they meant, in their
    // own timezone — the end of the day they named, not a parser declining to
    // guess a time. Anchoring it would move a date they stated themselves.
    const typed = "2026-08-19T21:59:59.000Z";
    const c = clockFor(
      dated(typed, { extractionMethod: "manual", sourceId: "you" }),
      "europe",
      NOW,
    );
    expect(c.endsMs).toBe(Date.parse(typed));
  });

  test("an unannounced end is still unannounced", () => {
    const c = clockFor(event({ endsAt: null, endPrecision: "unknown" }), "asia", NOW);
    expect(c.endsMs).toBeNull();
  });

  test("puts the checklist on the days the reader can actually claim", () => {
    // The window now starts on a reset, so the first pip is the day the source
    // named. Read as UTC midnight it opened three hours early, which put a
    // phantom pip on the day *before* the event for every region ahead of UTC.
    const c = clockFor(
      event({ startsAt: "2026-08-10T00:00:00.000Z", endsAt: "2026-08-13T00:00:00.000Z" }),
      "europe",
      NOW,
    );
    expect(dailyDays(c.startsMs, c.endsMs, "europe", "genshin")).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
    ]);
  });
});

describe("dayStartMs", () => {
  test("is the instant dayKey names, for every region and game", () => {
    for (const region of ["asia", "america", "europe"] as const) {
      for (const game of [undefined, "genshin", "endfield", "r1999"] as const) {
        const start = dayStartMs("2026-08-19", region, game);
        expect(dayKey(start, region, game)).toBe("2026-08-19");
        expect(dayKey(start - 1, region, game)).toBe("2026-08-18");
      }
    }
  });
});
