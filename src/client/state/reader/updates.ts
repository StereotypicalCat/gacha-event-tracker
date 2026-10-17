import { freshness, type EventFeed } from "../../../shared/feed.ts";
import type { ReaderState } from "./schema.ts";
export type UpdateItem =
  | { kind: "sources"; games: string[] }
  | { kind: "events"; accountId: string; ids: string[] }
  | { kind: "codes"; game: string; ids: string[] };
export function trackedGames(state: ReaderState): Set<string> {
  return new Set(
    Object.values(state.accounts)
      .filter(
        (a) =>
          !a.retiredAt &&
          !(
            Array.isArray(state.prefs.hiddenGames) &&
            state.prefs.hiddenGames.includes(a.game)
          ) &&
          (a.intent.events ||
            Object.values(a.routines).some((r) => r.followed)),
      )
      .map((a) => a.game),
  );
}
export function updateItems(
  state: ReaderState,
  feed: EventFeed,
  now: number,
): UpdateItem[] {
  const items: UpdateItem[] = [],
    tracked = trackedGames(state);
  const stale = freshness(feed.sources, now).stale.filter((s) =>
    tracked.has(s.game),
  );
  if (stale.length && !snoozed(state.prefs.staleSnooze, stale, now))
    items.push({ kind: "sources", games: stale.map((s) => s.game) });
  for (const a of Object.values(state.accounts)) {
    if (
      a.retiredAt ||
      !tracked.has(a.game) ||
      !a.intent.events ||
      !state.eventSeen[a.id]
    )
      continue;
    const ids = feed.events
      .filter(
        (e) => e.game === a.game && !state.eventSeen[a.id]!.includes(e.id),
      )
      .map((e) => e.id);
    if (ids.length) items.push({ kind: "events", accountId: a.id, ids });
  }
  return items;
}

/** The longest a reader can hide the “Event data may be out of date” notice. */
export const MAX_SNOOZE_DAYS = 7;
/** `prefs.staleSnooze`: hide the source warning for the games stale right now. */
export function staleSnooze(games: string[], now: number, days: number) {
  const d = Math.min(Math.max(days, 0), MAX_SNOOZE_DAYS);
  return { until: new Date(now + d * 86_400_000).toISOString(), games };
}
function snoozed(
  pref: unknown,
  stale: readonly { game: string }[],
  now: number,
): boolean {
  if (typeof pref !== "object" || pref === null) return false;
  const { until, games } = pref as { until?: unknown; games?: unknown };
  const end = typeof until === "string" ? Date.parse(until) : NaN;
  // A clock set back cannot stretch the snooze beyond seven days from now.
  if (!(now < end) || end - now > MAX_SNOOZE_DAYS * 86_400_000) return false;
  return Array.isArray(games) && stale.every((s) => games.includes(s.game));
}
