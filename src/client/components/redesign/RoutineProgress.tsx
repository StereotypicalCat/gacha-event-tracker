import { useEffect, useRef, useState } from "react";
import { readerDayKey } from "../../../shared/readerClock.ts";
import { routinesFor } from "../../../shared/routines.ts";
import type { RoutineRow } from "../../state/reader/routines.ts";
import { actionMeta } from "../../state/reader/actions.ts";
import type { ActionHandler } from "./GameSettings.tsx";

/**
 * A routine's progress as the Routines table shows it: the Round 6 `.tick` for
 * check-ins and the `.amt` bar for amounts. An amount reads as text until it is
 * clicked, then becomes a number field, so the table is not a wall of inputs.
 */
export function RoutineProgress({
  row,
  onAction,
  now,
}: {
  row: RoutineRow;
  onAction: ActionHandler;
  now: number;
}) {
  const [editing, setEditing] = useState(false);
  if (row.status.measure !== "amount") {
    const today = readerDayKey(now, row.clock),
      done = row.days.includes(today),
      many = row.status.required > 1;
    return (
      <button
        type="button"
        className="tick"
        aria-pressed={many ? row.status.met : done}
        aria-label={`${row.title}, ${done ? "done" : "not done"} today`}
        onClick={() =>
          void onAction({
            type: "day",
            accountId: row.accountId,
            revisionId: row.clock.revision,
            itemId: row.id,
            day: today,
            checked: !done,
            ...actionMeta(),
          })
        }
      >
        <span className="box" aria-hidden="true">
          <Check />
        </span>
        {many &&
          `${Math.min(row.status.count, row.status.required)} of ${row.status.required} days`}
      </button>
    );
  }
  const task = row.task ?? routinesFor(row.game).find((r) => r.id === row.id),
    unit = task?.measure.kind === "amount" ? (task.measure.unit ?? "") : "";
  const fill = Math.min(1, row.status.count / row.status.required);
  if (editing)
    return (
      <AmountForm
        row={row}
        unit={unit}
        onAction={onAction}
        onDone={() => setEditing(false)}
      />
    );
  return (
    <button
      type="button"
      className="amt"
      title="Enter an amount"
      aria-label={`${row.title}: ${row.status.count.toLocaleString()} of ${row.status.required.toLocaleString()}${unit ? ` ${unit}` : ""}. Enter an amount`}
      onClick={() => setEditing(true)}
    >
      <span className={`bar${fill >= 1 ? " full" : ""}`} aria-hidden="true">
        <i style={{ width: `${fill * 100}%` }} />
      </span>
      <span className="num">
        <b>{row.status.count.toLocaleString()}</b> /{" "}
        {row.status.required.toLocaleString()}
        {unit && ` ${unit}`}
      </span>
      <svg className="edit" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M10.5 2.5l3 3L6 13H3v-3z" />
      </svg>
    </button>
  );
}

function AmountForm({
  row,
  unit,
  onAction,
  onDone,
}: {
  row: RoutineRow;
  unit: string;
  onAction: ActionHandler;
  onDone: () => void;
}) {
  const [value, setValue] = useState(String(row.status.count));
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.select();
  }, []);
  const save = () => {
    const n = Number(value);
    if (Number.isInteger(n) && n >= 0 && n !== row.status.count)
      void onAction({
        type: "amount",
        accountId: row.accountId,
        revisionId: row.clock.revision,
        itemId: row.id,
        period: row.status.periodStart,
        value: n,
        ...actionMeta(),
      });
    onDone();
  };
  return (
    <form
      className="amt editing"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onDone();
      }}
    >
      <input
        ref={input}
        type="number"
        min="0"
        step="1"
        max="1000000000"
        inputMode="numeric"
        aria-label={`${row.title} amount`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onDone();
        }}
      />
      <span className="num">
        / {row.status.required.toLocaleString()}
        {unit && ` ${unit}`}
      </span>
      <button type="submit" className="btn sm">
        Save
      </button>
    </form>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}
