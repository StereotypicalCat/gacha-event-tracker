import { expect, test } from "bun:test";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";
import { pairKey, type ReaderState } from "../src/client/state/reader/schema.ts";
import {
  catchUpFor,
  catchUpTitle,
  defaultCatchUpAccount,
  keepKey,
  pickAccount,
  type AccountCatchUp,
} from "../src/client/state/reader/catchUp.ts";
import { routineRows } from "../src/client/state/reader/routines.ts";
import { sampleEvent } from "./helpers/reader.ts";

const at = "2026-11-06T12:00:00.000Z",
  now = Date.parse(at);
const pin = { followed: true, checklist: true, timeline: false };
const ID = "account:one";

function setup(game = "endfield"): { state: ReaderState; revision: string } {
  const state = migrateLegacy({}, [game], at, () => ID);
  return { state, revision: state.accounts[ID]!.clocks[0]!.id };
}
const ofAccount = (state: ReaderState): AccountCatchUp =>
  catchUpFor(state, state.accounts[ID]!, now);
const itemOf = (state: ReaderState, id: string) => {
  const item = ofAccount(state).items.find((i) => i.id === id);
  if (!item) throw new Error(`${id} is not listed`);
  return item;
};
const tick = (s: ReaderState, rev: string, id: string, days: unknown) => {
  (s.data[ID]!.daily[rev] ??= {})[id] = { days };
};
const DAILY = "dailies:endfield";

test("a feed-cycle id with no live row reads Battle pass", () => {
  const { state } = setup();
  const title = catchUpTitle(state, state.accounts[ID]!, "feed-cycle:endfield:battle-pass", []);
  expect(title).toBe("Battle pass");
});

test("a followed battle pass is titled from its event and gets no strip", () => {
  const { state } = setup("genshin");
  const pass = {
    ...sampleEvent,
    id: "genshin:moontrace:2026-10-23",
    title: "Moontrace",
    startsAt: "2026-10-23T00:00:00.000Z",
    endsAt: "2026-12-02T00:00:00.000Z",
    sourceUrl: "https://genshin-impact.fandom.com/wiki/Battle_Pass/Moontrace",
  };
  state.contentEvents = { [pass.id]: pass };
  const placement = "feed-cycle:genshin:battle-pass";
  state.accounts[ID]!.routines[placement] = pin;
  const rows = routineRows(state, ID, now);
  expect(rows.some((r) => r.placementId === placement)).toBe(true);
  expect(catchUpTitle(state, state.accounts[ID]!, placement, rows)).toBe("Moontrace");
  const ids = ofAccount(state).items.map((i) => i.id);
  expect(ids).not.toContain(placement);
  expect(ids).not.toContain(pass.id);
});

test("an unknown id reads Removed item", () => {
  const { state } = setup();
  expect(catchUpTitle(state, state.accounts[ID]!, "mystery:thing", [])).toBe("Removed item");
});

test("dailies use the name Today's dailies uses", () => {
  const { state } = setup();
  state.accounts[ID]!.routines[DAILY] = pin;
  expect(itemOf(state, DAILY).title).toBe("Daily missions");
  expect(itemOf(state, DAILY).kind).toBe("Dailies");
});

test("a daily strip holds 14 days ending today", () => {
  const { state } = setup();
  state.accounts[ID]!.routines[DAILY] = pin;
  const days = itemOf(state, DAILY).days!;
  expect(days).toHaveLength(14);
  expect(days[0]!.key).toBe("2026-10-24");
  expect(days.at(-1)).toMatchObject({ key: "2026-11-06", today: true, disabled: false });
  expect(days.filter((d) => d.today)).toHaveLength(1);
});

test("an amount routine gets values, not days", () => {
  const { state, revision } = setup();
  const id = "routine:endfield:weekly-routine";
  state.accounts[ID]!.routines[id] = pin;
  (state.data[ID]!.amounts[revision] ??= {})[id] = {
    "2026-11-02": { value: 8 },
    "2026-10-26": { value: 10 },
  };
  const item = itemOf(state, id);
  expect(item.title).toBe("Weekly Routine");
  expect(item.kind).toBe("Weeklies");
  expect(item.days).toBeNull();
  expect(item.values![0]).toMatchObject({ label: "Week of 2 Nov", text: "8 of 10 points" });
  expect(item.values![1]!.label).toBe("Week of 26 Oct");
});

