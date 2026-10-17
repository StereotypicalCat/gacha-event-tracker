import { useContext, type CSSProperties } from "react";
import { actionMeta } from "../../state/reader/actions.ts";
import { mintLocalId } from "../../state/reader/ids.ts";
import type { Account } from "../../state/reader/schema.ts";
import { useGameMeta } from "../../state/gameMeta.tsx";
import { DisplayTimeContext, formatInZone } from "../../state/displayTime.ts";
import {
  appendClockRevision,
  resolveReaderClock,
} from "../../../shared/readerClock.ts";
import {
  DAY,
  formatRemaining,
  REGION_LABEL,
  resetShiftMs,
} from "../../../shared/time.ts";
import type { ActionHandler } from "./GameSettings.tsx";

const hh = (h: number, m = 0) =>
  `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

/**
 * One server's reset (Round 6 B `.reset-editor`): its clock, when that is in
 * your time and how long until it, and a choice of Automatic or a whole hour.
 * A change appends a clock revision, so earlier progress is kept.
 */
export function ResetTimingRow({
  account: a,
  label,
  now,
  onAction,
}: {
  account: Account;
  /** "Genshin" or "Genshin · Europe". */
  label: string;
  now: number;
  onAction: ActionHandler;
}) {
  const meta = useGameMeta(),
    zone = useContext(DisplayTimeContext);
  // A just-saved revision is stamped with the real time, which can be up to a
  // tick past `now`: resolve at whichever is later.
  const clock = resolveReaderClock(a, Math.max(now, Date.now())),
    current = a.clocks.at(-1)!,
    shift = resetShiftMs(clock.region, a.game, clock),
    next = Math.floor((now + shift) / DAY) * DAY + DAY - shift;
  const value =
    current.reset === null
      ? "automatic"
      : `${current.reset.hour}:${current.reset.minute}`;
  const setReset = (reset: { hour: number; minute: number } | null) =>
    void onAction({
      type: "account",
      account: appendClockRevision(
        a,
        reset,
        a.region,
        new Date().toISOString(),
        mintLocalId(),
      ),
      ...actionMeta(),
    });
  return (
    <div
      className="reset-row"
      style={{ "--g": meta(a.game).hue } as CSSProperties}
    >
      <div>
        <strong>{label}</strong>
        <small>
          {current.reset === null ? "Automatic" : "Custom"}:{" "}
          {hh(clock.resetHour, clock.resetMinute)} {REGION_LABEL[a.region]}{" "}
          server time · {formatInZone(next, true, zone)} · in{" "}
          {formatRemaining(next - now)}
        </small>
      </div>
      <label>
        <span>Reset timing</span>
        <select
          value={value}
          onChange={(e) => {
            if (e.target.value === "automatic") setReset(null);
            else {
              const [hour, minute] = e.target.value.split(":").map(Number);
              setReset({ hour: hour!, minute: minute! });
            }
          }}
        >
          <option value="automatic">
            Automatic (
            {hh(current.automaticBase.hour, current.automaticBase.minute)})
          </option>
          {current.reset !== null && current.reset.minute !== 0 && (
            <option value={value}>
              {hh(current.reset.hour, current.reset.minute)} server time
            </option>
          )}
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={`${h}:0`}>
              {hh(h)} server time
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
