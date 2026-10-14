import type { Cadence, RepeatMode } from "./recurrence.ts";
import type { EventType } from "./schema.ts";

/**
 * Examples to start *Add an event* and *Add a task* from.
 *
 * A reader who knows what they want — a banner that ends on the 28th, 1300
 * points a week — could not see which answers in the form produce it. One tap
 * here gives the form that shape, and the reader fills in the rest.
 *
 * **An example sets a shape, never a fact.** No title (the example's text is
 * only a placeholder), no date, no time, no target, no game: those are claims
 * about a game, and a figure the reader did not type would read as one we
 * sourced — the bar `routines.ts` holds built-ins to. No date is guessed
 * either, not even "today": games reset on different days, and a guessed date
 * that looks deliberate is the failure this product exists to avoid. The form
 * keeps Save disabled until every date and figure the shape needs is typed, so
 * nothing an example set can be saved unread.
 */

export interface EventTemplate {
  /** Kebab-case, unique within the list. */
  id: string;
  /** The chip's text. */
  label: string;
  /** The name field's placeholder while this example is chosen. */
  placeholder: string;
  /** One line: what is left for the reader to fill in. */
  hint: string;
  sets: { type: EventType; cadence: Cadence; repeatMode: RepeatMode; endKnown: boolean };
}

export interface TaskTemplate {
  id: string;
  label: string;
  placeholder: string;
  hint: string;
  sets: {
    unit: "week" | "month";
    kind: "days" | "amount";
    /** As typed; "" empties the field. Only "once" is ever a shape. */
    required?: string;
    amountUnit?: string;
  };
}

export const EVENT_TEMPLATES: readonly EventTemplate[] = [
  {
    id: "banner",
    label: "Banner with a known end",
    placeholder: "Limited banner",
    hint: "Fill in when it starts and when it ends.",
    sets: { type: "banner", cadence: "one-off", repeatMode: "never", endKnown: true },
  },
  {
    id: "login",
    label: "Login event",
    placeholder: "Login bonus",
    hint: "Fill in when it starts and when it ends, or tick that you don't know.",
    sets: { type: "login", cadence: "one-off", repeatMode: "never", endKnown: true },
  },
  {
    id: "monthly-shop",
    label: "Monthly shop reset",
    placeholder: "Shop reset",
    hint: "Fill in a day it resets on. Each one runs until the next.",
    sets: { type: "shop", cadence: "monthly", repeatMode: "never", endKnown: true },
  },
  {
    id: "endgame-cycle",
    label: "Recurring endgame cycle",
    placeholder: "Endgame cycle",
    hint: "Fill in one cycle's start and end; how often it comes back is worked out from them.",
    sets: { type: "challenge", cadence: "custom", repeatMode: "forever", endKnown: true },
  },
  {
    id: "maintenance",
    label: "Maintenance",
    placeholder: "Maintenance",
    hint: "Fill in when it starts and ends, with times.",
    sets: { type: "maintenance", cadence: "one-off", repeatMode: "never", endKnown: true },
  },
];

export const TASK_TEMPLATES: readonly TaskTemplate[] = [
  {
    id: "weekly-points",
    label: "Weekly points target",
    placeholder: "Weekly points",
    hint: "Fill in the target, and the day the week rolls over if it isn't Monday.",
    sets: { unit: "week", kind: "amount", amountUnit: "points" },
  },
  {
    id: "few-days",
    label: "A few days each week",
    placeholder: "Weekly chore",
    hint: "Fill in how many days a week it needs.",
    sets: { unit: "week", kind: "days", required: "" },
  },
  {
    id: "monthly-shop",
    label: "Monthly shop buy-out",
    placeholder: "Monthly shop",
    hint: "Fill in the day the month rolls over.",
    sets: { unit: "month", kind: "days", required: "1" },
  },
  {
    id: "monthly-target",
    label: "Monthly target",
    placeholder: "Monthly target",
    hint: "Fill in the target and what it counts.",
    sets: { unit: "month", kind: "amount" },
  },
];
