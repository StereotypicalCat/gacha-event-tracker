import {
  asDisplayEvent,
  asOccurrenceEvent,
  CustomEvent,
  type DisplayEvent,
} from "../../../shared/custom.ts";
import { ruleIdOf, nextOccurrences } from "../../../shared/recurrence.ts";
import { endingSoonestFirst } from "../../../shared/time.ts";
import {
  readerClockFor,
  resolveReaderClock,
} from "../../../shared/readerClock.ts";
import type { RowEvent } from "../../components/EventRow.tsx";
import type { Region } from "../../../shared/schema.ts";
import type { ReaderState } from "./schema.ts";
export type ReaderEventRow = RowEvent & {
  accountId: string;
  region: Region;
  clockRevision: string;
};
export function readerEventRows(
  state: ReaderState,
  events: readonly DisplayEvent[],
  now: number,
): ReaderEventRow[] {
  const source = new Map(
    events.filter((e) => e.status === "published").map((e) => [e.id, e]),
  );
  for (const raw of Object.values(state.customEvents)) {
    const p = CustomEvent.safeParse(raw);
    if (!p.success) continue;
    const e = p.data;
    if (e.repeat === null) source.set(e.id, asDisplayEvent(e));
    else
      for (const o of nextOccurrences(e, now, 2))
        source.set(o.id, asOccurrenceEvent(e, o));
  }
  const out: ReaderEventRow[] = [];
  for (const a of Object.values(state.accounts)) {
    if (
      a.retiredAt ||
      !a.intent.events ||
      (Array.isArray(state.prefs.hiddenGames) &&
        state.prefs.hiddenGames.includes(a.game))
    )
      continue;
    const scoped = new Map(source);
    for (const seen of Object.values(state.seenEvents))
      if (
        seen.accountId === a.id &&
        !scoped.has(seen.event.id) &&
        (seen.event.sourceUrl !== null ||
          state.customEvents[ruleIdOf(seen.event.id)])
      )
        scoped.set(seen.event.id, seen.event);
    for (const event of scoped.values()) {
      if (event.game !== a.game) continue;
      const clock = readerClockFor(event, a, now);
      out.push({
        event,
        clock,
        accountId: a.id,
        region: a.region,
        clockRevision: resolveReaderClock(a, now).revision,
      });
    }
  }
  return out.sort(endingSoonestFirst);
}
