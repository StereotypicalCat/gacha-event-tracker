import { describe, expect, test } from "bun:test";
import {
  clampRequired,
  goalCaption,
  goalCount,
  goalLabel,
  goalStatus,
  readGoal,
  type Goal,
  type GoalStatus,
} from "../src/shared/goal.ts";

/**
 * Check-in goals: N distinct game-days per week or across an event, rather than
 * every day. The owner's case is Genshin's “To Temper Thyself and Journey
 * Far” — five of seven, weeks from Monday — and these dates are that event's.
 */

// Genshin, Europe: the day rolls at 03:00Z. Noon is safely inside a game-day.
const noon = (key: string) => Date.parse(`${key}T12:00:00Z`);
const START = Date.parse("2026-08-10T03:00:00Z"); // Monday's reset
const END = Date.parse("2026-11-02T03:00:00Z"); // twelve weeks later
const weekly: Goal = { period: "week", measure: "days", required: 5, weekStartsOn: 1 };
const base = { startsMs: START, endsMs: END, region: "europe" as const, game: "genshin" };

describe("readGoal", () => {
  test("reads a valid goal", () => {
    expect(readGoal(weekly)).toEqual(weekly);
  });

  test("absent, malformed or future-shaped is undefined, and never throws", () => {
    expect(readGoal(undefined)).toBeUndefined();
    expect(readGoal({ period: "week", required: 9 })).toBeUndefined();
    expect(
      readGoal({ period: "week", measure: "amount", target: 2100, weekStartsOn: 1 }),
    ).toBeUndefined();
    expect(readGoal("five")).toBeUndefined();
  });
});

describe("goalStatus: each week", () => {
  test("three distinct ticks this week read 3 of 5", () => {
    const s = goalStatus({
      ...base, goal: weekly, now: noon("2026-10-15"),
      logged: ["2026-10-12", "2026-10-13", "2026-10-15"],
    });
    expect(s).toMatchObject({ scope: "week", count: 3, required: 5, met: false, needed: 2 });
    // Today (Thu) is ticked; Fri, Sat and Sun remain.
    expect(s.open).toBe(3);
    expect(s.shortfall).toBe(false);
  });

  test("five non-consecutive days meet the week", () => {
    const s = goalStatus({
      ...base, goal: weekly, now: noon("2026-10-18"),
      logged: ["2026-10-12", "2026-10-14", "2026-10-15", "2026-10-17", "2026-10-18"],
    });
    expect(s.met).toBe(true);
    expect(s.needed).toBe(0);
  });

  test("last week's ticks and backfills never count toward this week", () => {
    const s = goalStatus({
      ...base, goal: weekly, now: noon("2026-10-19"),
      logged: ["2026-10-12", "2026-10-14", "2026-10-15", "2026-10-17", "2026-10-18"],
    });
    expect(s.count).toBe(0);
    expect(s.met).toBe(false);
  });

  test("a future tick never counts", () => {
    const s = goalStatus({
      ...base, goal: weekly, now: noon("2026-10-13"),
      logged: ["2026-10-12", "2026-10-16"],
    });
    expect(s.count).toBe(1);
  });

  test("removing a tick below target unmeets the week", () => {
    const five = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"];
    const now = noon("2026-10-16");
    expect(goalStatus({ ...base, goal: weekly, now, logged: five }).met).toBe(true);
    expect(goalStatus({ ...base, goal: weekly, now, logged: five.slice(1) }).met).toBe(false);
  });

  test("a short last week keeps its target and reports the shortfall", () => {
    // An event ending Thursday 29 Oct at reset: its last week is Mon–Wed.
    const s = goalStatus({
      ...base, endsMs: Date.parse("2026-10-29T03:00:00Z"), goal: weekly,
      now: noon("2026-10-27"), logged: ["2026-10-26"],
    });
    expect(s.required).toBe(5);
    expect(s.needed).toBe(4);
    expect(s.open).toBe(2); // Tue 27 and Wed 28
    expect(s.shortfall).toBe(true);
  });

  test("the first week is cut at the event start, not padded", () => {
    // An event opening on Thursday: Mon–Wed were never claimable.
    const s = goalStatus({
      ...base, startsMs: Date.parse("2026-10-15T03:00:00Z"), goal: weekly,
      now: noon("2026-10-15"), logged: ["2026-10-12", "2026-10-15"],
    });
    expect(s.count).toBe(1); // the Monday tick predates the event
    expect(s.open).toBe(3); // Fri, Sat, Sun
    expect(s.shortfall).toBe(true);
  });

  test("an unknown end still has this week's boundary", () => {
    const s = goalStatus({
      ...base, endsMs: null, goal: weekly, now: noon("2026-10-15"), logged: [],
    });
    expect(s.open).toBe(4);
  });

  test("before the event starts, nothing counts and nothing is negative", () => {
    const s = goalStatus({
      ...base, goal: weekly, now: noon("2026-08-05"), logged: ["2026-08-05"],
    });
    expect(s.count).toBe(0);
    expect(s.needed).toBe(5);
  });
});

