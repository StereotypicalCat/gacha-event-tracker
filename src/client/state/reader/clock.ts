export {
  appendClockRevision,
  resolveReaderClock,
  readerDayKey,
  readerClockFor,
} from "../../../shared/readerClock.ts";
import { appendClockRevision } from "../../../shared/readerClock.ts";
import { resetHourFor, serverOffsetUtc } from "../../../shared/time.ts";
import type { ReaderState } from "./schema.ts";
export function refreshAutomaticClocks(
  state: ReaderState,
  at: string,
): ReaderState {
  let next = state;
  for (const a of Object.values(state.accounts)) {
    const latest = a.clocks.at(-1)!;
    if (a.retiredAt || latest.reset !== null) continue;
    if (
      latest.automaticBase.offsetUtc === serverOffsetUtc(a.region, a.game) &&
      latest.automaticBase.hour === resetHourFor(a.region, a.game)
    )
      continue;
    const account = appendClockRevision(
      a,
      null,
      a.region,
      at,
      `automatic-${at}`,
    );
    next = { ...next, accounts: { ...next.accounts, [a.id]: account } };
  }
  return next;
}
