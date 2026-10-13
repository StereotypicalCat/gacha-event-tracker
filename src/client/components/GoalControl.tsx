import { useEffect, useState } from "react";
import { clampRequired, type Goal } from "../../shared/goal.ts";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const MODES = [
  { id: "off", label: "Off" },
  { id: "week", label: "Each week" },
  { id: "event", label: "Across the event" },
] as const;

type Mode = (typeof MODES)[number]["id"];

/**
 * The goal a mode press asks for: a Goal, undefined to clear it, or null for
 * "nothing to do". Pressing the mode already shown is null — including Off
 * when no goal is *readable*, which may still be one stored by a newer
 * version, and a press that looks like a no-op must not delete it.
 */
export function chooseGoal(
  id: Mode,
  goal: Goal | undefined,
  defaultWeekStartsOn: number,
  maxDays: number | null,
): Goal | undefined | null {
  if (id === (goal?.period ?? "off")) return null;
  if (id === "off") return undefined;
  const required = goal?.required ?? 5;
  if (id === "week") {
    return {
      period: "week",
      measure: "days",
      required: clampRequired("week", required, null),
      weekStartsOn: goal?.period === "week" ? goal.weekStartsOn : defaultWeekStartsOn,
    };
  }
  return { period: "event", measure: "days", required: clampRequired("event", required, maxDays) };
}

/** A typed count, clamped; null while the field is empty or unreadable — mid-edit, not an answer. */
export function parseDraft(
  raw: string,
  period: Goal["period"],
  maxDays: number | null,
): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? clampRequired(period, n, maxDays) : null;
}

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

  const choose = (id: Mode) => {
    const next = chooseGoal(id, goal, defaultWeekStartsOn, maxDays);
    if (next !== null) onChange(next);
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
          <CountField goal={goal} maxDays={maxDays} onChange={onChange} />
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

/**
 * The count, with its own draft text. Bound straight to `goal.required`, the
 * field could never be emptied: an empty value changes no goal, so React put
 * the old number straight back, and typing after a backspace appended to it.
 * The draft holds what is typed; a readable value commits, and leaving the
 * field shows the goal's count again.
 */
function CountField({
  goal,
  maxDays,
  onChange,
}: {
  goal: Goal;
  maxDays: number | null;
  onChange: (goal: Goal) => void;
}) {
  const [draft, setDraft] = useState(String(goal.required));
  useEffect(() => setDraft(String(goal.required)), [goal.required]);

  return (
    <input
      type="number"
      aria-label="Days needed"
      min={1}
      max={goal.period === "week" ? 7 : (maxDays ?? 366)}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = parseDraft(e.target.value, goal.period, maxDays);
        if (n !== null && n !== goal.required) onChange({ ...goal, required: n });
      }}
      onBlur={() => setDraft(String(goal.required))}
      className="tnum w-14 rounded-lg border border-hairline bg-ground px-2 py-1 text-sm text-ink focus:border-faint focus:outline-none"
    />
  );
}
