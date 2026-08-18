import { useState } from "react";
import { useGameMeta } from "../state/gameMeta.tsx";
import type { LaneId } from "../../shared/custom.ts";
import type { View } from "../state/usePrefs.ts";

/**
 * First run: pick your games, and how you want to read them.
 *
 * Asked once, before any events are shown, because a calendar full of games you
 * don't play is worse than an empty one — it buries the thing you came for.
 *
 * Nothing is preselected among the games. An empty state with a disabled button
 * is clearer than guessing on the reader's behalf and hoping they notice.
 */
export function Welcome({
  available,
  onConfirm,
}: {
  available: LaneId[];
  onConfirm: (chosen: LaneId[], view: View) => void;
}) {
  const gameMeta = useGameMeta();
  const [chosen, setChosen] = useState<LaneId[]>([]);
  /**
   * The view is the one thing here that arrives already answered.
   *
   * A reader cannot be asked to choose between two layouts they have not seen,
   * so the question ships with the answer this app is built around — the next
   * deadline, in one look — and the alternative sitting next to it with a
   * picture of what it is. Games stay unanswered because only the reader knows
   * which ones they play; this one has a defensible default.
   */
  const [view, setView] = useState<View>("soon");

  const toggle = (id: LaneId) =>
    setChosen((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id],
    );

  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-5 py-12">
      <p className="font-display text-[0.9375rem] font-bold tracking-[0.02em]">
        EVENT<span className="text-near">CLOCK</span>
      </p>

      <h1 className="mt-8 max-w-sm font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight">
        Which games do you play?
      </h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
        You'll only see events for these. Change it any time — nothing is saved
        anywhere but this browser.
      </p>

      {/* Two columns once there is room for them: a dozen games in one column
          pushes the view question and the way in off the bottom of the screen,
          on the one screen where both need to be seen. */}
      <div className="mt-8 grid gap-2 sm:grid-cols-2">
        {available.map((id) => {
          const game = gameMeta(id);
          const on = chosen.includes(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              aria-pressed={on}
              className="game-pick flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left"
              style={{
                ["--hue" as string]: game.hue,
                borderColor: on ? game.hue : "var(--color-hairline)",
                background: on
                  ? `color-mix(in srgb, ${game.hue} 12%, transparent)`
                  : "transparent",
              }}
            >
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full transition-transform duration-150"
                style={{
                  background: on ? game.hue : "var(--color-hairline)",
                  transform: on ? "scale(1.25)" : "scale(1)",
                }}
              />
              <span
                className="flex-1 text-[0.9375rem] font-medium"
                style={{ color: on ? game.hue : "var(--color-muted)" }}
              >
                {game.name}
              </span>
              {on && (
                <svg viewBox="0 0 16 16" className="size-4" style={{ color: game.hue }} aria-hidden>
                  <path
                    d="M2.5 8.5l3.5 3.5 7.5-8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          );
        })}
      </div>

      {/* The lanes in the timeline sketch are drawn in the hues of the first
          games on this very screen, because that is what a lane is: a game.
          Borrowing the urgency ramp for them would teach the wrong colour rule
          before the reader has seen a single event. */}
      <ViewChoice
        value={view}
        onChange={setView}
        hues={available.slice(0, 3).map((id) => gameMeta(id).hue)}
      />

      <div className="mt-8 flex flex-col gap-3">
        <button
          type="button"
          disabled={chosen.length === 0}
          onClick={() => onConfirm(chosen, view)}
          className="rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-ground transition-colors duration-150 hover:bg-ink-strong disabled:cursor-not-allowed disabled:bg-raised disabled:text-faint"
        >
          {chosen.length === 0
            ? "Pick at least one game"
            : `Show my ${chosen.length === 1 ? "game" : `${chosen.length} games`}`}
        </button>
        <button
          type="button"
          onClick={() => onConfirm(available, view)}
          className="text-xs text-faint transition-colors duration-150 hover:text-muted"
        >
          Show everything instead
        </button>
      </div>

      <p className="mt-auto pt-10 text-xs leading-relaxed text-faint">
        More games are coming as sources are added. A new one stays switched off
        until you ask for it — you'll find it in settings, at the bottom of the
        page.
      </p>
    </div>
  );
}

/**
 * Which of the two views to open on.
 *
 * The views answer different questions — "what expires next" and "when is
 * everything" — and which one a reader wants is not derivable from anything we
 * know about them. It was previously decided for them and then forgotten on
 * every reload; now it is asked once and remembered (`prefs.view`).
 *
 * Each option carries a drawing of itself rather than a description alone: the
 * words "list" and "timeline" mean nothing until you have seen this app's
 * version of them, and the miniature is honest about which one is denser.
 */
function ViewChoice({
  value,
  onChange,
  hues,
}: {
  value: View;
  onChange: (view: View) => void;
  /** Lane colours for the timeline sketch — real games, in their own hues. */
  hues: string[];
}) {
  const options: Array<{ id: View; label: string; hint: string }> = [
    { id: "soon", label: "Checklist", hint: "A list, closest deadline first." },
    { id: "timeline", label: "Timeline", hint: "Bars per game, today pinned." },
  ];

  return (
    <div className="mt-10">
      <h2 className="font-display text-lg font-semibold tracking-tight">
        How do you want to see them?
      </h2>

      <div role="radiogroup" aria-label="Opening view" className="mt-3 grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const on = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(option.id)}
              className={`rounded-xl border px-4 py-3.5 text-left transition-colors duration-150 ${
                on
                  ? "border-near bg-near/10"
                  : "border-hairline hover:border-faint"
              }`}
            >
              {option.id === "soon" ? <ListSketch /> : <TimelineSketch hues={hues} />}
              <p
                className={`mt-3 text-[0.9375rem] font-medium ${
                  on ? "text-ink" : "text-muted"
                }`}
              >
                {option.label}
              </p>
              <p className="mt-0.5 text-xs leading-snug text-faint">{option.hint}</p>
            </button>
          );
        })}
      </div>

      {/* Where the control is, in the reader's own terms — the tabs are 12px
          text in a corner, which is exactly the thing a first-time reader does
          not find on their own. */}
      <p className="mt-3 text-xs leading-relaxed text-faint">
        You can switch between them any time, from the tabs in the top right.
      </p>
    </div>
  );
}

