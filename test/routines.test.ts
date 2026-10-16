import { describe, expect, test } from "bun:test";
import {
  activeRoutines,
  ROUTINES,
  RoutineSchema,
  routinesFor,
  routineToAsk,
  mineFrom,
  copyRoutineState,
  hiddenAfter,
  offered,
} from "../src/shared/routines.ts";
import { choreRule, defaults, restorePrefsValue, routineRule, trackRoutinePatch } from "../src/client/state/usePrefs.ts";
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

  test("a figure confirmed in game says so, with the day", () => {
    // The one exception to "a page states it" (routines.ts): the reader must
    // be able to tell our figure from the page's.
    for (const r of ROUTINES) {
      if (r.note?.toLowerCase().includes("in game") !== true) continue;
      expect(r.note).toMatch(/Confirmed in game, \d{4}-\d{2}-\d{2}\./);
    }
  });

  test("a routine without a source is refused", () => {
    const { source: _s, ...bare } = ROUTINES[0]!;
    expect(RoutineSchema.safeParse(bare).success).toBe(false);
  });

  // Pinned to docs/superpowers/specs/2026-10-14-built-in-routines-design.md:
  // a figure that moves here moves there, with the page that says so.
  test("each game's, as sourced", () => {
    const shape = (game: string): unknown[] =>
      routinesFor(game).map((r) => [r.title, r.period, r.measure]);
    const week = { unit: "week" as const, startsOn: 1 };
    expect(shape("genshin")).toEqual([
      ["Weekly Bosses", week, { kind: "amount", target: 3, unit: "runs" }],
      ["Battle Pass weekly EXP", week, { kind: "amount", target: 10000, unit: "EXP" }],
      ["Reputation Bounties", week, { kind: "amount", target: 3, unit: "bounties" }],
      ["Reputation Requests", week, { kind: "amount", target: 3, unit: "requests" }],
      ["Realm Depot: Realm Treasures", week, { kind: "days", required: 1 }],
      ["Paimon's Bargains: Intertwined Fates", { unit: "month", startsOn: 1 }, { kind: "amount", target: 5, unit: "fates" }],
      ["Paimon's Bargains: Acquaint Fates", { unit: "month", startsOn: 1 }, { kind: "amount", target: 5, unit: "fates" }],
      ["Spiral Abyss", { unit: "month", startsOn: 16 }, { kind: "days", required: 1 }],
      ["Imaginarium Theater", { unit: "month", startsOn: 1 }, { kind: "days", required: 1 }],
    ]);
    expect(shape("hsr")).toEqual([
      ["Echo of War", week, { kind: "amount", target: 3, unit: "runs" }],
      ["Nameless Honor weekly EXP", week, { kind: "amount", target: 8000, unit: "EXP" }],
      ["Embers Exchange: Star Rail Special Pass", { unit: "month", startsOn: 1 }, { kind: "amount", target: 5, unit: "passes" }],
      ["Embers Exchange: Star Rail Pass", { unit: "month", startsOn: 1 }, { kind: "amount", target: 5, unit: "passes" }],
    ]);
    expect(shape("zzz")).toEqual([
      ["Ridu Weekly", week, { kind: "amount", target: 2100, unit: "points" }],
      ["Bounty Commissions", week, { kind: "amount", target: 8000, unit: "points" }],
      ["Notorious Hunt", week, { kind: "amount", target: 3, unit: "runs" }],
      ["New Eridu City Fund weekly EXP", week, { kind: "amount", target: 10000, unit: "EXP" }],
      ["Signal Shop: Encrypted Master Tapes", { unit: "month", startsOn: 1 }, { kind: "amount", target: 5, unit: "tapes" }],
      ["Signal Shop: Master Tapes", { unit: "month", startsOn: 1 }, { kind: "amount", target: 5, unit: "tapes" }],
      ["Signal Shop: Boopons", { unit: "month", startsOn: 1 }, { kind: "amount", target: 5, unit: "Boopons" }],
    ]);
    expect(shape("endfield")).toEqual([
      ["Weekly Routine", week, { kind: "amount", target: 10, unit: "points" }],
      ["Etchspace Salvage: Focus Commissions", week, { kind: "amount", target: 3, unit: "commissions" }],
    ]);
    expect(shape("wuwa")).toEqual([
      ["Weekly Challenge", week, { kind: "amount", target: 3, unit: "claims" }],
      ["Pioneer Podcast weekly EXP", week, { kind: "amount", target: 12000, unit: "EXP" }],
      ["Weekly Activities", week, { kind: "amount", target: 6000, unit: "points" }],
    ]);
    expect(shape("nte")).toEqual([
      ["Season Pass weekly EXP", week, { kind: "amount", target: 12000, unit: "EXP" }],
      ["Anomaly Pilgrimage", week, { kind: "amount", target: 3, unit: "claims" }],
      ["City Stamina", week, { kind: "amount", target: 700, unit: "stamina" }],
      ["Realm of Greed", week, { kind: "days", required: 1 }],
      ["Special City Commission", week, { kind: "days", required: 1 }],
    ]);
    expect(shape("nikki")).toEqual([
      ["Mira Journey weekly EXP", week, { kind: "amount", target: 8000, unit: "Journey EXP" }],
      ["Realm of Breakthrough", week, { kind: "amount", target: 2, unit: "trials" }],
      ["Resonance Store: Revelation Crystals", { unit: "month", startsOn: 1 }, { kind: "amount", target: 5, unit: "crystals" }],
      ["Resonance Store: Resonite Crystals", { unit: "month", startsOn: 1 }, { kind: "amount", target: 5, unit: "crystals" }],
    ]);
  });

  test("a routine has a status like any task", () => {
    const s = taskStatus({
      task: routinesFor("zzz")[0]!, region: "europe",
      now: Date.parse("2026-10-15T12:00:00Z"), logged: [],
      amounts: { "2026-10-12": { value: 900, at: "2026-10-15T12:00:00.000Z" } },
    });
    expect(s).toMatchObject({ scope: "week", count: 900, required: 2100 });
  });
});

