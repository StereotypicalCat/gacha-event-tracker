import { DAY, HOUR } from "./time.ts";

/**
 * How much work the player reckons an event will take.
 *
 * Four buckets, named the way a player would describe them rather than in
 * hours — nobody knows an event will take "3.5 hours", but everyone knows the
 * difference between a login page and a grind.
 */
export const EFFORTS = ["quick", "short", "long", "grind"] as const;
export type Effort = (typeof EFFORTS)[number];

export interface EffortMeta {
  id: Effort;
  label: string;
  /** What the bucket means, in the player's terms. */
  hint: string;
  /** Rough working time, used only for the "will you finish?" heuristic. */
  hours: number;
}

export const EFFORT: Record<Effort, EffortMeta> = {
  quick: { id: "quick", label: "Quick", hint: "a few minutes", hours: 0.25 },
  short: { id: "short", label: "Short", hint: "under an hour", hours: 1 },
  long: { id: "long", label: "Long", hint: "a few hours", hours: 4 },
  grind: { id: "grind", label: "Grind", hint: "several sessions", hours: 12 },
};

export const EFFORT_LIST: EffortMeta[] = EFFORTS.map((e) => EFFORT[e]);

/**
 * Assumed play time per day when working out whether an event is still
 * finishable. One hour is a deliberately modest guess: the point is to warn
 * early, and a warning that only fires when it is already impossible is
 * useless.
 *
 * This is a heuristic and the UI says so. It is never used to hide or reorder
 * anything — only to add a flag the reader can ignore.
 */
export const PLAY_HOURS_PER_DAY = 1;

/** Time you'd want left over to comfortably finish an event of this effort. */
export function runwayMs(effort: Effort): number {
  return (EFFORT[effort].hours / PLAY_HOURS_PER_DAY) * DAY;
}

export type Pressure = "fine" | "tight" | "unlikely";

/**
 * Whether the remaining time still covers the declared effort.
 *
 * Returns "fine" when there is no effort recorded — an unestimated event is
 * not a warning, and guessing an estimate for the reader would be inventing
 * information they did not give.
 */
export function pressure(
  effort: Effort | undefined,
  msRemaining: number | null,
): Pressure {
  if (effort === undefined || msRemaining === null) return "fine";
  if (msRemaining <= 0) return "unlikely";

  const needed = runwayMs(effort);
  if (msRemaining >= needed) return "fine";
  // Below a quarter of the runway, calling it "tight" would be optimistic.
  if (msRemaining >= needed / 4) return "tight";
  return "unlikely";
}

/** Plain-language reason, for a tooltip or the detail sheet. */
export function pressureReason(
  effort: Effort,
  msRemaining: number,
): string {
  const hours = EFFORT[effort].hours;
  const left = Math.max(0, Math.round(msRemaining / HOUR));
  const days = Math.max(1, Math.round(runwayMs(effort) / DAY));
  return `You marked this as ${EFFORT[effort].label.toLowerCase()} (${hours}h of play). At about ${PLAY_HOURS_PER_DAY}h a day that wants ~${days} day${days > 1 ? "s" : ""}, and ${left}h remain.`;
}
