import { useEffect, useState } from "react";

/** Where a step takes the reader; ReaderApp opens the matching page. */
export type TourStop =
  "routines" | "soon" | "timeline" | "codes" | "archive" | "settings";

export const TOUR_STEPS: readonly {
  stop: TourStop;
  title: string;
  body: string;
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
    stop: "timeline",
    title: "The Timeline",
    body: "Every event as a bar across the calendar, with now marked. Show time left or end dates, and choose its look in Settings → Appearance.",
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

/**
 * The returning reader's introduction to the new look. Continue always sits
 * first, in the same place, so clicking through never lands on Back; Back
 * follows it, and Skip stands apart at the end.
 */
export function ReturningTour({
  onStep,
  onFinish,
  autoStart = false,
}: {
  onStep: (stop: TourStop) => void;
  onFinish: () => void;
  /** Replayed from Settings: skip the welcome and open the first step. */
  autoStart?: boolean;
}) {
  const [step, setStep] = useState(autoStart ? 0 : -1);
  const go = (next: number) => {
    setStep(next);
    onStep(TOUR_STEPS[next]!.stop);
  };
  useEffect(() => {
    if (autoStart) onStep(TOUR_STEPS[0]!.stop);
  }, []);
  const last = step === TOUR_STEPS.length - 1;
  return (
    <aside className="returning-tour" aria-label="Introduction to the new look">
      {step >= 0 && (
        <p className="tour-step">
          {step + 1} of {TOUR_STEPS.length}
        </p>
      )}
      <h2>
        {step < 0
          ? "Welcome back. A little has moved."
          : TOUR_STEPS[step]!.title}
      </h2>
      <p>
        {step < 0
          ? "Your games, routines and progress are all still here. Take a short tour of the new layout, or keep browsing."
          : TOUR_STEPS[step]!.body}
      </p>
      <div className="tour-actions">
        <button
          type="button"
          className="commit"
          onClick={() => (last ? onFinish() : go(step + 1))}
        >
          {step < 0 ? "Take the quick tour" : last ? "Finish tour" : "Continue"}
        </button>
        {step > 0 && (
          <button type="button" className="btn" onClick={() => go(step - 1)}>
            Back
          </button>
        )}
        <button type="button" className="tour-skip" onClick={onFinish}>
          {step < 0 ? "Keep browsing" : "Skip tour"}
        </button>
      </div>
    </aside>
  );
}
