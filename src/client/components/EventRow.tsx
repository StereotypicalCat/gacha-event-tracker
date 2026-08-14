import { gameMeta } from "../../shared/games.ts";
import type { GachaEvent } from "../../shared/schema.ts";
import {
  formatRemaining,
  windowCaption,
  type EventClock,
} from "../../shared/time.ts";
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

  const caption = windowCaption(clock, Date.now());

  const countdown = clock.upcoming
    ? `starts in ${formatRemaining(clock.startsMs - Date.now())}`
    : clock.msRemaining === null
      ? "end date unknown"
      : formatRemaining(clock.msRemaining);

  return (
    <li
      className={`event-row relative border-b border-hairline/70 ${
        completed ? "is-complete" : ""
      }`}
      style={{ ["--hue" as string]: game.hue }}
    >
      {/* The whole row opens the event. A single full-bleed target gives a
          generous tap area on mobile and one unambiguous hover region — the
          content above it is pointer-transparent so clicks fall through. */}
      <button
        type="button"
        onClick={() => onOpen(event.id)}
        className="absolute inset-0 z-0 cursor-pointer"
      >
        <span className="sr-only">View {event.title} details</span>
      </button>

      <div className="pointer-events-none relative z-10 flex gap-3 px-4 py-3.5">
        {/* Game identity rail. Grows on hover — the cheapest possible signal
            that this row is live under the cursor. */}
        <span aria-hidden className="row-rail mt-0.5 w-[3px] shrink-0 rounded-full" />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <span className="eyebrow block truncate" style={{ color: game.hue }}>
                {game.short}
              </span>
              <span
                className={`row-title block truncate text-[0.9375rem] font-medium leading-snug ${
                  completed ? "line-through decoration-faint" : ""
                }`}
              >
                {event.title}
              </span>
            </div>

            <span
              className="tnum row-count shrink-0 font-display text-sm font-semibold"
              style={{
                color: clock.msRemaining === null ? "var(--color-faint)" : heat,
              }}
            >
              {countdown}
            </span>
          </div>

          {event.summary !== null && (
            <p className="row-summary mt-1 line-clamp-2 text-[0.8125rem] leading-snug text-muted">
              {event.summary}
            </p>
          )}

          <div className="mt-2.5">
            <Meter
              progress={clock.upcoming ? 1 : clock.progress}
              urgency={clock.urgency}
              label={`${event.title}: ${caption}`}
            />
            {/* Says what the bar is a proportion of. Without this the ticks
                are a shape the reader has to guess the meaning of. */}
            <p className="mt-1.5 text-[0.6875rem] leading-none text-faint">
              {caption}
            </p>
          </div>
        </div>

        {/* Sits above the row target so ticking done never opens the sheet. */}
        <button
          type="button"
          onClick={() => onToggle(event.id)}
          aria-pressed={completed}
          aria-label={
            completed ? `Mark ${event.title} not done` : `Mark ${event.title} done`
          }
          className={`row-check pointer-events-auto relative z-20 grid size-7 shrink-0 cursor-pointer place-items-center self-center rounded-md border ${
            completed
              ? "border-transparent bg-near/20 text-near"
              : "border-hairline text-faint"
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
      </div>
    </li>
  );
}
