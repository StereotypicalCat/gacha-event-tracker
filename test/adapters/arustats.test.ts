import { describe, expect, test } from "bun:test";
import { adapterById } from "../../src/ingest/adapters/index.ts";
import {
  ESTIMATE_CONFIDENCE,
  aruStatsParser,
} from "../../src/ingest/parsers/arustats.ts";
import type { EventType } from "../../src/shared/schema.ts";

const NOW = "2026-08-14T00:00:00.000Z";
const FIXTURE = "fixtures/hi3/arustats-events-2026-08-27.html";

const hi3 = adapterById("hi3-arustats-events");
if (hi3 === undefined) throw new Error("no adapter 'hi3-arustats-events'");

function parse(html: string) {
  return hi3!.parse(html, {
    now: NOW,
    sourceUrl: hi3!.url,
    sourceId: hi3!.id,
    game: hi3!.game,
  });
}

/**
 * The parser alone, with no adapter seam. Used only for shapes `canParse`
 * rejects — the adapter is supposed to *throw* on those, so it cannot be the
 * thing under test when the question is what the parser returns.
 */
function parseRaw(html: string) {
  return aruStatsParser.parse(html, {
    now: NOW,
    sourceUrl: hi3!.url,
    sourceId: hi3!.id,
    game: hi3!.game,
  });
}

/** A page built from scratch, so a test can state one shape at a time. */
function page(timeline: unknown): string {
  const body = JSON.stringify({ props: { pageProps: { timeline } } });
  return `<html><body><script id="__NEXT_DATA__" type="application/json">${body}</script></body></html>`;
}

const WEEKS = [
  { startDate: "2026-8-20 0:0:0", endDate: "2026-8-28 0:0:0" },
  { startDate: "2026-8-28 0:0:0", endDate: "2026-9-4 0:0:0" },
  { startDate: "2026-9-4 0:0:0", endDate: "2026-9-11 0:0:0" },
];

function bar(over: Record<string, unknown> = {}) {
  return {
    startWeek: 1,
    endWeek: 2,
    miniature: { titleTop: "A Banner", titleMid: null },
    ...over,
  };
}

describe("arustats: the source URL is version-less on purpose", () => {
  test("SOURCES points at the redirecting path, not a pinned version", () => {
    // `/en-us/hi3/timeline` answers 307 to the live version. Pinning `/9.0`
    // here would publish a finished schedule as current the day 9.1 ships,
    // which is the stale-source failure docs/SOURCES.md § 11 exists about.
    expect(hi3!.url).toBe("https://www.arustats.com/en-us/hi3/timeline");
    expect(hi3!.url).not.toMatch(/\/timeline\/\d/);
  });
});

