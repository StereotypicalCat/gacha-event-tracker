import { useEffect, useRef } from "react";
import { useGameMeta } from "../state/gameMeta.tsx";
import type { LaneId } from "../../shared/custom.ts";
import { DAY } from "../../shared/time.ts";
import type { RowEvent } from "./EventRow.tsx";
import { URGENCY_COLOR } from "./Meter.tsx";

const DAY_WIDTH = 13; // px per day — dense enough to see a patch cycle at once

/**
 * How far in from the left edge of the board a pinned label sits.
 *
 * Both the lane names and the event names stick here rather than riding off
 * with their own start dates. A six-week event begins weeks off-screen, and a
 * bar whose name scrolled away with its start date is a coloured rectangle.
 */
const PIN = 8;

/**
 * A sliver of time before now, so the "now" rule reads as a line in the view
 * rather than merging with the border.
 */
const HALF_DAY_LEAD = 12 * 60 * 60 * 1000;

/**
 * How far back the view can be scrolled beyond the oldest running event, so
 * "when did this start?" is answerable without the window being unbounded.
 */
const PAST_LEAD = 7 * DAY;

/** Where the now rule sits when the board opens: a little in from the edge. */
const OPEN_INSET = 28;

/**
 * One lane per game, bars spanning start→end, today pinned as a rule.
 *
 * The quiet view. The ending-soon list carries the page's boldness, so this
 * stays flat and legible: no gradients, no rounded chrome, just position and
 * length doing the work.
 *
 * It is a board rather than a stretch of page — its own pane, scrolling in both
 * directions, with the date axis pinned to the top and every name pinned to the
 * left. All three used to scroll away together, which is what made a wide
 * window worse rather than better: more calendar on screen, and nothing left
 * saying which day, whose game, or which event you were looking at.
 */
