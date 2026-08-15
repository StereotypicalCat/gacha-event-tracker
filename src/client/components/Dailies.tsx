import { dailiesId, dayKey, msUntilReset, streakOf } from "../../shared/daily.ts";
import { gameMeta } from "../../shared/games.ts";
import type { GameId, Region } from "../../shared/schema.ts";
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
 * Sits above the event list because it is the one part of the page that is
 * answerable in ten seconds and expires tonight.
 */
export function Dailies({
  games,
  region,
  now,
  daysFor,
  onToggleDay,
}: {
  games: GameId[];
  region: Region;
  now: number;
  daysFor: (id: string) => string[];
  onToggleDay: (id: string, day: string) => void;
}) {
  if (games.length === 0) return null;

  const today = dayKey(now, region);
  const done = games.filter((g) => daysFor(dailiesId(g)).includes(today));

  return (
    <section className="border-b border-hairline px-4 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="eyebrow">
          Today's dailies · {done.length}/{games.length}
        </h2>
        <p className="tnum text-[0.6875rem] text-faint">
          resets in {formatRemaining(msUntilReset(now, region))}
        </p>
      </div>

      <ul className="mt-2.5 flex flex-wrap gap-1.5">
        {games.map((id) => {
          const game = gameMeta(id);
          const key = dailiesId(id);
          const days = daysFor(key);
          const isDone = days.includes(today);
          const streak = streakOf(days, today);

          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onToggleDay(key, today)}
                aria-pressed={isDone}
                aria-label={`${game.name} dailies — ${game.dailyTasks}${
                  isDone ? ", done today" : ", not done today"
                }`}
                title={game.dailyTasks}
                className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  borderColor: isDone ? game.hue : "var(--color-hairline)",
                  color: isDone ? game.hue : "var(--color-faint)",
                  background: isDone
                    ? `color-mix(in srgb, ${game.hue} 14%, transparent)`
                    : "transparent",
                }}
              >
                <svg viewBox="0 0 16 16" aria-hidden className="size-3">
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
                {game.short}
                {streak > 1 && (
                  <span className="tnum text-[0.625rem] opacity-70">
                    {streak}d
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-[0.6875rem] leading-relaxed text-faint">
        {done.length === games.length
          ? "All done. Nothing else expires tonight."
          : `${waiting(games.length - done.length)} still waiting on you today.`}
      </p>
    </section>
  );
}

function waiting(n: number): string {
  return n === 1 ? "One game" : `${n} games`;
}