describe("goalStatus: across the event", () => {
  const seven = {
    ...base,
    startsMs: Date.parse("2026-10-12T03:00:00Z"),
    endsMs: Date.parse("2026-10-19T03:00:00Z"),
  };
  const total: Goal = { period: "event", measure: "days", required: 5 };

  test("reaches its target on the fifth recorded day", () => {
    const logged = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"];
    expect(goalStatus({ ...seven, goal: total, now: noon("2026-10-15"), logged }).met).toBe(
      false,
    );
    const s = goalStatus({
      ...seven, goal: total, now: noon("2026-10-16"), logged: [...logged, "2026-10-16"],
    });
    expect(s).toMatchObject({ scope: "event", count: 5, met: true });
  });

  test("an unknown end counts ticks but cannot say how many days are left", () => {
    const s = goalStatus({
      ...seven, endsMs: null, goal: total, now: noon("2026-10-14"),
      logged: ["2026-10-12", "2026-10-14", "2026-10-20"],
    });
    expect(s.count).toBe(2);
    expect(s.open).toBeNull();
    expect(s.shortfall).toBe(false);
  });

  test("a tick outside the window does not count", () => {
    const s = goalStatus({
      ...seven, goal: total, now: noon("2026-10-14"), logged: ["2026-10-11", "2026-10-13"],
    });
    expect(s.count).toBe(1);
  });
});

describe("copy", () => {
  const status = (over: Partial<GoalStatus>): GoalStatus => ({
    scope: "week", required: 5, count: 3, met: false, needed: 2,
    open: 4, shortfall: false, ...over,
  });

  test("captions", () => {
    expect(goalCaption(status({}))).toBe("3 of 5 this week · 2 needed · 4 days left this week");
    expect(goalCaption(status({ open: 1, shortfall: true }))).toBe(
      "3 of 5 this week · 2 needed, 1 day left this week",
    );
    expect(goalCaption(status({ count: 5, met: true, needed: 0 }))).toBe(
      "5 of 5 · Done this week",
    );
    expect(goalCaption(status({ scope: "event", open: 9 }))).toBe(
      "3 of 5 · 2 needed · 9 days left",
    );
    expect(goalCaption(status({ scope: "event", open: null }))).toBe("3 of 5 · 2 needed");
    expect(goalCaption(status({ scope: "event", count: 5, met: true, needed: 0 }))).toBe(
      "5 of 5 · Goal reached",
    );
  });

  test("chip count and spoken state", () => {
    expect(goalCount(status({}))).toBe("3/5 wk");
    expect(goalCount(status({ scope: "event" }))).toBe("3/5");
    expect(goalLabel(status({}))).toBe("3 of 5 this week");
    expect(goalLabel(status({ met: true }))).toBe("done this week");
    expect(goalLabel(status({ scope: "event", met: true }))).toBe("goal reached");
    expect(goalLabel(status({ scope: "event" }))).toBe("3 of 5");
  });
});

describe("clampRequired", () => {
  test("weekly is 1–7; event-wide is capped by the known days", () => {
    expect(clampRequired("week", 9, null)).toBe(7);
    expect(clampRequired("week", 0, null)).toBe(1);
    expect(clampRequired("event", 30, 14)).toBe(14);
    expect(clampRequired("event", 30, null)).toBe(30);
    expect(clampRequired("event", Number.NaN, 14)).toBe(1);
  });
});
