import { useEffect, useRef, useState } from "react";

/** Where a step takes the reader; ReaderApp opens the matching page. */
export type TourStop =
  "routines" | "soon" | "timeline" | "codes" | "archive" | "settings";

/** A look the reader tries from inside a step, switching the page behind. */
type TourChoice = "interface" | "timelineLook";

export const TOUR_STEPS: readonly {
  stop: TourStop;
  title: string;
  body: string;
  choice?: TourChoice;
}[] = [
  {
    stop: "routines",
    title: "Your routines have a home",
    body: "Follow your dailies, weeklies and monthlies in the Routines tab, and pin the ones you want beside your Checklist or on the Timeline.",
  },
  {
    stop: "soon",
    title: "Your Checklist",
    body: "What ends first, at the top. Focus on a game, tick today's dailies and pinned routines beside the list, and switch between Standard and Compact rows.",
  },
  {
    stop: "soon",
    title: "Pick a layout",
    body: "Try both on your own Checklist: the page behind changes as you switch. Whichever is selected when you continue is the one you keep.",
    choice: "interface",
  },
  {
    stop: "timeline",
    title: "The Timeline",
    body: "Every event as a bar across the calendar, with now marked. Try the new and classic looks here; whichever is selected when you continue stays.",
    choice: "timelineLook",
  },
  {
    stop: "codes",
    title: "Redeem codes",
    body: "New codes for the games you track show up at the top of the Checklist. Each game's Codes tab lists them with their rewards and expiry, ready to copy, and remembers which you've redeemed.",
  },
  {
    stop: "archive",
    title: "Your Archive",
    body: "Done and ignored events move here with their details and progress. Restore any of them at any time.",
  },
  {
    stop: "settings",
    title: "Your settings, together",
    body: "Appearance, region and time, each game's servers and colours, data sources and backups. The changelog has its own page here too.",
  },
];

const CHOICES: Record<
  TourChoice,
  readonly { value: string; label: string; note: string }[]
> = {
  interface: [
    {
      value: "relaxed",
      label: "Relaxed",
      note: "Separated panels with more breathing room.",
    },
    {
      value: "structured",
      label: "Structured",
      note: "A compact, ruled planner.",
    },
  ],
  timelineLook: [
    {
      value: "new",
      label: "New look",
      note: "A name column beside each bar.",
    },
    {
      value: "classic",
      label: "Classic look",
      note: "Filled bars with the title inside, under each game.",
    },
  ],
};

/**
 * `prefs.redesignTourSeen` holds where the reader is with the tour:
 *
 * - `TOUR_DONE`: finished. Nothing shows.
 * - `"new"` / `"returning"`: the tour must be finished before the app can be
 *   used, and the reader's look is settled: chosen in setup, or moved to
 *   Relaxed when the tour first opened. Which one sets the opening line, so
 *   a reload part-way through still greets the reader the same way.
 * - `"replay"`: started from Settings. Optional, and closable at any step.
 * - anything else (absent, null, or an earlier tour's marker): a returning
 *   reader who has not taken this tour. ReaderApp moves them to Relaxed and
 *   stores `"returning"`.
 *
 * A new tour version changes `TOUR_DONE`, so everyone takes it once more.
 */
export const TOUR_DONE = "2026-10-tour-2";
export type TourMode = "done" | "new" | "returning" | "replay" | "unseen";
export function tourMode(seen: unknown): TourMode {
  if (seen === TOUR_DONE) return "done";
  if (seen === "new" || seen === "returning" || seen === "replay") return seen;
  return "unseen";
}

/**
 * The introduction to Event Clock. Continue always sits first, in the same
 * place, so clicking through never lands on Back; Back follows it. Only a
 * replay has a way out before the end.
 */
export function ReturningTour({
  intro,
  closable,
  looks,
  onLook,
  onStep,
  onFinish,
}: {
  /** The opening line on the first step; none on a replay. */
  intro?: "new" | "returning" | undefined;
  /** A replay can be closed at any step. */
  closable: boolean;
  looks: Record<TourChoice, string>;
  onLook: (patch: Partial<Record<TourChoice, string>>) => void;
  onStep: (stop: TourStop) => void;
  onFinish: () => void;
}) {
  const [step, setStep] = useState(0);
  const card = useRef<HTMLElement>(null);
  const go = (next: number) => {
    setStep(next);
    onStep(TOUR_STEPS[next]!.stop);
  };
  useEffect(() => {
    onStep(TOUR_STEPS[0]!.stop);
    card.current?.focus();
  }, []);
  const current = TOUR_STEPS[step]!;
  const last = step === TOUR_STEPS.length - 1;
  return (
    <aside
      ref={card}
      tabIndex={-1}
      className="returning-tour"
      aria-label="Introduction to Event Clock"
    >
      {step === 0 && intro && (
        <p className="tour-intro">
          {intro === "returning"
            ? "Welcome back. A little has moved, so here's a short tour before you carry on. Your games, routines and progress are all still here."
            : "Welcome to Event Clock. Here's a short tour before you start."}
        </p>
      )}
      <p className="tour-step">
        {step + 1} of {TOUR_STEPS.length}
      </p>
      <h2>{current.title}</h2>
      <p>{current.body}</p>
      {current.choice && (
        <div className="tour-choice" role="group" aria-label={current.title}>
          {CHOICES[current.choice].map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={looks[current.choice!] === option.value}
              onClick={() => onLook({ [current.choice!]: option.value })}
            >
              <strong>{option.label}</strong>
              <small>{option.note}</small>
            </button>
          ))}
        </div>
      )}
      {current.choice && (
        <p className="tour-later">
          You can change this later in Settings → Appearance.
        </p>
      )}
      <div className="tour-actions">
        <button
          type="button"
          className="commit"
          onClick={() => (last ? onFinish() : go(step + 1))}
        >
          {last ? "Finish tour" : "Continue"}
        </button>
        {step > 0 && (
          <button type="button" className="btn" onClick={() => go(step - 1)}>
            Back
          </button>
        )}
        {closable && (
          <button type="button" className="tour-skip" onClick={onFinish}>
            Close tour
          </button>
        )}
      </div>
    </aside>
  );
}
