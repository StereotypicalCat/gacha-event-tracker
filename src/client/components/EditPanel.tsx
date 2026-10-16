import { useState } from "react";
import type { LaneId } from "../../shared/custom.ts";
import { dailyOverride } from "../../shared/daily.ts";
import { goalSummary, type Goal } from "../../shared/goal.ts";
import { useGameMeta } from "../state/gameMeta.tsx";
import { GoalControl } from "./GoalControl.tsx";

/**
 * Editing Today's dailies from the strip.
 *
 * Giving Genshin's “To Temper Thyself and Journey Far” its five-of-seven goal
 * used to mean finding the event in the list, opening its sheet, saying it
 * repeats and only then setting the goal. This panel does the same things with
 * the same handlers the sheet uses — `progress.daily` and `progress.goal` —
 * so nothing here stores anything the sheet would not.
 *
 * A section-level mode, like Catch up, and never a control inside a chip: a
 * chip is one tick target, and a second one inside it is a mis-tap that costs
 * a streak.
 */

/** An event as the panel needs it: what it is, its goal, and what bounds one. */
export interface StripEvent {
  id: string;
  game: LaneId;
  title: string;
  /** The goal, when it is one this build can read. */
  goal: Goal | undefined;
  /** Something is stored under `goal`, readable or not. */
  hasStoredGoal: boolean;
  /** Detection is on and says this one repeats — what `dailyOverride` compares against. */
  detected: boolean;
  /** The weekday of the event's first game-day: its weeks most likely start there. */
  defaultWeekStartsOn: number;
  /** Claimable days in the run, or null when the end is unannounced. */
  maxDays: number | null;
}

/**
 * Something the strip carries on a game's behalf rather than from the feed: its
 * standing chore (`dailies:<game>`) or a built-in weekly or monthly task
 * (`routine:`). No goal to set — only whether the reader tracks it.
 */
export interface StripStanding {
  id: string;
  game: LaneId;
  title: string;
  kind: "chore" | "routine";
  tracked: boolean;
}

/** Which parts of the strip are switched on. */
export interface StripShown {
  chores: boolean;
  weekly: boolean;
  monthly: boolean;
}

/** Everything the strip needs to be edited in place. Built by App. */
export interface StripEditor {
  /** Running events already in the strip. */
  inStrip: StripEvent[];
  /** Running events the reader has not finished or ignored that are not in it. */
  addable: StripEvent[];
  onGoal: (id: string, goal: Goal | undefined) => void;
  /** `useProgress().setDaily`: the override, and whether the goal goes with it. */
  onDaily: (id: string, daily: boolean | undefined, clearsGoal?: boolean) => void;
  /** Open the event's detail sheet. */
  onOpen: (id: string) => void;
  shown: StripShown;
  /** Whether there is any weekly or monthly task to switch: a switch with nothing behind it is not offered. */
  hasTasks: { weekly: boolean; monthly: boolean };
  onShown: (patch: Partial<StripShown>) => void;
  /** Chores and built-ins of the strip's games, tracked or not; chore first in each game. */
  standing: StripStanding[];
  /** Track one, or stop. App writes the prefs that already decide it — nothing new for a chore. */
  onTrack: (item: StripStanding, track: boolean) => void;
}

/**
 * Items by lane: the reader's order first, then any lane only an item brought
 * — the rule `dailyGroups` follows — and never re-sorted inside a lane. A lane
 * with nothing in it is dropped. Pure.
 */
export function laneGroups<T extends { game: LaneId }>(
  games: readonly LaneId[],
  events: readonly T[],
): { game: LaneId; events: T[] }[] {
  const lanes: LaneId[] = [...games];
  for (const event of events) if (!lanes.includes(event.game)) lanes.push(event.game);
  return lanes
    .map((game) => ({ game, events: events.filter((e) => e.game === game) }))
    .filter((group) => group.events.length > 0);
}

