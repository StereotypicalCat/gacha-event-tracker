import { useState } from "react";
import type { LaneId } from "../../shared/custom.ts";
import { AmountTarget } from "../../shared/goal.ts";
import { TaskSchema } from "../../shared/task.ts";
import { useGameMeta } from "../state/gameMeta.tsx";
import type { TaskDraft } from "../state/useTasks.ts";
import { parseAmount } from "./AmountEditor.tsx";
import { ExampleRow, field, labelClass, pill, StillNeeded } from "./formParts.tsx";
import { TASK_TEMPLATES, type TaskTemplate } from "../../shared/templates.ts";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** The form's fields as typed, before they are a task. */
export interface TaskFields {
  game: string;
  title: string;
  unit: "week" | "month";
  weekday: number;
  /** As typed, so the field can be emptied and retyped; read through `parseMonthDay`. */
  monthDay: string | number;
  kind: "days" | "amount";
  required: string;
  target: string;
  amountUnit: string;
}

/** A typed day of the month, clamped to 1–31; null while empty or unreadable. */
export function parseMonthDay(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? Math.min(31, Math.max(1, n)) : null;
}

/**
 * The task these fields describe, or null while they do not describe one the
 * store would accept. Checked against `TaskSchema` itself, so the form can
 * never offer Save on something the store would then refuse.
 */
export function taskDraftFrom(f: TaskFields): TaskDraft | null {
  // Never a draft the still-needed line has an objection to, so Save and the
  // line beside it cannot disagree.
  if (taskStillNeeded(f).length > 0) return null;
  const monthDay = parseMonthDay(String(f.monthDay));
  if (f.unit === "month" && monthDay === null) return null;
  const period =
    f.unit === "week"
      ? ({ unit: "week", startsOn: f.weekday } as const)
      : ({ unit: "month", startsOn: monthDay ?? 1 } as const);
  const unit = f.amountUnit.trim();
  const target = parseAmount(f.target);
  const measure =
    f.kind === "days"
      ? ({ kind: "days", required: Number(f.required.trim()) } as const)
      : target === null
        ? null
        : ({ kind: "amount", target, ...(unit === "" ? {} : { unit }) } as const);
  if (measure === null) return null;
  const draft: TaskDraft = { game: f.game, title: f.title.trim(), period, measure };
  const check = TaskSchema.safeParse({ ...draft, id: "mytask:check00000", at: "", updatedAt: "" });
  return check.success ? draft : null;
}

/**
 * These fields with an example's shape, and nothing else: the game, the name,
 * the target, the weekday and the month day stay as the reader typed them.
 */
export function withTaskTemplate(f: TaskFields, t: TaskTemplate): TaskFields {
  return {
    ...f,
    unit: t.sets.unit,
    kind: t.sets.kind,
    ...(t.sets.required === undefined ? {} : { required: t.sets.required }),
    ...(t.sets.amountUnit === undefined ? {} : { amountUnit: t.sets.amountUnit }),
  };
}

/**
 * What these fields still lack before they are a task, in the order the form
 * asks. Empty exactly when `taskDraftFrom` would return a draft — the bounds
 * here are the schema's (`AmountTarget`, 1–7 days a week, 1–31 a month).
 */
export function taskStillNeeded(f: TaskFields): string[] {
  const needs: string[] = [];
  if (f.title.trim() === "") needs.push("a name");
  if (f.unit === "month" && parseMonthDay(String(f.monthDay)) === null) {
    needs.push("a day of the month");
  }
  if (f.kind === "days") {
    const n = Number(f.required.trim());
    const most = f.unit === "week" ? 7 : 31;
    if (f.required.trim() === "" || !Number.isInteger(n) || n < 1 || n > most) {
      needs.push("how many days");
    }
  } else {
    const target = parseAmount(f.target);
    if (target === null) needs.push("the target");
    else if (target < 1) needs.push("a target of at least 1");
    else if (!AmountTarget.safeParse(target).success) needs.push("a smaller target");
  }
  return needs;
}

/**
 * Add or change a weekly or monthly task.
 *
 * Every answer has a default a reader can accept unread — weekly, from Monday,
 * ticked off once — because most of these games roll their week on Monday at
 * reset and most chores are done-or-not. The number is the one thing with no
 * sensible default, so choosing "Reach a number" asks for it.
 */