// What is on offer with standard-banner pulls left off, the default.
const OFFERED = ROUTINES.filter((r) => r.pulls !== "standard");
const idsOf = (...games: string[]) =>
  OFFERED.filter((r) => games.includes(r.game)).map((r) => r.id);
const RIDU = "routine:zzz:ridu-weekly";

describe("which built-ins are on", () => {
  const off = { all: false };
  test("only for games the reader said yes to", () => {
    expect(activeRoutines(off, new Set()).map((r) => r.id)).toEqual([]);
    expect(activeRoutines({ all: false, on: ["zzz"] }, new Set()).map((r) => r.id)).toEqual(idsOf("zzz"));
  });

  test("one the reader made their own is hidden while the copy exists", () => {
    expect(activeRoutines({ all: false, on: ["zzz", "endfield"] }, new Set([RIDU])).map((r) => r.id))
      .toEqual(idsOf("zzz", "endfield").filter((id) => id !== RIDU));
  });

  test("one the reader stopped tracking is hidden, and nothing else moves", () => {
    // Endfield's weekly items on, one of them not: the game's own answer is
    // untouched, so the rest stay and a new built-in for it still arrives.
    const rule = { all: false, on: ["zzz", "endfield"] };
    expect(activeRoutines(rule, new Set(), new Set([RIDU])).map((r) => r.id))
      .toEqual(idsOf("zzz", "endfield").filter((id) => id !== RIDU));
    expect(shownFor(rule, "zzz")).toBe(true);
  });

  test("switched on globally, every game's — less the ones switched off", () => {
    expect(activeRoutines({ all: true }, new Set()).map((r) => r.id))
      .toEqual(OFFERED.map((r) => r.id));
    expect(activeRoutines({ all: true, off: ["zzz"] }, new Set()).map((r) => r.id))
      .toEqual(OFFERED.filter((r) => r.game !== "zzz").map((r) => r.id));
  });
});

