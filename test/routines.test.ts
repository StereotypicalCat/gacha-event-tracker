import { describe, expect, test } from "bun:test";
import {
  activeRoutines,
  ROUTINES,
  RoutineSchema,
  routinesFor,
  routineToAsk,
  mineFrom,
  copyRoutineState,
} from "../src/shared/routines.ts";
import { choreRule, defaults, restorePrefsValue, routineRule } from "../src/client/state/usePrefs.ts";
import { shownFor } from "../src/shared/perGame.ts";
import { taskStatus } from "../src/shared/task.ts";

/**
 * Weekly tasks the app ships for a game. Each is a claim about a game we did
 * not write, so each must say where it came from and as of when — the bar
 * `dailyTasks` in games.ts is held to.
 */
describe("ROUTINES", () => {
  test("every one parses, and ids are unique", () => {
    for (const r of ROUTINES) expect(RoutineSchema.safeParse(r).success).toBe(true);
    expect(new Set(ROUTINES.map((r) => r.id)).size).toBe(ROUTINES.length);
  });

  test("every one names its game in its id, and cites an https source with a date", () => {
    for (const r of ROUTINES) {
      expect(r.id.split(":")[1]).toBe(r.game);
      expect(r.source.startsWith("https://")).toBe(true);
      expect(r.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test("a routine without a source is refused", () => {
    const { source: _s, ...bare } = ROUTINES[0]!;
    expect(RoutineSchema.safeParse(bare).success).toBe(false);
  });

  test("the first two, as sourced", () => {
    expect(routinesFor("zzz").map((r) => [r.title, r.measure])).toEqual([
      ["Ridu Weekly", { kind: "amount", target: 1300, unit: "points" }],
    ]);
    expect(routinesFor("endfield").map((r) => [r.title, r.measure])).toEqual([
      ["Weekly Routine", { kind: "amount", target: 10, unit: "points" }],
    ]);
    expect(routinesFor("genshin")).toEqual([]);
  });

  test("a routine has a status like any task", () => {
    const s = taskStatus({
      task: routinesFor("zzz")[0]!, region: "europe",
      now: Date.parse("2026-10-15T12:00:00Z"), logged: [],
      amounts: { "2026-10-12": { value: 900, at: "2026-10-15T12:00:00.000Z" } },
    });
    expect(s).toMatchObject({ scope: "week", count: 900, required: 1300 });
  });
});

describe("which built-ins are on", () => {
  const off = { all: false };
  test("only for games the reader said yes to", () => {
    expect(activeRoutines(off, new Set()).map((r) => r.id)).toEqual([]);
    expect(activeRoutines({ all: false, on: ["zzz"] }, new Set()).map((r) => r.id)).toEqual(["routine:zzz:ridu-weekly"]);
  });

  test("one the reader made their own is hidden while the copy exists", () => {
    expect(activeRoutines({ all: false, on: ["zzz", "endfield"] }, new Set(["routine:zzz:ridu-weekly"])).map((r) => r.id))
      .toEqual(["routine:endfield:weekly-routine"]);
  });

  test("switched on globally, every game's — less the ones switched off", () => {
    expect(activeRoutines({ all: true }, new Set()).map((r) => r.id))
      .toEqual(["routine:zzz:ridu-weekly", "routine:endfield:weekly-routine"]);
    expect(activeRoutines({ all: true, off: ["zzz"] }, new Set()).map((r) => r.id))
      .toEqual(["routine:endfield:weekly-routine"]);
  });
});

describe("a reader's answers from before the global switch carry over", () => {
  // Nothing is migrated: `routineGames` is the built-ins' on-list as it stands,
  // and an absent `showRoutines` is the opt-in it always was.
  test("routineGames alone still means exactly those games", () => {
    const rule = routineRule({ ...defaults(), routineGames: ["zzz"] });
    expect(activeRoutines(rule, new Set()).map((r) => r.id)).toEqual(["routine:zzz:ridu-weekly"]);
  });

  test("an install that never answered gets none", () => {
    expect(activeRoutines(routineRule(defaults()), new Set())).toEqual([]);
  });

  test("showRoutines and routinesOff are read", () => {
    const rule = routineRule({ ...defaults(), showRoutines: true, routinesOff: ["zzz"] });
    expect(activeRoutines(rule, new Set()).map((r) => r.id)).toEqual(["routine:endfield:weekly-routine"]);
  });

  test("showChores alone still means every game's chore, and choresOff narrows it", () => {
    expect(shownFor(choreRule(defaults()), "genshin")).toBe(true);
    expect(shownFor(choreRule({ ...defaults(), showChores: false }), "genshin")).toBe(false);
    const rule = choreRule({ ...defaults(), choresOff: ["hsr"] });
    expect([shownFor(rule, "genshin"), shownFor(rule, "hsr")]).toEqual([true, false]);
    expect(shownFor(choreRule({ ...defaults(), showChores: false, choresOn: ["hsr"] }), "hsr")).toBe(true);
  });
});

describe("which game to ask about", () => {
  const off = { all: false };
  test("the first game on screen with built-ins, not asked and not on", () => {
    expect(routineToAsk(["genshin", "zzz", "endfield"], off, undefined, false)).toBe("zzz");
    expect(routineToAsk(["genshin", "zzz", "endfield"], off, ["zzz"], false)).toBe("endfield");
    expect(routineToAsk(["zzz"], { all: false, on: ["zzz"] }, undefined, false)).toBeNull();
    expect(routineToAsk(["genshin"], off, undefined, false)).toBeNull();
  });

  test("never once the reader has answered the global switch", () => {
    // Either answer covers every game at once, so asking about one is asking
    // a question they already answered.
    expect(routineToAsk(["zzz"], off, undefined, true)).toBeNull();
    expect(routineToAsk(["zzz"], { all: true, off: ["zzz"] }, undefined, true)).toBeNull();
  });
});

describe("restoring prefs with the new fields", () => {
  test("junk in the arrays is sanitised, and absent stays absent", () => {
    const r = restorePrefsValue({ routineGames: ["zzz", 7], routinesAsked: "zzz" });
    expect(r.routineGames).toEqual(["zzz"]);
    expect(r.routinesAsked).toBeUndefined();
    expect(restorePrefsValue({}).routineGames).toBeUndefined();
  });

  test("the exception lists and the global built-ins answer are sanitised too", () => {
    const r = restorePrefsValue({ choresOn: ["hsr", null], choresOff: "x", routinesOff: [3, "zzz"], showRoutines: 1 });
    expect(r.choresOn).toEqual(["hsr"]);
    expect(r.choresOff).toBeUndefined();
    expect(r.routinesOff).toEqual(["zzz"]);
    expect(r.showRoutines).toBeUndefined();
    expect(restorePrefsValue({ showRoutines: false }).showRoutines).toBe(false);
    const empty = restorePrefsValue({});
    expect([empty.choresOn, empty.choresOff, empty.routinesOff, empty.showRoutines]).toEqual([
      undefined, undefined, undefined, undefined,
    ]);
  });
});

describe("making a built-in your own", () => {
  test("copies its shape and remembers where it came from", () => {
    const ridu = routinesFor("zzz")[0]!;
    expect(mineFrom(ridu)).toEqual({
      game: "zzz", title: "Ridu Weekly", period: { unit: "week", startsOn: 1 },
      measure: { kind: "amount", target: 1300, unit: "points" }, from: "routine:zzz:ridu-weekly",
    });
  });
});

describe("copying a built-in's record to the reader's copy", () => {
  const logs = { "routine:zzz:ridu-weekly": { days: ["2026-10-12"], at: "2026-10-12T10:00:00.000Z" } };
  const amounts = { "routine:zzz:ridu-weekly": { "2026-10-12": { value: 900, at: "2026-10-13T10:00:00.000Z" } } };

  test("ticks and numbers land under the new id; the original's are not touched", () => {
    const copy = copyRoutineState(logs, amounts, "routine:zzz:ridu-weekly", "mytask:abcdef1234");
    expect(copy.daily).toEqual({ "mytask:abcdef1234": logs["routine:zzz:ridu-weekly"] });
    expect(copy.amounts).toEqual({ "mytask:abcdef1234": amounts["routine:zzz:ridu-weekly"] });
    expect(Object.keys(copy.daily)).not.toContain("routine:zzz:ridu-weekly");
  });

  test("nothing recorded, nothing copied", () => {
    expect(copyRoutineState({}, {}, "routine:zzz:ridu-weekly", "mytask:abcdef1234")).toEqual({
      daily: {}, amounts: {},
    });
  });
});