test("an amount routine with nothing logged has an empty list, not a strip", () => {
  const { state } = setup();
  const id = "routine:endfield:weekly-routine";
  state.accounts[ID]!.routines[id] = pin;
  expect(itemOf(state, id).days).toBeNull();
  expect(itemOf(state, id).values).toEqual([]);
});

test("a banner routine has no strip", () => {
  const { state } = setup();
  const id = "routine:endfield:aic-quota-permits";
  state.accounts[ID]!.routines[id] = pin;
  expect(itemOf(state, id).days).toBeNull();
});

test("behind counts unticked days since the first tick, not today", () => {
  const { state, revision } = setup();
  state.accounts[ID]!.routines[DAILY] = pin;
  tick(state, revision, DAILY, ["2026-11-03", "2026-11-05"]);
  expect(itemOf(state, DAILY).behind).toBe(1);
  expect(ofAccount(state).behind).toBe(1);
});

test("a never-ticked routine counts nothing", () => {
  const { state } = setup();
  state.accounts[ID]!.routines[DAILY] = pin;
  expect(itemOf(state, DAILY).behind).toBe(0);
});

test("a weekly counts nothing", () => {
  const { state, revision } = setup();
  const id = "routine:endfield:weekly-routine";
  state.accounts[ID]!.routines[id] = pin;
  tick(state, revision, id, ["2026-10-26"]);
  expect(itemOf(state, id).behind).toBe(0);
});

const dailyEvent = {
  ...sampleEvent,
  id: "genshin:login:2026-10-30",
  title: "Login Campaign",
  startsAt: "2026-11-01T00:00:00.000Z",
  endsAt: "2026-11-20T00:00:00.000Z",
};
function withEvent() {
  const made = setup("genshin");
  made.state.seenEvents[pairKey(ID, dailyEvent.id)] = {
    accountId: ID,
    event: dailyEvent,
    firstSeenAt: at,
    lastSeenAt: at,
    clockRevision: made.revision,
  };
  return made;
}

test("a daily event is titled, typed Event, and its strip starts when it did", () => {
  const { state } = withEvent();
  state.data[ID]!.progress[dailyEvent.id] = { daily: true };
  const item = itemOf(state, dailyEvent.id);
  expect(item.title).toBe("Login Campaign");
  expect(item.kind).toBe("Event");
  expect(item.days![0]!.key).toBe("2026-11-01");
  expect(item.days!.length).toBeLessThan(14);
});

test("an event with a goal counts nothing", () => {
  const { state, revision } = withEvent();
  state.data[ID]!.progress[dailyEvent.id] = {
    goal: { period: "week", measure: "days", required: 3, weekStartsOn: 1 },
  };
  tick(state, revision, dailyEvent.id, ["2026-11-02"]);
  expect(itemOf(state, dailyEvent.id).behind).toBe(0);
});

test("a tick before the strip is under earlier", () => {
  const { state, revision } = setup();
  state.accounts[ID]!.routines[DAILY] = pin;
  tick(state, revision, DAILY, ["2026-09-01", "2026-11-05"]);
  const item = itemOf(state, DAILY);
  expect(item.earlier.map((d) => d.key)).toEqual(["2026-09-01"]);
  expect(item.earlier[0]).toMatchObject({ ticked: true, disabled: false });
  expect(item.days!.find((d) => d.key === "2026-11-05")!.ticked).toBe(true);
});

test("a tick after today is disabled, and kept", () => {
  const { state, revision } = setup();
  state.accounts[ID]!.routines[DAILY] = pin;
  tick(state, revision, DAILY, ["2026-11-07"]);
  expect(itemOf(state, DAILY).earlier[0]).toMatchObject({ key: "2026-11-07", disabled: true });
});