describe("arustats: week index to date", () => {
  test("endWeek is exclusive — a bar ends as its end week opens", () => {
    const [e] = parse(
      page({ scheduleDates: WEEKS, scheduleActivities: [{ row: "EVENT 1", content: [bar({ startWeek: 1, endWeek: 3 })] }] }),
    );
    expect(e?.startsAt).toBe("2026-08-20T00:00:00.000Z");
    // Week 3 opens 2026-09-04, so a 1→3 bar covers weeks 1–2 and ends there.
    expect(e?.endsAt).toBe("2026-09-04T00:00:00.000Z");
  });

  test("an endWeek one past the grid means the end of the version", () => {
    const [e] = parse(
      page({ scheduleDates: WEEKS, scheduleActivities: [{ row: "EVENT 1", content: [bar({ startWeek: 1, endWeek: 4 })] }] }),
    );
    // Not week 4 (there is none) — the last bucket's own endDate.
    expect(e?.endsAt).toBe("2026-09-11T00:00:00.000Z");
  });

  test("a week index further out than that is skipped, never clamped", () => {
    // Skip, never guess: pinning an unreadable bar to the version's edge would
    // be inventing a boundary the page never drew.
    expect(
      parse(page({ scheduleDates: WEEKS, scheduleActivities: [{ row: "EVENT 1", content: [bar({ startWeek: 1, endWeek: 9 })] }] })),
    ).toHaveLength(0);
    expect(
      parse(page({ scheduleDates: WEEKS, scheduleActivities: [{ row: "EVENT 1", content: [bar({ startWeek: 8, endWeek: 9 })] }] })),
    ).toHaveLength(0);
  });

  test("an impossible bucket date yields no event", () => {
    const html = page({
      scheduleDates: [{ startDate: "2026-13-40 0:0:0", endDate: "2026-14-99 0:0:0" }],
      scheduleActivities: [{ row: "EVENT 1", content: [bar({ startWeek: 1, endWeek: 2 })] }],
    });
    // `2026-13-40` must not roll over into a plausible 2027 date.
    expect(parseRaw(html)).toHaveLength(0);
    // And a grid that no longer states readable dates is a redesign, so the
    // adapter refuses the document outright rather than reporting a quiet zero.
    expect(() => parse(html)).toThrow(/redesigned/);
  });

  test("boundaries are day precision at 00:00Z, and the clock is discarded", () => {
    // Every cell on the page reads `0:0:0` and the page states no zone. Both
    // halves matter: there is no instant to publish and nothing to convert.
    const [e] = parse(
      page({
        scheduleDates: [
          { startDate: "2026-8-20 13:45:07", endDate: "2026-8-28 9:1:2" },
          { startDate: "2026-8-28 9:1:2", endDate: "2026-9-4 0:0:0" },
        ],
        scheduleActivities: [{ row: "EVENT 1", content: [bar({ startWeek: 1, endWeek: 2 })] }],
      }),
    );
    expect(e?.startsAt).toBe("2026-08-20T00:00:00.000Z");
    expect(e?.startPrecision).toBe("day");
    expect(e?.endPrecision).toBe("day");
  });
});

describe("arustats: titles arrive in two pieces", () => {
  test("two 7-Day Login events on the real page keep distinct IDs", async () => {
    // The regression that matters most here. `titleTop` is "7-Day Login:" for
    // both and both start in week 1, so dropping the titleMid join gives them
    // one ID and silently collapses two events into one.
    const events = parse(await Bun.file(FIXTURE).text());
    const logins = events.filter((e) => e.title.startsWith("7-Day Login"));
    expect(logins).toHaveLength(2);
    expect(new Set(logins.map((e) => e.id)).size).toBe(2);
    expect(logins.every((e) => e.startsAt === "2026-08-20T00:00:00.000Z")).toBe(true);
  });

  test("a trailing colon on titleTop means the name continues", () => {
    const [e] = parse(
      page({ scheduleDates: WEEKS, scheduleActivities: [{ row: "EVENT 2", content: [bar({ miniature: { titleTop: "7-Day Login:", titleMid: "300 crystals" } })] }] }),
    );
    expect(e?.title).toBe("7-Day Login: 300 crystals");
    expect(e?.summary).toBeNull();
  });

  test("on a supply row titleMid continues the name too", () => {
    const [e] = parse(
      page({ scheduleDates: WEEKS, scheduleActivities: [{ row: "ASCENSION SUPPLY", content: [bar({ miniature: { titleTop: "Lone", titleMid: "Destruction" } })] }] }),
    );
    expect(e?.title).toBe("Lone Destruction");
    expect(e?.summary).toBeNull();
  });

  test("on an EVENT row it is a blurb", () => {
    const [e] = parse(
      page({ scheduleDates: WEEKS, scheduleActivities: [{ row: "EVENT 6", content: [bar({ miniature: { titleTop: "P2 Finale", titleMid: "It's finally over" } })] }] }),
    );
    expect(e?.title).toBe("P2 Finale");
    expect(e?.summary).toBe("It's finally over");
  });

  test("a bar with no title at all is skipped", () => {
    expect(
      parse(page({ scheduleDates: WEEKS, scheduleActivities: [{ row: "EVENT 1", content: [bar({ miniature: { titleTop: "", titleMid: null } })] }] })),
    ).toHaveLength(0);
  });
});