export function Timeline({
  rows,
  now,
  onOpen,
  isDone,
}: {
  rows: RowEvent[];
  now: number;
  onOpen: (id: string) => void;
  /**
   * Asked rather than derived from the progress store: an entry exists there
   * the moment a reader records an effort or a note, and dimming a bar for
   * that would say "finished" about something they have not started.
   */
  isDone: (id: string) => boolean;
}) {
  const gameMeta = useGameMeta();
  const scroller = useRef<HTMLDivElement>(null);

  const ends = rows.map((r) => r.clock.endsMs ?? r.clock.startsMs + 14 * DAY);
  const starts = rows.map((r) => r.clock.startsMs);

  // The window covers the past too, so a reader can scroll back to see when a
  // running event began — but it *opens* scrolled to now, because that is what
  // they came for. Rendering from the earliest start alone buried today
  // off-screen; clamping to now made the past unreachable. This does both.
  const min = Math.min(...starts, now) - PAST_LEAD;
  const max = Math.max(...ends, now) + 2 * DAY;
  const totalDays = Math.ceil((max - min) / DAY);
  const chartWidth = totalDays * DAY_WIDTH;
  /** One coordinate space for everything: bars, gridlines and the now rule. */
  const x = (ms: number) => ((ms - min) / DAY) * DAY_WIDTH;

  // Open at today rather than at the far past, with a little of the past week
  // still on screen — an event that began three days ago is context, not
  // history. Keyed on the rounded offset so it runs when the range changes,
  // not every second: re-scrolling on each tick would fight the reader.
  const openAt = Math.round(Math.max(0, x(now - HALF_DAY_LEAD) - OPEN_INSET));
  const jumpToNow = (behavior: ScrollBehavior) =>
    scroller.current?.scrollTo({ left: openAt, behavior });

  useEffect(() => {
    jumpToNow("instant");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openAt]);

  if (rows.length === 0) {
    return (
      <p className="px-4 py-10 text-sm text-muted">
        Nothing to plot. Switch a game back on to see its schedule.
      </p>
    );
  }

  const byGame = new Map<LaneId, RowEvent[]>();
  for (const row of rows) {
    byGame.set(row.event.game, [...(byGame.get(row.event.game) ?? []), row]);
  }

  const months = monthBoundaries(min, max);
  const weeks = weekBoundaries(min, max);

  return (
    <>
      {/* The board's own header. The jump control lives out here rather than
          floating over the chart: pinned inside, it would sit on top of the
          calendar and cover the very dates it sends you back to. */}
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-2.5">
        <p className="eyebrow">One lane per game</p>
        <button
          type="button"
          onClick={() => jumpToNow("smooth")}
          className="text-[0.6875rem] font-medium text-faint transition-colors duration-150 hover:text-ink"
        >
          Jump to today
        </button>
      </div>

      <div
        ref={scroller}
        /*
         * The pane scrolls, not the page — which is what lets the axis stay
         * put. Capped rather than fixed: three lanes take the height they need
         * and nothing scrolls vertically at all.
         */
        className="scroll-pane relative max-h-[72vh] overflow-auto overscroll-x-contain"
      >
        <div className="relative" style={{ width: chartWidth, minWidth: "100%" }}>
          {/* Gridlines first, so everything else paints over them. */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            {weeks.map((ms) => (
              <span
                key={ms}
                className="absolute bottom-0 top-10 w-px bg-hairline/40"
                style={{ left: x(ms) }}
              />
            ))}
            {months.slice(1).map((m) => (
              <span
                key={m.ms}
                className="absolute bottom-0 top-10 w-px bg-hairline"
                style={{ left: x(m.ms) }}
              />
            ))}
          </div>

          {/* Now: the one rule that has to be findable from anywhere. */}
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-0 top-10 z-10 w-px bg-critical/80"
            style={{ left: x(now) }}
          >
            <span className="eyebrow absolute top-1 -translate-x-1/2 rounded-[3px] bg-critical px-1 py-px text-[0.5625rem] leading-none text-ground">
              now
            </span>
          </div>

          {/* The axis: months above, week dates below, pinned to the top. */}
          <div className="sticky top-0 z-30 h-10 border-b border-hairline bg-ground/95 backdrop-blur">
            {months.map((m) => (
              <span
                key={m.ms}
                className="eyebrow absolute top-1 whitespace-nowrap pl-1.5 text-faint"
                style={{ left: x(m.ms) }}
              >
                {m.label}
              </span>
            ))}
            {weeks.map((ms) => (
              <span
                key={ms}
                className="tnum absolute bottom-1 whitespace-nowrap pl-1.5 text-[0.625rem] leading-none text-faint"
                style={{ left: x(ms) }}
              >
                {dayLabel(ms)}
              </span>
            ))}
          </div>

          <div className="space-y-5 pb-8 pt-4">
            {[...byGame.entries()].map(([gameId, events]) => {
              const game = gameMeta(gameId);
              return (
                <div key={gameId}>
                  {/* On its own line and pinned to the left edge, so the lane
                      keeps its name at any scroll position without a frozen
                      column standing on top of the calendar. */}
                  <p
                    className="eyebrow sticky left-0 z-20 mb-1.5 w-fit bg-ground pr-2 text-[0.625rem]"
                    style={{ color: game.hue, paddingLeft: PIN }}
                    title={game.name}
                  >
                    {game.short}
                  </p>

                  <div className="relative space-y-1">
                    {events.map(({ event, clock }) => {
                      const unknownEnd = clock.endsMs === null;
                      // Only clipped if it began before the rendered window,
                      // which reaches a week past the oldest running event — so
                      // in practice bars show their real start and the fade is
                      // reserved for genuinely truncated ones.
                      const clippedStart = clock.startsMs < min;
                      const left = Math.max(x(clock.startsMs), 0);
                      const right = x(clock.endsMs ?? clock.startsMs + 14 * DAY);
                      const done = isDone(event.id);
                      return (
                        <button
                          key={event.id}
                          type="button"
                          onClick={() => onOpen(event.id)}
                          title={event.title}
                          className={`relative flex h-7 items-center rounded-[4px] px-2 text-left text-[0.6875rem] font-medium transition-opacity hover:opacity-100 ${
                            done ? "opacity-35" : "opacity-90"
                          }`}
                          style={{
                            marginLeft: left,
                            width: Math.max(right - left, 26),
                            background: `color-mix(in srgb, ${game.hue} 22%, var(--color-surface))`,
                            // No start edge to draw when the bar begins before
                            // the view does.
                            borderLeft: clippedStart
                              ? undefined
                              : `2px solid ${game.hue}`,
                            // Frayed right = end unannounced; faded left =
                            // started before the window. Both are honest about
                            // what is not shown.
                            maskImage: edgeMask(clippedStart, unknownEnd),
                            color: "var(--color-ink)",
                          }}
                        >
                          {/* Sticky clamps to the bar's own box, so a name can
                              never wander outside the event it belongs to. */}
                          <span
                            className="sticky truncate"
                            style={{ left: PIN }}
                          >
                            {event.title}
                          </span>
                          <span
                            aria-hidden
                            className="ml-auto size-1.5 shrink-0 rounded-full"
                            style={{ background: URGENCY_COLOR[clock.urgency] }}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Fade a bar's edge where the truth extends past what is drawn: the left when
 * the event began before the view opens, the right when its end is unannounced.
 */
function edgeMask(clippedStart: boolean, unknownEnd: boolean): string | undefined {
  if (clippedStart && unknownEnd) {
    return "linear-gradient(90deg, transparent 0%, #000 14%, #000 60%, transparent 100%)";
  }
  if (clippedStart) return "linear-gradient(90deg, transparent 0%, #000 14%)";
  if (unknownEnd) return "linear-gradient(90deg, #000 60%, transparent 100%)";
  return undefined;
}

/** `18 Aug`, in the reader's own locale, for the week ticks. */
function dayLabel(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

/**
 * Every Monday in range.
 *
 * Weeks are the unit these schedules are actually written in — a patch is six
 * of them — and a tick every seven days is the densest grid that still leaves
 * room for a date on it.
 */
function weekBoundaries(min: number, max: number): number[] {
  const d = new Date(min);
  d.setUTCHours(0, 0, 0, 0);
  // 0 is Sunday; step forward to the next Monday.
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7));
  const out: number[] = [];
  while (d.getTime() <= max) {
    out.push(d.getTime());
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return out;
}

function monthBoundaries(min: number, max: number) {
  const short = (ms: number) =>
    new Date(ms).toLocaleDateString(undefined, { month: "short" });

  // The window opens mid-month, so the first real boundary can be weeks away.
  // Label the left edge with the current month or the opening stretch has no
  // date context at all.
  const out: Array<{ ms: number; label: string }> = [
    { ms: min, label: short(min) },
  ];

  const d = new Date(min);
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCMonth(d.getUTCMonth() + 1);
  while (d.getTime() <= max) {
    out.push({ ms: d.getTime(), label: short(d.getTime()) });
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}