test("unreadable logs do not throw", () => {
  const { state, revision } = setup();
  state.accounts[ID]!.routines[DAILY] = pin;
  const id = "routine:endfield:weekly-routine";
  state.accounts[ID]!.routines[id] = pin;
  tick(state, revision, DAILY, "x");
  (state.data[ID]!.amounts[revision] ??= {})[id] = { "2026-11-02": { value: "x" } };
  expect(itemOf(state, DAILY).days!.every((d) => !d.ticked)).toBe(true);
  expect(itemOf(state, id).values![0]!.text).toBe("unreadable amount");
});

test("a logged item no longer followed lands in Older records with recorded days only", () => {
  const { state, revision } = setup();
  const id = "routine:endfield:focus-commissions";
  tick(state, revision, id, ["2026-10-01"]);
  const { items, older } = ofAccount(state);
  expect(items.map((i) => i.id)).not.toContain(id);
  expect(older).toHaveLength(1);
  expect(older[0]!.title).toBe("Ended or no longer followed");
  expect(older[0]!.items[0]).toMatchObject({ title: "Etchspace Salvage: Focus Commissions" });
  expect(older[0]!.items[0]!.days!.map((d) => d.key)).toEqual(["2026-10-01"]);
});

test("an earlier reset timing is its own older group", () => {
  const { state, revision } = setup();
  const account = state.accounts[ID]!;
  const first = account.clocks[0]!;
  account.clocks.push({ ...first, id: "rev-2", effectiveAt: "2026-11-04T00:00:00.000Z" });
  tick(state, revision, DAILY, ["2026-11-01"]);
  const { older } = ofAccount(state);
  expect(older).toHaveLength(1);
  expect(older[0]!.title).toBe("Before reset timing changed");
  expect(older[0]!.note).toContain("Migrated history");
  const item = older[0]!.items[0]!;
  expect(item.revisionId).toBe(revision);
  expect(item.days!.find((d) => d.key === "2026-11-01")!.ticked).toBe(true);
});

test("an item with nothing logged is not in older", () => {
  const { state, revision } = setup();
  tick(state, revision, "routine:endfield:focus-commissions", []);
  expect(ofAccount(state).older).toEqual([]);
});

test("a recorded day unticked this visit stays offered, so a mis-tap can be undone", () => {
  const { state, revision } = setup();
  const id = "routine:endfield:focus-commissions";
  const kept = new Set([keepKey(ID, revision, id, "2026-10-01")]);
  tick(state, revision, id, []);
  const older = catchUpFor(state, state.accounts[ID]!, now, kept).older;
  expect(older[0]!.items[0]!.days).toEqual([
    { key: "2026-10-01", ticked: false, today: false, disabled: false },
  ]);
});

test("an earlier day unticked this visit stays under earlier", () => {
  const { state, revision } = setup();
  state.accounts[ID]!.routines[DAILY] = pin;
  const kept = new Set([keepKey(ID, revision, DAILY, "2026-09-01")]);
  const item = catchUpFor(state, state.accounts[ID]!, now, kept).items[0]!;
  expect(item.earlier).toEqual([
    { key: "2026-09-01", ticked: false, today: false, disabled: false },
  ]);
});

test("a day unticked on another account is not offered here", () => {
  const { state, revision } = setup();
  const kept = new Set([keepKey("account:other", revision, DAILY, "2026-09-01")]);
  expect(catchUpFor(state, state.accounts[ID]!, now, kept).older).toEqual([]);
});

const summary = (accountId: string, behind: number): AccountCatchUp => ({
  accountId,
  behind,
  items: [],
  older: [],
});

test("defaultCatchUpAccount picks the first behind, else first, else null", () => {
  expect(defaultCatchUpAccount([summary("a", 0), summary("b", 2), summary("c", 1)])).toBe("b");
  expect(defaultCatchUpAccount([summary("a", 0), summary("b", 0)])).toBe("a");
  expect(defaultCatchUpAccount([])).toBeNull();
});

test("pickAccount keeps a live selection, and falls back when it is gone", () => {
  const list = [summary("a", 0), summary("b", 2)];
  expect(pickAccount("a", list)).toBe("a");
  expect(pickAccount("gone", list)).toBe("b");
  expect(pickAccount(null, list)).toBe("b");
});
