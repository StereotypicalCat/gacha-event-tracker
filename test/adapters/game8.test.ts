import { describe, expect, test } from "bun:test";
import { adapterById } from "../../src/ingest/adapters/index.ts";
import type { Adapter } from "../../src/ingest/adapters/types.ts";
import { parseOrdinalDateTimeRange } from "../../src/ingest/dates.ts";
import { arknightsWikiParser } from "../../src/ingest/parsers/akwiki.ts";
import { blueArchiveWikiParser } from "../../src/ingest/parsers/bawiki.ts";
import { fandomParser, renderedHtml } from "../../src/ingest/parsers/fandom.ts";
import { inferType } from "../../src/ingest/parsers/game8.ts";
import { holodoriWikiParser } from "../../src/ingest/parsers/holodori.ts";
import { GachaEvent, type EventType } from "../../src/shared/schema.ts";

/**
 * Pinned clock. Parsers take `now` from context and never read it themselves,
 * so a fixture captured months ago still asserts byte-identical output.
 */
const NOW = "2026-08-14T00:00:00.000Z";

function adapter(id: string): Adapter {
  const found = adapterById(id);
  if (found === undefined) throw new Error(`no adapter '${id}'`);
  return found;
}

const genshinGame8 = adapter("genshin-game8-events");
const nteGame8 = adapter("nte-game8-events");

const CASES: Array<{ adapter: Adapter; fixture: string }> = [
  { adapter: genshinGame8, fixture: "fixtures/genshin/game8-events-2026-08-14" },
  { adapter: nteGame8, fixture: "fixtures/nte/game8-events-2026-08-14" },
  { adapter: adapter("hsr-game8-events"), fixture: "fixtures/hsr/game8-events-2026-08-14" },
  { adapter: adapter("wuwa-game8-events"), fixture: "fixtures/wuwa/game8-events-2026-08-14" },
  { adapter: adapter("zzz-game8-events"), fixture: "fixtures/zzz/game8-events-2026-08-14" },
  { adapter: adapter("endfield-game8-events"), fixture: "fixtures/endfield/game8-events-2026-08-14" },
  { adapter: adapter("endfield-wikigg-events"), fixture: "fixtures/endfield/wikigg-events-2026-08-14" },
  { adapter: adapter("nikki-game8-events"), fixture: "fixtures/nikki/game8-events-2026-08-17" },
  { adapter: adapter("p5x-game8-events"), fixture: "fixtures/p5x/game8-events-2026-08-17" },
  { adapter: adapter("arknights-akwiki-events"), fixture: "fixtures/arknights/akwiki-events-2026-08-17" },
  // A `.html` fixture holding JSON, deliberately: this source is the MediaWiki
  // action API, and `snapshots/` names every stored body `<id>.html` whatever
  // its content type. The fixture is the bytes the fetcher would store.
  { adapter: adapter("r1999-fandom-events"), fixture: "fixtures/r1999/fandom-events-2026-08-17" },
  { adapter: adapter("ba-bawiki-events"), fixture: "fixtures/ba/bawiki-events-2026-08-17" },
  { adapter: adapter("fgo-fandom-events"), fixture: "fixtures/fgo/fandom-events-2026-08-18" },
  { adapter: adapter("holodori-holodoriwiki-events"), fixture: "fixtures/holodori/holodoriwiki-events-2026-08-18" },
  { adapter: adapter("gfl2-iopwiki-events"), fixture: "fixtures/gfl2/iopwiki-events-2026-08-19" },
];

async function runAdapter(adapter: Adapter, fixture: string) {
  const html = await Bun.file(`${fixture}.html`).text();
  return adapter.parse(html, {
    now: NOW,
    sourceUrl: adapter.url,
    sourceId: adapter.id,
    game: adapter.game,
  });
}

describe.each(CASES)("$adapter.id", ({ adapter, fixture }) => {
  test("matches the checked-in expected output", async () => {
    const events = await runAdapter(adapter, fixture);
    const expected = await Bun.file(`${fixture}.expected.json`).json();
    expect(events).toEqual(expected);
  });

  test("every event satisfies the schema", async () => {
    for (const event of await runAdapter(adapter, fixture)) {
      expect(() => GachaEvent.parse(event)).not.toThrow();
    }
  });

  test("is deterministic across runs", async () => {
    const a = await runAdapter(adapter, fixture);
    const b = await runAdapter(adapter, fixture);
    expect(a).toEqual(b);
  });

  test("never emits an end before its start", async () => {
    for (const e of await runAdapter(adapter, fixture)) {
      if (e.endsAt !== null) expect(e.endsAt > e.startsAt).toBe(true);
    }
  });

  test("no event runs longer than 180 days", async () => {
    // Patch cycles are ~6 weeks. A longer span means a misread year, which is
    // the failure mode most likely to reach a user as a confident wrong date.
    for (const e of await runAdapter(adapter, fixture)) {
      if (e.endsAt === null) continue;
      const days =
        (Date.parse(e.endsAt) - Date.parse(e.startsAt)) / 86_400_000;
      expect(days).toBeLessThanOrEqual(180);
    }
  });

  test("event IDs are unique and stable in shape", async () => {
    const events = await runAdapter(adapter, fixture);
    const ids = events.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of events) {
      expect(e.id).toBe(
        `${e.game}:${e.id.split(":")[1]}:${e.startsAt.slice(0, 10)}`,
      );
    }
  });

  test("excludes permanent and past sections", async () => {
    const titles = (await runAdapter(adapter, fixture)).map((e) => e.title);
    // Permanent entries carry no dates; past entries ended before the fixture
    // date. Neither belongs on a "what's live / what's next" calendar.
    for (const t of titles) expect(t).not.toMatch(/permanent/i);
  });
});

describe("genshin fixture specifics", () => {
  test("yields the nine dated events on the page", async () => {
    const events = await runAdapter(
      genshinGame8,
      "fixtures/genshin/game8-events-2026-08-14",
    );
    expect(events).toHaveLength(9);

    const byTitle = new Map(events.map((e) => [e.title, e]));
    const mutual = byTitle.get("Mutual Aid in Bloom: Into the Frostlands");
    expect(mutual?.startsAt).toBe("2026-08-12T00:00:00.000Z");
    expect(mutual?.endsAt).toBe("2026-08-24T00:00:00.000Z");
    expect(mutual?.startPrecision).toBe("day");

    // Sourced from a one-cell "Availability Period" range rather than
    // Start/End rows — the other table shape on the same page.
    expect(byTitle.get("Battle Pass - Frostfarer")?.endsAt).toBe(
      "2026-09-21T00:00:00.000Z",
    );
  });

  test("year-less summary rows produce no events", async () => {
    // The page's summary tables show "08/12 - 08/24" with no year. Those must
    // be skipped, not year-guessed — and they must not duplicate the detail
    // tables that carry the same events with real years.
    const events = await runAdapter(
      genshinGame8,
      "fixtures/genshin/game8-events-2026-08-14",
    );
    const dupes = events.filter(
      (e) => e.title === "Mutual Aid in Bloom: Into the Frostlands",
    );
    expect(dupes).toHaveLength(1);
  });
});

