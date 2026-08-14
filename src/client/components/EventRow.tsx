import { gameMeta } from "../../shared/games.ts";
import type { GachaEvent } from "../../shared/schema.ts";
import { formatRemaining, type EventClock } from "../../shared/time.ts";
import { Meter, URGENCY_COLOR } from "./Meter.tsx";

export interface RowEvent {
  event: GachaEvent;
  clock: EventClock;
}

interface EventRowProps {
  row: RowEvent;
  completed: boolean;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}

export function EventRow({ row, completed, onToggle, onOpen }: EventRowProps) {
  const { event, clock } = row;
  const game = gameMeta(event.game);
  const heat = URGENCY_COLOR[clock.urgency];

  const countdown = clock.upcoming
    ? `starts in ${formatRemaining(clock.startsMs - Date.now())}`
    : clock.msRemaining === null
      ? "end date unknown"
      : formatRemaining(clock.msRemaining);

  return (
    <li
      className={`group relative flex gap-3 border-b border-hairline/70 px-4 py-3.5 transition-opacity ${
        completed ? "opacity-40" : ""
      }`}
    >
      {/* Game identity: a hue stripe, never an urgency colour. */}
      <span
        aria-hidden
        className="mt-1 w-[3px] shrink-0 rounded-full"
        style={{ background: game.hue }}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <button
            type="button"
            onClick={() => onOpen(event.id)}
            className="min-w-0 text-left"
          >
            <span
              className="eyebrow block truncate"
              style={{ color: game.hue }}
            >
              {game.short}
            </span>
            <span
              className={`block truncate text-[0.9375rem] font-medium leading-snug ${
                completed ? "line-through decoration-faint" : ""
              }`}
            >
              {event.title}
            </span>
          </button>

          <span
            className="tnum shrink-0 font-display text-sm font-semibold tabular-nums"
            style={{ color: clock.msRemaining === null ? "var(--color-faint)" : heat }}
          >
            {countdown}
          </span>
        </div>

        <div className="mt-2.5">
          <Meter
            progress={clock.upcoming ? 1 : clock.progress}
            urgency={clock.urgency}
            label={`${event.title}: ${countdown}`}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => onToggle(event.id)}
        aria-pressed={completed}
        aria-label={completed ? `Mark ${event.title} not done` : `Mark ${event.title} done`}
        className={`mt-0.5 grid size-7 shrink-0 place-items-center self-center rounded-md border transition-colors ${
          completed
            ? "border-transparent bg-near/20 text-near"
            : "border-hairline text-faint hover:border-faint hover:text-muted"
        }`}
      >
        <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
          <path
            d="M2.5 8.5l3.5 3.5 7.5-8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </li>
  );
}
