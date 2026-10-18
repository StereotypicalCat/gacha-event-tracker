import { useGameMeta } from "../../state/gameMeta.tsx";
import { serverSuffix } from "../../state/reader/servers.ts";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { readerDayKey } from "../../../shared/readerClock.ts";
import { formatRemaining, DAY, resetShiftMs } from "../../../shared/time.ts";
import { streakOf } from "../../../shared/daily.ts";
import { goalCount } from "../../../shared/goal.ts";
import { chipLabel } from "../Dailies.tsx";
import { Fireworks } from "../Fireworks.tsx";
import {
  finishesSection,
  useSectionCelebration,
} from "./useSectionCelebration.ts";

import type { ReaderState } from "../../state/reader/schema.ts";
import type { RoutineRow } from "../../state/reader/routines.ts";
import { actionMeta } from "../../state/reader/actions.ts";
import type { ActionHandler } from "./GameSettings.tsx";
export function RoutineControl({
  row,
  onAction,
  now,
  finishes = false,
}: {
  row: RoutineRow;
  onAction: ActionHandler;
  now: number;
  /** Completing it finishes the section, whose grand celebration goes instead. */
  finishes?: boolean;
}) {
  const today = readerDayKey(now, row.clock);
  const [amount, setAmount] = useState(String(row.status.count));
  const editing = useRef(false);
  const [burst, celebrate] = useBurst();
  useEffect(() => {
    if (!editing.current) setAmount(String(row.status.count));
  }, [row.status.count, row.status.periodStart]);
  return (
    <div className="routine-control">
      {burst > 0 && <Fireworks key={burst} />}
      <div>
        <strong>{row.title}</strong>
        <small>
          {row.cadence === "day" ? "Today" : `This ${row.cadence}`} ·{" "}
          {row.status.count.toLocaleString()} /{" "}
          {row.status.required.toLocaleString()}
        </small>
      </div>
      {row.status.measure === "amount" ? (
        <label className="numeric-routine">
          <span className="sr-only">{row.title} progress</span>
          <input
            type="number"
            min="0"
            step="1"
            max="1000000000"
            value={amount}
            onFocus={() => {
              editing.current = true;
            }}
            onBlur={() => {
              editing.current = false;
              if (amount === "") setAmount(String(row.status.count));
            }}
            onChange={(e) => {
              setAmount(e.target.value);
              const value = e.target.valueAsNumber;
              if (!Number.isInteger(value) || value < 0) return;
              if (
                !finishes &&
                row.status.count < row.status.required &&
                value >= row.status.required
              )
                celebrate();
              void onAction({
                type: "amount",
                accountId: row.accountId,
                revisionId: row.clock.revision,
                itemId: row.id,
                period: row.status.periodStart,
                value,
                ...actionMeta(),
              });
            }}
          />
        </label>
      ) : (
        <button
          type="button"
          className="daily-tick"
          aria-label={`${row.title}, ${row.days.includes(today) ? "done" : "not done"} today`}
          aria-pressed={row.days.includes(today)}
          onClick={() => {
            if (!finishes && !row.days.includes(today) && !row.status.met)
              celebrate();
            toggleToday(row, today, onAction);
          }}
        >
          <svg aria-hidden viewBox="0 0 16 16">
            <rect
              x="2"
              y="2"
              width="12"
              height="12"
              rx="3"
              fill="none"
              stroke="currentColor"
            />
            {row.days.includes(today) && (
              <path
                d="m4 8 3 3 5-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            )}
          </svg>
        </button>
      )}
    </div>
  );
}
/**
 * The small burst: fired by an action that completes one item, cleared once
 * the sparks are done (the live strip's 1400ms). Counts up so a second
 * completion while one is still showing remounts it.
 */
function useBurst(): [number, () => void] {
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    if (burst === 0) return;
    const id = setTimeout(() => setBurst(0), 1400);
    return () => clearTimeout(id);
  }, [burst]);
  return [burst, () => setBurst((n) => n + 1)];
}

/** Today's tick for a daily row: on, or off again. */
function toggleToday(row: RoutineRow, today: string, onAction: ActionHandler) {
  void onAction({
    type: "day",
    accountId: row.accountId,
    revisionId: row.clock.revision,
    itemId: row.id,
    day: today,
    checked: !row.days.includes(today),
    ...actionMeta(),
  });
}

/**
 * A check-in goal: "5 days a week" and the like, as on Genshin's "To Temper
 * Thyself and Journey Far". A plain daily is a one-day event-scoped status.
 */
function hasGoal(row: RoutineRow): boolean {
  return (
    row.status.scope !== "day" &&
    !(row.status.scope === "event" && row.status.required === 1)
  );
}

/**
 * Done for now: ticked today, or its goal already met for the week (or the
 * event), as the live strip counts it. Nothing is ticked on a met goal's behalf.
 */
function doneToday(row: RoutineRow, today: string): boolean {
  if (row.status.measure === "amount") return row.status.met;
  return row.days.includes(today) || (hasGoal(row) && row.status.met);
}

