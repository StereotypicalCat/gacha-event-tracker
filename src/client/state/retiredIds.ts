import { mergeDailyLogs, type DailyLogMap } from "./useDailyLog.ts";
import { mergeMarks, type Marks } from "./useMarkSet.ts";
import { mergeProgress, type ProgressMap } from "./useProgress.ts";

/** Old id → the id its marks now belong to. */
export type CarryTable = Readonly<Record<string, string>>;

/**
 * Event ids a *parser* change stopped publishing, and the id each one became.
 *
 * An event id is a localStorage key (AGENTS.md § Event IDs are localStorage
 * keys), so an id that moves takes the reader's marks with it unless they are
 * carried across. These moved on 2026-10-14, when the Game8 parser stopped
 * keeping `Battle Pass -` in front of Genshin's pass names: Fandom had always
 * published the bare name, and the two ids put every pass on the calendar
 * twice (docs/superpowers/specs/2026-10-14-genshin-duplicates-design.md).
 *
 * Only a parser change belongs here. An id that *merge* folds into another is
 * named by the feed itself (`GachaEvent.mergedIds`) and carried by
 * `aliasesFrom` with nobody editing anything; a parser change cannot be,
 * because the old id is never produced again for any feed to mention.
 *
 * An explicit table, never a pattern: the battle passes are the only two such
 * ids that ever shipped (git history of snapshots/ and fixtures/), and a
 * pattern would also catch an id nobody retired. Keep it until at least
 * 2027-10-14 — a reader who has not opened the app since still has marks under
 * the old ids.
 */
export const RETIRED_IDS: CarryTable = {
  "genshin:battle-pass-frostfarer:2026-08-12": "genshin:frostfarer:2026-08-12",
  "genshin:battle-pass-moontrace:2026-09-23": "genshin:moontrace:2026-09-23",
};

/**
 * What the feed says merge absorbed, as a carry table.
 *
 * Every id an event lists in `mergedIds` was another source's copy of it, and
 * may already hold a reader's marks from a day it was published alone. Two
 * exclusions: an id the feed still publishes as its own row — should a later
 * feed split a pair again, each row keeps its own marks — and an event naming
 * itself, which would be a no-op at best.
 */
export function aliasesFrom(
  events: ReadonlyArray<{ id: string; mergedIds?: readonly string[] | undefined }>,
): CarryTable {
  const published = new Set(events.map((e) => e.id));
  const table: Record<string, string> = {};
  for (const event of events) {
    for (const from of event.mergedIds ?? []) {
      if (from === event.id || published.has(from)) continue;
      table[from] = event.id;
    }
  }
  return table;
}

/**
 * Move each entry under an old id in `table` to its replacement.
 *
 * A move, not a copy: the storage key is untouched, and an entry left behind
 * under the old id would be carried forward again on every load — bringing back
 * a mark the reader had since cleared. Where both ids hold an entry (the reader
 * marked both duplicate rows), `combine` is the store's own import merge, so
 * nothing either row held is lost. Returns `map` itself when nothing moved.
 */
export function carryForward<V>(
  map: Record<string, V>,
  combine: (current: V, moved: V) => V,
  table: CarryTable = RETIRED_IDS,
): Record<string, V> {
  // These run in useState initialisers, where a throw is a blank screen, and
  // `readJson` hands back a stored `null` as it found it. Leave what cannot be
  // read exactly where it is.
  if (!isRecord(map)) return map;
  if (!Object.keys(map).some((id) => Object.hasOwn(table, id))) return map;
  const next = { ...map };
  for (const [from, to] of Object.entries(table)) {
    const moved = next[from];
    if (moved === undefined || !isRecord(moved)) continue;
    delete next[from];
    const current = next[to];
    next[to] =
      current !== undefined && isRecord(current) ? combine(current, moved) : moved;
  }
  return next;
}

function isRecord(v: unknown): boolean {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** One entry through a whole-map merge: the store's rule, not a second one. */
function viaMap<V>(merge: (a: Record<string, V>, b: Record<string, V>) => Record<string, V>) {
  return (current: V, moved: V): V => merge({ id: current }, { id: moved }).id ?? current;
}

/**
 * Not `mergeProgress` alone. That rule picks one whole record because an
 * import is a foreign copy of the same row; here both are rows the reader
 * edited, so the later one wins every field it sets and a note or goal only
 * the other held survives rather than vanishing with the duplicate.
 */
export const carryProgress = (map: ProgressMap, table?: CarryTable): ProgressMap =>
  carryForward(
    map,
    (current, moved) => {
      const later = viaMap(mergeProgress)(current, moved);
      const earlier = later === current ? moved : current;
      return { ...earlier, ...later };
    },
    table,
  );

export const carryDaily = (map: DailyLogMap, table?: CarryTable): DailyLogMap =>
  carryForward(map, viaMap(mergeDailyLogs), table);

export const carryMarks = (map: Marks, table?: CarryTable): Marks =>
  carryForward(map, viaMap(mergeMarks), table);
