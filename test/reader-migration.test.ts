import { expect, test } from "bun:test";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";
import { ReaderStateSchema } from "../src/client/state/reader/schema.ts";
const at = "2026-10-16T12:00:00.000Z";
const raw = {
  "gacha-tracker:v1:prefs": JSON.stringify({
    region: "europe",
    view: "timeline",
    theme: "light",
    hiddenGames: ["hsr"],
    gameOrder: ["genshin", "hsr"],
    showRoutines: true,
    routinesHidden: ["routine:genshin:weekly-bosses"],
  }),
  "gacha-tracker:v1:progress": JSON.stringify({
    "genshin:test:2026-10-01": { status: "done", at, goal: { future: true } },
    "foreign-id": { note: "keep", at },
  }),
  "gacha-tracker:v1:daily": JSON.stringify({
    "dailies:genshin": { days: ["2026-10-15"], at },
  }),
  "gacha-tracker:v1:tasks": JSON.stringify({
    "mytask:abcdef": {
      id: "mytask:abcdef",
      game: "genshin",
      title: "Mine",
      period: { unit: "week", startsOn: 1 },
      measure: { kind: "days", required: 1 },
      at,
      updatedAt: at,
      future: 42,
    },
  }),
  "gacha-tracker:v1:amounts": JSON.stringify({
    "mytask:abcdef": { "2026-10-12": { value: 7, at } },
  }),
};
test("migration preserves view, region, game choices and exact history keys", () => {
  let n = 0;
  const state = migrateLegacy(
    raw,
    ["genshin", "hsr"],
    at,
    () => `account:test${++n}`,
  );
  expect(ReaderStateSchema.safeParse(state).success).toBe(true);
  expect(state.prefs.view).toBe("timeline");
  expect(state.prefs.hiddenGames).toEqual(["hsr"]);
  const account = Object.values(state.accounts).find(
    (a) => a.game === "genshin",
  )!;
  expect(account.region).toBe("europe");
  const data = state.data[account.id]!;
  expect(data.progress["genshin:test:2026-10-01"]).toEqual({
    status: "done",
    at,
    goal: { future: true },
  });
  expect(data.daily[account.clocks[0]!.id]?.["dailies:genshin"]).toEqual({
    days: ["2026-10-15"],
    at,
  });
  expect(data.amounts[account.clocks[0]!.id]?.["mytask:abcdef"]).toEqual({
    "2026-10-12": { value: 7, at },
  });
  expect(account.routines["routine:genshin:weekly-bosses"]?.followed).toBe(
    false,
  );
  expect(state.tasks["mytask:abcdef"]).toHaveProperty("future", 42);
  expect(raw["gacha-tracker:v1:progress"]).toContain("foreign-id");
});
test("completion-only installs and games absent from feed retain their state", () => {
  const state = migrateLegacy(
    {
      "gacha-tracker:v1:completions": JSON.stringify({
        "zzz:old:2026-01-01": { at },
      }),
    },
    [],
    at,
    () => "account:old",
  );
  const account = Object.values(state.accounts)[0]!;
  expect(account.game).toBe("zzz");
  expect(state.data[account.id]?.progress["zzz:old:2026-01-01"]).toEqual({
    status: "done",
    at,
  });
});
test("malformed blobs cannot hide valid state in other legacy keys", () => {
  const state = migrateLegacy(
    { ...raw, "gacha-tracker:v1:tasks": "broken" },
    ["genshin"],
    at,
    () => "account:one",
  );
  expect(state.tasks).toEqual({});
  expect(state.data["account:one"]?.progress).toHaveProperty(
    "genshin:test:2026-10-01",
  );
});
test("new catalogue games remain switched off for a returning reader", () => {
  let n = 0;
  const s = migrateLegacy(
    {
      "gacha-tracker:v1:prefs": JSON.stringify({
        knownGames: ["genshin"],
        hiddenGames: [],
        onboarded: true,
      }),
    },
    ["genshin", "hsr"],
    at,
    () => `account:new${++n}`,
  );
  expect(s.prefs.hiddenGames).toEqual(["hsr"]);
  expect(
    Object.values(s.accounts).find((a) => a.game === "hsr")?.intent.events,
  ).toBe(false);
});