describe("a reader's answers from before the global switch carry over", () => {
  // Nothing is migrated: `routineGames` is the built-ins' on-list as it stands,
  // and an absent `showRoutines` is the opt-in it always was.
  test("routineGames alone still means exactly those games", () => {
    const rule = routineRule({ ...defaults(), routineGames: ["zzz"] });
    expect(activeRoutines(rule, new Set()).map((r) => r.id)).toEqual(idsOf("zzz"));
  });

  test("an install that never answered gets none", () => {
    expect(activeRoutines(routineRule(defaults()), new Set())).toEqual([]);
  });

  test("showRoutines and routinesOff are read", () => {
    const rule = routineRule({ ...defaults(), showRoutines: true, routinesOff: ["zzz"] });
    expect(activeRoutines(rule, new Set()).map((r) => r.id))
      .toEqual(OFFERED.filter((r) => r.game !== "zzz").map((r) => r.id));
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
    // Arknights has none, so the first game asked about is the next one.
    expect(routineToAsk(["arknights", "zzz", "endfield"], off, undefined, false)).toBe("zzz");
    expect(routineToAsk(["arknights", "zzz", "endfield"], off, ["zzz"], false)).toBe("endfield");
    expect(routineToAsk(["zzz"], { all: false, on: ["zzz"] }, undefined, false)).toBeNull();
    expect(routineToAsk(["arknights"], off, undefined, false)).toBeNull();
    expect(routineToAsk(["genshin"], off, undefined, false)).toBe("genshin");
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

describe("tracking one built-in, or not", () => {
  test("stopping adds its id once; tracking again removes it; the list is absent when empty", () => {
    expect(hiddenAfter(undefined, "routine:zzz:ridu-weekly", false)).toEqual(["routine:zzz:ridu-weekly"]);
    expect(hiddenAfter(["routine:zzz:ridu-weekly"], "routine:zzz:ridu-weekly", false))
      .toEqual(["routine:zzz:ridu-weekly"]);
    expect(hiddenAfter(["routine:zzz:ridu-weekly", "routine:x:y"], "routine:zzz:ridu-weekly", true))
      .toEqual(["routine:x:y"]);
    expect(hiddenAfter(["routine:zzz:ridu-weekly"], "routine:zzz:ridu-weekly", true)).toBeUndefined();
  });

  test("the pref survives a restore, and junk in it is dropped", () => {
    expect(restorePrefsValue({ routinesHidden: ["routine:zzz:ridu-weekly", 4] }).routinesHidden)
      .toEqual(["routine:zzz:ridu-weekly"]);
    expect(restorePrefsValue({ routinesHidden: "routine:zzz:ridu-weekly" }).routinesHidden).toBeUndefined();
    expect(restorePrefsValue({}).routinesHidden).toBeUndefined();
  });
});

describe("standard-banner pulls", () => {
  const standard = ROUTINES.filter((r) => r.pulls === "standard");

  test("each shop's standard line sits beside its premium one, on the same reset", () => {
    // The switch adds a second line to a shop the reader already tracks; a
    // standard line with no premium twin would arrive alone.
    expect(standard.length).toBeGreaterThan(0);
    for (const r of standard) {
      const twin = ROUTINES.find(
        (p) => p.game === r.game && p.pulls === "premium" && JSON.stringify(p.period) === JSON.stringify(r.period),
      );
      expect(twin).toBeDefined();
    }
  });

  test("are left out unless the reader asks for them", () => {
    const all = { all: true, on: undefined, off: undefined };
    const ids = (on: boolean) => activeRoutines(all, new Set(), new Set(), on).map((r) => r.id);
    for (const r of standard) {
      expect(ids(false)).not.toContain(r.id);
      expect(ids(true)).toContain(r.id);
    }
    // Everything else is the same either way.
    expect(ids(true).filter((id) => !standard.some((r) => r.id === id))).toEqual(ids(false));
    expect(offered(standard[0]!, false)).toBe(false);
    expect(offered(standard[0]!, true)).toBe(true);
    expect(offered(routinesFor("zzz")[0]!, false)).toBe(true);
  });

  test("the switch survives a restore, and junk in it is dropped", () => {
    expect(restorePrefsValue({ standardPulls: true }).standardPulls).toBe(true);
    expect(restorePrefsValue({ standardPulls: "yes" }).standardPulls).toBeUndefined();
    expect(restorePrefsValue({}).standardPulls).toBeUndefined();
  });
});

describe("tracking a built-in from the strip", () => {
  const ridu = routinesFor("zzz")[0]!;

  test("stopping hides that one and leaves the game's answer alone", () => {
    const p = { ...defaults(), routineGames: ["zzz"] };
    expect(trackRoutinePatch(p, ridu, false)).toEqual({ routinesHidden: [ridu.id] });
  });

  test("tracking one of a game that is on just unhides it", () => {
    const p = { ...defaults(), routineGames: ["zzz"], routinesHidden: [ridu.id] };
    expect(trackRoutinePatch(p, ridu, true)).toEqual({ routinesHidden: undefined });
  });

  test("tracking one of a game that is off turns the game on with only that one", () => {
    // The reader asked for one item, not the game's whole list: its siblings
    // arrive hidden, and the game counts as asked so the strip does not ask again.
    const p = { ...defaults(), showRoutines: false };
    const patch = trackRoutinePatch(p, ridu, true);
    const after = { ...p, ...patch };
    const shown = activeRoutines(routineRule(after), new Set(), new Set(after.routinesHidden ?? []));
    expect(shown.map((r) => r.id)).toEqual([ridu.id]);
    expect(after.routinesAsked).toContain("zzz");
  });
});

describe("making a built-in your own", () => {
  test("copies its shape and remembers where it came from", () => {
    const ridu = routinesFor("zzz")[0]!;
    expect(mineFrom(ridu)).toEqual({
      game: "zzz", title: "Ridu Weekly", period: { unit: "week", startsOn: 1 },
      measure: { kind: "amount", target: 2100, unit: "points" }, from: "routine:zzz:ridu-weekly",
    });
  });

  test("leaves a server clock behind: a reader's task has none", () => {
    const ridu = routinesFor("zzz")[0]!;
    expect("clock" in mineFrom({ ...ridu, clock: "asia" })).toBe(false);
  });
});

describe("a built-in on one server's clock", () => {
  test("only a cycle has one", () => {
    for (const r of ROUTINES) if (r.clock !== undefined) expect(r.period.unit).toBe("cycle");
  });

  test("the schema reads it as a server", () => {
    const ridu = routinesFor("zzz")[0]!;
    expect(RoutineSchema.safeParse({ ...ridu, clock: "asia" }).success).toBe(true);
    expect(RoutineSchema.safeParse({ ...ridu, clock: "mars" }).success).toBe(false);
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
