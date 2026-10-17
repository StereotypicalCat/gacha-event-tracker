import { expect, test } from "bun:test";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";
import {
  routineRows,
  placementFor,
} from "../src/client/state/reader/routines.ts";
const at = "2026-10-16T12:00:00.000Z";
test("routine placements are independent and an absent new routine is not followed", () => {
  const state = migrateLegacy({}, ["genshin"], at, () => "account:one");
  const a = state.accounts["account:one"]!;
  a.routines["routine:genshin:weekly-bosses"] = {
    followed: true,
    checklist: false,
    timeline: true,
  };
  expect(placementFor(a, "new-routine")).toEqual({
    followed: false,
    checklist: false,
    timeline: false,
  });
  const rows = routineRows(state, a.id, Date.parse(at));
  expect(
    rows.find((r) => r.id === "routine:genshin:weekly-bosses")?.placement,
  ).toEqual({ followed: true, checklist: false, timeline: true });
});
test("a changed reset reads only its own current revision without deleting older history", () => {
  const state = migrateLegacy({}, ["genshin"], at, () => "account:one");
  const a = state.accounts["account:one"]!;
  a.clocks.push({
    ...a.clocks[0]!,
    id: "changed",
    effectiveAt: at,
    reset: { hour: 5, minute: 30 },
  });
  state.data[a.id]!.daily.initial = {
    "dailies:genshin": { days: ["2026-10-16"], at },
  };
  const row = routineRows(state, a.id, Date.parse(at)).find(
    (r) => r.id === "dailies:genshin",
  )!;
  expect(row.days).toEqual([]);
  expect(state.data[a.id]!.daily.initial).toHaveProperty("dailies:genshin");
});
import { sampleEvent } from "./helpers/reader.ts";
test("an event the reader marked daily remains a directly tickable routine", () => {
  const s = migrateLegacy({}, ["genshin"], at, () => "account:one");
  s.seenEvents.x = {
    accountId: "account:one",
    event: sampleEvent,
    firstSeenAt: at,
    lastSeenAt: at,
    clockRevision: "initial",
  };
  s.data["account:one"]!.progress[sampleEvent.id] = { daily: true, at };
  const row = routineRows(s, "account:one", Date.parse(at)).find(
    (r) => r.id === sampleEvent.id,
  );
  expect(row?.placement.followed).toBe(true);
  expect(row?.cadence).toBe("day");
});
