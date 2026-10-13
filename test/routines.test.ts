import { describe, expect, test } from "bun:test";
import {
  activeRoutines,
  ROUTINES,
  RoutineSchema,
  routinesFor,
  routineToAsk,
} from "../src/shared/routines.ts";
import { restorePrefsValue } from "../src/client/state/usePrefs.ts";
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
  test("only for games the reader said yes to", () => {
    expect(activeRoutines(undefined, new Set()).map((r) => r.id)).toEqual([]);
    expect(activeRoutines(["zzz"], new Set()).map((r) => r.id)).toEqual(["routine:zzz:ridu-weekly"]);
  });

  test("one the reader made their own is hidden while the copy exists", () => {
    expect(activeRoutines(["zzz", "endfield"], new Set(["routine:zzz:ridu-weekly"])).map((r) => r.id))
      .toEqual(["routine:endfield:weekly-routine"]);
  });
});

describe("which game to ask about", () => {
  test("the first game on screen with built-ins, not asked and not on", () => {
    expect(routineToAsk(["genshin", "zzz", "endfield"], undefined, undefined)).toBe("zzz");
    expect(routineToAsk(["genshin", "zzz", "endfield"], undefined, ["zzz"])).toBe("endfield");
    expect(routineToAsk(["zzz"], ["zzz"], undefined)).toBeNull();
    expect(routineToAsk(["genshin"], undefined, undefined)).toBeNull();
  });
});

describe("restoring prefs with the new fields", () => {
  test("junk in the arrays is sanitised, and absent stays absent", () => {
    const r = restorePrefsValue({ routineGames: ["zzz", 7], routinesAsked: "zzz" });
    expect(r.routineGames).toEqual(["zzz"]);
    expect(r.routinesAsked).toBeUndefined();
    expect(restorePrefsValue({}).routineGames).toBeUndefined();
  });
});