describe("nte fixture specifics", () => {
  test("yields current and upcoming events only", async () => {
    const events = await runAdapter(
      nteGame8,
      "fixtures/nte/game8-events-2026-08-14",
    );
    expect(events).toHaveLength(13); // 9 current + 4 upcoming

    const titles = events.map((e) => e.title);
    expect(titles).toContain("Market Opening Rehearsal"); // current
    expect(titles).toContain("Fons Rush"); // upcoming
    expect(titles).not.toContain("Login Gift"); // permanent
    expect(titles).not.toContain("Tiger Perks"); // previous
  });

  test("carries the summary column through", async () => {
    const events = await runAdapter(
      nteGame8,
      "fixtures/nte/game8-events-2026-08-14",
    );
    const circleGift = events.find((e) => e.title === "Circle Gift");
    expect(circleGift?.summary).toContain("Log in");
  });
});

describe("inferType", () => {
  const cases: Array<[string, EventType]> = [
    ["Overflowing Abundance Rerun", "rerun"],
    ["Stygian Onslaught", "challenge"],
    ["Character Test Runs", "challenge"],
    ["Gold Clash", "challenge"],
    ["Seize the Day Login Bonus", "login"],
    ["Epitome Invocation Banner", "banner"],
    ["Chaldea Boys Collection Summoning Campaign", "banner"],
    ["Mutual Aid in Bloom: Into the Frostlands", "other"],
  ];
  test.each(cases)("%s → %s", (title, expected) => {
    expect(inferType(title)).toBe(expected);
  });
});

describe("new source shapes", () => {
  test("zzz recovers events from rowspan Start/End rows", async () => {
    // The event name spans two rows, so a flat cell reader sees
    // [title, "Start", date] then ["End", date]. Losing the pairing would
    // silently halve the calendar.
    const events = await runAdapter(
      adapter("zzz-game8-events"),
      "fixtures/zzz/game8-events-2026-08-14",
    );
    const summer = events.find((e) => e.title === "Summer Waves Rolls In");
    expect(summer?.startsAt).toBe("2026-07-29T00:00:00.000Z");
    expect(summer?.endsAt).toBe("2026-09-07T00:00:00.000Z");
    expect(events.every((e) => e.endsAt !== null)).toBe(true);
  });

  test("hsr keeps events whose end is not announced", async () => {
    // "Jul. 24, 2026 - End of 4.6" has a real start and no knowable end.
    // Publishing it with a guessed end would be the worst possible outcome.
    const events = await runAdapter(
      adapter("hsr-game8-events"),
      "fixtures/hsr/game8-events-2026-08-14",
    );
    const open = events.filter((e) => e.endsAt === null);
    expect(open.length).toBeGreaterThan(0);
    for (const e of open) expect(e.endPrecision).toBe("unknown");
  });

  test("wuwa parses ranges carrying a year on both sides", async () => {
    const events = await runAdapter(
      adapter("wuwa-game8-events"),
      "fixtures/wuwa/game8-events-2026-08-14",
    );
    const jade = events.find((e) => e.title === "In Search of Lost Jade");
    expect(jade?.startsAt).toBe("2026-07-30T00:00:00.000Z");
    expect(jade?.endsAt).toBe("2026-08-13T00:00:00.000Z");
  });
});

describe("endfield", () => {
  test("reads MM/DD/YY ranges from a combined schedule cell", async () => {
    // This page hides its only dated events in an "Event | Schedule & Summary"
    // table, where one cell holds the label, the range and the blurb.
    const events = await runAdapter(
      adapter("endfield-game8-events"),
      "fixtures/endfield/game8-events-2026-08-14",
    );
    expect(events).toHaveLength(2);
    const rooted = events.find((e) => e.title === "The Rooted Realm");
    expect(rooted?.startsAt).toBe("2026-08-09T00:00:00.000Z");
    expect(rooted?.endsAt).toBe("2026-08-30T00:00:00.000Z");
    // The prose after the dates becomes the blurb, without the label.
    expect(rooted?.summary).not.toBeNull();
    expect(rooted?.summary).not.toMatch(/^Period:/);
  });
});

describe("nikki", () => {
  const fixture = "fixtures/nikki/game8-events-2026-08-17";

  test("reads a labelled Start/End cell, and takes no end from 'Permanent'", async () => {
    // The duration cell is "Start: January 24, 2025 End: Permanent" — two
    // labelled halves separated by a <br>, which a tag-stripping reader sees as
    // one run of text.
    const events = await runAdapter(adapter("nikki-game8-events"), fixture);
    expect(events).toHaveLength(7); // every row of the current-events table

    const fiesta = events.find((e) => e.title === "Fireworks Fiesta");
    expect(fiesta?.startsAt).toBe("2025-01-24T00:00:00.000Z");
    // "Permanent" is not a date and does not become one.
    expect(fiesta?.endsAt).toBeNull();
    expect(fiesta?.endPrecision).toBe("unknown");

    const bubble = events.find((e) => e.title === "Bubble Season");
    expect(bubble?.startsAt).toBe("2025-04-28T00:00:00.000Z");
    expect(bubble?.endsAt).toBe("2025-06-12T00:00:00.000Z");
  });

  test("never presents the labelled cell's own text as a summary", async () => {
    // "End: Permanent" is structure, not a blurb. Leaving it in the summary
    // slot would show a reader a date the parser deliberately refused to use.
    const events = await runAdapter(adapter("nikki-game8-events"), fixture);
    for (const e of events) {
      expect(e.summary).toBeNull();
    }
  });
});

