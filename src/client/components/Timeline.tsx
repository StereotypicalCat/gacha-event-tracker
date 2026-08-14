import { gameMeta } from "../../shared/games.ts";
import type { GameId } from "../../shared/schema.ts";
import { DAY } from "../../shared/time.ts";
import type { RowEvent } from "./EventRow.tsx";
import { URGENCY_COLOR } from "./Meter.tsx";

const DAY_WIDTH = 13; // px per day — dense enough to see a patch cycle at once

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
  completions,
}: {
  rows: RowEvent[];
  now: number;
  onOpen: (id: string) => void;
  completions: Record<string, unknown>;
}) {
  if (rows.length === 0) {
    return (
      <p className="px-4 py-10 text-sm text-muted">
        Nothing to plot. Switch a game back on to see its schedule.
      </p>
    );
  }

  const starts = rows.map((r) => r.clock.startsMs);
  const ends = rows.map((r) => r.clock.endsMs ?? r.clock.startsMs + 14 * DAY);
  const min = Math.min(...starts, now) - 2 * DAY;
  const max = Math.max(...ends, now) + 2 * DAY;
  const totalDays = Math.ceil((max - min) / DAY);
  const width = totalDays * DAY_WIDTH;
  const x = (ms: number) => ((ms - min) / DAY) * DAY_WIDTH;

  const byGame = new Map<GameId, RowEvent[]>();
  for (const row of rows) {
    byGame.set(row.event.game, [...(byGame.get(row.event.game) ?? []), row]);
  }

  const monthTicks = monthBoundaries(min, max);

  return (
    <div className="scroll-x">
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
                    const left = x(clock.startsMs);
                    const unknownEnd = clock.endsMs === null;
                    const right = x(clock.endsMs ?? clock.startsMs + 14 * DAY);
                    const done = completions[event.id] !== undefined;
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
                          borderLeft: `2px solid ${game.hue}`,
                          // A frayed right edge says the end is unannounced —
                          // visually distinct from an event ending far away.
                          maskImage: unknownEnd
                            ? "linear-gradient(90deg, #000 60%, transparent 100%)"
                            : undefined,
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

function monthBoundaries(min: number, max: number) {
  const out: Array<{ ms: number; label: string }> = [];
  const d = new Date(min);
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  while (d.getTime() <= max) {
    if (d.getTime() >= min) {
      out.push({
        ms: d.getTime(),
        label: d.toLocaleDateString(undefined, { month: "short" }),
      });
    }
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}
