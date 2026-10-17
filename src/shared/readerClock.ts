import type { Account, ClockRevision } from "../client/state/reader/schema.ts";
import type { Region } from "./schema.ts";
import {
  clockFor,
  resetHourFor,
  serverOffsetUtc,
  type Clockable,
  type ResetTiming,
} from "./time.ts";
import { dayKey } from "./daily.ts";
export interface ReaderClock extends ResetTiming {
  revision: string;
  region: Region;
}
export function resolveReaderClock(account: Account, at: number): ReaderClock {
  const ordered = account.clocks
    .filter((r) => r.historicalOnly !== true)
    .slice()
    .sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt));
  const r =
    ordered.filter((r) => Date.parse(r.effectiveAt) <= at).at(-1) ??
    ordered[0]!;
  return clockFromRevision(r);
}
export function clockFromRevision(r: ClockRevision): ReaderClock {
  return {
    revision: r.id,
    region: r.region,
    offsetUtc: r.automaticBase.offsetUtc,
    resetHour: r.reset?.hour ?? r.automaticBase.hour,
    resetMinute: r.reset?.minute ?? r.automaticBase.minute,
  };
}
export function appendClockRevision(
  account: Account,
  reset: ClockRevision["reset"],
  region: Region,
  at: string,
  id: string,
): Account {
  if (
    !Number.isFinite(Date.parse(at)) ||
    account.clocks.some((r) => r.id === id) ||
    (reset &&
      (reset.hour < 0 ||
        reset.hour > 23 ||
        reset.minute < 0 ||
        reset.minute > 59 ||
        !Number.isInteger(reset.hour) ||
        !Number.isInteger(reset.minute)))
  )
    throw new Error("Invalid clock revision");
  return {
    ...account,
    region,
    clocks: [
      ...account.clocks,
      {
        id,
        effectiveAt: at,
        region,
        reset,
        automaticBase: {
          offsetUtc: serverOffsetUtc(region, account.game),
          hour: resetHourFor(region, account.game),
          minute: 0,
        },
      },
    ],
  };
}
export function readerDayKey(at: number, clock: ReaderClock): string {
  return dayKey(at, clock.region, undefined, clock);
}
export function readerClockFor(
  event: Clockable,
  account: Account,
  now: number,
) {
  const clock = resolveReaderClock(account, now);
  return clockFor(event, clock.region, now, clock);
}
