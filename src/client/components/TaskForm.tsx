import { useState } from "react";
import type { LaneId } from "../../shared/custom.ts";
import { TaskSchema } from "../../shared/task.ts";
import { useGameMeta } from "../state/gameMeta.tsx";
import type { TaskDraft } from "../state/useTasks.ts";
import { parseAmount } from "./AmountEditor.tsx";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** The form's fields as typed, before they are a task. */
export interface TaskFields {
  game: string;
  title: string;
  unit: "week" | "month";
  weekday: number;
  monthDay: number;
  kind: "days" | "amount";
  required: string;
  target: string;
  amountUnit: string;
}

/**
 * The task these fields describe, or null while they do not describe one the
 * store would accept. Checked against `TaskSchema` itself, so the form can
 * never offer Save on something the store would then refuse.
 */
export function taskDraftFrom(f: TaskFields): TaskDraft | null {
  const period =
    f.unit === "week"
      ? ({ unit: "week", startsOn: f.weekday } as const)
      : ({ unit: "month", startsOn: f.monthDay } as const);
  const unit = f.amountUnit.trim();
  const target = parseAmount(f.target);
  const measure =
    f.kind === "days"
      ? ({ kind: "days", required: Number.parseInt(f.required, 10) } as const)
      : target === null
        ? null
        : ({ kind: "amount", target, ...(unit === "" ? {} : { unit }) } as const);
  if (measure === null) return null;
  const draft: TaskDraft = { game: f.game, title: f.title.trim(), period, measure };
  const check = TaskSchema.safeParse({ ...draft, id: "mytask:check00000", at: "", updatedAt: "" });
  return check.success ? draft : null;
}

function pill(on: boolean): string {
  return `rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
    on ? "border-near/70 bg-near/15 text-near" : "border-hairline text-faint hover:text-muted"
  }`;
}

const field =
  "rounded-lg border border-hairline bg-ground px-2 py-1 text-sm text-ink focus:border-faint focus:outline-none";

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
    monthDay: initial?.period.unit === "month" ? initial.period.startsOn : 1,
    kind: initial?.measure.kind ?? "days",
    required: initial?.measure.kind === "days" ? String(initial.measure.required) : "1",
    target: initial?.measure.kind === "amount" ? String(initial.measure.target) : "",
    amountUnit: initial?.measure.kind === "amount" ? (initial.measure.unit ?? "") : "",
  }));
  const set = (patch: Partial<TaskFields>) => setF((prev) => ({ ...prev, ...patch }));
  const draft = taskDraftFrom(f);

  return (
    <form
      className="mt-3 rounded-xl border border-hairline p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (draft !== null) onSave(draft);
      }}
    >
      <div className="flex flex-wrap gap-3">
        <label className="block text-xs font-medium text-muted">
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
        <label className="block min-w-0 flex-1 text-xs font-medium text-muted">
          Task
          <input
            autoFocus
            value={f.title}
            maxLength={80}
            onChange={(e) => set({ title: e.target.value })}
            placeholder="Weekly activity points"
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
              onChange={(e) => set({ monthDay: Number.parseInt(e.target.value, 10) || 1 })}
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

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={draft === null}
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
      </div>
    </form>
  );
}