describe("p5x", () => {
  const fixture = "fixtures/p5x/game8-events-2026-08-17";

  test("reads a range whose halves are separated by an <hr>", async () => {
    const events = await runAdapter(adapter("p5x-game8-events"), fixture);
    const beach = events.find((e) =>
      e.title.startsWith("Haunted Beach Shack Summer Event"),
    );
    expect(beach?.startsAt).toBe("2026-07-30T00:00:00.000Z");
    expect(beach?.endsAt).toBe("2026-08-13T00:00:00.000Z");
  });

  test("keeps the finished-events back catalogue off the calendar", async () => {
    // Fifty-odd past events sit in a table fenced off by nothing but an
    // <h4>Finished Events</h4> inside a collapsed accordion. A reader blind to
    // h4 sees one uninterrupted run of tables and publishes the lot.
    const events = await runAdapter(adapter("p5x-game8-events"), fixture);
    expect(events).toHaveLength(3);
    const titles = events.map((e) => e.title);
    expect(titles).not.toContain("Tycoon Season 1"); // finished
    expect(titles).not.toContain("New Year's Gifts"); // finished
  });

  test("skips a row whose duration states no date at all", async () => {
    // "Take Your Heart" ends 30 days after each player makes an account, so it
    // has no calendar date and no honest place on a calendar.
    const events = await runAdapter(adapter("p5x-game8-events"), fixture);
    expect(events.map((e) => e.title)).not.toContain("Take Your Heart");
  });

  test("takes no end from an ambiguous one, and does not show it as prose", async () => {
    // "June 25, 2026 July 16/30, 2026" names two candidate ends. Picking either
    // would be a guess, and echoing the leftover into the summary would dress
    // the same guess up as information.
    const events = await runAdapter(adapter("p5x-game8-events"), fixture);
    const login = events.find((e) => e.title === "Login Campaigns");
    expect(login?.startsAt).toBe("2026-06-25T00:00:00.000Z");
    expect(login?.endsAt).toBeNull();
    expect(login?.summary).toBeNull();
  });

  test("recovers the blurb from the event's own section", async () => {
    // The event is listed twice: once in a bare Event|Duration table, and again
    // under its own heading with a paragraph of prose. Deduping by ID must not
    // throw the prose away.
    const events = await runAdapter(adapter("p5x-game8-events"), fixture);
    const anniversary = events.find(
      (e) => e.title === "1st Anniversary Celebration",
    );
    expect(anniversary?.summary).toContain("first anniversary");
  });
});

describe("arknights wiki", () => {
  const fixture = "fixtures/arknights/akwiki-events-2026-08-17";
  const akwiki = adapter("arknights-akwiki-events");

  test("publishes the Global schedule and never the CN one", async () => {
    // Every row carries both, and CN runs about five months ahead. A reader on
    // Global told a CN date would be told an event ended in March that has not
    // started yet — the confidently-wrong date this product exists to prevent.
    const events = await runAdapter(akwiki, fixture);
    expect(events).toHaveLength(6); // the six rows of the Ongoing/upcoming table

    const crossing = events.find((e) => e.title === "[Story Collection] Crossing");
    expect(crossing?.startsAt).toBe("2026-08-13T00:00:00.000Z"); // Global
    // CN ran 2026/03/10 - 2026/03/17. Nothing in the output may fall there.
    for (const e of events) expect(e.startsAt > "2026-06-01").toBe(true);
  });

  test("takes the exact boundary the countdown states, on whichever side it is", async () => {
    // The page puts a machine-readable timer on the *next* boundary only: the
    // end while an event is running, the start while it is still upcoming. So
    // precision legitimately differs per event and per side.
    const events = await runAdapter(akwiki, fixture);

    const running = events.find((e) => e.title.startsWith("Vector Breakthrough"));
    expect(running?.endPrecision).toBe("exact");
    expect(running?.endsAt).toBe("2026-08-20T10:59:59.000Z");
    expect(running?.startPrecision).toBe("day");

    const upcoming = events.find((e) => e.title === "[Side Story] People, A People");
    expect(upcoming?.startPrecision).toBe("exact");
    expect(upcoming?.startsAt).toBe("2026-09-16T15:00:00.000Z");
    expect(upcoming?.endPrecision).toBe("day");
  });

  test("an exact instant never moves the day an event ID is built from", async () => {
    // The ID ends in startsAt.slice(0, 10). When an upcoming event goes live
    // its exact start disappears from the page and the day-precision date takes
    // over, so the two must agree on the day or every completion mark for that
    // event is orphaned the morning it starts.
    const events = await runAdapter(akwiki, fixture);
    for (const e of events) {
      expect(e.id.endsWith(e.startsAt.slice(0, 10))).toBe(true);
    }
  });

  test("reports one global end rather than inventing per-region ones", async () => {
    // Arknights serves all three of our regions from one Global server, which
    // is the opposite of Endfield. regionScoped means the source distinguishes
    // regions; this one does not.
    for (const e of await runAdapter(akwiki, fixture)) {
      expect(e.regionScoped).toBe(false);
      expect(e.regionEnds).toBeNull();
    }
  });

  test("the back catalogue under 'By year' stays off the calendar", async () => {
    // The same table class repeats further down the page for every event the
    // game has ever run. Inclusion has to stop at the next heading.
    const titles = (await runAdapter(akwiki, fixture)).map((e) => e.title);
    expect(titles).not.toContain("Ceremonial Rite");
    expect(titles.length).toBeLessThan(20);
  });

  test("fails loudly if the wiki drops the section or the table", async () => {
    const html = await Bun.file(`${fixture}.html`).text();
    const parser = arknightsWikiParser;
    expect(parser.canParse(html)).toBe(true);
    expect(parser.canParse(html.replace(/mrfz-wtable/g, "x-table"))).toBe(false);
    // MediaWiki emits both the modern anchor and a legacy percent-escaped one
    // (`Ongoing.2Fupcoming`) on the same heading, so a rename has to take both
    // away before the parser should give up on the page.
    expect(
      parser.canParse(html.replace(/id="Ongoing(\/|\.2F)upcoming"/g, 'id="Now"')),
    ).toBe(false);
  });
});

describe("wiki.gg parser", () => {
  test("reads exact per-region timers", async () => {
    // The first source that states region-scoped ends. Asia and the Americas
    // differ by hours, which is precisely what regionEnds exists to carry.
    const events = await runAdapter(
      adapter("endfield-wikigg-events"),
      "fixtures/endfield/wikigg-events-2026-08-14",
    );
    expect(events).toHaveLength(6);

    const heat = events.find((e) => e.title === "HEAT RAGE! MEGA ARENA!");
    expect(heat?.startPrecision).toBe("exact");
    expect(heat?.regionScoped).toBe(true);
    expect(heat?.regionEnds?.asia).toBe("2026-08-12T20:00:00.000Z");
    expect(heat?.regionEnds?.america).toBe("2026-08-13T09:00:00.000Z");
    // endsAt is the fallback for a region the source did not list, so it takes
    // the earliest — never promise more time than some region actually gets.
    expect(heat?.endsAt).toBe("2026-08-12T20:00:00.000Z");
  });

  test("links each event to its own wiki page", async () => {
    const events = await runAdapter(
      adapter("endfield-wikigg-events"),
      "fixtures/endfield/wikigg-events-2026-08-14",
    );
    for (const e of events) {
      expect(e.sourceUrl).toStartWith("https://endfield.wiki.gg/wiki/");
    }
  });
});

