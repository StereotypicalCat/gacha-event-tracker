import type { LaneId } from "../../../shared/custom.ts";
import type { Region } from "../../../shared/schema.ts";
import { resetHourFor, serverOffsetUtc } from "../../../shared/time.ts";
import { appendClockRevision } from "../../../shared/readerClock.ts";
import type { Account, AccountId } from "./schema.ts";
export function createAccount(
  game: LaneId,
  region: Region,
  at: string,
  id: AccountId,
): Account {
  return {
    id,
    game,
    region,
    intent: {
      events: true,
      dailies: false,
      weeklyMonthly: false,
      cycles: false,
    },
    routines: {},
    clocks: [
      {
        id: "initial",
        effectiveAt: at,
        region,
        reset: null,
        automaticBase: {
          offsetUtc: serverOffsetUtc(region, game),
          hour: resetHourFor(region, game),
          minute: 0,
        },
      },
    ],
  };
}
export function changeAccountRegion(
  account: Account,
  region: Region,
  at: string,
  id: string,
): Account {
  return appendClockRevision(account, null, region, at, id);
}
export function retireAccount(account: Account, at: string): Account {
  return { ...account, retiredAt: at };
}
