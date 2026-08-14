import { useEffect } from "react";
import { gameMeta } from "../../shared/games.ts";
import { formatAbsolute, formatRemaining } from "../../shared/time.ts";
import type { RowEvent } from "./EventRow.tsx";
import { Meter, URGENCY_COLOR } from "./Meter.tsx";

export function EventDetail({
  row,
  completed,
  onToggle,
  onClose,
}: {
  row: RowEvent;
  completed: boolean;
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  const { event, clock } = row;
  const game = gameMeta(event.game);
  const heat = URGENCY_COLOR[clock.urgency];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className="absolute inset-0 bg-ground/80 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={event.title}
        className="relative max-h-[88vh] w-full overflow-y-auto rounded-t-2xl border border-hairline bg-surface p-5 sm:max-w-lg sm:rounded-2xl"
      >
        <p className="eyebrow" style={{ color: game.hue }}>
          {game.name}
        </p>
        <h2 className="mt-1.5 font-display text-xl font-semibold leading-snug">
          {event.title}
        </h2>
        {event.summary !== null && (
          <p className="mt-2 text-sm leading-relaxed text-muted">{event.summary}</p>
        )}

        <div className="mt-4">
          <Meter
            progress={clock.progress}
            urgency={clock.urgency}
            label="Time remaining"
            animate={false}
          />
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Field label="Starts">
            {formatAbsolute(event.startsAt, event.startPrecision === "exact")}
          </Field>
          <Field label="Ends">
            {event.endsAt === null ? (
              <span className="text-faint">Not announced</span>
            ) : (
              formatAbsolute(event.endsAt, event.endPrecision === "exact")
            )}
          </Field>
          <Field label="Remaining">
            <span className="tnum font-display" style={{ color: heat }}>
              {clock.msRemaining === null
                ? "unknown"
                : formatRemaining(clock.msRemaining)}
            </span>
          </Field>
          <Field label="Type">{event.type}</Field>
        </dl>

        {event.endPrecision === "day" && event.endsAt !== null && (
          <p className="mt-3 text-xs leading-relaxed text-faint">
            The source gave a date but no time of day, so this end is accurate to
            the day only. Check in-game before the last hours.
          </p>
        )}

        <div className="mt-5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onToggle(event.id)}
            className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
              completed
                ? "border-hairline text-muted hover:text-ink"
                : "border-transparent bg-ink text-ground hover:bg-white"
            }`}
          >
            {completed ? "Mark not done" : "Mark done"}
          </button>
          <a
            href={event.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="rounded-lg border border-hairline px-4 py-2.5 text-sm text-muted transition-colors hover:text-ink"
          >
            Source
          </a>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
