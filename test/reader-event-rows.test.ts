import { expect, test } from "bun:test";
import { readerEventRows } from "../src/client/state/reader/eventRows.ts";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";
import { createAccount } from "../src/client/state/reader/accounts.ts";
import { sampleEvent } from "./helpers/reader.ts";
const at = "2026-10-16T12:00:00.000Z";

test("events resolve on each account's server without changing domain identities", () => {
  const s = migrateLegacy({}, ["genshin"], at, () => "account:one");
  s.accounts["account:two"] = createAccount(
    "genshin",
    "asia",
    at,
    "account:two",
  );
  s.data["account:two"] = { progress: {}, ignored: {}, daily: {}, amounts: {} };
  const rows = readerEventRows(s, [sampleEvent], Date.parse(at));
  expect(rows).toHaveLength(2);
  expect(rows[0]?.event.id).toBe(sampleEvent.id);
  expect(new Set(rows.map((r) => r.clock.endsMs)).size).toBe(2);
  expect(new Set(rows.map((r) => r.accountId)).size).toBe(2);
});
test("missing future and unknown-end seen events remain accessible", () => {
  const s = migrateLegacy({}, ["genshin"], at, () => "account:one");
  s.seenEvents.a = {
    accountId: "account:one",
    event: { ...sampleEvent, endsAt: null, endPrecision: "unknown" },
    firstSeenAt: at,
    lastSeenAt: at,
    clockRevision: "initial",
  };
  expect(readerEventRows(s, [], Date.parse(at))[0]?.clock.endsMs).toBeNull();
});
test("deleted reader events are not resurrected from their seen snapshots", () => {
  const s = migrateLegacy({}, ["genshin"], at, () => "account:one");
  s.seenEvents.a = {
    accountId: "account:one",
    event: { ...sampleEvent, id: "myevent:deleted", sourceUrl: null },
    firstSeenAt: at,
    lastSeenAt: at,
    clockRevision: "initial",
  };
  expect(readerEventRows(s, [], Date.parse(at))).toHaveLength(0);
});
