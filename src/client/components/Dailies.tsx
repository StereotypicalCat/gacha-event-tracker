import { useEffect, useRef, useState } from "react";
import {
  catchUpDays,
  CATCH_UP_DAYS,
  dailiesId,
  dayKey,
  msUntilReset,
  streakOf,
} from "../../shared/daily.ts";
import { useGameMeta } from "../state/gameMeta.tsx";
import { isCustomGameId, type DisplayEvent, type LaneId } from "../../shared/custom.ts";
import type { GameMeta } from "../../shared/games.ts";
import type { GameId, Region } from "../../shared/schema.ts";
import { goalCount, goalLabel, type GoalStatus } from "../../shared/goal.ts";
import { addDays, periodOf, type Period } from "../../shared/period.ts";
import type { Task } from "../../shared/task.ts";
import { AmountEditor } from "./AmountEditor.tsx";
import { formatRemaining } from "../../shared/time.ts";
import { DayPip } from "./DayPip.tsx";
import { Fireworks } from "./Fireworks.tsx";

/**
 * The chores no source publishes.
 *
 * Commissions, sanity, daily training — the routine that runs whether or not
 * an event is on. They are the most-missed thing in every one of these games
 * and they appear on no wiki page, so they are a fixed client-side list rather
 * than feed data. Ticking one is stored in exactly the same day log an event's
 * checklist uses, so streaks and exports work the same way for both.
 *
 * Running events that repeat sit here too, so ticking today off never means
 * opening a sheet to find the checklist. The checklist is still where the whole
 * run lives — this is just today's line of it.
 *
 * Sits above the event list because it is the one part of the page that is
 * answerable in ten seconds and expires tonight.
 */

/**
 * One thing to do: a game's standing chore, one of its repeating events, or a
 * weekly or monthly task the reader set up.
 */
export interface DailyItem {
  /** The day-log key — `dailies:<game>` for a chore, the event or task id otherwise. */
  key: string;
  game: LaneId;
  label: string;
  title: string;
  ariaLabel: string;
  today: string;
  resetsIn: number;
  /**
   * Where a catch-up strip starts: the event's start, or null for a chore,
   * which has no start because it is a routine rather than an event.
   */
  notBefore: number | null;
  /**
   * The event's check-in goal or the task's status for its period. Chores have
   * none. An amount here makes the chip open an editor instead of ticking.
   */
  goal?: GoalStatus | undefined;
  /**
   * How often it is due. Chores and events are daily and make up the header's
   * "today" count; tasks are counted by their own period beside it.
   */
  cadence: "day" | "week" | "month";
  /** A task's period, for finding the one before it in Catch up. */
  period?: Period | undefined;
  /** A task's unit, printed after its target. */
  unit?: string | undefined;
}

/** A game and everything of its that wants ticking today. */
export interface DailyGroup {
  game: LaneId;
  meta: GameMeta;
  items: DailyItem[];
}

/**
 * A game's dailies, together.
 *
 * This used to be `[...chores, ...repeating]` — every game's standing chore,
 * then every repeating event — which put Genshin's commissions and Genshin's
 * login event at opposite ends of the strip with a dozen other games between
 * them. The reader thinks in games: if they marked an event as repeating, it
 * belongs beside the chores of the game it came from.
 *
 * The chore comes first inside a group because it is the one that exists every
 * day; the events follow **in the order they arrived**, because grouping is not
 * a licence to re-sort within a group — the same rule `lanes.ts` states for the
 * timeline's lanes.
 *
 * A lane the reader invented contributes events but no chore: there is no
 * routine we could name on their behalf (`docs/DATA-MODEL.md` § Reader-authored
 * key spaces). A group with nothing in it is dropped rather than rendered as an
 * empty heading.
 *
 * Pure, and exported so it is tested directly — the pattern `Timeline.tsx` uses
 * for `boardWindow` and `splitAt`.
 */
