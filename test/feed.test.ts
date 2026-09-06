import { describe, expect, test } from "bun:test";
import {
  brokenSources,
  freshness,
  staleSources,
  STALE_AFTER_MS,
  SourceHealth,
} from "../src/shared/feed.ts";
import { sourceHealth } from "../src/ingest/health.ts";
import type { GachaEvent, GameId } from "../src/shared/schema.ts";

/**
 * Freshness disclosure (PRD F7).
 *
 * The footer's claim about its own age is load-bearing: a reader deciding
 * whether to trust a countdown has nothing else to go on. These pin the two
 * ways that claim could lie — reporting a build stamp instead of the data's age,
 * and letting one fresh source speak for a game whose other source is a week
 * behind.
 */

const NOW = Date.parse("2026-08-17T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function source(
  game: GameId,
  lastSuccessAt: string | null,
  sourceId = `${game}-src`,
): SourceHealth {
  return {
    sourceId,
    game,
    url: "https://example.test/events",
    lastSuccessAt,
    eventCount: 3,

    parsedCount: 3,
    statesNoEvents: false,
  };
}

describe("freshness", () => {
  test("reports the newest confirmation across sources", () => {
    const result = freshness(
      [
        source("genshin", "2026-08-17T06:00:00.000Z"),
        source("hsr", "2026-08-17T09:30:00.000Z"),
        source("zzz", "2026-08-16T23:00:00.000Z"),
      ],
      NOW,
    );
    expect(result.refreshedAt).toBe("2026-08-17T09:30:00.000Z");
    expect(result.stale).toEqual([]);
  });

  test("a game is only as fresh as its oldest source", () => {
    // Endfield has two. If the wiki refreshed an hour ago but Game8 has been
    // down for a week, some of that lane's rows are a week old — so the lane is
    // stale even though one of its sources is not.
    const result = freshness(
      [
        source("endfield", "2026-08-17T11:00:00.000Z", "endfield-wikigg-events"),
        source("endfield", "2026-08-10T11:00:00.000Z", "endfield-game8-events"),
      ],
      NOW,
    );
    expect(result.refreshedAt).toBe("2026-08-17T11:00:00.000Z");
    expect(result.stale).toEqual([
      { game: "endfield", lastSuccessAt: "2026-08-10T11:00:00.000Z" },
    ]);
  });

  test("a source that never succeeded makes its game stale, whatever a sibling says", () => {
    const result = freshness(
      [
        source("endfield", "2026-08-17T11:00:00.000Z", "endfield-wikigg-events"),
        source("endfield", null, "endfield-game8-events"),
      ],
      NOW,
    );
    expect(result.stale).toEqual([{ game: "endfield", lastSuccessAt: null }]);
  });

  test("order of sources does not change the answer", () => {
    const a = source("endfield", null, "a");
    const b = source("endfield", "2026-08-17T11:00:00.000Z", "b");
    expect(freshness([a, b], NOW).stale).toEqual(freshness([b, a], NOW).stale);
  });

  test("48 hours is the boundary, and it is exclusive", () => {
    const at = new Date(NOW - STALE_AFTER_MS).toISOString();
    expect(freshness([source("genshin", at)], NOW).stale).toEqual([]);

    const older = new Date(NOW - STALE_AFTER_MS - 1000).toISOString();
    expect(freshness([source("genshin", older)], NOW).stale).toHaveLength(1);
  });

  test("lists the stale games oldest first, never-refreshed ahead of the rest", () => {
    const result = freshness(
      [
        source("genshin", new Date(NOW - 50 * HOUR).toISOString()),
        source("hsr", new Date(NOW - 200 * HOUR).toISOString()),
        source("zzz", null),
        source("wuwa", new Date(NOW - HOUR).toISOString()),
      ],
      NOW,
    );
    expect(result.stale.map((s) => s.game)).toEqual(["zzz", "hsr", "genshin"]);
  });

  test("no source has ever succeeded", () => {
    // A fresh checkout with no fixtures. Not a state a reader reaches, but the
    // footer must say something honest rather than format a null.
    const result = freshness([source("genshin", null)], NOW);
    expect(result.refreshedAt).toBeNull();
    expect(result.stale).toEqual([{ game: "genshin", lastSuccessAt: null }]);
  });

  test("an empty feed reports nothing rather than throwing", () => {
    expect(freshness([], NOW)).toEqual({ refreshedAt: null, stale: [] });
  });
});

