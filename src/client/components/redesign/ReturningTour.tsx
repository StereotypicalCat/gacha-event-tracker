import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** Where a step takes the reader; ReaderApp opens the matching page. */
export type TourStop =
  | "soon"
  | "timeline"
  | "routines"
  | "archive"
  | "settings"
  /** Settings, with a game's page open: its row in the list is the way in. */
  | "codes-game"
  /** The same game page, pointing at its Codes tab. */
  | "codes-tab"
  /** The game's Codes tab open. */
  | "codes"
  /** Settings → Appearance, where the tour can be replayed. */
  | "replay";

/** A look the reader tries from inside a step, switching the page behind. */
type TourChoice = "interface" | "timelineLook";

/**
 * The tour, in the owner's order (2026-10-18). The first step only says a tour
 * is starting, over a dimmed page, so the first highlight is not missed while
 * the reader is still reading the welcome; the second shows the bar along the
 * top that every later step points into. The codes steps walk the way in:
 * Settings, the game, its Codes tab, the codes.
 */
export const TOUR_STEPS: readonly {
  stop: TourStop;
  title: string;
  body: string;
  /** What the step is about, highlighted on the page behind; none dims it all. */
  target?: string;
  choice?: TourChoice;
}[] = [
  {
    stop: "soon",
    title: "A short tour",
    body: "A quick look at where everything is. Each step highlights what it's about.",
  },
  {
    stop: "soon",
    title: "Getting around",
    body: "The bar along the top takes you everywhere: the Checklist and Timeline, your Routines, the Archive and Settings. The numbers beside them count what's still to do. Click Event Clock to go back to your default view.",
    target: ".reader-ui header.top",
  },
  {
    stop: "soon",
    title: "Your Checklist, and its layout",
    body: "What ends first, at the top, with today's dailies and pinned routines beside it. Try both layouts on your own Checklist: the page changes as you switch, and the one selected when you continue is the one you keep.",
    choice: "interface",
    target: ".checklist-layout",
  },
  {
    stop: "timeline",
    title: "The Timeline",
    body: "Every event as a bar across the calendar, with now marked. Try the new and classic looks on your own events; whichever is selected when you continue stays.",
    choice: "timelineLook",
    target:
      ".reader-timeline .timeline-scroller, .reader-timeline .classic-timeline",
  },
  {
    stop: "routines",
    title: "Your routines have a home",
    body: "Follow your dailies, weeklies and monthlies in the Routines tab, and pin the ones you want beside your Checklist or on the Timeline.",
    target: '[data-page="routines"]',
  },
  {
    stop: "archive",
    title: "Your Archive",
    body: "Done and ignored events move here with their details and progress. Restore any of them at any time.",
    target: '[data-page="archive"]',
  },
  {
    stop: "settings",
    title: "Your settings, together",
    body: "Appearance, region and time, each game's servers and colours, data sources and backups. The changelog has its own page here too.",
    target: '[data-page="settings"]',
  },
  {
    stop: "codes-game",
    title: "Redeem codes: pick the game",
    body: "Codes live with each game. In Settings, choose the game under Your games; a game with codes you haven't seen says how many.",
    target: '.settings-layout .settings-row[aria-current="page"]',
  },
  {
    stop: "codes-tab",
    title: "Redeem codes: open Codes",
    body: "On the game's page, open the Codes tab.",
    target: '.subtabs [data-tab="codes"]',
  },
  {
    stop: "codes",
    title: "Redeem codes: copy and tick",
    body: "Each code with its rewards and expiry, ready to copy, and where to redeem it. Tick Redeemed once you've used one: it moves down with the expired ones.",
    target: ".codes-page",
  },
  {
    stop: "replay",
    title: "Take the tour again",
    body: "Whenever you want this tour again, it's here: Settings → Appearance → Replay the introduction.",
    target: '[data-tour="replay"]',
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

/** The options of a choice the reader has not yet seen on the page. */
export function untriedOptions(choice: TourChoice, seen: readonly string[]) {
  return CHOICES[choice].filter((o) => !seen.includes(o.value));
}

/**
 * Rings the step's subject and dims the rest of the
 * page around it. A fixed layer drawn over the target's box rather than the
 * target raised above a scrim, so no stacking context on the page can trap it;
 * it follows the target as the page scrolls, and takes no clicks.
 */
function TourSpotlight({ target }: { target: string | undefined }) {
  const [box, setBox] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    let frame = 0;
    const follow = () => {
      const next = target
        ? document.querySelector(target)?.getBoundingClientRect()
        : undefined;
      setBox((previous) =>
        next &&
        previous &&
        next.x === previous.x &&
        next.y === previous.y &&
        next.width === previous.width &&
        next.height === previous.height
          ? previous
          : (next ?? null),
      );
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(frame);
  }, [target]);
  if (!box) return <div className="tour-scrim" aria-hidden="true" />;
  // Padded, but kept 3px inside the window so a full-width subject, such as
  // the bar along the top, still shows its ring at the edges.
  const pad = 6,
    edge = 3,
    left = Math.max(edge, box.x - pad),
    top = Math.max(edge, box.y - pad),
    right = Math.min(window.innerWidth - edge, box.right + pad);
  return (
    <div
      className="tour-spotlight"
      aria-hidden="true"
      style={{
        left,
        top,
        width: right - left,
        height: box.bottom + pad - top,
      }}
    />
  );
}

/** The first step's words when the tour opens on its own; a replay has none. */
const WELCOME = {
  returning: {
    title: "Welcome back",
    body: "A few things have changed, so we're going on a short tour before you carry on. Your games, routines and progress are all still here. Each step highlights what it's about.",
  },
  new: {
    title: "Welcome to Event Clock",
    body: "Before you start, we're going on a short tour of where everything is. Each step highlights what it's about.",
  },
};

/**
 * The introduction to Event Clock. Continue always sits first, in the same
 * place, so clicking through never lands on Back; Back follows it. Only a
 * replay has a way out before the end. A step with a choice holds Continue
 * until the reader has seen every option on the page.
 */
export function ReturningTour({
  intro,
  closable,
  looks,
  onLook,
  onStep,
  onFinish,
}: {
  /** Who the first step welcomes; a replay opens on the plain first step. */
  intro?: "new" | "returning" | undefined;
  /** A replay can be closed at any step. */
  closable: boolean;
  looks: Record<TourChoice, string>;
  onLook: (patch: Partial<Record<TourChoice, string>>) => void;
  onStep: (stop: TourStop) => void;
  onFinish: () => void;
}) {
  const [step, setStep] = useState(0);
  // The options seen at each choice: the look on screen when the step opens
  // counts, as the reader is looking at it.
  const [tried, setTried] = useState<Record<TourChoice, string[]>>({
    interface: [],
    timelineLook: [],
  });
  const card = useRef<HTMLElement>(null);
  const current = TOUR_STEPS[step]!;
  const choice = current.choice;
  const see = (key: TourChoice, value: string) =>
    setTried((t) =>
      t[key].includes(value) ? t : { ...t, [key]: [...t[key], value] },
    );
  const go = (next: number) => {
    setStep(next);
    onStep(TOUR_STEPS[next]!.stop);
  };
  useEffect(() => {
    onStep(TOUR_STEPS[0]!.stop);
    card.current?.focus();
  }, []);
  useEffect(() => {
    if (choice) see(choice, looks[choice]);
  }, [choice]);
  // A choice step brings its subject up to the top of the window, clear of
  // the banners above it, once the page it lives on has rendered, and again
  // when the look changes it. Two frames: the app scrolls a newly opened page to its top in
  // the same commit.
  useEffect(() => {
    if (!current.target) return;
    const target = current.target;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const el = document.querySelector(target);
        if (!el) return;
        const box = el.getBoundingClientRect();
        // A choice step's subject, and any too tall for the window, goes
        // to the top; anything else out of sight, to the middle.
        if (choice || box.height > window.innerHeight - 32)
          window.scrollTo({ top: box.top + window.scrollY - 16 });
        else if (box.top < 0 || box.bottom > window.innerHeight)
          el.scrollIntoView({ block: "center" });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [step, choice && looks[choice]]);
  const untried = choice ? untriedOptions(choice, tried[choice]) : [];
  const last = step === TOUR_STEPS.length - 1;
  return (
    <>
      <TourSpotlight target={current.target} />
      <aside
        ref={card}
        tabIndex={-1}
        className={choice ? "returning-tour docked" : "returning-tour"}
        aria-label="Introduction to Event Clock"
      >
        <p className="tour-step">
          {step + 1} of {TOUR_STEPS.length}
        </p>
        <h2>
          {(step === 0 && intro && WELCOME[intro].title) || current.title}
        </h2>
        <p>{(step === 0 && intro && WELCOME[intro].body) || current.body}</p>
        {choice && (
          <div className="tour-choice" role="group" aria-label={current.title}>
            {CHOICES[choice].map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={looks[choice] === option.value}
                onClick={() => {
                  see(choice, option.value);
                  onLook({ [choice]: option.value });
                }}
              >
                <strong>{option.label}</strong>
                <small>{option.note}</small>
              </button>
            ))}
          </div>
        )}
        {choice && (
          <p className="tour-later" aria-live="polite">
            {untried.length
              ? `Try ${untried.map((o) => o.label).join(" and ")} to continue.`
              : "You can change this later in Settings → Appearance."}
          </p>
        )}
        <div className="tour-actions">
          <button
            type="button"
            className="commit"
            disabled={untried.length > 0}
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
    </>
  );
}