export function dailyGroups(
  games: readonly LaneId[],
  events: readonly DisplayEvent[],
  now: number,
  region: Region,
  meta: (id: LaneId) => GameMeta,
  startOf: (event: DisplayEvent) => number,
  showChores = true,
  goalFor: (id: string) => GoalStatus | undefined = () => undefined,
  tasks: readonly Task[] = [],
  taskStatusFor: (task: Task) => GoalStatus | undefined = () => undefined,
): DailyGroup[] {
  // A lane can arrive through an event without being in `games` — an event on a
  // game the reader has since switched off, say — and dropping it here would
  // quietly remove a tickable line. Ordered lanes first, then any straggler in
  // the order its events came.
  const lanes: LaneId[] = [...games];
  for (const event of events) {
    if (!lanes.includes(event.game)) lanes.push(event.game);
  }

  const groups: DailyGroup[] = [];
  for (const lane of lanes) {
    const game = meta(lane);
    const items: DailyItem[] = [];
    const today = dayKey(now, region, lane);
    const resetsIn = msUntilReset(now, region, lane);

    // The standing chore is the app's own invention — no source publishes
    // "Commissions, resin" — so it is the one part of this strip a reader can
    // reasonably want gone. Switched off it is simply not built; nothing reads
    // or writes its ticks here, so `dailies:<game>` keeps every day the reader
    // ever logged and switching back on restores the lot. A game the reader
    // invented never had one to begin with.
    if (showChores && !isCustomGameId(lane)) {
      items.push({
        key: dailiesId(lane as GameId),
        game: lane,
        label: game.short,
        title: game.dailyTasks,
        ariaLabel: `${game.name} dailies — ${game.dailyTasks}`,
        today,
        resetsIn,
        notBefore: null,
        cadence: "day",
      });
    }

    for (const event of events) {
      if (event.game !== lane) continue;
      items.push({
        key: event.id,
        game: lane,
        label: event.title,
        title: `${game.name} — ${event.title}`,
        ariaLabel: `${event.title} (${game.name})`,
        today,
        resetsIn,
        notBefore: startOf(event),
        goal: goalFor(event.id),
        cadence: "day",
      });
    }

    // A game's weekly and monthly tasks come last in its group: they are the
    // least urgent thing in it. Only for lanes the reader is looking at — unlike
    // an event, a task of a game they switched off is not something they are in
    // the middle of, and its ticks and numbers wait untouched.
    if (games.includes(lane)) {
      for (const task of tasks) {
        if (task.game !== lane) continue;
        items.push({
          key: task.id,
          game: lane,
          label: task.title,
          title: `${game.name} — ${task.title}`,
          ariaLabel: `${task.title} (${game.name})`,
          today,
          resetsIn,
          notBefore: null,
          goal: taskStatusFor(task),
          cadence: task.period.unit,
          period: task.period,
          unit: task.measure.kind === "amount" ? task.measure.unit : undefined,
        });
      }
    }

    if (items.length > 0) groups.push({ game: lane, meta: game, items });
  }
  return groups;
}

interface PeriodTally {
  total: number;
  complete: number;
}

/**
 * How much of the strip is finished. A daily item is complete when ticked today
 * or when its goal is already met — nothing is ticked on its behalf.
 * `tickedToday` is kept apart because only a real tick celebrates. Weekly and
 * monthly tasks are tallied by their own period: a task due by Sunday is not
 * "still waiting on you today" every morning.
 */
export function dailyTally(
  items: readonly DailyItem[],
  daysFor: (id: string) => string[],
): {
  total: number;
  complete: number;
  tickedToday: number;
  week: PeriodTally;
  month: PeriodTally;
} {
  let total = 0;
  let complete = 0;
  let tickedToday = 0;
  const week = { total: 0, complete: 0 };
  const month = { total: 0, complete: 0 };
  for (const i of items) {
    const met = i.goal?.met === true;
    if (i.cadence !== "day") {
      const tally = i.cadence === "week" ? week : month;
      tally.total += 1;
      if (met) tally.complete += 1;
      continue;
    }
    total += 1;
    const ticked = daysFor(i.key).includes(i.today);
    if (ticked) tickedToday += 1;
    if (ticked || met) complete += 1;
  }
  return { total, complete, tickedToday, week, month };
}

