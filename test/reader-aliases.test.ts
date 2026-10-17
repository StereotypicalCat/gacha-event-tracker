import { expect, test } from "bun:test";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";
import { applyReaderAliases } from "../src/client/state/reader/aliases.ts";
const at = "2026-10-16T12:00:00.000Z";
test("retired and merged event ids carry progress and ticks in every account/revision", () => {
  const s = migrateLegacy({}, ["genshin"], at, () => "account:one");
  s.data["account:one"]!.progress.old = { status: "done", at };
  s.data["account:one"]!.daily.initial = { old: { days: ["2026-10-16"], at } };
  const next = applyReaderAliases(s, { old: "new" });
  expect(next.data["account:one"]?.progress.new).toHaveProperty(
    "status",
    "done",
  );
  expect(next.data["account:one"]?.progress.old).toBeUndefined();
  expect(next.data["account:one"]?.daily.initial?.new).toHaveProperty("days", [
    "2026-10-16",
  ]);
  expect(applyReaderAliases(next, { old: "new" })).toBe(next);
});
test("aliases carry amount history and durable event snapshots", () => {
  const s = migrateLegacy({}, ["genshin"], at, () => "account:one");
  s.data["account:one"]!.amounts.initial = {
    old: { "2026-10-16": { value: 7, at } },
  };
  const next = applyReaderAliases(s, { old: "new" });
  expect(next.data["account:one"]?.amounts.initial?.new).toHaveProperty(
    "2026-10-16",
    { value: 7, at },
  );
  expect(next.data["account:one"]?.amounts.initial?.old).toBeUndefined();
});