describe("fandom parser", () => {
  const fixture = "fixtures/r1999/fandom-events-2026-08-17";
  const r1999 = adapter("r1999-fandom-events");

  test("publishes only the events that have not ended", async () => {
    // The page is an archive: 154 rows spanning every version since 1.1, of
    // which six had not ended at the pinned clock. Counted independently off
    // the fixture before this expectation was written — the count is the guard
    // against a shape change making events vanish silently.
    const events = await runAdapter(r1999, fixture);
    expect(events).toHaveLength(6);
    for (const e of events) {
      expect(e.endsAt).not.toBeNull();
      expect(Date.parse(e.endsAt!)).toBeGreaterThanOrEqual(Date.parse(NOW));
    }
  });

  test("converts the stated UTC-5 offset rather than reading it as UTC", async () => {
    // "August 13th, 05:00 - September 21st, 2026, 04:59 (UTC-5)". Reading the
    // wall clock as UTC would put every boundary five hours early — and a start
    // that crossed a UTC midnight would move the event's ID with it.
    const events = await runAdapter(r1999, fixture);
    const version = events.find((e) => e.title === "On Another's Sorrow");
    expect(version?.startsAt).toBe("2026-08-13T10:00:00.000Z");
    expect(version?.endsAt).toBe("2026-09-21T09:59:00.000Z");
    expect(version?.startPrecision).toBe("exact");
    expect(version?.endPrecision).toBe("exact");
  });

  test("takes the title from the <b>, not the cell text", async () => {
    // A missing banner image renders as a red link whose visible text is
    // "File:A Stranger to Memory Lane Banner.png". A cell-text reader publishes
    // that filename as the event's name.
    const events = await runAdapter(r1999, fixture);
    const titles = events.map((e) => e.title);
    expect(titles).toContain("A Stranger to Memory Lane");
    for (const t of titles) {
      expect(t).not.toMatch(/^File:/);
      expect(t).not.toMatch(/\.png/i);
    }
  });

  test("carries the section heading as the summary and types from it", async () => {
    const events = await runAdapter(r1999, fixture);
    const story = events.find((e) => e.title === "The You That's Meant to Be");
    // The title alone says nothing about what kind of event it is; the section
    // it sits under does.
    expect(story?.summary).toBe("Character Story Events");
    expect(story?.type).toBe("story");
    // The [edit] link MediaWiki renders inside every heading is not part of it.
    for (const e of events) expect(e.summary).not.toMatch(/edit/i);
  });

  test("states one global end, not per-region ends", async () => {
    // Every row reads (UTC-5) and the page draws no regional distinction.
    for (const e of await runAdapter(r1999, fixture)) {
      expect(e.regionScoped).toBe(false);
      expect(e.regionEnds).toBeNull();
    }
  });

  test("rejects a body that is not an action=parse response", async () => {
    // The plain wiki page answers a non-browser client with a Cloudflare
    // interstitial. Feeding that to the parser must fail loudly rather than
    // report zero events, which reads downstream as "nothing is on".
    const interstitial = "<html><head><title>Just a moment...</title></head></html>";
    expect(fandomParser.canParse(interstitial)).toBe(false);
    expect(fandomParser.canParse('{"error":{"code":"missingtitle"}}')).toBe(false);
    expect(() =>
      r1999.parse(interstitial, {
        now: NOW,
        sourceUrl: r1999.url,
        sourceId: r1999.id,
        game: r1999.game,
      }),
    ).toThrow(/redesigned/);
  });

  test("a row stating no year on either half yields no event", async () => {
    // "February 20th, 05:00 - March 27th, 04:59 (UTC-5)" — the fixture has
    // exactly one, and there is no honest year to give it.
    const body = await Bun.file(`${fixture}.html`).text();
    const rendered = renderedHtml(body);
    expect(rendered).not.toBeNull();
    expect(rendered!).toContain("February 20th, 05:00 - March 27th, 04:59");
    expect(parseOrdinalDateTimeRange("February 20th, 05:00 - March 27th, 04:59 (UTC-5)")).toBeNull();
  });
});

