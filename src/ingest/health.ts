/**
 * What the feed records about a source, from the document it just parsed.
 *
 * This is one function rather than a few lines inside `scripts/build-feed.ts`
 * because of how the rule it carries went wrong. The refresh runner and the
 * feed builder both have to tell three zeros apart — a parser that can no
 * longer read a redesigned page, a page whose events have all ended, and a page
 * that says it currently lists none — and the runner learned the third on
 * 2026-09-03 while the builder did not. Nothing caught that: the builder is a
 * top-level script that fetches nothing but writes `public/`, so importing it
 * from a test runs a build, and the rule sat where no test could reach it.
 *
 * That is the same argument the `ci.yml` comment already makes about
 * `brokenSources`: behaviour belongs where behaviour can be exercised.
 * `docs/INGESTION.md` § Stage 1 carries the rule itself.
 */
import type { SourceHealth } from "../shared/feed.ts";
import type { GachaEvent, GameId } from "../shared/schema.ts";

/**
 * The part of an `Adapter` this needs. Narrow on purpose — it keeps the
 * function testable with a stub and says plainly that nothing here fetches.
 */
export interface HealthAdapter {
  id: string;
  game: GameId;
  url: string;
  parse(
    html: string,
    ctx: { now: string; sourceUrl: string; sourceId: string; game: GameId },
  ): GachaEvent[];
  statesNoEvents?(html: string): boolean;
}

/**
 * @param html      the document the feed was built from — a live snapshot, or a
 *                  checked-in fixture on a clean checkout.
 * @param at        when those bytes were last confirmed current, or null when
 *                  we do not know.
 * @param eventCount events this source contributed to the feed, after expiry.
 */
export function sourceHealth(
  adapter: HealthAdapter,
  html: string,
  at: string | null,
  eventCount: number,
): SourceHealth {
  // Parsed a second time as of the document's own capture date, when nothing in
  // it had expired yet. That figure is what separates "this parser has stopped
  // reading the page" from "this page's events have all finished since it was
  // captured" — the two are the same zero once expiry has been applied, and
  // only the first means our code is wrong.
  //
  // Null when we do not know when these bytes were current: there is no date to
  // parse "as of", and inventing one would manufacture a figure the check then
  // trusts. Unknown is a real answer here, and `brokenSources` declines to fail
  // a build on it.
  const parsedCount =
    at === null
      ? null
      : adapter.parse(html, {
          now: at,
          sourceUrl: adapter.url,
          sourceId: adapter.id,
          game: adapter.game,
        }).length;

  // Asked only of a zero, exactly as `scripts/refresh-sources.ts` asks it. The
  // flag qualifies an empty parse — "this zero is the page's own answer" — and
  // claims nothing on its own, so a loose implementation that keeps matching
  // after a redesign can never excuse a source that is still producing rows.
  //
  // Null takes the strict reading for the same reason it does above: with no
  // date for the bytes there is no parse to qualify.
  const statesNoEvents =
    parsedCount === 0 && adapter.statesNoEvents?.(html) === true;

  return {
    sourceId: adapter.id,
    game: adapter.game,
    url: adapter.url,
    // When the bytes were last confirmed live; a fixture's capture date when
    // this source has never been refreshed.
    lastSuccessAt: at,
    eventCount,
    parsedCount,
    statesNoEvents,
  };
}
