import { endingSoonestFirst, type EventClock } from "../../shared/time.ts";

/**
 * How the list is ordered.
 *
 * "ending" is the product's thesis — what runs out first. "doing" answers the
 * other question a reader arrives with, which is "what was I in the middle
 * of?", and is a strictly weaker sort: it only groups, and inside every group
 * the deadline order is preserved.
 */
export type SortMode = "ending" | "doing";

export const SORT_MODES: Array<{ id: SortMode; label: string; hint: string }> = [
  { id: "ending", label: "Ending soonest", hint: "What runs out first" },
  { id: "doing", label: "Doing first", hint: "What you're partway through" },
];

/**
 * What the reader is doing with an event, as far as ordering cares.
 *
 * Deliberately coarser than the stored status: ticking a day off a daily
 * checklist is evidence you are mid-way through something just as much as
 * setting the status is, and the reader should not have to say it twice.
 */
export type Activity = "doing" | "idle" | "done";

const RANK: Record<Activity, number> = { doing: 0, idle: 1, done: 2 };

/**
 * Comparator for a list of rows.
 *
 * Both modes fall back to `endingSoonestFirst`, so an ordering change never
 * costs the reader the deadline order they rely on — it only decides which
 * block a row lands in.
 */
export function compareRows<T extends { event: { id: string }; clock: EventClock }>(
  mode: SortMode,
  activityOf: (id: string) => Activity,
): (a: T, b: T) => number {
  if (mode === "ending") return endingSoonestFirst;
  return (a, b) => {
    // Live before upcoming, always. You cannot be partway through something
    // that has not started, so activity must not lift a future event above a
    // running one.
    if (a.clock.upcoming !== b.clock.upcoming) return a.clock.upcoming ? 1 : -1;
    const delta = RANK[activityOf(a.event.id)] - RANK[activityOf(b.event.id)];
    return delta !== 0 ? delta : endingSoonestFirst(a, b);
  };
}
