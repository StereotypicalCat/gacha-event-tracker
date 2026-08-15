import { useEffect, useRef } from "react";
import { gameMeta } from "../../shared/games.ts";
import type { GameId } from "../../shared/schema.ts";
import { DAY } from "../../shared/time.ts";
import type { RowEvent } from "./EventRow.tsx";
import { URGENCY_COLOR } from "./Meter.tsx";

const DAY_WIDTH = 13; // px per day — dense enough to see a patch cycle at once

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

/**
 * One lane per game, bars spanning start→end, today pinned as a rule.
 *
 * The quiet view. The ending-soon list carries the page's boldness, so this
 * stays flat and legible: no gradients, no rounded chrome, just position and
 * length doing the work.
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
  const scroller = useRef<HTMLDivElement>(null);

  const ends = rows.map((r) => r.clock.endsMs ?? r.clock.startsMs + 14 * DAY);
  const starts = rows.map((r) => r.clock.startsMs);

  // The window covers the past too, so a reader can scroll back to see when a
  // running event began — but it *opens* scrolled to now, because that is what
  // they came for. Rendering from the earliest start alone buried today
  // off-screen; clamping to now made the past unreachable. This does both.
  const min = Math.min(...starts, now) - PAST_LEAD;
  const max = Math.max(...ends, now) + 2 * DAY;
  // Where "now" sits, so the container can be scrolled there on open.
  const nowOffset = ((now - HALF_DAY_LEAD - min) / DAY) * DAY_WIDTH;
  const totalDays = Math.ceil((max - min) / DAY);
  const width = totalDays * DAY_WIDTH;
  const x = (ms: number) => ((ms - min) / DAY) * DAY_WIDTH;

  // Open at today rather than at the far past. Keyed on the rounded offset so
  // it runs when the range changes, not every second — re-scrolling on each
  // tick would fight the reader's own scrolling.
  const openAt = Math.round(nowOffset);
  useEffect(() => {
    scroller.current?.scrollTo({ left: openAt, behavior: "instant" });
  }, [openAt]);

  if (rows.length === 0) {
    return (
      <p className="px-4 py-10 text-sm text-muted">
        Nothing to plot. Switch a game back on to see its schedule.
      </p>
    );
  }

  const byGame = new Map<GameId, RowEvent[]>();
  for (const row of rows) {
    byGame.set(row.event.game, [...(byGame.get(row.event.game) ?? []), row]);
  }

  const monthTicks = monthBoundaries(min, max);

  return (
    <div ref={scroller} className="scroll-x">
      <div style={{ width, minWidth: "100%" }} className="relative px-4 pb-8 pt-3">
        {/* Month rule, so a bar's absolute position means something. */}
        <div className="relative mb-3 h-4 border-b border-hairline">
          {monthTicks.map((t) => (
            <span
              key={t.ms}
              className="eyebrow absolute -translate-x-px whitespace-nowrap border-l border-hairline pl-1"
              style={{ left: x(t.ms) }}
            >
              {t.label}
            </span>
          ))}
        </div>

        <div
          aria-hidden
          className="absolute bottom-8 top-8 z-10 w-px bg-critical/70"
          style={{ left: x(now) + 16 }}
        >
          <span className="eyebrow absolute -top-4 left-1 text-critical">now</span>
        </div>

        <div className="space-y-4">
          {[...byGame.entries()].map(([gameId, events]) => {
            const game = gameMeta(gameId);
            return (
              <div key={gameId}>
                <p className="eyebrow mb-1.5" style={{ color: game.hue }}>
                  {game.short}
                </p>
                <div className="relative h-auto space-y-1">
                  {events.map(({ event, clock }) => {
                    const unknownEnd = clock.endsMs === null;
                    // Only clipped if it began before the rendered window,
                    // which now reaches a week past the oldest running event —
                    // so in practice bars show their real start and the fade is
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
                        className={`relative flex h-6 items-center overflow-hidden rounded-[3px] px-1.5 text-left text-[0.6875rem] font-medium transition-opacity hover:opacity-100 ${
                          done ? "opacity-35" : "opacity-90"
                        }`}
                        style={{
                          marginLeft: left,
                          width: Math.max(right - left, 22),
                          background: `color-mix(in srgb, ${game.hue} 22%, var(--color-surface))`,
                          // No start edge to draw when the bar begins before
                          // the view does.
                          borderLeft: clippedStart
                            ? undefined
                            : `2px solid ${game.hue}`,
                          // Frayed right = end unannounced; faded left = started
                          // before now. Both are honest about what is not shown.
                          maskImage: edgeMask(clippedStart, unknownEnd),
                          color: "var(--color-ink)",
                        }}
                      >
                        <span className="truncate">{event.title}</span>
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
