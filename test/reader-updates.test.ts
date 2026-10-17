import { expect, test } from "bun:test";
import {
  staleSnooze,
  updateItems,
} from "../src/client/state/reader/updates.ts";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";
import type { EventFeed } from "../src/shared/feed.ts";
const at = "2026-10-16T12:00:00.000Z";
test("source warning follows tracked games, independent of focus; empty updates disappear", () => {
  const s = migrateLegacy(
    {},
    ["genshin", "hsr"],
    at,
    (() => {
      let n = 0;
      return () => `account:a${++n}`;
    })(),
  );
  s.accounts["account:a2"]!.intent.events = false;
  s.accounts["account:a2"]!.routines = {};
  s.prefs.focusGame = "hsr";
  const source = {
    sourceId: "genshin-events",
    game: "genshin" as const,
    url: "https://example.com",
    lastSuccessAt: null,
    lastConfirmedAt: null,
    contentChangedAt: null,
    eventCount: 0,
    parsedCount: null,
    statesNoEvents: false,
  };
  const feed: EventFeed = {
    schemaVersion: 1,
    generatedAt: at,
    events: [],
    sources: [source],
  };
  expect(updateItems(s, feed, Date.parse(at)).map((r) => r.kind)).toEqual([
    "sources",
  ]);
  expect(
    updateItems(
      s,
      { ...feed, sources: [{ ...source, lastSuccessAt: at }] },
      Date.parse(at),
    ),
  ).toEqual([]);
});
test("a snoozed source warning stays hidden until it expires or another game goes stale", () => {
  const s = migrateLegacy(
    {},
    ["genshin", "hsr"],
    at,
    (() => {
      let n = 0;
      return () => `account:a${++n}`;
    })(),
  );
  const source = (game: "genshin" | "hsr") => ({
    sourceId: `${game}-events`,
    game,
    url: "https://example.com",
    lastSuccessAt: null,
    lastConfirmedAt: null,
    contentChangedAt: null,
    eventCount: 0,
    parsedCount: null,
    statesNoEvents: false,
  });
  const feed: EventFeed = {
    schemaVersion: 1,
    generatedAt: at,
    events: [],
    sources: [source("genshin")],
  };
  const now = Date.parse(at),
    day = 86_400_000;
  s.prefs.staleSnooze = staleSnooze(["genshin"], now, 7);
  expect(s.prefs.staleSnooze).toEqual({
    until: new Date(now + 7 * day).toISOString(),
    games: ["genshin"],
  });
  expect(updateItems(s, feed, now + 6 * day)).toEqual([]);
  expect(updateItems(s, feed, now + 7 * day).map((r) => r.kind)).toEqual([
    "sources",
  ]);
  expect(
    updateItems(
      s,
      { ...feed, sources: [source("genshin"), source("hsr")] },
      now + day,
    ),
  ).toEqual([{ kind: "sources", games: ["genshin", "hsr"] }]);
  // Never longer than seven days, whatever is asked.
  expect(staleSnooze(["genshin"], now, 30).until).toBe(
    new Date(now + 7 * day).toISOString(),
  );
  s.prefs.staleSnooze = "garbage";
  expect(updateItems(s, feed, now).map((r) => r.kind)).toEqual(["sources"]);
});