describe("arustats: what the rows mean", () => {
  const TYPES: Array<[string, string, EventType]> = [
    ["BATTLESUIT SUPPLY B", "Jovial Deception", "banner"],
    ["ARMAMENT ASCENSION", "Mad Pleasure Equipment", "banner"],
    ["OUTFIT", "Crane of Taixuan", "shop"],
    ["EVENT 2", "7-Day Login: 300 crystals", "login"],
    ["EVENT 4", "Captain's Wishing Tree Secrets", "other"],
  ];

  test.each(TYPES)("%s / %s is a %s", (row, titleTop, expected) => {
    const [e] = parse(
      page({ scheduleDates: WEEKS, scheduleActivities: [{ row, content: [bar({ miniature: { titleTop, titleMid: null } })] }] }),
    );
    expect(e?.type).toBe(expected);
  });

  test("bosses are not read as events", async () => {
    // `scheduleBosses` is the only exactly-dated material on the page, and it is
    // a recurring Abyss/Memorial rotation with no end — not a deadline.
    const events = parse(await Bun.file(FIXTURE).text());
    expect(events.some((e) => /parvati|herrscher|rimestar/i.test(e.title))).toBe(false);
  });

  test("the whole page is read — one event per bar, nothing silently dropped", async () => {
    const html = await Bun.file(FIXTURE).text();
    const timeline = JSON.parse(
      /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html)![1]!,
    ).props.pageProps.timeline;
    const bars = timeline.scheduleActivities.reduce(
      (n: number, a: { content: unknown[] }) => n + a.content.length,
      0,
    );
    expect(parse(html)).toHaveLength(bars);
  });
});

describe("arustats: the estimate is recorded in the data", () => {
  test("every event carries the estimate confidence", async () => {
    // The one machine-readable mark separating this source from one that
    // publishes announced dates. A real HI3 source outranks it on merge.
    const events = parse(await Bun.file(FIXTURE).text());
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) expect(e.confidence).toBe(ESTIMATE_CONFIDENCE);
  });

  test("it sits well below what a date-stating source earns", () => {
    expect(ESTIMATE_CONFIDENCE).toBeLessThan(0.85);
  });
});

describe("arustats: canParse fails a redesign loudly", () => {
  test("accepts the real page", async () => {
    expect(aruStatsParser.canParse(await Bun.file(FIXTURE).text())).toBe(true);
  });

  test.each([
    ["no __NEXT_DATA__ block", "<html><body><table></table></body></html>"],
    ["a body that is not JSON", `<script id="__NEXT_DATA__" type="application/json">not json</script>`],
  ])("rejects %s", (_label, html) => {
    expect(aruStatsParser.canParse(html)).toBe(false);
  });

  test.each([
    ["no week grid", { scheduleDates: [], scheduleActivities: [{ row: "EVENT 1", content: [bar()] }] }],
    ["no activity rows", { scheduleDates: WEEKS, scheduleActivities: [] }],
    ["a week grid that no longer states dates", { scheduleDates: [{ startDate: "Week 1", endDate: "Week 2" }], scheduleActivities: [{ row: "EVENT 1", content: [bar()] }] }],
  ])("rejects %s", (_label, timeline) => {
    expect(aruStatsParser.canParse(page(timeline))).toBe(false);
  });

  test("the adapter refuses a rejected shape instead of publishing zero", () => {
    // An empty calendar reads as "this game has nothing on" to a reader, which
    // is why the seam throws here rather than returning nothing.
    const html = page({ scheduleDates: [], scheduleActivities: [] });
    expect(() => parse(html)).toThrow(/redesigned/);
    expect(parseRaw(html)).toHaveLength(0);
  });
});
