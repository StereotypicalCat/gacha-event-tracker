import { describe, expect, test } from "bun:test";
import { RESERVED_ID_SEGMENTS } from "../src/shared/custom.ts";
import { nextResetMs } from "../src/shared/daily.ts";
import { goalCount } from "../src/shared/goal.ts";
import { mintTaskId, TaskSchema, taskCaption, taskStatus, type Task } from "../src/shared/task.ts";

/**
 * A reader's own weekly and monthly chores: ZZZ's weekly activity points,
 * Endfield's weekly routine. Not events — no window, no end, no status — just a
 * period that rolls on the game's reset and a measure that fills it.
 */

const AT = "2026-10-01T00:00:00.000Z";
const noon = (key: string) => Date.parse(`${key}T12:00:00Z`);
const task = (over: Partial<Task>): Task => ({
  id: "mytask:abc123def4",
  game: "zzz",
  title: "Activity points",
  period: { unit: "week", startsOn: 1 },
  measure: { kind: "amount", target: 2100, unit: "points" },
  at: AT,
  updatedAt: AT,
  ...over,
});

describe("task ids", () => {
  test("live in their own reserved space", () => {
    expect(mintTaskId(() => 0.5)).toMatch(/^mytask:[a-z0-9]{10}$/);
    expect(RESERVED_ID_SEGMENTS).toContain("mytask");
    expect(RESERVED_ID_SEGMENTS).toContain("routine");
  });
});

describe("TaskSchema", () => {
  test("accepts both measures and both periods", () => {
    expect(TaskSchema.safeParse(task({})).success).toBe(true);
    expect(
      TaskSchema.safeParse(
        task({ period: { unit: "month", startsOn: 31 }, measure: { kind: "days", required: 1 } }),
      ).success,
    ).toBe(true);
  });

  test("refuses a blank title, a zero target and a game-less task", () => {
    expect(TaskSchema.safeParse(task({ title: "  " })).success).toBe(false);
    expect(
      TaskSchema.safeParse(task({ measure: { kind: "amount", target: 0 } })).success,
    ).toBe(false);
    expect(TaskSchema.safeParse(task({ game: "" })).success).toBe(false);
  });

  test("game is any lane, not just a tracked game", () => {
    expect(TaskSchema.safeParse(task({ game: "mygame:limbus-company" })).success).toBe(true);
  });
});

describe("taskStatus", () => {
  const amounts = {
    "2026-10-05": { value: 2100, at: AT },
    "2026-10-12": { value: 1900, at: AT },
  };

  test("a weekly amount reads this week's value", () => {
    const s = taskStatus({
      task: task({}), region: "europe", now: noon("2026-10-15"), logged: [], amounts,
    });
    expect(s).toMatchObject({
      scope: "week", measure: "amount", periodStart: "2026-10-12",
      count: 1900, required: 2100, met: false, needed: 200,
    });
  });

  test("the week rolls at the game's reset in the reader's region", () => {
    const reset = nextResetMs(Date.parse("2026-10-18T12:00:00Z"), "europe", "zzz");
    const before = taskStatus({ task: task({}), region: "europe", now: reset - 1, logged: [], amounts });
    const after = taskStatus({ task: task({}), region: "europe", now: reset, logged: [], amounts });
    expect(before.periodStart).toBe("2026-10-12");
    expect(after.periodStart).toBe("2026-10-19");
    expect(after.count).toBe(0);
  });

  test("a weekly tick task is done once any day this week is ticked", () => {
    const t = task({ measure: { kind: "days", required: 1 } });
    const s = taskStatus({
      task: t, region: "europe", now: noon("2026-10-15"), logged: ["2026-10-13"],
    });
    expect(s).toMatchObject({ measure: "days", count: 1, met: true });
    const lastWeek = taskStatus({
      task: t, region: "europe", now: noon("2026-10-15"), logged: ["2026-10-11"],
    });
    expect(lastWeek.met).toBe(false);
  });

  test("a monthly task from the 31st keys a 30-day month by its last day", () => {
    const t = task({ period: { unit: "month", startsOn: 31 } });
    const s = taskStatus({
      task: t, region: "europe", now: noon("2026-10-05"), logged: [],
      amounts: { "2026-09-30": { value: 50, at: AT } },
    });
    expect(s).toMatchObject({ scope: "month", periodStart: "2026-09-30", count: 50 });
  });

  test("a days count never asks for more days than the period has", () => {
    const t = task({
      period: { unit: "month", startsOn: 1 },
      measure: { kind: "days", required: 31 },
    });
    const s = taskStatus({ task: t, region: "europe", now: noon("2026-02-10"), logged: [] });
    expect(s.required).toBe(28);
  });
});