/** Three rows and their meters, at a twelfth of the size. */
function ListSketch() {
  const rows = [
    { width: "72%", ticks: 3, color: "var(--color-critical)" },
    { width: "58%", ticks: 6, color: "var(--color-soon)" },
    { width: "66%", ticks: 9, color: "var(--color-near)" },
  ];
  return (
    <span aria-hidden className="flex h-12 flex-col justify-center gap-2">
      {rows.map((row) => (
        <span key={row.width} className="flex flex-col gap-1">
          <span
            className="h-1 rounded-full bg-hairline"
            style={{ width: row.width }}
          />
          <span className="flex gap-[2px]">
            {Array.from({ length: 12 }, (_, i) => (
              <span
                key={i}
                className="h-1 w-1 rounded-[1px]"
                style={{
                  background:
                    i < row.ticks ? row.color : "var(--color-hairline)",
                }}
              />
            ))}
          </span>
        </span>
      ))}
    </span>
  );
}

/** Three lanes of bars against the now-rule, at the same size. */
function TimelineSketch({ hues }: { hues: string[] }) {
  const geometry = [
    { left: "4%", width: "44%" },
    { left: "28%", width: "52%" },
    { left: "12%", width: "70%" },
  ];
  const bars = geometry.map((bar, i) => ({
    ...bar,
    // Falls back to the neutral tone rather than to a heat colour: a lane is an
    // identity, and this sketch must never look like it is showing urgency.
    hue: hues[i] ?? "var(--color-calm)",
  }));
  return (
    <span aria-hidden className="relative flex h-12 flex-col justify-center gap-1.5">
      <span className="absolute inset-y-0 left-[38%] w-px bg-critical/70" />
      {bars.map((bar) => (
        <span key={bar.left} className="relative block h-2.5">
          <span
            className="absolute h-full rounded-[2px]"
            style={{
              left: bar.left,
              width: bar.width,
              background: `color-mix(in srgb, ${bar.hue} 30%, var(--color-raised))`,
              borderLeft: `2px solid ${bar.hue}`,
            }}
          />
        </span>
      ))}
    </span>
  );
}
