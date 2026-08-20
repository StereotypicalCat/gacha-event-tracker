/**
 * One game-day, ticked or not.
 *
 * Shared by the two places a run of days is drawn: an event's checklist in the
 * detail sheet, and the catch-up strips on the dailies section and on an event
 * whose end was never announced. One pip rather than two, because they mean the
 * same thing to the reader and a second copy is a second set of rules about
 * what a missed day looks like.
 *
 * Future days are dimmed but not disabled-looking, and past misses read as
 * empty rather than as an error — a missed daily is information, not a telling
 * off. A catch-up strip never contains a future day at all, so there the
 * dimming never appears.
 */
export function DayPip({
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