export function TaskForm({
  lanes,
  initial,
  onSave,
  onCancel,
}: {
  lanes: LaneId[];
  initial?: TaskDraft | undefined;
  onSave: (draft: TaskDraft) => void;
  onCancel: () => void;
}) {
  const gameMeta = useGameMeta();
  const [f, setF] = useState<TaskFields>(() => ({
    game: initial?.game ?? lanes[0] ?? "",
    title: initial?.title ?? "",
    unit: initial?.period.unit ?? "week",
    weekday: initial?.period.unit === "week" ? initial.period.startsOn : 1,
    monthDay: String(initial?.period.unit === "month" ? initial.period.startsOn : 1),
    kind: initial?.measure.kind ?? "days",
    required: initial?.measure.kind === "days" ? String(initial.measure.required) : "1",
    target: initial?.measure.kind === "amount" ? String(initial.measure.target) : "",
    amountUnit: initial?.measure.kind === "amount" ? (initial.measure.unit ?? "") : "",
  }));
  const set = (patch: Partial<TaskFields>) => setF((prev) => ({ ...prev, ...patch }));
  const [chosen, setChosen] = useState<TaskTemplate | null>(null);
  const draft = taskDraftFrom(f);
  const needs = taskStillNeeded(f);

  return (
    <form
      className="mt-3 rounded-xl border border-hairline p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (draft !== null) onSave(draft);
      }}
    >
      {initial === undefined && (
        <ExampleRow
          examples={TASK_TEMPLATES}
          chosen={chosen?.id ?? null}
          onChoose={(t) => {
            setChosen(t);
            setF((prev) => withTaskTemplate(prev, t));
          }}
        />
      )}

      <div className="flex flex-wrap gap-3">
        <label className={labelClass}>
          Game
          <select
            value={f.game}
            onChange={(e) => set({ game: e.target.value })}
            className={`mt-1 block ${field}`}
          >
            {lanes.map((lane) => (
              <option key={lane} value={lane}>
                {gameMeta(lane).name}
              </option>
            ))}
          </select>
        </label>
        <label className={`${labelClass} min-w-48 flex-1`}>
          Name
          <input
            autoFocus
            value={f.title}
            maxLength={80}
            onChange={(e) => set({ title: e.target.value })}
            placeholder={chosen?.placeholder ?? "Weekly activity points"}
            className={`mt-1 block w-full ${field}`}
          />
        </label>
      </div>

      <p className="mt-3 text-xs font-medium text-muted">How often</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <button type="button" aria-pressed={f.unit === "week"} onClick={() => set({ unit: "week" })} className={pill(f.unit === "week")}>
          Every week
        </button>
        <button type="button" aria-pressed={f.unit === "month"} onClick={() => set({ unit: "month" })} className={pill(f.unit === "month")}>
          Every month
        </button>
        {f.unit === "week" ? (
          <label className="flex items-center gap-1.5 text-xs text-muted">
            from
            <select
              aria-label="Week starts on"
              value={f.weekday}
              onChange={(e) => set({ weekday: Number(e.target.value) })}
              className={field}
            >
              {WEEKDAYS.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="flex items-center gap-1.5 text-xs text-muted">
            from day
            <input
              type="number"
              aria-label="Month starts on day"
              min={1}
              max={31}
              value={f.monthDay}
              onChange={(e) => set({ monthDay: e.target.value })}
              className={`tnum w-14 ${field}`}
            />
          </label>
        )}
      </div>
      <p className="mt-1 text-[0.6875rem] leading-relaxed text-faint">
        It rolls over at the game's daily reset on that day, on your server.
      </p>

      <p className="mt-3 text-xs font-medium text-muted">Done when</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <button type="button" aria-pressed={f.kind === "days"} onClick={() => set({ kind: "days" })} className={pill(f.kind === "days")}>
          Tick it off
        </button>
        <button type="button" aria-pressed={f.kind === "amount"} onClick={() => set({ kind: "amount" })} className={pill(f.kind === "amount")}>
          Reach a number
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        {f.kind === "days" ? (
          <>
            <input
              type="number"
              aria-label="Days needed"
              min={1}
              max={f.unit === "week" ? 7 : 31}
              value={f.required}
              onChange={(e) => set({ required: e.target.value })}
              className={`tnum w-14 ${field}`}
            />
            <span>{f.required === "1" ? "day" : "days"} this {f.unit}</span>
          </>
        ) : (
          <>
            <input
              inputMode="numeric"
              aria-label="Target"
              value={f.target}
              onChange={(e) => set({ target: e.target.value })}
              placeholder="2100"
              className={`tnum w-20 ${field}`}
            />
            <input
              aria-label="Unit"
              value={f.amountUnit}
              maxLength={24}
              onChange={(e) => set({ amountUnit: e.target.value })}
              placeholder="points"
              className={`w-24 ${field}`}
            />
            <span>this {f.unit}</span>
          </>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={draft === null || needs.length > 0}
          className="rounded-lg border border-transparent bg-ink px-3 py-1.5 text-xs font-medium text-ground transition-colors disabled:opacity-40"
        >
          Save task
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-hairline px-3 py-1.5 text-xs text-muted transition-colors hover:text-ink"
        >
          Cancel
        </button>
        <StillNeeded needs={needs} />
      </div>
    </form>
  );
}