export function EditPanel({
  games,
  editor,
  initialOpen = null,
  initialAdding = null,
}: {
  games: readonly LaneId[];
  editor: StripEditor;
  /** The row open on first render; for tests, which cannot press a button. */
  initialOpen?: string | null;
  /** The game whose add list is open on first render; for tests, likewise. */
  initialAdding?: LaneId | null;
}) {
  const gameMeta = useGameMeta();
  /** Which event's goal is open, by id. One at a time, as with the amount editor. */
  const [open, setOpen] = useState<string | null>(initialOpen);
  /**
   * The game whose add list is showing. Closed by default and one at a time:
   * a reader with every game on has a hundred running events, and listing them
   * all at once buried the strip's own events under a wall of pills.
   */
  const [adding, setAdding] = useState<LaneId | null>(initialAdding);
  const { inStrip, addable, shown, hasTasks, standing } = editor;

  const add = (event: StripEvent) => {
    editor.onDaily(event.id, dailyOverride(true, event.detected));
    // Straight to its goal: adding one is nearly always so as to give it one.
    setOpen(event.id);
  };

  const groups = laneGroups<StripEvent | StripStanding>(games, [...standing, ...inStrip, ...addable]);
  const untracked = standing.filter((s) => !s.tracked);

  return (
    <div className="relative mt-3 flex flex-col gap-3">
      {groups.map(({ game, events: items }) => {
        const meta = gameMeta(game);
        const kept = standing.filter((s) => s.game === game && s.tracked);
        const here = inStrip.filter((e) => items.includes(e));
        // What the game could track and does not: its chore or built-ins when
        // off, then its running events — one list, so "Track" means one thing.
        const more: (StripEvent | StripStanding)[] = [
          ...untracked.filter((s) => s.game === game),
          ...addable.filter((e) => items.includes(e)),
        ];
        return (
          <div key={game}>
            <p className="text-[0.6875rem] font-semibold" style={{ color: meta.hue }}>
              {meta.name}
            </p>
            {/* No goal to open, so the way out sits on the row itself. */}
            {kept.map((item) => (
              <div key={item.id} className="mt-1.5 flex items-baseline justify-between gap-3 text-xs">
                <span className="truncate text-muted">{item.title}</span>
                <button
                  type="button"
                  onClick={() => editor.onTrack(item, false)}
                  aria-label={`Stop tracking ${item.title}`}
                  className="shrink-0 text-faint transition-colors hover:text-muted"
                >
                  Stop tracking
                </button>
              </div>
            ))}
            {here.map((event) => {
              const isOpen = open === event.id;
              return (
                <div key={event.id} className="mt-1.5">
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : event.id)}
                    aria-expanded={isOpen}
                    className="flex w-full items-baseline justify-between gap-3 text-left text-xs"
                  >
                    <span className="truncate text-muted">{event.title}</span>
                    <span className="tnum shrink-0 text-faint">
                      {/* Unreadable is not "none": a newer version's goal is
                          still stored, and saying "No goal" would invite the
                          reader to think there is nothing to lose. */}
                      {event.goal === undefined && event.hasStoredGoal
                        ? "A goal this version can't read"
                        : goalSummary(event.goal)}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="mb-2 ml-3 border-l border-hairline pl-3">
                      <GoalControl
                        goal={event.goal}
                        defaultWeekStartsOn={event.defaultWeekStartsOn}
                        maxDays={event.maxDays}
                        onChange={(goal) => editor.onGoal(event.id, goal)}
                      />
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        <button
                          type="button"
                          onClick={() => editor.onOpen(event.id)}
                          className="text-muted transition-colors hover:text-ink"
                        >
                          Open details
                        </button>
                        {/* The sheet's "not a daily" control: the goal goes
                            with it, so the two never contradict. Named as the
                            chore's and built-ins' are, since it does the same. */}
                        <button
                          type="button"
                          onClick={() => {
                            editor.onDaily(event.id, dailyOverride(false, event.detected), true);
                            setOpen(null);
                          }}
                          className="text-faint transition-colors hover:text-muted"
                        >
                          {event.hasStoredGoal
                            ? "Stop tracking — removes the goal"
                            : "Stop tracking"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {more.length > 0 && (
              <button
                type="button"
                onClick={() => setAdding(adding === game ? null : game)}
                aria-expanded={adding === game}
                className="mt-1.5 text-xs text-faint transition-colors hover:text-muted"
              >
                Track · {more.length}
              </button>
            )}
            {more.length > 0 && adding === game && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {more.map((event) => (
                  <li key={event.id}>
                    <button
                      type="button"
                      onClick={() => ("kind" in event ? editor.onTrack(event, true) : add(event))}
                      aria-label={`Track ${event.title}`}
                      className="flex max-w-[15rem] items-center gap-1.5 rounded-full border border-dashed border-hairline px-3 py-1.5 text-xs text-faint transition-colors hover:border-faint hover:text-muted"
                    >
                      <svg viewBox="0 0 16 16" aria-hidden className="size-3 shrink-0">
                        <path
                          d="M8 3v10M3 8h10"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                      </svg>
                      <span className="truncate">{event.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      {addable.length === 0 && untracked.length === 0 && (
        <p className="text-[0.6875rem] leading-relaxed text-faint">
          Everything running is tracked. An event that hasn't started joins the list to track once
          it opens.
        </p>
      )}

      {/* The same prefs the settings' What you see group writes: one answer,
          reachable from where its effect is. */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-hairline pt-3 text-xs text-muted">
        <Switch
          label="Daily chores"
          checked={shown.chores}
          onChange={(chores) => editor.onShown({ chores })}
        />
        {hasTasks.weekly && (
          <Switch
            label="Weekly tasks"
            checked={shown.weekly}
            onChange={(weekly) => editor.onShown({ weekly })}
          />
        )}
        {hasTasks.monthly && (
          <Switch
            label="Monthly tasks"
            checked={shown.monthly}
            onChange={(monthly) => editor.onShown({ monthly })}
          />
        )}
      </div>
    </div>
  );
}

function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-[var(--color-near)]"
      />
      <span>{label}</span>
    </label>
  );
}
