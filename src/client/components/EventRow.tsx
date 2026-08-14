import { gameMeta } from "../../shared/games.ts";
import type { GachaEvent } from "../../shared/schema.ts";
import {
  formatRemaining,
  windowCaption,
  type EventClock,
} from "../../shared/time.ts";
import { EFFORT, pressure, type Effort } from "../../shared/effort.ts";
import type { Status } from "../state/useProgress.ts";
import { Meter, URGENCY_COLOR } from "./Meter.tsx";

export interface RowEvent {
  event: GachaEvent;
  clock: EventClock;
}

interface EventRowProps {
  row: RowEvent;
  completed: boolean;
  status?: Status | undefined;
  effort?: Effort | undefined;
  /** Only ever true when the reader has chosen to reveal ignored events. */
  ignored?: boolean | undefined;
  onToggle: (id: string) => void;
  onRestore?: ((id: string) => void) | undefined;
  onOpen: (id: string) => void;
}

export function EventRow({
  row,
  completed,
  status,
  effort,
  ignored = false,
  onToggle,
  onRestore,
  onOpen,
}: EventRowProps) {
  const { event, clock } = row;
  const game = gameMeta(event.game);
  const heat = URGENCY_COLOR[clock.urgency];

  const caption = windowCaption(clock, Date.now());
  // Only ever a warning when the reader gave an estimate — inferring one to
  // justify the warning would be inventing their input.
  const risk = status === "done" ? "fine" : pressure(effort, clock.msRemaining);

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
              <span className="eyebrow flex items-center gap-1.5 truncate">
                <span style={{ color: game.hue }}>{game.short}</span>
                {ignored && (
                  <span className="rounded-[3px] bg-hairline px-1 py-px text-[0.5625rem] tracking-normal text-muted">
                    ignored
                  </span>
                )}
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

          {(status === "doing" || effort !== undefined || risk !== "fine") && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {status === "doing" && (
                <span className="rounded-[3px] bg-near/15 px-1.5 py-px text-[0.625rem] font-medium text-near">
                  doing
                </span>
              )}
              {effort !== undefined && (
                <span className="rounded-[3px] bg-hairline px-1.5 py-px text-[0.625rem] text-muted">
                  {EFFORT[effort].label.toLowerCase()}
                </span>
              )}
              {risk !== "fine" && (
                <span
                  className="rounded-[3px] px-1.5 py-px text-[0.625rem] font-medium"
                  style={{
                    background:
                      risk === "unlikely"
                        ? "color-mix(in srgb, var(--color-critical) 18%, transparent)"
                        : "color-mix(in srgb, var(--color-soon) 18%, transparent)",
                    color:
                      risk === "unlikely"
                        ? "var(--color-critical)"
                        : "var(--color-soon)",
                  }}
                >
                  {risk === "unlikely" ? "running out of time" : "tight"}
                </span>
              )}
            </div>
          )}

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

        {/* Sits above the row target so ticking done never opens the sheet.
            On a revealed ignored row this becomes the undo, which is the most
            direct place to put it. */}
        {ignored && onRestore !== undefined ? (
          <button
            type="button"
            onClick={() => onRestore(event.id)}
            aria-label={`Stop ignoring ${event.title}`}
            className="row-check pointer-events-auto relative z-20 grid size-7 shrink-0 cursor-pointer place-items-center self-center rounded-md border border-hairline text-faint"
          >
            <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
              <path
                d="M2.5 8a5.5 5.5 0 1 0 1.7-4M2.5 2.5V6H6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : (
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
        )}
      </div>
    </li>
  );
}