describe("blue archive wiki", () => {
  const fixture = "fixtures/ba/bawiki-events-2026-08-17";
  const ba = adapter("ba-bawiki-events");

  /** A stand-in page with the tabber shape this parser navigates. */
  function tabbed(japanese: string, global: string): string {
    return `<div class="tabber"><header><nav>
      <a class="tabber__tab" id="tabber-Japanese_version-label" href="#tabber-Japanese_version">Japanese version</a>
      <a class="tabber__tab" id="tabber-Global_version-label" href="#tabber-Global_version">Global version</a>
      </nav></header><section>
      <article id="tabber-Japanese_version"><table class="wikitable">${japanese}</table></article>
      <article id="tabber-Global_version"><table class="wikitable">${global}</table></article>
      </section></div>`;
  }

  const GLOBAL_HEADER =
    "<tr><th>Name (EN)</th><th>Start date</th><th>End date</th><th>Notes</th></tr>";

  function parse(html: string) {
    return ba.parse(html, {
      now: NOW,
      sourceUrl: ba.url,
      sourceId: ba.id,
      game: ba.game,
    });
  }

  test("publishes the Global schedule and never the Japanese one", async () => {
    // Both panels are on the page and the Japanese one runs months ahead — the
    // same hazard as the CN column on the Arknights wiki. Counted independently
    // off the fixture: 98 Global rows, of which two had not ended at the pinned
    // clock. 104 Japanese rows are on the same page and none of them is ours.
    const events = await runAdapter(ba, fixture);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.title)).toEqual([
      "Code: BOX - The Shadow Approaching Millennium",
      "Pray-Ball! Swing for the Grand Slam!",
    ]);

    // Live on Global for the fixture's clock.
    expect(events[0]?.startsAt).toBe("2026-08-04T00:00:00.000Z");
    expect(events[0]?.endsAt).toBe("2026-08-18T00:00:00.000Z");

    // "Pandemic Hazard ~ Miracle Pancake ~" runs 2026-08-12 to 2026-08-26 on
    // the *Japanese* server and has not been scheduled on Global at all. It is
    // what this parser publishes if it slices from the Global tab's nav button
    // — which precedes the Japanese panel — instead of from the panel itself.
    for (const e of events) expect(e.title).not.toMatch(/Pandemic Hazard/);
  });

  test("the back catalogue stays off the calendar", async () => {
    // The table is an archive going back to 2021 with no "ongoing" heading to
    // gate on, so inclusion is decided against ctx.now.
    const events = await runAdapter(ba, fixture);
    for (const e of events) {
      expect(e.endsAt).not.toBeNull();
      expect(Date.parse(e.endsAt!)).toBeGreaterThanOrEqual(Date.parse(NOW));
    }
  });

  test("states day precision, because the page states no time of day", async () => {
    // Every boundary on this page is a bare `YYYY-MM-DD`. Day precision is the
    // honest reading, and it costs 0.05 of confidence on each side.
    for (const e of await runAdapter(ba, fixture)) {
      expect(e.startPrecision).toBe("day");
      expect(e.endPrecision).toBe("day");
      expect(e.startsAt.endsWith("T00:00:00.000Z")).toBe(true);
      expect(e.confidence).toBe(0.85);
    }
  });

  test("reports one global end rather than inventing per-region ones", async () => {
    // The panels are game *versions*, not our asia/america/europe regions —
    // Blue Archive Global is a single worldwide server and this page draws no
    // distinction inside it.
    for (const e of await runAdapter(ba, fixture)) {
      expect(e.regionScoped).toBe(false);
      expect(e.regionEnds).toBeNull();
    }
  });

  test("links each event to its own article, never to Special:", async () => {
    for (const e of await runAdapter(ba, fixture)) {
      expect(e.sourceUrl.startsWith("https://bluearchive.wiki/wiki/")).toBe(true);
      // robots.txt disallows Special:, and it is the wrong page to send a
      // reader to besides.
      expect(e.sourceUrl).not.toMatch(/Special:/);
    }
  });

  test("takes the Notes column as the summary and types from it", async () => {
    const events = await runAdapter(ba, fixture);
    // A rerun reuses the original's title verbatim, so the title alone cannot
    // say what kind of event it is. The Notes column can.
    expect(events.every((e) => e.summary === "Rerun")).toBe(true);
    expect(events.every((e) => e.type === "rerun")).toBe(true);
  });

  test("resolves columns from the header row rather than counting them", () => {
    // The Japanese table carries an extra `Name (JP)` column. If the Global one
    // ever gains it, fixed indices would feed a title to the date reader and
    // every row would fail to parse — emptying the lane with no error anywhere.
    const events = parse(
      tabbed(
        "",
        `<tr><th>Name (EN)</th><th>Name (JP)</th><th>Start date</th><th>End date</th></tr>
         <tr><td><a href="/wiki/Widened">Widened Table</a></td><td>ワイド</td>
             <td>2026-09-02</td><td>2026-09-16</td></tr>`,
      ),
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.title).toBe("Widened Table");
    expect(events[0]?.startsAt).toBe("2026-09-02T00:00:00.000Z");
  });

  test("an upcoming row with no end date publishes as endsAt null", () => {
    // The source genuinely has not announced one. Inventing a plausible end is
    // the failure this product exists to prevent; a null end renders as such.
    const events = parse(
      tabbed(
        "",
        `${GLOBAL_HEADER}
         <tr><td><a href="/wiki/Soon">Announced, Undated</a></td>
             <td>2026-09-02</td><td>TBA</td><td></td></tr>`,
      ),
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.endsAt).toBeNull();
    expect(events[0]?.endPrecision).toBe("unknown");
    expect(events[0]?.summary).toBeNull();
    expect(events[0]?.confidence).toBe(0.75); // held under the 0.8 gate
  });

  test("a started row with no end date yields nothing", () => {
    // On a page that is 98 rows of history, the end date is the only thing
    // separating a live event from a finished one. Without it there is no way
    // to tell, so the row is not publishable.
    const events = parse(
      tabbed(
        "",
        `${GLOBAL_HEADER}
         <tr><td><a href="/wiki/Old">Started, Undated</a></td>
             <td>2021-03-11</td><td></td><td></td></tr>`,
      ),
    );
    expect(events).toEqual([]);
  });

  test("finds the schedule by its shape, not by its position", async () => {
    // Three Global panels are on this page: the schedule, and the Mini-Event
    // and Joint Firing Drill tabbers whose ids are the same name with `_2` and
    // `_3` appended. Taking the first one works only until the page is
    // reordered — and those two head their name column `Name`, which is why
    // `Name (EN)` is what identifies the right table.
    const html = await Bun.file(`${fixture}.html`).text();
    expect(html).toContain('id="tabber-Global_version_2"');
    expect(html).toContain('id="tabber-Global_version_3"');

    const events = await runAdapter(ba, fixture);
    // Those two tables publish reward campaigns and firing drills. Nothing from
    // them may appear, and nothing from them can: their dates carry a wall
    // clock the page never gives a timezone for, so this reader takes neither.
    for (const e of events) expect(e.title).not.toMatch(/Exercise|rewards/i);
  });

  test("fails loudly if the wiki renames the tab or the columns", async () => {
    const html = await Bun.file(`${fixture}.html`).text();
    expect(blueArchiveWikiParser.canParse(html)).toBe(true);

    // A renamed panel leaves the two Global tabbers further down the page still
    // matching, so this is a real test of the header check rather than of the
    // id: neither of those is headed `Name (EN)`.
    expect(
      blueArchiveWikiParser.canParse(
        html.replace(/id="tabber-Global_version"/g, 'id="tabber-Worldwide"'),
      ),
    ).toBe(false);

    // A renamed column is the more likely change, and the more dangerous one:
    // without this it costs no error at all, just an empty Blue Archive lane.
    expect(
      blueArchiveWikiParser.canParse(html.replace(/Name \(EN\)/g, "Event")),
    ).toBe(false);
  });
});

