import { describe, expect, test } from "bun:test";
import { mergeAmounts, readableAmounts } from "../src/client/state/useAmounts.ts";
import { mergeTasks, visibleTasks } from "../src/client/state/useTasks.ts";

/**
 * The two stores weekly and monthly tasks add. Both are the only copy of what
 * they hold, so the rules are the repo's usual ones: nothing is dropped on
 * load, and an import merges without ever removing or rolling back.
 */

const task = (id: string, title: string, updatedAt: string, game = "zzz") => ({
  id, game, title,
  period: { unit: "week", startsOn: 1 },
  measure: { kind: "days", required: 1 },
  at: "2026-10-01T00:00:00.000Z",
  updatedAt,
});
const A = "mytask:aaaaaa1111";
const B = "mytask:bbbbbb2222";
// A shape no version of this build understands: a later version's task.
const FUTURE = { ...task("mytask:cccccc3333", "Later", "2026-10-02T00:00:00.000Z"), measure: { kind: "streak", n: 3 } };

describe("tasks", () => {
  test("an unreadable stored task is hidden, never dropped", () => {
    const raw = { [A]: task(A, "Weekly", "2026-10-02T00:00:00.000Z"), [FUTURE.id]: FUTURE };
    expect(visibleTasks(raw).map((t) => t.id)).toEqual([A]);
    const merged = mergeTasks(raw, {});
    expect(merged[FUTURE.id]).toEqual(FUTURE);
  });

  test("import keeps both sides and the later edit wins, either direction", () => {
    const device = { [A]: task(A, "New name", "2026-10-05T00:00:00.000Z") };
    const file = {
      [A]: task(A, "Old name", "2026-10-03T00:00:00.000Z"),
      [B]: task(B, "Monthly", "2026-10-03T00:00:00.000Z"),
    };
    const merged = mergeTasks(device, file);
    expect(Object.keys(merged).sort()).toEqual([A, B]);
    expect((merged[A] as { title: string }).title).toBe("New name");
    expect((mergeTasks(file, device)[A] as { title: string }).title).toBe("New name");
  });

  test("a malformed incoming task is skipped, not let in", () => {
    const merged = mergeTasks({}, { [A]: { id: A, title: 7 }, junk: "x" });
    expect(merged).toEqual({});
    expect(mergeTasks({}, "not an object")).toEqual({});
  });

  test("visible tasks are ordered by game, then title", () => {
    const raw = {
      [A]: task(A, "b", "2026-10-02T00:00:00.000Z", "zzz"),
      [B]: task(B, "a", "2026-10-02T00:00:00.000Z", "endfield"),
    };
    expect(visibleTasks(raw).map((t) => t.title)).toEqual(["a", "b"]);
  });
});

describe("amounts", () => {
  const value = (m: Record<string, Record<string, unknown>>, key: string, period: string) =>
    readableAmounts(m[key])[period]?.value;
  const T1 = "2026-10-14T00:00:00.000Z";
  const T2 = "2026-10-15T00:00:00.000Z";

  test("an older backup cannot roll back a newer week", () => {
    const device = { [A]: { "2026-10-12": { value: 1900, at: T2 } } };
    const file = { [A]: { "2026-10-12": { value: 800, at: T1 } } };
    expect(value(mergeAmounts(device, file), A, "2026-10-12")).toBe(1900);
    expect(value(mergeAmounts(file, device), A, "2026-10-12")).toBe(1900);
  });

  test("a period only one side has survives", () => {
    const device = { [A]: { "2026-10-12": { value: 1900, at: T2 } } };
    const file = { [A]: { "2026-10-05": { value: 2100, at: T1 } }, [B]: { "2026-10-01": { value: 3, at: T1 } } };
    const merged = mergeAmounts(device, file);
    expect(Object.keys(merged[A]!).sort()).toEqual(["2026-10-05", "2026-10-12"]);
    expect(value(merged, B, "2026-10-01")).toBe(3);
  });

  test("a malformed stored entry is kept on disk and skipped when read", () => {
    const stored = { [A]: { "2026-10-12": { value: "lots", at: T1 }, "2026-10-05": { value: 5, at: T1 } } };
    const merged = mergeAmounts(stored, {});
    expect(merged[A]!["2026-10-12"]).toEqual({ value: "lots", at: T1 });
    expect(readableAmounts(merged[A])).toEqual({ "2026-10-05": { value: 5, at: T1 } });
  });

  test("non-numbers and bad shapes are skipped", () => {
    const merged = mergeAmounts({}, {
      [A]: { "2026-10-12": { value: "1900", at: T1 }, "2026-10-05": { value: Number.NaN, at: T1 } },
      [B]: "nope",
    });
    expect(merged).toEqual({});
  });
});
