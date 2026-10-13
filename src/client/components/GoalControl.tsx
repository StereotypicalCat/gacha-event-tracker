import { clampRequired, type Goal } from "../../shared/goal.ts";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const MODES = [
  { id: "off", label: "Off" },
  { id: "week", label: "Each week" },
  { id: "event", label: "Across the event" },
] as const;

/**
 * How many check-ins the event actually wants.
 *
 * Some events ask for five days out of seven, not every day. The reader says
 * so here — nothing is read off the title — and the checklist and the dailies
 * strip count against it. Meeting it never marks the event done.
 *
 * The same pill style as the status and effort controls below it, because it
 * is the same kind of answer: something only the reader knows.
 */
export function GoalControl({
  goal,
  defaultWeekStartsOn,
  maxDays,
  onChange,
}: {
  goal: Goal | undefined;
  /** The weekday of the event's first game-day: its weeks most likely start there. */
  defaultWeekStartsOn: number;
  /** Claimable days in the run, or null when the end is unannounced. */
  maxDays: number | null;
  onChange: (goal: Goal | undefined) => void;
}) {
  const mode = goal?.period ?? "off";
  const required = goal?.required ?? 5;

  const choose = (id: (typeof MODES)[number]["id"]) => {
    if (id === "off") return onChange(undefined);
    if (id === "week") {
      return onChange({
        period: "week",
        measure: "days",
        required: clampRequired("week", required, null),
        weekStartsOn: goal?.period === "week" ? goal.weekStartsOn : defaultWeekStartsOn,
      });
    }
    onChange({
      period: "event",
      measure: "days",
      required: clampRequired("event", required, maxDays),
    });
  };

  const setRequired = (raw: string) => {
    if (goal === undefined) return;
    // An emptied field is mid-edit, not an answer; keep the goal as it was.
    if (raw.trim() === "") return;
    onChange({ ...goal, required: clampRequired(goal.period, Number.parseInt(raw, 10), maxDays) });
  };

  return (
    <div className="mt-3">
      <p className="eyebrow">Check-in goal</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {MODES.map((m) => {
          const on = mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => choose(m.id)}
              aria-pressed={on}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                on
                  ? "border-near/70 bg-near/15 text-near"
                  : "border-hairline text-faint hover:text-muted"
              }`}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {goal !== undefined && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          <input
            type="number"
            aria-label="Days needed"
            min={1}
            max={goal.period === "week" ? 7 : (maxDays ?? 366)}
            value={goal.required}
            onChange={(e) => setRequired(e.target.value)}
            className="tnum w-14 rounded-lg border border-hairline bg-ground px-2 py-1 text-sm text-ink focus:border-faint focus:outline-none"
          />
          <span>
            {goal.period === "week" ? "days each week, weeks start" : "days across the event"}
          </span>
          {goal.period === "week" && (
            <select
              aria-label="Week starts on"
              value={goal.weekStartsOn}
              onChange={(e) => onChange({ ...goal, weekStartsOn: Number(e.target.value) })}
              className="rounded-lg border border-hairline bg-ground px-2 py-1 text-sm text-ink focus:border-faint focus:outline-none"
            >
              {WEEKDAYS.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}
