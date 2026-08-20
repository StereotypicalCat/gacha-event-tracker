import { useState } from "react";
import type { LaneId } from "../../shared/custom.ts";
import type { Region } from "../../shared/schema.ts";
import { REGION_LABEL } from "../../shared/time.ts";
import { useGameMeta } from "../state/gameMeta.tsx";
import { moveGame } from "../state/gameOrder.ts";
import type { ThemeChoice } from "../state/theme.ts";
import type { Prefs } from "../state/usePrefs.ts";
import { YourOwn } from "./YourOwn.tsx";

const REGIONS: Array<{ id: Region; label: string }> = (
  ["america", "europe", "asia"] as const
).map((id) => ({ id, label: REGION_LABEL[id] }));

/**
 * Dark first, because that is what the app is and what this control is offered
 * *from*; `System` last, because it is the answer that defers rather than
 * decides.
 */
const THEMES: Array<{ id: ThemeChoice; label: string }> = [
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
  { id: "system", label: "System" },
];

/**
 * The two readings of a board with the future on it, and both are right for
 * somebody — see PRD F1.
 *
 * Kept as a pair of pills rather than a second checkbox because neither answer
 * is the absence of the other: "mixed in" is a different order, not a heading
 * switched off. A checkbox would name one of them and leave the other as
 * whatever is left over.
 */
const SPLITS: Array<{ split: boolean; label: string; hint: string }> = [
  {
    split: true,
    label: "In their own group",
    hint: "Each lane runs out, then a \u201cNot started yet\u201d heading and what is queued behind it \u2014 the shape the checklist has either way.",
  },
  {
    split: false,
    label: "Mixed in",
    hint: "One deadline order, started or not — so something opening Friday and closing Sunday sits above an event running until October.",
  },
];

