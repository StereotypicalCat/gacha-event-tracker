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
  /** Events this source contributed to the feed — after expired ones are dropped. */
  eventCount: z.number().int().nonnegative(),
  /**
   * Events the document yields when parsed as of its own capture date, before
   * anything is dropped for having ended.
   *
   * The pair is what separates a broken source from a stale one. `eventCount`
   * alone cannot: a parser that has stopped reading a redesigned page and a
   * page whose every event has since finished both report zero, and only the
   * first means our code is wrong.
   *
   * **Nullable and defaulted, never required.** The client validates the whole
   * feed with `EventFeed.safeParse`, and the service worker serves the last
   * feed it downloaded — so a required field here would make every cached feed
   * fail validation and take the offline promise with it. Null means an older
   * feed that never recorded this, which is an absence of information rather
   * than evidence of a fault.
   */
  parsedCount: z.number().int().nonnegative().nullable().default(null),
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

/**
 * Sources whose document yielded nothing at all.
 *
 * This is the failure a parser-only pipeline is most prone to and that nothing
 * else would surface: a page is redesigned, the parser reads it as empty, and
 * one game's calendar goes blank while the total stays comfortably healthy.
 * Worth failing a build over.
 *
 * A source whose events have merely all ended is not this, and CI said it was
 * — the check read `eventCount`, which is measured after expiry, so a stale
 * page and a broken parser arrived as the same zero. Only an explicit zero
 * counts here; a null is an older feed that never recorded the figure, and
 * failing on missing information would be the same mistake in a new place.
 */
export function brokenSources(sources: readonly SourceHealth[]): SourceHealth[] {
  return sources.filter((s) => s.parsedCount === 0);
}

/**
 * Sources that parsed fine but have nothing current left to show.
 *
 * A real problem — that lane renders an empty calendar — but a refresh
 * problem rather than a code one, and some of these cannot be refreshed from
 * CI at all (`docs/SOURCES.md` records which hosts refuse the runner). So it
 * is reported and left visible rather than thrown, the same way the app shows
 * a stale timestamp rather than pretending the calendar is current.
 */
export function staleSources(sources: readonly SourceHealth[]): SourceHealth[] {
  return sources.filter(
    (s) => s.parsedCount !== null && s.parsedCount > 0 && s.eventCount === 0,
  );
}