/** The chip's accessible name: today's tick and the goal are separate facts. */
export function chipLabel(
  base: string,
  isDone: boolean,
  goal: GoalStatus | undefined,
): string {
  // A number has no "today": it is wherever the reader last said it was.
  if (goal?.measure === "amount") return `${base}, ${goalLabel(goal)}`;
  if (!isDone && goal?.met === true) return `${base}, ${goalLabel(goal)}`;
  const today = isDone ? "done today" : "not done today";
  return goal === undefined ? `${base}, ${today}` : `${base}, ${today}, ${goalLabel(goal)}`;
}

export function Dailies({
  games,
  events,
  region,
  now,
  daysFor,
  onToggleDay,
  showChores,
  goalFor,
  tasks = [],
  taskStatusFor,
  onSetAmount,
  amountFor,
}: {
  /** Every lane the reader is looking at, in their own order. */
  games: LaneId[];
  /**
   * Live events that repeat daily — detected, or marked by the reader — and
   * that the reader has not already finished or ignored. An event they marked
   * done has no line left to tick, and listing it is the app arguing with them.
   */
  events: DisplayEvent[];
  region: Region;
  /** Whether to carry each game's standing chore — `prefs.showChores`. */
  showChores: boolean;
  now: number;
  daysFor: (id: string) => string[];
  onToggleDay: (id: string, day: string) => void;
  /**
   * An event's check-in goal status, when the reader set one. A met goal
   * completes its item for the header without ticking anything.
   */
  goalFor?: ((id: string) => GoalStatus | undefined) | undefined;
  /** The reader's weekly and monthly tasks, all of them; the strip picks its lanes'. */
  tasks?: readonly Task[] | undefined;
  taskStatusFor?: ((task: Task) => GoalStatus | undefined) | undefined;
  /** Record a number for an item's period. */
  onSetAmount?: ((key: string, periodStart: string, value: number) => void) | undefined;
  /** The number recorded for an item's period, if any. */
  amountFor?: ((key: string, periodStart: string) => number | undefined) | undefined;
}) {
  const gameMeta = useGameMeta();
  /**
   * Whether the strip is showing the last fortnight.
   *
   * Per-visit state and deliberately not a stored preference, for the reason
   * expanding a truncated list is not one: it is something a reader does while
   * reading — "I did Tuesday, let me say so" — rather than a statement about how
   * the app should work.
   */
  const [catchUp, setCatchUp] = useState(false);
  /** Which amount chip's editor is open, by item key. One at a time. */
  const [editing, setEditing] = useState<string | null>(null);

  // Each game rolls on its own server clock, so "today" is asked per game
  // rather than once for the section — Endfield's European day can still be
  // yesterday's while every HoYo game has already turned over.
  const groups = dailyGroups(
    games,
    events,
    now,
    region,
    gameMeta,
    (event) => Date.parse(event.startsAt),
    showChores,
    goalFor,
    tasks,
    taskStatusFor,
  );
  const items = groups.flatMap((group) => group.items);
  const { total, complete, tickedToday, week, month } = dailyTally(items, daysFor);
  const allDone = total > 0 && complete === total;

  const [burst, setBurst] = useState(0);
  // Null until the first render has been seen, so arriving at a page where
  // everything is already ticked is not treated as having just finished it.
  const previous = useRef<{ total: number; tickedToday: number } | null>(null);

  useEffect(() => {
    const was = previous.current;
    previous.current = { total, tickedToday };
    if (was === null || !allDone) return;
    // Celebrate a tick today that finished the strip, and only that. The list
    // also gets shorter when the reader focuses a single game or marks a
    // repeating event done, which can land on "all complete" without them
    // having ticked anything — a burst there is the app congratulating them for
    // filtering. A backfilled day can complete the strip too, by meeting a
    // week's goal, and that is not something they just did either; so the
    // count watched is today's ticks, not completion.
    if (was.total === total && tickedToday > was.tickedToday) setBurst((n) => n + 1);
  }, [total, tickedToday, allDone]);

  useEffect(() => {
    if (burst === 0) return;
    const id = setTimeout(() => setBurst(0), 1400);
    return () => clearTimeout(id);
  }, [burst]);

  if (items.length === 0) return null;

  // With mixed reset clocks there is no single "resets in", so the header
  // reports the next one to land and says that it is the next one.
  const soonest = Math.min(...items.map((i) => i.resetsIn));
  const mixed = new Set(items.map((i) => i.resetsIn)).size > 1;
  const open = items.find((i) => i.key === editing && i.goal?.measure === "amount");

  return (
    <section className="relative border-b border-hairline px-4 py-4">
      {burst > 0 && <Fireworks key={burst} />}

      <div className="relative flex items-baseline justify-between gap-3">
        <h2 className="eyebrow">
          {total > 0 ? <>Today's dailies · {complete}/{total}</> : "Your tasks"}
          {week.total > 0 && <> · Weekly {week.complete}/{week.total}</>}
          {month.total > 0 && <> · Monthly {month.complete}/{month.total}</>}
        </h2>
        <p className="tnum text-[0.6875rem] text-faint">
          {mixed ? "next reset in " : "resets in "}
          {formatRemaining(soonest)}
        </p>
      </div>

      {catchUp ? (
        <CatchUpPanel
          groups={groups}
          now={now}
          region={region}
          daysFor={daysFor}
          onToggleDay={onToggleDay}
          onSetAmount={onSetAmount}
          amountFor={amountFor}
        />
      ) : (
        /* One wrapping row, with each game's chore and its events adjacent. No
           per-game headings here: this is the part of the page answerable in ten
           seconds, and a heading per game would make it the tallest block on it,
           pushing "next to expire" — the answer the reader came for — down the
           page. The hue already says which game a chip belongs to. */
        <ul className="relative mt-2.5 flex flex-wrap gap-1.5">
          {items.map((item) => (
            <li key={item.key}>
              {item.goal?.measure === "amount" ? (
                <AmountChip
                  label={item.label}
                  hue={gameMeta(item.game).hue}
                  title={item.title}
                  ariaLabel={item.ariaLabel}
                  goal={item.goal}
                  open={editing === item.key}
                  onOpen={() => setEditing(editing === item.key ? null : item.key)}
                />
              ) : (
                <TickChip
                  label={item.label}
                  hue={gameMeta(item.game).hue}
                  title={item.title}
                  ariaLabel={item.ariaLabel}
                  days={daysFor(item.key)}
                  today={item.today}
                  goal={item.goal}
                  onToggle={() => onToggleDay(item.key, item.today)}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Under the strip rather than inside the chip: a chip is one target, and
          a field inside it would be a second one waiting to be mis-tapped. */}
      {!catchUp && open?.goal !== undefined && onSetAmount !== undefined && (
        <AmountEditor
          key={`${open.key}:${open.goal.periodStart}`}
          autoFocus
          label={`${open.label} this ${open.goal.scope === "event" ? "event" : open.goal.scope}:`}
          value={amountFor?.(open.key, open.goal.periodStart)}
          target={open.goal.required}
          unit={open.unit}
          onSave={(value) => {
            onSetAmount(open.key, open.goal!.periodStart, value);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      <div className="relative mt-2 flex items-baseline justify-between gap-3">
        <p className="text-[0.6875rem] leading-relaxed text-faint">
          {catchUp
            ? `Tick a day you did but didn't record. The last ${CATCH_UP_DAYS} days, and nothing later than today.`
            : total === 0
              ? week.complete + month.complete === week.total + month.total
                ? "All done for this week and month."
                : `${waiting(week.total + month.total - week.complete - month.complete)} still open this week or month.`
              : allDone
                ? "All done. Nothing else expires tonight."
                : `${waiting(total - complete)} still waiting on you today.`}
        </p>
        {/* The way back to a day you already did. It lives on the section rather
            than on each chip because a chip is a single tick target, and a
            second control inside one is a mis-tap that costs a streak. */}
        <button
          type="button"
          onClick={() => setCatchUp((on) => !on)}
          aria-expanded={catchUp}
          className="shrink-0 text-[0.6875rem] text-faint transition-colors hover:text-muted"
        >
          {catchUp ? "Done" : "Catch up"}
        </button>
      </div>
    </section>
  );
}

/**
 * The last fortnight, for saying you did a day you never ticked.
 *
 * Its own component rather than a branch inside the section, so it can be
 * rendered and asserted on directly — the interesting parts are which days
 * appear and whose clock they were cut on, and neither is reachable through a
 * `useState` from a test.
 *
 * Expanded there is vertical room, so the grouping becomes a heading per game.
 * Collapsed it is adjacency alone: the strip is the part of the page answerable
 * in ten seconds, and a heading per game would make it the tallest block on it.
 *
 * Every strip is cut with its own item's game, never the section's — Endfield
 * serves Europe off the Americas machine, so a tick written under one clock and
 * read under another is a day the reader loses.
 */
export function CatchUpPanel({
  groups,
  now,
  region,
  daysFor,
  onToggleDay,
  onSetAmount,
  amountFor,
}: {
  groups: DailyGroup[];
  now: number;
  region: Region;
  daysFor: (id: string) => string[];
  onToggleDay: (id: string, day: string) => void;
  onSetAmount?: ((key: string, periodStart: string, value: number) => void) | undefined;
  amountFor?: ((key: string, periodStart: string) => number | undefined) | undefined;
}) {
  return (
    <div className="relative mt-3 flex flex-col gap-3">
      {groups.map((group) => (
        <div key={group.game}>
          <p
            className="text-[0.6875rem] font-semibold"
            style={{ color: group.meta.hue }}
          >
            {group.meta.name}
          </p>
          {group.items.map((item) => {
            // A number is caught up a period at a time: the one just gone is
            // the one a reader forgets to record. An event's number is edited
            // in its sheet, where its whole run is.
            if (item.goal?.measure === "amount") {
              if (item.period === undefined || onSetAmount === undefined) return null;
              const previous = periodOf(item.period, addDays(item.goal.periodStart, -1)).start;
              return (
                <div key={item.key} className="mt-1.5">
                  <p className="truncate text-xs text-muted">{item.label}</p>
                  <AmountEditor
                    key={previous}
                    label={`Last ${item.period.unit}:`}
                    value={amountFor?.(item.key, previous)}
                    target={item.goal.required}
                    unit={item.unit}
                    onSave={(value) => onSetAmount(item.key, previous, value)}
                  />
                </div>
              );
            }
            return (
            <div key={item.key} className="mt-1.5">
              <p className="truncate text-xs text-muted">{item.label}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {catchUpDays(now, region, item.game, item.notBefore).map((day) => (
                  <DayPip
                    key={day}
                    day={day}
                    today={item.today}
                    done={daysFor(item.key).includes(day)}
                    onToggle={() => onToggleDay(item.key, day)}
                  />
                ))}
              </div>
            </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * A number against a target: `1,900/2,100 wk`, with a hairline under it filling
 * to the same fraction.
 *
 * Not a toggle — there is nothing to tick — so no `aria-pressed`; it opens the
 * editor under the strip and says so with `aria-expanded`. Met, it takes the
 * goal-met look a tick chip has: full hue, no wash, since a wash means "done
 * today" and a number is never that.
 */
function AmountChip({
  label,
  hue,
  title,
  ariaLabel,
  goal,
  open,
  onOpen,
}: {
  label: string;
  hue: string;
  title: string;
  ariaLabel: string;
  goal: GoalStatus;
  open: boolean;
  onOpen: () => void;
}) {
  const share = Math.min(1, goal.required === 0 ? 0 : goal.count / goal.required);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-expanded={open}
      aria-label={chipLabel(ariaLabel, false, goal)}
      title={title}
      className="hue-chip relative flex max-w-[15rem] items-center gap-2 overflow-hidden rounded-full border px-3 py-1.5 text-xs font-medium"
      style={{
        ["--hue" as string]: hue,
        borderColor: goal.met ? hue : `color-mix(in srgb, ${hue} 20%, transparent)`,
        color: goal.met ? hue : "var(--color-muted)",
        background: `color-mix(in srgb, ${hue} 3%, transparent)`,
      }}
    >
      <span className="hue-chip-label truncate">{label}</span>
      <span className="tnum shrink-0 text-[0.625rem] opacity-70">{goalCount(goal)}</span>
      <span
        aria-hidden
        className="absolute bottom-0 left-0 h-[2px]"
        style={{ width: `${share * 100}%`, background: hue, opacity: goal.met ? 1 : 0.6 }}
      />
    </button>
  );
}

/**
 * One thing to tick off today.
 *
 * The same pill whether it is a game's standing chore or an event that repeats:
 * to the reader at 23:50 they are the same job, and the distinction between
 * "the app knows about this" and "a wiki published it" is ours, not theirs.
 *
 * The game's hue is on the border in both states — faintly while the job is
 * outstanding, fully once it is done. A chip that only takes its colour on
 * completion means the strip you actually scan, the unfinished one, is a row of
 * identical grey pills with no clue which game each belongs to.
 *
 * The outstanding tint is kept low enough to read as a hint rather than a
 * state: it has to say *which game* without competing with the tick, which is
 * the only thing on the chip that answers the question the reader came with.
 * Ticking one should be a visible jump, not a nudge.
 *
 * An event with a check-in goal has a third state: nothing ticked today, but
 * the week's count already met. It takes the done border and a full-strength
 * check, drawn dashed, and keeps the outstanding ground — only a real tick
 * earns the wash, so "done this week" never reads as "done today".
 */
function TickChip({
  label,
  hue,
  title,
  ariaLabel,
  days,
  today,
  goal,
  onToggle,
}: {
  label: string;
  hue: string;
  title: string;
  ariaLabel: string;
  days: string[];
  today: string;
  goal?: GoalStatus | undefined;
  onToggle: () => void;
}) {
  const isDone = days.includes(today);
  const met = !isDone && goal?.met === true;
  const streak = streakOf(days, today);

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={isDone}
      aria-label={chipLabel(ariaLabel, isDone, goal)}
      title={title}
      // `.hue-chip` is the shared hover: the chip's own colours are the game's
      // hue and arrive inline, which no rule can override, so it is drawn from
      // what inline does not own. `--hue` below is the only thing it needs;
      // pressed-ness it reads off `aria-pressed`, which is already up there.
      className="hue-chip flex max-w-[15rem] items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium"
      style={{
        ["--hue" as string]: hue,
        borderColor: isDone || met ? hue : `color-mix(in srgb, ${hue} 20%, transparent)`,
        // Colour identifies the game; done-ness is carried by the tick, the
        // full-strength border and the wash. Keeping the label readable matters
        // more than saturating it, so an outstanding chip stays on muted ink.
        color: isDone || met ? hue : "var(--color-muted)",
        background: isDone
          ? `color-mix(in srgb, ${hue} 14%, transparent)`
          : `color-mix(in srgb, ${hue} 3%, transparent)`,
      }}
    >
      <svg viewBox="0 0 16 16" aria-hidden className="size-3 shrink-0">
        <path
          d="M2.5 8.5l3.5 3.5 7.5-8"
          fill="none"
          stroke={isDone || met ? "currentColor" : hue}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={met ? "2 2.6" : undefined}
          opacity={isDone || met ? 1 : 0.25}
        />
      </svg>
      <span className="hue-chip-label truncate">{label}</span>
      {/* One counter per pill. With a goal, its count is the one that answers
          "is this week done?"; a streak is beside the point when every day was
          never required. */}
      {goal !== undefined ? (
        <span className="tnum shrink-0 text-[0.625rem] opacity-70">{goalCount(goal)}</span>
      ) : (
        streak > 1 && (
          <span className="tnum shrink-0 text-[0.625rem] opacity-70">{streak}d</span>
        )
      )}
    </button>
  );
}

function waiting(n: number): string {
  return n === 1 ? "One thing" : `${n} things`;
}
