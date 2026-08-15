import { describe, expect, test } from "bun:test";
import { compareRows, type Activity } from "../src/client/state/sort.ts";
import { DAY, type EventClock } from "../src/shared/time.ts";

const NOW = Date.parse("2026-08-15T12:00:00Z");

function row(id: string, msRemaining: number | null, upcoming = false) {
  const clock: EventClock = {
    startsMs: upcoming ? NOW + DAY : NOW - DAY,
    endsMs: msRemaining === null ? null : NOW + msRemaining,
    msRemaining,
    progress: 0.5,
    urgency: "near",
    live: !upcoming,
    upcoming,
    ended: false,
  };
  return { event: { id }, clock };
}

const ids = (rows: Array<{ event: { id: string } }>) => rows.map((r) => r.event.id);

/** Everything is idle unless the test says otherwise. */
const activity = (map: Record<string, Activity>) => (id: string) =>
  map[id] ?? "idle";

describe("compareRows", () => {
  test("deadline order is the default and ignores activity", () => {
    const rows = [row("late", 5 * DAY), row("soon", 1 * DAY)];
    const sorted = [...rows].sort(
      compareRows("ending", activity({ late: "doing" })),
    );
    expect(ids(sorted)).toEqual(["soon", "late"]);
  });

  test("doing first pulls what you're partway through to the top", () => {
    const rows = [row("a", 1 * DAY), row("b", 5 * DAY), row("c", 9 * DAY)];
    const sorted = [...rows].sort(compareRows("doing", activity({ c: "doing" })));
    expect(ids(sorted)).toEqual(["c", "a", "b"]);
  });

  test("finished events sink below untouched ones", () => {
    const rows = [row("done", 1 * DAY), row("fresh", 8 * DAY)];
    const sorted = [...rows].sort(
      compareRows("doing", activity({ done: "done" })),
    );
    expect(ids(sorted)).toEqual(["fresh", "done"]);
  });

  test("deadline order survives inside every group", () => {
    // Grouping is all this mode does. If it also scrambled the deadlines it
    // would cost the reader the one ordering the product exists for.
    const rows = [
      row("doing-late", 6 * DAY),
      row("idle-late", 7 * DAY),
      row("doing-soon", 2 * DAY),
      row("idle-soon", 3 * DAY),
    ];
    const sorted = [...rows].sort(
      compareRows("doing", activity({ "doing-late": "doing", "doing-soon": "doing" })),
    );
    expect(ids(sorted)).toEqual([
      "doing-soon",
      "doing-late",
      "idle-soon",
      "idle-late",
    ]);
  });

  test("upcoming events stay after live ones in both modes", () => {
    // Even marked "doing": you cannot be partway through an event that has not
    // started, and a future one displacing a running one would be wrong.
    const rows = [row("upcoming", 20 * DAY, true), row("live", 9 * DAY)];
    for (const mode of ["ending", "doing"] as const) {
      const sorted = [...rows].sort(
        compareRows(mode, activity({ upcoming: "doing" })),
      );
      expect(ids(sorted)).toEqual(["live", "upcoming"]);
    }
  });

  test("an unknown end sorts last among live events, as it always did", () => {
    const rows = [row("unknown", null), row("known", 30 * DAY)];
    const sorted = [...rows].sort(compareRows("ending", activity({})));
    expect(ids(sorted)).toEqual(["known", "unknown"]);
  });
});
