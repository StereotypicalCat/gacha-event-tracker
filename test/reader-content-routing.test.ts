import { expect, test } from "bun:test";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";
import { contentEvents, routeReaderContent } from "../src/client/state/reader/contentRouting.ts";
import { ReaderStateSchema, pairKey } from "../src/client/state/reader/schema.ts";
import { reduceReader } from "../src/client/state/reader/reducer.ts";
import { createAccount } from "../src/client/state/reader/accounts.ts";
import { sampleEvent } from "./helpers/reader.ts";
import { mergeReaderData } from "../src/client/state/reader/import.ts";
const at = "2026-11-01T12:00:00.000Z";
const event = { ...sampleEvent, id: "genshin:starlit-gala:2026-10-01", title: "Starlit Gala", endsAt: "2026-11-03T00:00:00.000Z", sourceUrl: "https://genshin-impact.fandom.com/wiki/Starlit_Gala" };
function saved() {
  const s = migrateLegacy({}, ["genshin"], at, () => "account:one");
  s.prefs.onboarded = true;
  s.seenEvents[pairKey("account:one", event.id)] = { accountId: "account:one", event, firstSeenAt: at, lastSeenAt: at, clockRevision: "initial" };
  s.data["account:one"]!.progress[event.id] = { note: "keep me", status: "doing", at };
  s.data["account:one"]!.daily.initial = { [event.id]: { days: ["2026-10-31"], at } };
  return s;
}
test("routes only Miliastra state with the same IDs and clock references, hidden initially", () => {
  const before = saved();
  const after = routeReaderContent(before);
  const target = Object.values(after.accounts).find(a => a.game === "miliastra")!;
  expect(target).toBeDefined();
  expect(after.data[target.id]?.progress[event.id]).toEqual(before.data["account:one"]!.progress[event.id]);
  expect(after.data["account:one"]!.progress[event.id]).toBeUndefined();
  expect(after.data[target.id]?.daily.initial?.[event.id]).toEqual({ days: ["2026-10-31"], at });
  expect(after.seenEvents[pairKey(target.id, event.id)]?.event.game).toBe("miliastra");
  expect(after.prefs.hiddenGames).toContain("miliastra");
  expect(ReaderStateSchema.safeParse(after).success).toBe(true);
  expect(routeReaderContent(after)).toEqual(after);
  expect(before.data["account:one"]!.progress[event.id]).toBeDefined();
});
test("two same-region origins retain different counterpart identities", () => {
  const s = saved();
  s.accounts["account:two"] = createAccount("genshin", "asia", at, "account:two");
  s.data["account:two"] = { ...s.data["account:one"]!, progress: { [event.id]: { note: "second" } } };
  const n = routeReaderContent(s);
  const accounts = Object.values(n.accounts).filter(a => a.game === "miliastra");
  expect(accounts).toHaveLength(2);
  expect(accounts.map(a => n.data[a.id]!.progress[event.id])).toContainEqual({ note: "second" });
});
test("old-account writes route before conflict checks; a cleared field cannot be resurrected", () => {
  let n = routeReaderContent(saved());
  const target = Object.values(n.accounts).find(a => a.game === "miliastra")!;
  n = reduceReader(n, { type: "progress", accountId: target.id, itemId: event.id, patch: { note: null }, at: "2026-11-01T13:00:00.000Z", opId: "clear" });
  expect(() => reduceReader(n, { type: "progress", accountId: "account:one", itemId: event.id, patch: { note: "stale" }, at, opId: "late" })).toThrow("conflict");
  const next = reduceReader(n, { type: "progress", accountId: "account:one", itemId: event.id, patch: { note: "new" }, at: "2026-11-01T14:00:00.000Z", opId: "new" });
  expect(next.data[target.id]!.progress[event.id]).toHaveProperty("note", "new");
  expect(next.data["account:one"]!.progress[event.id]).toBeUndefined();
});
test("an old backup cannot resurrect a cleared migrated day or note", () => {
  const old = saved();
  let current = routeReaderContent(old);
  const target = Object.values(current.accounts).find(a => a.game === "miliastra")!;
  const later = "2026-11-01T15:00:00.000Z";
  current = reduceReader(current, { type: "progress", accountId: target.id, itemId: event.id, patch: { note: null }, at: later, opId: "clear-note" });
  current = reduceReader(current, { type: "day", accountId: target.id, revisionId: "initial", itemId: event.id, day: "2026-10-31", checked: false, at: later, opId: "clear-day" });
  const result = mergeReaderData(current, old);
  expect((result.data[target.id]?.progress[event.id] as { note?: string })?.note).toBeUndefined();
  expect(result.data[target.id]?.daily.initial?.[event.id]).toHaveProperty("days", []);
  expect(result.data["account:one"]?.progress[event.id]).toBeUndefined();
  expect(ReaderStateSchema.safeParse(result).success).toBe(true);
});
test("a migrated backup cannot resurrect a destination day deletion", () => {
  const old = routeReaderContent(saved());
  const target = Object.values(old.accounts).find(a => a.game === "miliastra")!;
  const current = reduceReader(old, { type: "day", accountId: target.id, revisionId: "initial", itemId: event.id, day: "2026-10-31", checked: false, at: "2026-11-01T15:00:00.000Z", opId: "remove" });
  const result = mergeReaderData(current, old);
  expect(result.data[target.id]?.daily.initial?.[event.id]).toHaveProperty("days", []);
});
test("a routed backup respects cleared ignores, amounts and restored history", () => {
  let initial = routeReaderContent(saved());
  const target = Object.values(initial.accounts).find(a => a.game === "miliastra")!;
  initial = reduceReader(initial, { type: "ignore", accountId: target.id, itemId: event.id, ignored: true, at, opId: "ignore" });
  initial = reduceReader(initial, { type: "amount", accountId: target.id, revisionId: "initial", itemId: event.id, period: "event", value: 3, at, opId: "amount" });
  initial = reduceReader(initial, { type: "outcome", outcome: "done", accountId: target.id, eventId: event.id, at, opId: "done" });
  let current = reduceReader(initial, { type: "restore", accountId: target.id, eventId: event.id, at: "2026-11-01T15:00:00.000Z", opId: "restore" });
  current = reduceReader(current, { type: "ignore", accountId: target.id, itemId: event.id, ignored: false, at: "2026-11-01T15:00:00.000Z", opId: "unignore" });
  current = reduceReader(current, { type: "amount", accountId: target.id, revisionId: "initial", itemId: event.id, period: "event", value: null, at: "2026-11-01T15:00:00.000Z", opId: "clear-amount" });
  const result = mergeReaderData(current, initial);
  expect(result.data[target.id]?.ignored[event.id]).toBeUndefined();
  expect((result.data[target.id]?.amounts.initial?.[event.id] as Record<string, unknown>)?.event).toBeUndefined();
  expect(result.archive[pairKey(target.id, event.id)]).toBeUndefined();
});
test("legacy object ignores respect a newer destination clear", () => {
  const old = saved();
  old.data["account:one"]!.ignored[event.id] = { at };
  const first = routeReaderContent(old);
  const target = Object.values(first.accounts).find(a => a.game === "miliastra")!;
  const current = reduceReader(first, { type: "ignore", accountId: target.id, itemId: event.id, ignored: false, at: "2026-11-01T15:00:00.000Z", opId: "unignore" });
  expect(mergeReaderData(current, old).data[target.id]?.ignored[event.id]).toBeUndefined();
});
test("a later inventory retains current pass dates over remembered snapshots", () => {
  const s = saved();
  const current = { ...event, endsAt: "2026-11-05T00:00:00.000Z" };
  s.contentEvents = { [event.id]: current };
  expect(contentEvents(s).find(e => e.id === event.id)?.endsAt).toBe(current.endsAt);
});
test("an unknown imported origin cannot overwrite a same-region counterpart", () => {
  const current = routeReaderContent(saved());
  const other = migrateLegacy({}, ["genshin"], at, () => "account:different");
  other.data["account:different"]!.progress[event.id] = { note: "different", at: "2026-11-01T16:00:00.000Z" };
  const result = mergeReaderData(current, other);
  expect(result.accounts["account:different"]).toBeDefined();
  const original = Object.values(result.accounts).find(a => a.contentOrigin === "account:one")!;
  expect(result.data[original.id]?.progress[event.id]).toHaveProperty("note", "keep me");
});
test("an already-routed backup retains its distinct origin mapping", () => {
  const current = routeReaderContent(saved());
  const other = migrateLegacy({}, ["genshin"], at, () => "account:different");
  other.data["account:different"]!.progress[event.id] = { note: "different", at };
  const backup = routeReaderContent(other);
  const result = mergeReaderData(current, backup);
  expect(result.accounts["account:different"]).toBeDefined();
  expect(Object.values(result.accounts).filter(a => a.game === "miliastra")).toHaveLength(2);
});
test("new-reader lane offering does not produce duplicate Miliastra accounts", () => {
  let i = 0;
  const s = migrateLegacy({}, ["genshin", "miliastra"], at, () => `account:new${++i}`);
  s.contentEvents = { [event.id]: event };
  const result = routeReaderContent(s);
  expect(Object.values(result.accounts).filter(a => a.game === "miliastra")).toHaveLength(1);
});
test("a counterpart created after startup inherits legacy pass visibility", () => {
  let s = migrateLegacy({}, ["genshin"], at, () => "account:one");
  s = routeReaderContent(s);
  const pass = { ...event, id: "genshin:silvery-moonlight-chronicle:2026-09-23", sourceUrl: "https://genshin-impact.fandom.com/wiki/Miliastra_Pass/2026-09-23" };
  s.contentEvents = { [pass.id]: pass };
  const result = routeReaderContent(s);
  const target = Object.values(result.accounts).find(a => a.game === "miliastra")!;
  expect(target.routines["feed-cycle:miliastra:miliastra-pass"]?.followed).toBe(true);
});
