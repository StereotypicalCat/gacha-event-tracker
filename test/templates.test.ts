import { describe, expect, test } from "bun:test";
import { EVENT_TEMPLATES, TASK_TEMPLATES } from "../src/shared/templates.ts";

// An example shapes a form; it never states a fact about a game. These pin
// that bar on the data itself, so a new example cannot slip a date or a
// figure in under the label of a shape.
describe("the examples", () => {
  test("ids are unique within each list", () => {
    for (const list of [EVENT_TEMPLATES, TASK_TEMPLATES]) {
      const ids = list.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  test("an event example sets only the shape", () => {
    for (const t of EVENT_TEMPLATES) {
      expect(Object.keys(t.sets).sort()).toEqual(["cadence", "endKnown", "repeatMode", "type"]);
    }
  });

  test("a task example sets only the shape, and never a target", () => {
    const shape = new Set(["unit", "kind", "required", "amountUnit"]);
    for (const t of TASK_TEMPLATES) {
      for (const key of Object.keys(t.sets)) expect(shape.has(key)).toBe(true);
    }
  });

  test("a day count is set only to say 'once', or to empty the field", () => {
    const set = TASK_TEMPLATES.filter((t) => t.sets.required !== undefined).map((t) => [
      t.id,
      t.sets.required,
    ]);
    expect(set).toEqual([
      ["few-days", ""],
      ["monthly-shop", "1"],
    ]);
  });

  test("every example names itself, explains what is left, and offers a placeholder", () => {
    for (const t of [...EVENT_TEMPLATES, ...TASK_TEMPLATES]) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.hint.startsWith("Fill in")).toBe(true);
      expect(t.placeholder.length).toBeGreaterThan(0);
    }
  });
});