describe("hololive Dreams wiki", () => {
  const fixture = "fixtures/holodori/holodoriwiki-events-2026-08-18";
  const holo = adapter("holodori-holodoriwiki-events");

  function parse(html: string) {
    return holo.parse(html, {
      now: NOW,
      sourceUrl: holo.url,
      sourceId: holo.id,
      game: holo.game,
    });
  }

  /** A stand-in page with the two-heading shape this parser navigates. */
  function paged(current: string, past: string): string {
    return `<div class="mw-parser-output">
      <h2>Current Events</h2><table class="wikitable">${current}</table>
      <h2>Past Events</h2><table class="wikitable">${past}</table>
      </div>`;
  }

  const HEADER =
    "<tr><th>Logo</th><th>Event</th><th>Type</th><th>Start Date</th><th>End Date</th><th>Featured Members</th></tr>";

  const row = (title: string, type: string, start: string, end: string) =>
    `<tr><td></td><td>${title}</td><td>${type}</td><td>${start}</td><td>${end}</td><td></td></tr>`;

  test("publishes Current Events and never the Past Events table below it", async () => {
    // Counted independently off the fixture: the Current table holds three
    // rows and the Past table two, and the two tables are identically shaped —
    // so a reader that took every `wikitable` would put the back catalogue on
    // the calendar with nothing to distinguish it.
    const events = await runAdapter(holo, fixture);
    expect(events.map((e) => e.title)).toEqual([
      "Ultimate Summer For Me?",
      "Training Support Missions",
    ]);
    for (const e of events) {
      expect(e.title).not.toMatch(/Synced Summer Sparkles|Brand New Summer/);
    }
  });

  test("converts JST to UTC on both boundaries, to the minute", async () => {
    // This is the only wiki source here that states a timezone on every cell,
    // which is what earns `exact` on both sides without a per-region timer.
    const [spotlight, missions] = await runAdapter(holo, fixture);

    // 08/17/2026 8:00PM (JST) → 11:00Z the same day.
    expect(spotlight?.startsAt).toBe("2026-08-17T11:00:00.000Z");
    // 08/27/2026 7:59PM (JST) → 10:59Z.
    expect(spotlight?.endsAt).toBe("2026-08-27T10:59:00.000Z");
    // 08/30/2026 3:59AM (JST) → 18:59Z on the 29th: a small-hours JST boundary
    // lands on the *previous* UTC day, which is exactly the shift that makes
    // storing the source's own wall clock unusable.
    expect(missions?.endsAt).toBe("2026-08-29T18:59:00.000Z");

    for (const e of await runAdapter(holo, fixture)) {
      expect(e.startPrecision).toBe("exact");
      expect(e.endPrecision).toBe("exact");
      expect(e.confidence).toBe(0.95);
    }
  });

  test("reads 12PM as noon and 12AM as midnight", async () => {
    // The failure this guards is silent: a naive 12-hour reading puts a start
    // twelve hours out and still produces a valid-looking instant.
    const events = parse(
      paged(
        HEADER +
          row("Noon", "Mission", "08/20/2026 12:00PM (JST)", "08/21/2026 12:00AM (JST)"),
        HEADER,
      ),
    );
    expect(events).toHaveLength(1);
    // 12:00 JST → 03:00Z, not 00:00Z.
    expect(events[0]?.startsAt).toBe("2026-08-20T03:00:00.000Z");
    // 00:00 JST on the 21st → 15:00Z on the 20th, not noon.
    expect(events[0]?.endsAt).toBe("2026-08-20T15:00:00.000Z");
  });

  test("drops a row whose start is not a date, and keeps one whose end is not", async () => {
    // Both appear on the real page. `Beginner Mission` runs "Game Launch" →
    // "Unknown": no start means no event ID and no place on a calendar of
    // deadlines. An unannounced *end* is the opposite — it is a fact worth
    // publishing, and inventing one is the failure this product exists to
    // prevent.
    expect((await runAdapter(holo, fixture)).map((e) => e.title)).not.toContain(
      "Beginner Mission",
    );

    const events = parse(
      paged(
        HEADER +
          row("Open ended", "Mission", "08/20/2026 12:00PM (JST)", "Unknown") +
          row("No start", "Mission", "Game Launch", "08/21/2026 12:00PM (JST)"),
        HEADER,
      ),
    );
    expect(events.map((e) => e.title)).toEqual(["Open ended"]);
    expect(events[0]?.endsAt).toBeNull();
    expect(events[0]?.endPrecision).toBe("unknown");
    // An unannounced end is weaker evidence and the gate should see that.
    expect(events[0]?.confidence).toBe(0.8);
  });

  test("requires the stated timezone rather than falling back to UTC", async () => {
    // A cell that loses its `(JST)` is a missing fact, and a missing fact is a
    // dropped row here — not a nine-hour error nobody can see.
    const events = parse(
      paged(
        HEADER +
          row("Zoneless", "Mission", "08/20/2026 12:00PM", "08/21/2026 12:00PM") +
          row("Unknown zone", "Mission", "08/20/2026 12:00PM (XYZ)", "08/21/2026 12:00PM (XYZ)"),
        HEADER,
      ),
    );
    expect(events).toEqual([]);
  });

  test("takes the type from the source's own column, not from the title", async () => {
    // "Spotlight" is this game's word for a rate-up banner, and no reading of
    // "Ultimate Summer For Me?" would ever produce it.
    const [spotlight, missions] = await runAdapter(holo, fixture);
    expect(spotlight?.type).toBe("banner");
    expect(spotlight?.summary).toBe("Spotlight");
    expect(missions?.type).toBe("other");

    const events = parse(
      paged(
        HEADER +
          row("Rally", "Point Rally", "08/20/2026 12:00PM (JST)", "08/28/2026 12:00PM (JST)") +
          row("Scored", "Score Challenge", "08/20/2026 12:00PM (JST)", "08/28/2026 12:00PM (JST)"),
        HEADER,
      ),
    );
    // The game's two ranked scoring formats land in the same bucket, because
    // the game does not draw a distinction between them that we can act on.
    expect(events.map((e) => e.type)).toEqual(["challenge", "challenge"]);
  });

  test("a stale Current Events heading does not keep a finished event live", async () => {
    // The heading is maintained by hand and lags the dates by a few days. The
    // dates are the fact; the heading is someone's housekeeping.
    const events = parse(
      paged(
        HEADER +
          row("Over", "Mission", "07/01/2026 12:00PM (JST)", "07/20/2026 12:00PM (JST)"),
        HEADER,
      ),
    );
    expect(events).toEqual([]);
  });

  test("columns are resolved by name, so an inserted column moves nothing", async () => {
    // The first column is a logo and the last a cast list. Counting from either
    // end means one added column shifts every date one place, every row fails
    // to parse, and the lane empties with no error anywhere.
    const events = parse(
      `<div class="mw-parser-output"><h2>Current Events</h2><table class="wikitable">
        <tr><th>Logo</th><th>Banner</th><th>Event</th><th>Type</th><th>Start Date</th><th>End Date</th></tr>
        <tr><td></td><td></td><td>Shifted</td><td>Spotlight</td><td>08/20/2026 12:00PM (JST)</td><td>08/28/2026 12:00PM (JST)</td></tr>
      </table></div>`,
    );
    expect(events.map((e) => e.title)).toEqual(["Shifted"]);
    expect(events[0]?.startsAt).toBe("2026-08-20T03:00:00.000Z");
  });

  test("a renamed heading or column fails the run instead of emptying the lane", () => {
    const good = paged(HEADER, HEADER);
    expect(holodoriWikiParser.canParse(good)).toBe(true);

    // The heading the parser navigates by.
    expect(holodoriWikiParser.canParse(good.replace("Current Events", "Live Events"))).toBe(false);
    // A column it reads.
    expect(holodoriWikiParser.canParse(good.replace(/<th>Start Date<\/th>/g, "<th>Begins</th>"))).toBe(false);
  });

  test("links to the events page while every article is still a red link", async () => {
    // The wiki has no article for any of these events yet, so each title links
    // to `?action=edit&redlink=1` — a create-page form, and a `?action=` URL
    // this wiki's robots.txt disallows. Neither belongs in the feed.
    for (const e of await runAdapter(holo, fixture)) {
      expect(e.sourceUrl).toBe("https://holodori.wiki/wiki/Events");
      expect(e.sourceUrl).not.toMatch(/action=|redlink|Special:/);
    }

    // A real article, once one exists, is linked.
    const events = parse(
      paged(
        HEADER +
          row(
            '<a href="/wiki/Ultimate_Summer" title="Ultimate Summer">Ultimate Summer</a>',
            "Spotlight",
            "08/20/2026 12:00PM (JST)",
            "08/28/2026 12:00PM (JST)",
          ),
        HEADER,
      ),
    );
    expect(events[0]?.sourceUrl).toBe("https://holodori.wiki/wiki/Ultimate_Summer");
  });

  test("reports one global end rather than inventing per-region ones", async () => {
    // One worldwide service on a Japanese clock: the page states each boundary
    // once, in JST, with no per-region column anywhere.
    for (const e of await runAdapter(holo, fixture)) {
      expect(e.regionScoped).toBe(false);
      expect(e.regionEnds).toBeNull();
    }
  });
});

