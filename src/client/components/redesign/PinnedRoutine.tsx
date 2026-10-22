import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { readerDayKey } from "../../../shared/readerClock.ts";
import { routinesFor } from "../../../shared/routines.ts";
import { formatRemaining } from "../../../shared/time.ts";
import type { RoutineRow } from "../../state/reader/routines.ts";
import { actionMeta } from "../../state/reader/actions.ts";
import { Fireworks } from "../Fireworks.tsx";
import type { ActionHandler } from "./GameSettings.tsx";
import { estimatedReset, routinePeriod } from "./TimelinePage.tsx";

/** The latest logged day inside the routine's current period, if any. */
export function lastDayInPeriod(row: RoutineRow, today: string): string | null {
  const inPeriod = row.days
    .filter((d) => d >= row.status.periodStart && d <= today)
    .sort();
  return inPeriod.at(-1) ?? null;
}

/**
 * A pinned routine in the Checklist rail, drawn like a daily: a row that
 * washes in the game's colour once its target is met, with the live
 * fireworks when an action here completes it.
 *
 * - Check-ins: the box ticks today. Unticking a met routine removes the
 *   period's latest tick, which may be from an earlier day.
 * - Amounts: the box completes it in one go (the amount becomes the target),
 *   "+1" steps it, and the count opens an editor. Unticking a completed
 *   amount puts back the value it had before, when this session saw it;
 *   otherwise it opens the editor so the reader says where they are.
 */
