/**
 * Events two sources name with nothing in common, recorded as one by a person.
 *
 * The fallback, not the mechanism. `mergeEvents` pairs cross-source copies by
 * title, by a qualifier at either end, and by one copy's summary naming the
 * other's title — and that last rule is what now pairs Genshin's anniversary
 * selectors, which were the first two entries here (2026-10-14): Game8 calls
 * them by what they are, Fandom by the event's name, and Game8's own blurb
 * names the Fandom event. An entry belongs here only when no page links the two
 * copies at all, and a person has established the pairing some other way.
 *
 * Each entry names the two copies by **event ID**, which already carries the
 * game, the title and the run's start date. A record therefore fuses exactly
 * one run and lapses by itself when the next one starts. Merge still applies
 * its start-date guard on top.
 *
 * Every entry cites what established it. Never add one on a guess or from
 * matching dates: a wrong pairing hides a real event behind another, and patch
 * day puts twenty different events on one window.
 */
export interface RecordedPair {
  ids: readonly [string, string];
  evidence: string;
}

export const SAME_EVENT: readonly RecordedPair[] = [];

/** True when a person recorded these two IDs as one event. */
export function recordedSame(
  a: string,
  b: string,
  table: readonly RecordedPair[] = SAME_EVENT,
): boolean {
  return table.some(
    ({ ids: [x, y] }) => (x === a && y === b) || (x === b && y === a),
  );
}