/**
 * Today's dailies in the Checklist rail. The whole row is the tick target, as
 * the live strip's pill is. A tick washes the row in the game's colour, pops
 * the box and draws the check, with a small burst of fireworks in the row. The
 * tick that finishes the list gets the grand celebration over the panel instead,
 * under the same rule as live (see `Dailies.tsx`): only a tick made just now
 * that finishes the list counts, not a list that got shorter.
 */
export function DailyPanel({
  rows,
  state,
  onAction,
  now,
  onManage,
}: {
  onManage?: () => void;
  rows: RoutineRow[];
  state: ReaderState;
  onAction: ActionHandler;
  now: number;
}) {
  const meta = useGameMeta();
  const total = rows.length;
  const done = rows.filter((r) =>
    doneToday(r, readerDayKey(now, r.clock)),
  ).length;
  const allDone = total > 0 && done === total;
  const burst = useSectionCelebration(total, done);
  const finishes = finishesSection(total, done);
  // The row whose tick just completed it, for its own small burst.
  const [rowBurst, setRowBurst] = useState<{ key: string; n: number } | null>(
    null,
  );
  useEffect(() => {
    if (!rowBurst) return;
    const id = setTimeout(() => setRowBurst(null), 1400);
    return () => clearTimeout(id);
  }, [rowBurst]);
  // Rows ticked by a click in this panel; only those animate, so a reload
  // with everything already done doesn't replay every pop.
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  if (!rows.length) return null;
  return (
    <section
      className="daily-panel"
      data-all-done={allDone || undefined}
      data-burst={burst > 0 || undefined}
    >
      {burst > 0 && <Fireworks key={burst} grand />}
      <div className="daily-heading">
        <h2>Today's dailies</h2>
        {onManage && <button onClick={onManage}>Edit pins</button>}
      </div>
      <div className="daily-progress">
        <span className="daily-pips" aria-hidden="true">
          {rows.map((row) => (
            <i
              key={row.accountId + row.id}
              data-on={
                doneToday(row, readerDayKey(now, row.clock)) || undefined
              }
              style={
                {
                  "--g": meta(state.accounts[row.accountId]!.game).hue,
                } as CSSProperties
              }
            />
          ))}
        </span>
        <span className="daily-count" aria-live="polite">
          {allDone ? "All done for today" : `${done} of ${total} done`}
        </span>
      </div>
      {rows.map((row) => {
        const account = state.accounts[row.accountId]!;
        const s = resetShiftMs(account.region, account.game, row.clock),
          next = Math.floor((now + s) / DAY) * DAY + DAY - s;
        const today = readerDayKey(now, row.clock);
        const key = row.accountId + row.id;
        const ticked = row.days.includes(today);
        const isDone = doneToday(row, today);
        // Met this week without today's tick: done, drawn with a dotted check.
        const met = isDone && !ticked;
        const goal = hasGoal(row);
        const streak = streakOf(row.days, today);
        const label = (
          <span className="daily-text">
            <strong>
              {meta(account.game).short}
              {serverSuffix(state, account.game, account.region)}
            </strong>
            <small>
              {row.title} · reset {formatRemaining(next - now)}
            </small>
          </span>
        );
        const style = { "--g": meta(account.game).hue } as CSSProperties;
        if (row.status.measure === "amount")
          return (
            <div
              className="daily-row"
              key={key}
              style={style}
              data-done={isDone || undefined}
            >
              {label}
              <RoutineControl
                row={row}
                onAction={onAction}
                now={now}
                finishes={finishes}
              />
            </div>
          );
        return (
          <button
            type="button"
            className="daily-row daily-hit"
            key={key}
            style={style}
            data-done={isDone || undefined}
            data-met={met || undefined}
            data-fresh={(ticked && fresh.has(key)) || undefined}
            aria-pressed={ticked}
            aria-label={chipLabel(
              `${meta(account.game).short} ${row.title}`,
              ticked,
              goal ? row.status : undefined,
            )}
            onClick={() => {
              if (!isDone && !finishes)
                setRowBurst((b) => ({ key, n: (b?.n ?? 0) + 1 }));
              setFresh((f) => {
                const n = new Set(f);
                if (ticked) n.delete(key);
                else n.add(key);
                return n;
              });
              toggleToday(row, today, onAction);
            }}
          >
            {rowBurst?.key === key && <Fireworks key={rowBurst.n} />}
            {label}
            {/* One counter, as on live: a goal's count answers "is this week
                done?", so a streak beside it is beside the point. */}
            {goal ? (
              <span className="daily-tally">{goalCount(row.status)}</span>
            ) : (
              streak > 1 && (
                <span className="daily-tally">{streak}-day streak</span>
              )
            )}
            <span className="daily-box" aria-hidden="true">
              <svg viewBox="0 0 16 16">
                <rect x="1.5" y="1.5" width="13" height="13" rx="3.5" />
                <path d="m4.4 8.2 2.5 2.5 4.7-5.2" />
              </svg>
            </span>
          </button>
        );
      })}
    </section>
  );
}
