import { z } from "zod";
import { GachaEvent, GameId } from "./schema.ts";

/**
 * The wire contract between server and client.
 *
 * The client refuses a `schemaVersion` it does not know rather than guessing at
 * unfamiliar fields. Additive fields do not bump it; removing or retyping one
 * does. See docs/DATA-MODEL.md § Schema versioning.
 */
export const SCHEMA_VERSION = 1;

export const SourceHealth = z.object({
  sourceId: z.string(),
  game: GameId,
  url: z.string().url(),
  lastSuccessAt: z.string().datetime().nullable(),
  eventCount: z.number().int().nonnegative(),
});

export const EventFeed = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  generatedAt: z.string().datetime(),
  events: z.array(GachaEvent),
  sources: z.array(SourceHealth),
});

export type SourceHealth = z.infer<typeof SourceHealth>;
export type EventFeed = z.infer<typeof EventFeed>;

/** A game's data is stale past this age (PRD F7). */
export const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

export interface Freshness {
  /**
   * When any source last had its bytes confirmed — the newest `lastSuccessAt`.
   *
   * Deliberately not `generatedAt`. The feed is rebuilt on every deploy whether
   * or not a page was refetched, so a build stamp would report a calendar as
   * minutes old while its events came from a fixture captured months ago. This
   * reports the age of the *data*, which is the only thing a reader is trusting
   * (PRD F7: never present stale data as current).
   *
   * Null only when no source has ever succeeded, which is a fresh checkout with
   * no fixtures — not a state a reader reaches.
   */
  refreshedAt: string | null;
  /** Per game, oldest first: what has not refreshed inside `STALE_AFTER_MS`. */
  stale: Array<{ game: GameId; lastSuccessAt: string | null }>;
}

/**
 * How current this feed's data is, per game.
 *
 * Pure and clock-injected like everything else that a test needs to pin. One
 * game can have several sources, and a game is only as fresh as its *oldest*
 * one: if Endfield's wiki refreshed an hour ago but its Game8 page has been
 * down for a week, some of that lane's rows are a week old and saying "fresh"
 * would be the confident wrong answer this product exists to avoid.
 */
export function freshness(
  sources: readonly SourceHealth[],
  now: number,
): Freshness {
  const oldestPerGame = new Map<GameId, string | null>();
  let refreshedAt: string | null = null;

  for (const source of sources) {
    const at = source.lastSuccessAt;
    if (at !== null && (refreshedAt === null || at > refreshedAt)) {
      refreshedAt = at;
    }

    // `null` beats any date: a source that has never succeeded is the oldest
    // thing a game can have, and must not be outvoted by a sibling that has.
    // `undefined` is the separate case of no entry yet, which is why this reads
    // the map once rather than asking `has` and then `get`.
    const known = oldestPerGame.get(source.game);
    if (known === undefined || (known !== null && (at === null || at < known))) {
      oldestPerGame.set(source.game, at);
    }
  }

  const stale = [...oldestPerGame.entries()]
    .filter(([, at]) => at === null || now - Date.parse(at) > STALE_AFTER_MS)
    .map(([game, lastSuccessAt]) => ({ game, lastSuccessAt }))
    .sort((a, b) => (a.lastSuccessAt ?? "").localeCompare(b.lastSuccessAt ?? ""));

  return { refreshedAt, stale };
}
