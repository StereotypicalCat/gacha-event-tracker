import { describe, expect, test } from "bun:test";
import { ROUTINES, RoutineSchema, routinesFor } from "../src/shared/routines.ts";
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
