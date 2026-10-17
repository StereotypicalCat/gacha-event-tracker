import { expect, test } from "bun:test";
import { periodOf } from "../src/shared/period.ts";
import { TaskSchema, taskCaption } from "../src/shared/task.ts";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";
import { routineRows } from "../src/client/state/reader/routines.ts";
import { readerDayKey } from "../src/shared/readerClock.ts";

const base = {
  id: "mytask:abcdef1234",
  game: "genshin",
  title: "Log in",
  measure: { kind: "days", required: 1 },
  at: "2026-10-16T00:00:00.000Z",
  updatedAt: "2026-10-16T00:00:00.000Z",
} as const;

test("a daily period is the one game-day", () => {
  expect(periodOf({ unit: "day" }, "2026-10-17")).toEqual({
    start: "2026-10-17",
    days: ["2026-10-17"],
  });
  expect(taskCaption({ period: { unit: "day" }, measure: base.measure })).toBe(
    "every day · tick it off",
  );
});

test("own routines keep a reset hour, a note and a web link, and nothing else", () => {
  const ok = TaskSchema.safeParse({
    ...base,
    period: { unit: "day" },
    resetHour: 20,
    note: "Bring a healer",
    link: "https://example.com/guide",
  });
  expect(ok.success).toBe(true);
  for (const bad of [
    { link: "javascript:alert(1)" },
    { link: "ftp://example.com" },
    { resetHour: 24 },
    { resetHour: 1.5 },
  ])
    expect(
      TaskSchema.safeParse({ ...base, period: { unit: "day" }, ...bad })
        .success,
    ).toBe(false);
  // Older records, without the new fields, still parse.
  expect(
    TaskSchema.safeParse({ ...base, period: { unit: "week", startsOn: 1 } })
      .success,
  ).toBe(true);
});

test("a custom reset hour moves only that routine's day boundary", () => {
  const at = "2026-10-16T12:00:00.000Z";
  const s = migrateLegacy({}, ["genshin"], at, () => "account:one");
  s.tasks[base.id] = { ...base, period: { unit: "day" }, resetHour: 20 };
  // 10:00 UTC on the 16th is 11:00 in Europe's server time (UTC+1): the
  // game's 04:00 reset has opened the 16th, but a 20:00 routine's day labelled
  // the 16th has not begun yet.
  const now = Date.parse("2026-10-16T10:00:00.000Z");
  const rows = routineRows(s, "account:one", now);
  const own = rows.find((r) => r.id === base.id)!;
  const daily = rows.find((r) => r.id === "dailies:genshin")!;
  expect(own.cadence).toBe("day");
  expect(own.clock.resetHour).toBe(20);
  expect(own.clock.revision).toBe(daily.clock.revision);
  expect(readerDayKey(now, daily.clock)).toBe("2026-10-16");
  expect(readerDayKey(now, own.clock)).toBe("2026-10-15");
});