export function Controls({
  games,
  prefs,
  onToggleGame,
  onUpdate,
  ignoredCount,
  onExport,
  onImport,
  own,
}: {
  games: LaneId[];
  prefs: Prefs;
  onToggleGame: (g: LaneId) => void;
  onUpdate: (p: Partial<Prefs>) => void;
  ignoredCount: number;
  onExport: () => void;
  onImport: (file: File) => void;
  /** Everything the reader entered themselves, and the ways to change it. */
  own: React.ComponentProps<typeof YourOwn>;
}) {
  const gameMeta = useGameMeta();
  return (
    <section className="border-t border-hairline px-4 py-5">
      {/* Which games and how they are read on one side, what the reader has
          added and what they can take away with them on the other. Two short
          columns beat one tall one here: settings are scanned for the one row
          you came to change. */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-x-10">
        <div>
          <GameOrder
            games={games}
            hidden={prefs.hiddenGames}
            custom={prefs.gameOrder !== undefined}
            onToggleGame={onToggleGame}
            onReorder={(from, to) =>
              // The whole displayed list, every time: the indices are positions
              // on screen, and what the reader is looking at is the order they
              // mean. See `moveGame`.
              onUpdate({ gameOrder: moveGame(games, from, to) })
            }
            onReset={() => onUpdate({ gameOrder: undefined })}
          />

          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-4">
            <div>
              <p className="eyebrow">Server region</p>
              <div className="mt-2 flex gap-1.5">
                {REGIONS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onUpdate({ region: r.id, regionConfirmed: true })}
                    aria-pressed={prefs.region === r.id}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      prefs.region === r.id
                        ? "border-ink/70 text-ink"
                        : "border-hairline text-faint hover:text-muted"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Next to the region rather than off in a corner: both are
                "how do I read this?", and neither changes what the page
                knows. Switching is instant and costs nothing — no reload, and
                nothing marked, typed or ticked is touched. */}
            <div>
              <p className="eyebrow">Appearance</p>
              <div className="mt-2 flex gap-1.5">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onUpdate({ theme: t.id })}
                    aria-pressed={prefs.theme === t.id}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      prefs.theme === t.id
                        ? "border-ink/70 text-ink"
                        : "border-hairline text-faint hover:text-muted"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={prefs.showCompleted}
                  onChange={(e) => onUpdate({ showCompleted: e.target.checked })}
                  className="size-4 accent-[var(--color-near)]"
                />
                Show events I've finished
              </label>

              {/* One of the three "what am I allowed to look at" rows, and it
                  reaches both views: the checklist's "Not started yet" section
                  and the board's future bars are the same events answering the
                  same question. Off is the default because this app answers
                  *what expires next* — see PRD F1. */}
              <label className="flex cursor-pointer select-none items-start gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={prefs.showUpcoming}
                  onChange={(e) => onUpdate({ showUpcoming: e.target.checked })}
                  className="mt-px size-4 accent-[var(--color-near)]"
                />
                <span>
                  Show events that haven't started
                  <span className="mt-0.5 block max-w-xs leading-relaxed text-faint">
                    Adds the checklist's "Not started yet" section, and plots
                    them on the timeline — which draws its span from what it
                    plots, so the board stretches weeks past today.
                  </span>
                </span>
              </label>

              {/* Only while there is something to arrange. A choice about how
                  unstarted events sit on the board is unanswerable when none
                  are on it, and offering it anyway is a control that does
                  nothing — the stored answer is kept either way, so switching
                  the row above back on restores it rather than a default. */}
              {prefs.showUpcoming && (
                <div className="ml-6 flex flex-col gap-1.5">
                  <div className="flex gap-1.5">
                    {SPLITS.map((s) => (
                      <button
                        key={String(s.split)}
                        type="button"
                        onClick={() =>
                          onUpdate({ timelineSplitUpcoming: s.split })
                        }
                        aria-pressed={prefs.timelineSplitUpcoming === s.split}
                        className={`rounded-full border px-3 py-1 text-[0.6875rem] font-medium transition-colors ${
                          prefs.timelineSplitUpcoming === s.split
                            ? "border-ink/70 text-ink"
                            : "border-hairline text-faint hover:text-muted"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <p className="max-w-xs text-xs leading-relaxed text-faint">
                    On the timeline.{" "}
                    {SPLITS.find((s) => s.split === prefs.timelineSplitUpcoming)
                      ?.hint}
                  </p>
                </div>
              )}

              {/* Detection reads the source's wording and is wrong in both
                  directions, so it ships off and says so. Off leaves only the
                  events the reader marked, and discards nothing — every mark and
                  logged day survives, so it can be switched back on. */}
              <label className="flex cursor-pointer select-none items-start gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={prefs.detectDaily}
                  onChange={(e) => onUpdate({ detectDaily: e.target.checked })}
                  className="mt-px size-4 accent-[var(--color-near)]"
                />
                <span>
                  Spot daily events automatically
                  <span className="ml-1.5 rounded-full border border-hairline px-1.5 py-0.5 align-[1px] text-[0.5625rem] font-medium uppercase tracking-wider text-faint">
                    Experimental
                  </span>
                  <span className="mt-0.5 block max-w-xs leading-relaxed text-faint">
                    Guessed from what the source wrote, so it misses some and
                    invents others. Off, only events you mark yourself get a
                    checklist. Your ticks and streaks are kept either way.
                  </span>
                </span>
              </label>

              {ignoredCount > 0 && (
                <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={prefs.showIgnored}
                    onChange={(e) => onUpdate({ showIgnored: e.target.checked })}
                    className="size-4 accent-[var(--color-near)]"
                  />
                  Show the {ignoredCount} event{ignoredCount > 1 ? "s" : ""} I'm
                  ignoring
                </label>
              )}
            </div>
          </div>
        </div>

        <div>
          <YourOwn {...own} />

          <div className="mt-6 border-t border-hairline pt-4">
            <p className="eyebrow">Your progress</p>
            <p className="mt-1.5 max-w-md text-xs leading-relaxed text-faint">
              What you've finished, and every daily you've ticked off, are saved in
              this browser only — there is no account. Anything you added yourself is
              in there too. Move it all to another device with a file.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={onExport}
                className="rounded-lg border border-hairline px-3 py-1.5 text-xs text-muted transition-colors hover:text-ink"
              >
                Export
              </button>
              <label className="cursor-pointer rounded-lg border border-hairline px-3 py-1.5 text-xs text-muted transition-colors hover:text-ink">
                Import
                <input
                  type="file"
                  accept="application/json,.json"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onImport(file);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Which games the reader plays, and the order they read them in.
 *
 * One row per game rather than the chip row this replaced: a reorder affordance
 * needs somewhere to put a handle and two arrows, and at fourteen games a list
 * reads better than a wrapped row of pills anyway.
 *
 * **Reordering lives here and nowhere else.** The focus bar and the dailies strip
 * are the fastest tap targets on the page — the strip is the part of it that is
 * answerable in ten seconds — and a drag target sitting on top of a tick target
 * costs somebody a streak the first time it misfires. So the live surfaces stay
 * drag-free and this is the screen you visit on purpose.
 *
 * The row itself is not a target. The handle, the two arrows and the on/off
 * switch are four explicit controls, and nothing else here is clickable — which
 * is what keeps this the right side of "a list row is one target": that rule is
 * about a full-bleed row target with a second control hidden inside it.
 */
function GameOrder({
  games,
  hidden,
  custom,
  onToggleGame,
  onReorder,
  onReset,
}: {
  /** Every lane, already in the reader's order. */
  games: LaneId[];
  hidden: LaneId[];
  /** Whether the reader has an order of their own, so reset has something to do. */
  custom: boolean;
  onToggleGame: (g: LaneId) => void;
  onReorder: (from: number, to: number) => void;
  onReset: () => void;
}) {
  const gameMeta = useGameMeta();
  const [dragging, setDragging] = useState<number | null>(null);

  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow">Games</p>
        {custom && (
          <button
            type="button"
            onClick={onReset}
            className="text-[0.6875rem] text-faint transition-colors hover:text-muted"
          >
            Reset to A–Z
          </button>
        )}
      </div>

      {/* Both affordances, always visible. Touch fires no drag events at all, so
          the arrows are the mechanism and the handle is the fast path where a
          pointer exists — and the arrows are ordinary buttons, which is what
          makes this reachable by keyboard and screen reader without a second
          implementation of the same interaction. */}
      <p className="mt-1 text-[0.6875rem] leading-relaxed text-faint">
        Drag a row, or use the arrows, to put your games in order. Everything
        that lists a game follows it.
      </p>

      <ul className="mt-2">
        {games.map((id, i) => {
          const game = gameMeta(id);
          const on = !hidden.includes(id);
          return (
            <li
              key={id}
              draggable
              onDragStart={(e) => {
                setDragging(i);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragging !== null && dragging !== i) onReorder(dragging, i);
                setDragging(null);
              }}
              onDragEnd={() => setDragging(null)}
              className={`flex items-center gap-2 rounded-lg py-1 ${
                dragging === i ? "opacity-40" : ""
              }`}
            >
              <span
                aria-hidden
                title="Drag to reorder"
                className="cursor-grab select-none px-0.5 text-xs leading-none text-faint"
              >
                ⠿
              </span>
              <span className="tnum w-4 shrink-0 text-[0.625rem] text-faint">
                {i + 1}
              </span>

              <button
                type="button"
                onClick={() => onToggleGame(id)}
                aria-pressed={on}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-full border px-3 py-1.5 text-left text-xs font-medium transition-colors"
                style={{
                  borderColor: on ? game.hue : "var(--color-hairline)",
                  color: on ? game.hue : "var(--color-faint)",
                  background: on
                    ? `color-mix(in srgb, ${game.hue} 12%, transparent)`
                    : "transparent",
                }}
              >
                <span className="truncate">{game.name}</span>
              </button>

              {/* Rendered at the ends too, and inert there. A control that
                  disappears on the first row slides the other one under the
                  finger that was aiming at it. */}
              <Nudge
                label={`Move ${game.name} up (${i + 1} of ${games.length})`}
                disabled={i === 0}
                onClick={() => onReorder(i, i - 1)}
                d="M8 3.5l4.5 5h-9z"
              />
              <Nudge
                label={`Move ${game.name} down (${i + 1} of ${games.length})`}
                disabled={i === games.length - 1}
                onClick={() => onReorder(i, i + 1)}
                d="M8 12.5l-4.5-5h9z"
              />
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** One arrow. Disabled at the ends rather than removed — see above. */
function Nudge({
  label,
  disabled,
  onClick,
  d,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  d: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`grid size-6 shrink-0 place-items-center rounded-md border border-hairline transition-colors ${
        disabled
          ? "cursor-not-allowed opacity-25"
          : "text-muted hover:border-faint hover:text-ink"
      }`}
    >
      <svg viewBox="0 0 16 16" aria-hidden className="size-2.5">
        <path d={d} fill="currentColor" />
      </svg>
    </button>
  );
}