describe("telling a broken source from a stale one", () => {
  // CI failed on Infinity Nikki yielding nothing, and the check was wrong to.
  // Its snapshot parses to seven events; every one of them had simply ended by
  // the day the build ran. `eventCount` is measured after expiry, so "our
  // parser broke" and "this source has nothing current left" arrived as the
  // same zero — and only the first is a reason to redden a build.
  const health = (over: Partial<SourceHealth>): SourceHealth => ({
    sourceId: "nikki-fandom-events",
    game: "nikki" as GameId,
    url: "https://example.test/nikki",
    lastSuccessAt: "2026-08-19T00:00:00.000Z",
    eventCount: 0,
    parsedCount: 7,
    statesNoEvents: false,
    ...over,
  });

  test("a source that parsed nothing is broken", () => {
    // The failure this check exists for: a page changed shape and the parser
    // now reads it as empty. Nothing to publish and nothing to expire.
    expect(brokenSources([health({ parsedCount: 0 })]).map((s) => s.sourceId)).toEqual([
      "nikki-fandom-events",
    ]);
  });

  test("a source whose page states it lists none is not broken", () => {
    // The third empty, and the one the refresh runner already knew about while
    // the feed did not. Infinity Nikki's wiki replaced both event tables with
    // "There are no Events in this category" between 2.7 and 2.8, so the page
    // parses to zero and is *answering*. A redesign yields zero too, which is
    // why only the page's own words may say which — never the row count.
    expect(
      brokenSources([health({ parsedCount: 0, statesNoEvents: true })]),
    ).toEqual([]);
  });

  test("a page that states its emptiness still fails once it parses nothing at all", () => {
    // Guard on the guard. `statesNoEvents` excuses an empty parse, so a parser
    // whose selectors all broke must not be able to reach it: the flag is only
    // ever set from the page's own declaration, and a source claiming both a
    // declaration and rows is a contradiction we do not have to honour.
    expect(
      brokenSources([health({ parsedCount: 0, statesNoEvents: false })]).map(
        (s) => s.sourceId,
      ),
    ).toEqual(["nikki-fandom-events"]);
  });

  test("a source whose events have all ended is not broken", () => {
    // The Nikki case exactly. The parser did its job; the calendar moved past
    // everything the page still lists.
    expect(brokenSources([health({})])).toEqual([]);
  });

  test("a healthy source is neither", () => {
    const ok = health({ eventCount: 5, parsedCount: 5 });
    expect(brokenSources([ok])).toEqual([]);
    expect(staleSources([ok])).toEqual([]);
  });

  test("a source with nothing current left is reported as stale", () => {
    // Worth saying out loud — a lane showing an empty calendar is a real
    // problem — but it is a refresh problem, not a code one, so it is
    // reported rather than thrown.
    expect(staleSources([health({})]).map((s) => s.sourceId)).toEqual([
      "nikki-fandom-events",
    ]);
  });

  test("a feed cached before the field existed is not called broken", () => {
    // The service worker serves the last feed it downloaded, so a feed built
    // before `statesNoEvents` shipped still has to validate and still has to
    // mean what it meant. Absent parses to `false`, which is the strict
    // reading — an old feed cannot vouch for a page it never asked.
    const cached = SourceHealth.parse({
      sourceId: "nikki-fandom-events",
      game: "nikki",
      url: "https://example.test/nikki",
      lastSuccessAt: "2026-08-19T00:00:00.000Z",
      eventCount: 0,
      parsedCount: 7,
    });
    expect(cached.statesNoEvents).toBe(false);
    expect(brokenSources([cached])).toEqual([]);
  });

  test("a feed that never recorded the count is not called broken", () => {
    // An older feed — one the service worker cached before this field existed
    // — says nothing either way, and absence of information is not evidence of
    // a fault.
    expect(brokenSources([health({ parsedCount: null })])).toEqual([]);
    expect(staleSources([health({ parsedCount: null })])).toEqual([]);
  });
});

/**
 * What the feed builder records about a source it just parsed.
 *
 * The distinction above is only worth having if something sets it, and this is
 * the seam where it was missing: `scripts/refresh-sources.ts` had asked
 * `statesNoEvents` since 2026-09-03 while `scripts/build-feed.ts` never did, so
 * a page declaring itself empty reached CI as a bare zero and failed the build.
 * The rule was in a script nothing could import, which is why it now lives in a
 * module and is exercised here rather than grepped for.
 */
describe("recording a source's health at build time", () => {
  const EMPTY = "<p>There are no Events in this category</p>";
  const FULL = "<p>Song of the Wandering Sky</p>";

  const adapter = (over: Partial<Parameters<typeof sourceHealth>[0]> = {}) => ({
    id: "nikki-fandom-events",
    game: "nikki" as GameId,
    url: "https://example.test/nikki",
    parse: (html: string) => (html === FULL ? ([{}] as unknown as GachaEvent[]) : []),
    statesNoEvents: (html: string) => html.includes("There are no Events"),
    ...over,
  });

  test("a page that declares itself empty is recorded as having answered", () => {
    const health = sourceHealth(adapter(), EMPTY, "2026-09-06T15:39:19.376Z", 0);

    expect(health.parsedCount).toBe(0);
    expect(health.statesNoEvents).toBe(true);
    expect(brokenSources([health])).toEqual([]);
  });

  test("a page that reads empty without saying so is left to fail", () => {
    // The redesign case, and the whole reason the flag may not be inferred
    // from the row count: this parse is zero too.
    const health = sourceHealth(
      adapter({ statesNoEvents: () => false }),
      EMPTY,
      "2026-09-06T15:39:19.376Z",
      0,
    );

    expect(health.statesNoEvents).toBe(false);
    expect(brokenSources([health]).map((s) => s.sourceId)).toEqual([
      "nikki-fandom-events",
    ]);
  });

  test("a source with rows is never marked as declaring itself empty", () => {
    // A loose `statesNoEvents` — one matching prose that survives a redesign —
    // must not be able to excuse a source that is working. The flag qualifies
    // an empty parse and states nothing on its own, so it is asked only of a
    // zero, exactly as the refresh runner asks it.
    const health = sourceHealth(
      adapter({ statesNoEvents: () => true }),
      FULL,
      "2026-09-06T15:39:19.376Z",
      1,
    );

    expect(health.parsedCount).toBe(1);
    expect(health.statesNoEvents).toBe(false);
  });

  test("a document of unknown age records neither count nor declaration", () => {
    // No capture date means no "as of" to parse against, and inventing one
    // manufactures a figure the check then trusts. `parsedCount` is null for
    // that reason and the declaration goes with it: both answer a question
    // about bytes we cannot date.
    const health = sourceHealth(adapter(), EMPTY, null, 0);

    expect(health.parsedCount).toBeNull();
    expect(health.statesNoEvents).toBe(false);
    expect(brokenSources([health])).toEqual([]);
  });
});