describe("taskCaption", () => {
  test("says when it rolls and what it wants", () => {
    expect(taskCaption(task({}))).toBe("every week from Monday · reach 2,100 points");
    expect(
      taskCaption(
        task({ period: { unit: "month", startsOn: 1 }, measure: { kind: "days", required: 1 } }),
      ),
    ).toBe("every month from the 1st · tick it off");
    expect(
      taskCaption(
        task({ period: { unit: "month", startsOn: 22 }, measure: { kind: "days", required: 3 } }),
      ),
    ).toBe("every month from the 22nd · 3 days");
  });
});

describe("a task on a cycle", () => {
  test("its status is by its cycle, and its caption names the start", () => {
    const t = task({
      period: { unit: "cycle", days: 14, from: "2026-10-16" },
      measure: { kind: "days", required: 5 },
    });
    expect(TaskSchema.safeParse(t).success).toBe(true);
    expect(taskCaption(t)).toBe("every 14 days from 16 Oct 2026 · 5 days");
    const s = taskStatus({
      task: t, region: "europe", now: noon("2026-10-20"),
      logged: ["2026-10-15", "2026-10-16", "2026-10-18"],
    });
    expect(s).toMatchObject({ scope: "cycle", periodStart: "2026-10-16", count: 2, required: 5, open: 10 });
  });

  test("a short cycle never asks for more days than it holds", () => {
    const t = task({
      period: { unit: "cycle", days: 3, from: "2026-10-16" },
      measure: { kind: "days", required: 5 },
    });
    expect(taskStatus({ task: t, region: "europe", now: noon("2026-10-16"), logged: [] }).required).toBe(3);
  });
});

describe("a task on another server's clock", () => {
  // NTE's Asia server rolls at 05:00 UTC+8, 21:00 UTC; its Europe server at 03:00 UTC.
  const t = {
    game: "nte",
    period: { unit: "cycle" as const, days: 14, from: "2026-10-22" },
    measure: { kind: "days" as const, required: 1 },
    clock: "asia" as const,
  };

  test("its cycle rolls at that server's reset for a reader on another", () => {
    const before = taskStatus({ task: t, region: "europe", now: Date.parse("2026-10-21T20:59:00Z"), logged: [] });
    const after = taskStatus({ task: t, region: "europe", now: Date.parse("2026-10-21T21:01:00Z"), logged: [] });
    expect(before.periodStart).toBe("2026-10-08");
    expect(after.periodStart).toBe("2026-10-22");
  });

  test("without one, it rolls on the reader's own reset", () => {
    const { clock: _, ...own } = t;
    const after = taskStatus({ task: own, region: "europe", now: Date.parse("2026-10-21T21:01:00Z"), logged: [] });
    expect(after.periodStart).toBe("2026-10-08");
  });
});

describe("a cycle chip's days left", () => {
  test("is the days left in the cycle, ticked or not", () => {
    const t = task({ period: { unit: "cycle", days: 14, from: "2026-10-16" }, measure: { kind: "days", required: 1 } });
    const at = (logged: string[], day: string) =>
      goalCount(taskStatus({ task: t, region: "europe", now: noon(day), logged }));
    expect(at([], "2026-10-20")).toBe("0/1 · 10d");
    expect(at(["2026-10-20"], "2026-10-20")).toBe("1/1 · 10d");
    expect(at(["2026-10-29"], "2026-10-29")).toBe("1/1 · 1d");
  });
});