export function PinnedRoutine({
  row,
  hue,
  onAction,
  now,
  finishes = false,
}: {
  row: RoutineRow;
  hue: string;
  onAction: ActionHandler;
  now: number;
  /** Completing it finishes its group, whose grand celebration goes instead. */
  finishes?: boolean;
}) {
  const today = readerDayKey(now, row.clock);
  const amount = row.status.measure === "amount";
  const met = row.status.met;
  const [editing, setEditing] = useState(false);
  const [burst, setBurst] = useState(0);
  // Whether the burst it is showing finished the group: then the box still
  // pops, but the group's grand celebration stands in for the sparks.
  const [quiet, setQuiet] = useState(false);
  // The amount before a completing action, for undo.
  const [before, setBefore] = useState<number | null>(null);
  // Set by an action in this row, so only a completion made here celebrates,
  // never one that arrives with a reload or a new period.
  const acted = useRef(false);
  const wasMet = useRef(met);
  // As it stood at the completing action: by the time `met` flips, the group
  // already counts this routine done.
  const finishesGroup = useRef(false);
  useEffect(() => {
    if (met && !wasMet.current && acted.current) {
      setQuiet(finishesGroup.current);
      setBurst((n) => n + 1);
    }
    wasMet.current = met;
    acted.current = false;
  }, [met]);
  useEffect(() => {
    if (burst === 0) return;
    // Longer than the live strip's 1400ms: the sparks wait for the box.
    const id = setTimeout(() => setBurst(0), 1800);
    return () => clearTimeout(id);
  }, [burst]);

  const task = row.task ?? routinesFor(row.game).find((r) => r.id === row.id);
  const unit = task?.measure.kind === "amount" ? (task.measure.unit ?? "") : "";
  const count = row.status.count,
    required = row.status.required;
  const setAmount = (value: number) => {
    acted.current = true;
    finishesGroup.current = finishes;
    void onAction({
      type: "amount",
      accountId: row.accountId,
      revisionId: row.clock.revision,
      itemId: row.id,
      period: row.status.periodStart,
      value,
      ...actionMeta(),
    });
  };
  const setDay = (day: string, checked: boolean) => {
    acted.current = true;
    finishesGroup.current = finishes;
    void onAction({
      type: "day",
      accountId: row.accountId,
      revisionId: row.clock.revision,
      itemId: row.id,
      day,
      checked,
      ...actionMeta(),
    });
  };
  const toggle = () => {
    if (amount) {
      if (!met) {
        setBefore(count);
        setAmount(required);
      } else if (before !== null && before < required) {
        setAmount(before);
        setBefore(null);
      } else setEditing(true);
      return;
    }
    if (row.days.includes(today)) setDay(today, false);
    else if (met) {
      const last = lastDayInPeriod(row, today);
      if (last) setDay(last, false);
    } else setDay(today, true);
  };
  const step = () => {
    if (count + 1 >= required) setBefore(count);
    setAmount(count + 1);
  };

  const period = row.cadence === "day" ? "Today" : `This ${row.cadence}`;
  const span = routinePeriod(row, now);
  const resets = span.estimated
    ? estimatedReset(row, now)
    : `resets in ${formatRemaining(span.end - now)}`;
  const progress = amount
    ? `${count.toLocaleString()} / ${required.toLocaleString()}${unit ? ` ${unit}` : ""}`
    : required > 1
      ? `${Math.min(count, required)} of ${required} days`
      : null;
  return (
    <div
      className="pinned-routine"
      data-done={met || undefined}
      data-burst={burst > 0 || undefined}
      style={{ "--g": hue } as CSSProperties}
    >
      {burst > 0 && !quiet && <Fireworks key={burst} />}
      <div className="pr-text">
        <strong>{row.title}</strong>
        <small>
          {met ? `Done ${lower(period)}` : period} · {resets}
        </small>
        {amount && editing ? (
          <AmountEditor
            row={row}
            unit={unit}
            onSave={(value) => {
              if (value >= required && count < required) setBefore(count);
              setAmount(value);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : amount ? (
          <span className="pr-amount">
            <button
              type="button"
              className="pr-count"
              title="Enter an amount"
              aria-label={`${row.title}: ${progress}. Enter an amount`}
              onClick={() => setEditing(true)}
            >
              <span className="pr-bar" aria-hidden="true">
                <i
                  style={
                    {
                      width: `${Math.min(1, count / required) * 100}%`,
                      "--from": `${Math.min(1, (before ?? 0) / required) * 100}%`,
                    } as CSSProperties
                  }
                />
              </span>
              {progress}
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M10.5 2.5l3 3L6 13H3v-3z" />
              </svg>
            </button>
            {!met && (
              <button
                type="button"
                className="pr-step"
                aria-label={`Add one to ${row.title}`}
                onClick={step}
              >
                +1
              </button>
            )}
          </span>
        ) : (
          progress && <span className="pr-days">{progress}</span>
        )}
      </div>
      <button
        type="button"
        className="pr-box"
        aria-pressed={met}
        aria-label={
          met
            ? `${row.title}, done ${lower(period)}. Undo`
            : amount
              ? `Mark ${row.title} complete`
              : `${row.title}, not done ${lower(period)}. Tick today`
        }
        title={met ? "Undo" : amount ? "Mark complete" : "Tick today"}
        onClick={toggle}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="1.5" y="1.5" width="13" height="13" rx="3.5" />
          <path d="m4.4 8.2 2.5 2.5 4.7-5.2" />
        </svg>
      </button>
    </div>
  );
}

/** How long typing must pause before a value at the target completes it. */
export const AUTO_COMPLETE_MS = 450;

function AmountEditor({
  row,
  unit,
  onSave,
  onCancel,
}: {
  row: RoutineRow;
  unit: string;
  onSave: (value: number) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(String(row.status.count));
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.select();
  }, []);
  // A number at or over the target completes it without Save. The pause lets
  // a multi-digit number ("10000") finish before it counts.
  useEffect(() => {
    const n = Number(value);
    if (
      value === "" ||
      !Number.isInteger(n) ||
      n < row.status.required ||
      n === row.status.count
    )
      return;
    const id = setTimeout(() => onSave(n), AUTO_COMPLETE_MS);
    return () => clearTimeout(id);
  }, [value]);
  return (
    <form
      className="pr-edit"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(value);
        if (Number.isInteger(n) && n >= 0 && n !== row.status.count) onSave(n);
        else onCancel();
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          onCancel();
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
          if (e.key === "Escape") onCancel();
        }}
      />
      <span>
        / {row.status.required.toLocaleString()}
        {unit && ` ${unit}`}
      </span>
      <button type="submit" className="btn sm">
        Save
      </button>
    </form>
  );
}

/** "This week" → "this week", for the middle of a sentence. */
function lower(period: string): string {
  return period[0]!.toLowerCase() + period.slice(1);
}
