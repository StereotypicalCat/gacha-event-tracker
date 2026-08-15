import { dailiesId, dayKey, msUntilReset, streakOf } from "../../shared/daily.ts";
import { gameMeta } from "../../shared/games.ts";
import type { GachaEvent, GameId, Region } from "../../shared/schema.ts";
import { formatRemaining } from "../../shared/time.ts";

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
export function Dailies({
  games,
  events,
  region,
  now,
  daysFor,
  onToggleDay,
}: {
  games: GameId[];
  /** Live events that repeat daily — detected, or marked by the reader. */
  events: GachaEvent[];
  region: Region;
  now: number;
  daysFor: (id: string) => string[];
  onToggleDay: (id: string, day: string) => void;
}) {
  if (games.length === 0 && events.length === 0) return null;

  const today = dayKey(now, region);
  const doneEvents = events.filter((e) => daysFor(e.id).includes(today));
  const done = games.filter((g) => daysFor(dailiesId(g)).includes(today));
  const total = games.length + events.length;
  const complete = done.length + doneEvents.length;

  return (
    <section className="border-b border-hairline px-4 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="eyebrow">
          Today's dailies · {complete}/{total}
        </h2>
        <p className="tnum text-[0.6875rem] text-faint">
          resets in {formatRemaining(msUntilReset(now, region))}
        </p>
      </div>

      <ul className="mt-2.5 flex flex-wrap gap-1.5">
        {games.map((id) => {
          const game = gameMeta(id);
          const key = dailiesId(id);
          return (
            <li key={key}>
              <TickChip
                label={game.short}
                hue={game.hue}
                title={game.dailyTasks}
                ariaLabel={`${game.name} dailies — ${game.dailyTasks}`}
                days={daysFor(key)}
                today={today}
                onToggle={() => onToggleDay(key, today)}
              />
            </li>
          );
        })}

        {events.map((event) => {
          const game = gameMeta(event.game);
          return (
            <li key={event.id}>
              <TickChip
                label={event.title}
                hue={game.hue}
                title={`${game.name} — ${event.title}`}
                ariaLabel={`${event.title} (${game.name})`}
                days={daysFor(event.id)}
                today={today}
                onToggle={() => onToggleDay(event.id, today)}
              />
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-[0.6875rem] leading-relaxed text-faint">
        {complete === total
          ? "All done. Nothing else expires tonight."
          : `${waiting(total - complete)} still waiting on you today.`}
      </p>
    </section>
  );
}

/**
 * One thing to tick off today.
 *
 * The same pill whether it is a game's standing chore or an event that repeats:
 * to the reader at 23:50 they are the same job, and the distinction between
 * "the app knows about this" and "a wiki published it" is ours, not theirs.
 */
function TickChip({
  label,
  hue,
  title,
  ariaLabel,
  days,
  today,
  onToggle,
}: {
  label: string;
  hue: string;
  title: string;
  ariaLabel: string;
  days: string[];
  today: string;
  onToggle: () => void;
}) {
  const isDone = days.includes(today);
  const streak = streakOf(days, today);

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={isDone}
      aria-label={`${ariaLabel}${isDone ? ", done today" : ", not done today"}`}
      title={title}
      className="flex max-w-[15rem] items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
      style={{
        borderColor: isDone ? hue : "var(--color-hairline)",
        color: isDone ? hue : "var(--color-faint)",
        background: isDone ? `color-mix(in srgb, ${hue} 14%, transparent)` : "transparent",
      }}
    >
      <svg viewBox="0 0 16 16" aria-hidden className="size-3 shrink-0">
        <path
          d="M2.5 8.5l3.5 3.5 7.5-8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={isDone ? 1 : 0.3}
        />
      </svg>
      <span className="truncate">{label}</span>
      {streak > 1 && (
        <span className="tnum shrink-0 text-[0.625rem] opacity-70">{streak}d</span>
      )}
    </button>
  );
}

function waiting(n: number): string {
  return n === 1 ? "One thing" : `${n} things`;
}
