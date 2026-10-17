import { resolveReaderClock } from "../src/shared/readerClock.ts";
import { expect, test } from "bun:test";
import { mergeReaderData } from "../src/client/state/reader/import.ts";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";
const at = "2026-10-16T12:00:00.000Z";
test("progress import merges by game/server and preserves local preferences and unknown fields", () => {
  const a = migrateLegacy({}, ["genshin"], at, () => "account:local"),
    b = migrateLegacy({}, ["genshin"], at, () => "account:imported");
  a.prefs.interface = "structured";
  a.data["account:local"]!.progress.event = {
    note: "mine",
    at: "2026-10-15T12:00:00.000Z",
    future: 42,
  };
  b.data["account:imported"]!.progress.event = { status: "done", at };
  const merged = mergeReaderData(a, b);
  expect(merged.prefs.interface).toBe("structured");
  expect(Object.keys(merged.accounts)).toEqual(["account:local"]);
  expect(merged.data["account:local"]?.progress.event).toMatchObject({
    status: "done",
    note: "mine",
    future: 42,
  });
});
test("import allocates distinct revision ids and prefers updated custom edits", () => {
  const a = migrateLegacy({}, ["genshin"], at, () => "account:local");
  const b = migrateLegacy({}, ["genshin"], at, () => "account:imported");
  b.accounts["account:imported"]!.clocks.push(
    {
      ...b.accounts["account:imported"]!.clocks[0]!,
      id: "initial-import",
      reset: { hour: 5, minute: 0 },
    },
    {
      ...b.accounts["account:imported"]!.clocks[0]!,
      id: "initial",
      reset: { hour: 6, minute: 0 },
    },
  );
  a.tasks.task = { at, updatedAt: "2026-10-16T13:00:00.000Z", title: "older" };
  b.tasks.task = { at, updatedAt: "2026-10-16T14:00:00.000Z", title: "newer" };
  const merged = mergeReaderData(a, b);
  const ids = merged.accounts["account:local"]!.clocks.map((c) => c.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(merged.tasks.task).toMatchObject({ title: "newer" });
});
test("progress import retains imported history without replacing the local reset", () => {
  const a = migrateLegacy({}, ["genshin"], at, () => "account:local");
  const b = migrateLegacy({}, ["genshin"], at, () => "account:imported");
  b.accounts["account:imported"]!.clocks.push({
    ...b.accounts["account:imported"]!.clocks[0]!,
    id: "custom",
    effectiveAt: at,
    reset: { hour: 9, minute: 0 },
  });
  const merged = mergeReaderData(a, b);
  expect(
    resolveReaderClock(merged.accounts["account:local"]!, Date.parse(at))
      .resetHour,
  ).toBe(4);
  expect(
    merged.accounts["account:local"]!.clocks.some((c) => c.id === "custom"),
  ).toBe(true);
});
test("repeated progress imports keep clocks and opaque extension history idempotent", () => {
  const a = migrateLegacy({}, ["genshin"], at, () => "account:local"),
    b = migrateLegacy({}, ["genshin"], at, () => "account:remote");
  b.accounts["account:remote"]!.clocks.push({
    ...b.accounts["account:remote"]!.clocks[0]!,
    id: "override",
    reset: { hour: 9, minute: 0 },
  });
  b.accounts["account:remote"]!.futureAccount = { opaque: 42 };
  const once = mergeReaderData(a, b),
    twice = mergeReaderData(once, b);
  expect(twice.accounts["account:local"]!.clocks.length).toBe(
    once.accounts["account:local"]!.clocks.length,
  );
  const third = mergeReaderData(
    migrateLegacy({}, ["genshin"], at, () => "account:third"),
    once,
  );
  expect(JSON.stringify(third.importedExtensions)).toContain('"opaque":42');
});