describe("Fate/Grand Order wiki", () => {
  const fixture = "fixtures/fgo/fandom-events-2026-08-18";
  const fgo = adapter("fgo-fandom-events");

  /** The page's three section dividers, as it draws them. */
  const divider = (label: string) =>
    `<div style="position: absolute;"><b><span style="color:#fff;">${label}</span></b></div>`;

  const block = (title: string, duration: string) =>
    `<h2><span class="mw-headline"><a href="/wiki/${title.replace(/ /g, "_")}"` +
    ` title="${title}">${title}</a></span></h2>` +
    `<p><b>Duration:</b> ${duration}</p>`;

  const envelope = (inner: string) =>
    JSON.stringify({ parse: { title: "Event List (US)", text: inner } });

  function parse(inner: string) {
    return fgo.parse(envelope(inner), {
      now: NOW,
      sourceUrl: fgo.url,
      sourceId: fgo.id,
      game: fgo.game,
    });
  }

  test("reads the English server, and the source url says so", () => {
    // The wiki publishes two schedules months apart — `Event_List` opens "This
    // page lists all Events in Fate/Grand Order Japan" — and the adapter must
    // be pointed at the other one. A JP date on an English calendar is the
    // akwiki CN column again.
    expect(fgo.url).toContain("Event_List_(US)");
    expect(fgo.url).not.toMatch(/page=Event_List&/);
  });

  test("publishes every ongoing event on the page and nothing else", async () => {
    // Counted independently off the fixture: four `<h2>` blocks carry a
    // `Duration:` line, all four between the ONGOING and FUTURE dividers.
    const events = await runAdapter(fgo, fixture);
    expect(events.map((e) => e.title)).toEqual([
      "FGO Summer 2026 Event",
      "Archetype Inception Chapter Release",
      "Ordeal Call III Clear Support Campaign",
      "Archetype Inception Part 3 Release Campaign",
    ]);
  });

  test("skips the FUTURE section, whose ETAs are a month with no day", async () => {
    // "August 2026" is not a start date, and a start date is half of an event
    // id. The upcoming table names events we would otherwise want.
    const events = await runAdapter(fgo, fixture);
    for (const e of events) {
      expect(e.title).not.toMatch(/Back to School|Downloads Campaign/);
      // Nothing on this page reaches us without both boundaries stated.
      expect(e.endsAt).not.toBeNull();
      expect(e.startPrecision).toBe("day");
      expect(e.endPrecision).toBe("day");
    }
  });

  test("skips the PAST section, 111 tables the page states no year for", async () => {
    const events = await runAdapter(fgo, fixture);
    expect(events).toHaveLength(4);
    for (const e of events) expect(e.title).not.toMatch(/Part 2 Release/);
  });

  test("strips the (US) article suffix from the title, never from the url", async () => {
    // The suffix disambiguates the English article from the Japanese one. It
    // is the article's name, so it stays in the link, and it is noise on a
    // calendar that shows one server, so it leaves the title.
    const [summer] = await runAdapter(fgo, fixture);
    expect(summer?.title).toBe("FGO Summer 2026 Event");
    expect(summer?.sourceUrl).toBe(
      "https://fategrandorder.fandom.com/wiki/FGO_Summer_2026_Event_(US)",
    );
    expect(summer?.id).toBe("fgo:fgo-summer-2026-event:2026-07-15");
  });

  test("keeps the day the page states rather than shifting it out of PDT", async () => {
    // The durations name a zone but no clock, so there is no time of day to
    // anchor a conversion to — and the day is half the event id.
    const [summer] = await runAdapter(fgo, fixture);
    expect(summer?.startsAt).toBe("2026-07-15T00:00:00.000Z");
    expect(summer?.endsAt).toBe("2026-09-01T00:00:00.000Z");
  });

  test("drops an ongoing row the wiki has not got round to moving", () => {
    // "Ongoing" is maintained by hand. holodori.wiki taught this one.
    const events = parse(
      divider("ONGOING EVENTS") +
        block("Finished Campaign", "June 1, 2026 ~ July 1, 2026 PDT") +
        block("Live Campaign", "August 1, 2026 ~ September 1, 2026 PDT") +
        divider("FUTURE EVENTS"),
    );
    expect(events.map((e) => e.title)).toEqual(["Live Campaign"]);
  });

  test("skips a duration missing a boundary rather than inventing one", () => {
    const events = parse(
      divider("ONGOING EVENTS") +
        block("Open Ended", "August 1, 2026 ~ TBD PDT") +
        block("No Year", "August 1 ~ September 1 PDT") +
        divider("FUTURE EVENTS"),
    );
    expect(events).toEqual([]);
  });

  test("yields nothing for the Japanese page, and canParse says why", () => {
    // `Event_List` has no dividers and no `Duration:` label on its archive
    // tables. Refusing it in `canParse` is what makes the runner reject the
    // body and hold the previous snapshot, instead of the lane going empty.
    const japanese =
      '<div><p>This page lists all Events in Fate/Grand Order Japan.</p>' +
      '<table id="082026" class="wikitable"><tr><th colspan="2">Azrael Mausoleum</th></tr>' +
      "<tr><td></td><td>August 2 ~ August 12</td></tr></table></div>";
    expect(fandomParser.canParse(envelope(japanese))).toBe(false);
    // And the seam turns that refusal into a loud failure rather than an
    // empty list, which is what makes the runner hold the previous snapshot.
    expect(() => parse(japanese)).toThrow(/redesigned/);
  });

  test("a renamed divider fails the source instead of emptying the lane", async () => {
    const html = JSON.parse(
      await Bun.file(`${fixture}.html`).text(),
    ).parse.text as string;
    expect(fandomParser.canParse(envelope(html))).toBe(true);
    expect(
      fandomParser.canParse(envelope(html.replace("ONGOING EVENTS", "LIVE NOW"))),
    ).toBe(false);
  });

  test("reports one global end rather than inventing per-region ones", async () => {
    // One worldwide server on Pacific time — the PDT on every duration.
    for (const e of await runAdapter(fgo, fixture)) {
      expect(e.regionScoped).toBe(false);
      expect(e.regionEnds).toBeNull();
    }
  });
});

