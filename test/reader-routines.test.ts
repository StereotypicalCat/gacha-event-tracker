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

// Spec 2026-10-22: WuWa's shop pulls reset with the version and show with the cycles.
import { routinePeriod } from "../src/client/components/redesign/TimelinePage.tsx";
test("a routine that resets with the version is a cycle row, banded to its recorded end", () => {
  const now = "2026-10-22T14:30:00.000Z";
  const s = migrateLegacy({}, ["wuwa"], now, () => "account:one");
  s.prefs.standardPulls = true;
  s.data["account:one"]!.amounts[s.accounts["account:one"]!.clocks.at(-1)!.id] = {
    "routine:wuwa:shop-radiant-tide": { "2026-09-30": { value: 4, at: now } },
  };
  const rows = routineRows(s, "account:one", Date.parse(now));
  const shop = rows.filter((r) => r.id.startsWith("routine:wuwa:shop-"));
  expect(shop.map((r) => r.cadence)).toEqual(["cycle", "cycle", "cycle"]);
  const radiant = shop.find((r) => r.id === "routine:wuwa:shop-radiant-tide")!;
  expect(radiant.status).toMatchObject({ count: 4, required: 7, daysLeft: 20, periodStart: "2026-09-30" });
  expect(routinePeriod(radiant, Date.parse(now))).toEqual({
    start: Date.parse("2026-09-30T03:00:00Z"),
    end: Date.parse("2026-11-11T10:30:00Z"),
    estimated: false,
  });
  // Past the recorded end, drawn to the estimate — a picture, not a reset.
  expect(routinePeriod(radiant, Date.parse("2026-11-20T00:00:00Z")).end).toBe(
    Date.parse("2026-12-23T10:30:00Z"),
  );
});
