import {
  dailySummary,
  msUntilReset,
  type DailySummary,
} from "../../shared/daily.ts";
import type { Region } from "../../shared/schema.ts";
import { formatRemaining } from "../../shared/time.ts";

/**
 * The checklist for an event you have to come back to every day.
 *
 * A single "done" tick is the wrong shape for these: the job is not finished
 * or unfinished, it is finished *today*, and yesterday's is gone whatever you
 * do now. So this shows the whole run as a strip of days — what you got, what
 * you missed, and how many chances are left — with today's tick as the one
 * prominent control.
 *
 * Past days stay clickable on purpose. People log in and tick up later, and a
 * checklist that cannot be corrected stops being trusted after the first
 * mistake.
 */
export function DailyChecklist({
  startsMs,
  endsMs,
  region,
  now,
  logged,
  onToggleDay,
}: {
  startsMs: number;
  endsMs: number | null;
  region: Region;
  now: number;
  logged: string[];
  onToggleDay: (day: string) => void;
}) {
  const summary = dailySummary({ startsMs, endsMs, region, now, logged });
  const { days, today, doneToday, todayInWindow } = summary;
  const started = now >= startsMs;

  return (
    <div className="mt-5 rounded-xl border border-hairline p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow">Daily checklist</p>
        <p className="tnum text-[0.6875rem] text-faint">
          resets in {formatRemaining(msUntilReset(now, region))}
        </p>
      </div>

      <button
        type="button"
        onClick={() => onToggleDay(today)}
        disabled={!started}
        aria-pressed={doneToday}
        className={`mt-3 flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
          doneToday
            ? "border-near/60 bg-near/10 text-near"
            : "border-hairline text-ink hover:border-faint"
        } ${started ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
      >
        <span
          aria-hidden
          className={`grid size-6 shrink-0 place-items-center rounded-md border ${
            doneToday ? "border-transparent bg-near/25" : "border-hairline"
          }`}
        >
          <svg viewBox="0 0 16 16" className="size-3.5">
            <path
              d="M2.5 8.5l3.5 3.5 7.5-8"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={doneToday ? 1 : 0.25}
            />
          </svg>
        </span>
        <span className="text-sm font-medium">
          {!started
            ? "Not started yet"
            : doneToday
              ? "Done today"
              : "Do today's"}
        </span>
        {summary.streak > 1 && (
          <span className="ml-auto text-[0.6875rem] text-faint">
            {summary.streak}-day streak
          </span>
        )}
      </button>

      {days === null ? (
        <p className="mt-3 text-xs leading-relaxed text-faint">
          The source hasn't announced an end date, so how many days are left is
          unknown. Your ticks are still counted — {summary.logged} so far.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-1">
            {days.map((day) => (
              <DayPip
                key={day}
                day={day}
                today={today}
                done={logged.includes(day)}
                onToggle={() => onToggleDay(day)}
              />
            ))}
          </div>
          <p className="mt-2.5 text-xs leading-relaxed text-faint">
            {caption(summary, todayInWindow)}
          </p>
        </>
      )}
    </div>
  );
}

/**
 * One day. Future days are dimmed but not disabled-looking, past misses read as
 * empty rather than as an error — a missed daily is information, not a telling
 * off.
 */
function DayPip({
  day,
  today,
  done,
  onToggle,
}: {
  day: string;
  today: string;
  done: boolean;
  onToggle: () => void;
}) {
  const isToday = day === today;
  const isFuture = day > today;
  // Rendered in UTC on purpose. A day key is a game-day, not an instant, and
  // formatting it in the reader's own zone shifts it a day backwards for
  // everyone west of UTC — so the pip would read "12" while the label a screen
  // reader announces said "Aug 11".
  const label = new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={isFuture}
      aria-pressed={done}
      aria-label={`${label}${done ? ", done" : ", not done"}`}
      title={label}
      className={`tnum size-6 rounded-[5px] border text-[0.625rem] leading-none transition-colors ${
        done
          ? "border-transparent bg-near/25 text-near"
          : isFuture
            ? "border-hairline/60 text-faint/50"
            : "border-hairline text-faint hover:border-faint"
      } ${isToday ? "ring-1 ring-ink/40" : ""} ${
        isFuture ? "cursor-default" : "cursor-pointer"
      }`}
    >
      {day.slice(8)}
    </button>
  );
}

function caption(summary: DailySummary, todayInWindow: boolean): string {
  const { days, logged, remaining, missed } = summary;
  if (days === null || remaining === null) return `${logged} days ticked off.`;

  const parts = [`${logged} of ${days.length} days`];
  if (remaining > 0) {
    parts.push(
      todayInWindow
        ? `${remaining} left including today`
        : `${remaining} to come`,
    );
  } else {
    parts.push("the run is over");
  }
  if (missed !== null && missed > 0) parts.push(`${missed} missed`);
  return `${parts.join(" · ")}.`;
}