describe("IOP Wiki (Girls' Frontline 2)", () => {
  const fixture = "fixtures/gfl2/iopwiki-events-2026-08-19";
  const gfl2 = adapter("gfl2-iopwiki-events");

  function parse(html: string) {
    return gfl2.parse(html, {
      now: NOW,
      sourceUrl: gfl2.url,
      sourceId: gfl2.id,
      game: gfl2.game,
    });
  }

  const HEADER =
    "<tr><th>Title</th><th>Period (start/end)</th><th>Server</th><th>Type</th><th>Comment</th></tr>";

  const row = (title: string, period: string, server: string, type = "Character Event") =>
    `<tr><td>${title}</td><td>${period}</td><td>${server}</td><td>${type}</td><td></td></tr>`;

  /** A stand-in page with the heading-fenced shape this parser navigates. */
  const paged = (main: string, betas = "") =>
    `<h2>Main Events</h2><h3>Event</h3><table class="gf-table event-period">${main}</table>
     <h2>Betas</h2><table class="gf-table event-period">${betas}</table>`;

  test("publishes only the EN server's rows", async () => {
    // The hazard this source has, and the only one that could put a
    // confidently wrong date on the calendar: CN, EN and JP rows share one
    // table and the Chinese schedule runs about a year ahead. Counted off the
    // fixture: 145 rows, 51 of them EN.
    const events = parse(
      paged(
        HEADER +
          row("异乡乐徽", "2027-08-06 10:00 - 2027-08-26 09:59 (UTC)", "CN") +
          row("Moonshroud Requiem", "2026-08-06 13:00 - 2026-08-26 22:59 (UTC)", "EN") +
          row("失意の翼の中で", "2026-11-06 13:00 - 2026-11-26 22:59 (UTC)", "JP"),
      ),
    );
    expect(events.map((e) => e.title)).toEqual(["Moonshroud Requiem"]);
  });

  test("fences out the Betas section", async () => {
    // Closed beta rows are dated exactly like everything else and parse
    // cleanly — onto a calendar of things nobody can play.
    const events = parse(
      paged(
        HEADER + row("Moonshroud Requiem", "2026-08-06 13:00 - 2026-08-26 22:59 (UTC)", "EN"),
        HEADER +
          row("Closed Beta Test (Sunborn)", "2026-08-10 12:00 - 2026-08-19 08:00 (UTC)", "EN", "Open Beta"),
      ),
    );
    expect(events.map((e) => e.title)).toEqual(["Moonshroud Requiem"]);
  });

  test("takes both boundaries exact, in the UTC the page states", async () => {
    const events = await runAdapter(gfl2, fixture);
    expect(events).toHaveLength(1);
    const [live] = events;
    expect(live?.title).toBe("Moonshroud Requiem");
    expect(live?.startsAt).toBe("2026-08-06T13:00:00.000Z");
    expect(live?.endsAt).toBe("2026-08-26T22:59:00.000Z");
    expect(live?.startPrecision).toBe("exact");
    expect(live?.endPrecision).toBe("exact");
    // Nothing was converted or assumed, which is what earns the top score.
    expect(live?.confidence).toBe(0.95);
  });

  test("drops a row that loses its zone rather than reading it as UTC", async () => {
    // The page states `(UTC)` on all 145 rows. If one ever stops, that row is
    // a wall clock with no zone — a missing fact, and the same call
    // `parseSlashClockZone` makes on the hololive wiki.
    const events = parse(
      paged(HEADER + row("Zoneless", "2026-08-06 13:00 - 2026-08-26 22:59", "EN")),
    );
    expect(events).toEqual([]);
  });

  test("prefers the stated Type over a guess from the title", async () => {
    // "Moonshroud Requiem" says nothing about being a character banner; the
    // page's own Type column does.
    const events = parse(
      paged(
        HEADER +
          row("Moonshroud Requiem", "2026-08-06 13:00 - 2026-08-26 22:59 (UTC)", "EN") +
          row("Corposant Part 1", "2026-08-07 13:00 - 2026-08-27 22:59 (UTC)", "EN", "Main Story Event") +
          row("Endless Projections", "2026-08-08 13:00 - 2026-08-28 22:59 (UTC)", "EN", "Combat Event"),
      ),
    );
    expect(events.map((e) => e.type)).toEqual(["banner", "story", "challenge"]);
  });

  test("word-infers a Type the wiki has not used before", async () => {
    // An unmapped value must not silently flatten to "other" — that is how a
    // taxonomy change goes unnoticed.
    const events = parse(
      paged(
        HEADER +
          row("Anniversary Login", "2026-08-06 13:00 - 2026-08-26 22:59 (UTC)", "EN", "Sign-in Event"),
      ),
    );
    expect(events[0]?.type).toBe("login");
  });

  test("publishes nothing from the back catalogue", async () => {
    // 145 rows go back to 2023 and nothing downstream drops a finished event,
    // so the currency gate is this parser's job.
    for (const e of await runAdapter(gfl2, fixture)) {
      expect(e.endsAt === null || e.endsAt > NOW).toBe(true);
    }
  });

  test("a redesign fails the source instead of emptying the lane", () => {
    // 47 tables on this page, most of them layout. "A table exists" proves
    // nothing; that the Title/Period/Server header row is still findable does.
    expect(() =>
      gfl2.parse("<h2>Main Events</h2><table><tr><th>Name</th><th>When</th></tr></table>", {
        now: NOW,
        sourceUrl: gfl2.url,
        sourceId: gfl2.id,
        game: gfl2.game,
      }),
    ).toThrow(/redesigned/);
  });
});
