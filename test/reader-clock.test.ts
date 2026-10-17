import { expect, test } from "bun:test";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";
import {
  appendClockRevision,
  resolveReaderClock,
  readerDayKey,
  readerClockFor,
} from "../src/shared/readerClock.ts";
import { clockFor } from "../src/shared/time.ts";
import { dayKey } from "../src/shared/daily.ts";
import { GAMES } from "../src/shared/games.ts";
import { GachaEvent } from "../src/shared/schema.ts";
const at = "2026-10-16T12:00:00.000Z",
  now = Date.parse(at);
const account = () =>
  Object.values(
    migrateLegacy({}, ["genshin"], at, () => "account:one").accounts,
  )[0]!;
test("automatic matches every game and server's existing day-key clock", () => {
  for (const game of Object.keys(GAMES))
    for (const region of ["asia", "america", "europe"] as const) {
      const a = Object.values(
        migrateLegacy(
          { "gacha-tracker:v1:prefs": JSON.stringify({ region }) },
          [game],
          at,
          () => "account:one",
        ).accounts,
      )[0]!;
      expect(readerDayKey(now, resolveReaderClock(a, now))).toBe(
        dayKey(now, region, game),
      );
    }
});
test("reset override/revert retains revisions, including a backwards current day", () => {
  const a = account(),
    t = "2026-10-17T03:10:00.000Z";
  const custom = appendClockRevision(
    a,
    { hour: 5, minute: 30 },
    "europe",
    t,
    "custom",
  );
  expect(
    readerDayKey(Date.parse(t), resolveReaderClock(a, Date.parse(t))),
  ).toBe("2026-10-17");
  expect(
    readerDayKey(Date.parse(t), resolveReaderClock(custom, Date.parse(t))),
  ).toBe("2026-10-16");
  expect(resolveReaderClock(custom, Date.parse(t) - 1).revision).toBe(
    "initial",
  );
  const reverted = appendClockRevision(
    custom,
    null,
    "europe",
    "2026-10-18T12:00:00.000Z",
    "reverted",
  );
  expect(reverted.clocks).toHaveLength(3);
  expect(
    resolveReaderClock(reverted, Date.parse("2026-10-18T13:00:00.000Z"))
      .resetHour,
  ).toBe(4);
});
const event = () =>
  GachaEvent.parse({
    id: "genshin:test:2026-10-01",
    game: "genshin",
    title: "Test",
    type: "story",
    summary: null,
    startsAt: "2026-10-01T00:00:00.000Z",
    startPrecision: "day",
    endsAt: "2026-10-20T00:00:00.000Z",
    endPrecision: "day",
    sourceUrl: "https://example.com",
    regionScoped: true,
    regionEnds: {},
    sourceId: "test",
    confidence: 1,
    extractionMethod: "parser",
    version: 1,
    firstSeenAt: at,
    updatedAt: at,
    status: "published",
  });
test("only reset-based boundaries move; exact regional ends remain authoritative", () => {
  const a = account(),
    custom = appendClockRevision(
      a,
      { hour: 5, minute: 30 },
      "europe",
      at,
      "custom",
    );
  const e = event();
  expect(
    readerClockFor(e, custom, now).endsMs! - clockFor(e, "europe", now).endsMs!,
  ).toBe(90 * 60000);
  const exact = { ...e, regionEnds: { europe: "2026-10-20T18:00:00.000Z" } };
  expect(readerClockFor(exact, custom, now).endsMs).toBe(
    Date.parse(exact.regionEnds.europe),
  );
  expect(
    readerClockFor({ ...e, endsAt: null, endPrecision: "unknown" }, custom, now)
      .endsMs,
  ).toBeNull();
});
test("a reader-entered day-precision instant is never moved by a reset override", () => {
  const a = appendClockRevision(
    account(),
    { hour: 5, minute: 30 },
    "europe",
    at,
    "custom",
  );
  const e = { ...event(), extractionMethod: "manual" as const };
  expect(readerClockFor(e, a, now).endsMs).toBe(Date.parse(e.endsAt!));
});
import { refreshAutomaticClocks } from "../src/client/state/reader/clock.ts";
test("automatic metadata corrections create a revision instead of rewriting history", () => {
  const a = account();
  a.clocks[0]!.automaticBase.hour = 3;
  const state = migrateLegacy({}, ["genshin"], at, () => "account:one");
  state.accounts[a.id] = a;
  const next = refreshAutomaticClocks(state, at);
  expect(next.accounts[a.id]?.clocks).toHaveLength(2);
  expect(next.accounts[a.id]?.clocks[0]?.automaticBase.hour).toBe(3);
  expect(resolveReaderClock(next.accounts[a.id]!, now).resetHour).toBe(4);
});
