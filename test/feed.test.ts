import { describe, expect, test } from "bun:test";
import {
  brokenSources,
  freshness,
  staleSources,
  STALE_AFTER_MS,
  type SourceHealth,
} from "../src/shared/feed.ts";
import type { GameId } from "../src/shared/schema.ts";

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
    ...over,
  });

  test("a source that parsed nothing is broken", () => {
    // The failure this check exists for: a page changed shape and the parser
    // now reads it as empty. Nothing to publish and nothing to expire.
    expect(brokenSources([health({ parsedCount: 0 })]).map((s) => s.sourceId)).toEqual([
      "nikki-fandom-events",
    ]);
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

  test("a feed that never recorded the count is not called broken", () => {
    // An older feed — one the service worker cached before this field existed
    // — says nothing either way, and absence of information is not evidence of
    // a fault.
    expect(brokenSources([health({ parsedCount: null })])).toEqual([]);
    expect(staleSources([health({ parsedCount: null })])).toEqual([]);
  });
});
