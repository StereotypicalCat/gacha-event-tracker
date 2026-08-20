import type { LaneId } from "../../shared/custom.ts";

/**
 * The order games appear in — the reader's, when they have given one.
 *
 * Nothing used to decide this. The focus bar, the settings chips and the
 * timeline's lanes all render `App`'s `games`, which is the order lanes first
 * appear in the feed — whichever game happened to hold the first event row. It
 * is arbitrary, it shifts as events come and go, and it is the same problem the
 * first-run picker had (`docs/PRD.md` F8).
 *
 * Pure and its own module for the reason `lens.ts`, `zoom.ts` and `lanes.ts` are:
 * `prefs` stores the answer, four surfaces read it, and a rule that lives in one
 * place cannot drift between them.
 */

/**
 * Put lanes in the reader's order, falling back to alphabetical.
 *
 * `stored` absent means the reader has never placed a game — not that they have
 * no order. Every install predating this is in that state, which is the same
 * distinction `knownGames` draws in `usePrefs.ts`, and the fallback is what the
 * first-run picker already does.
 *
 * The result is **always a permutation of `lanes`**: never a lane dropped, never
 * one invented, and never a duplicate even if `stored` carries one. That is the
 * property worth testing rather than the ordering itself — a game missing from
 * the focus bar or from settings looks exactly like a game the reader switched
 * off, and their fix for that, switching it back on, would do nothing at all.
 *
 * Sorted on the name the reader sees and not on the `LaneId`, because the id is
 * not what is printed: `hsr` is Honkai: Star Rail and `nikke` is Goddess of
 * Victory: Nikke. Through `localeCompare`, because `<` orders by code point and
 * files hololive Dreams after every capitalised game in `games.ts`.
 */
export function orderGames(
  lanes: readonly LaneId[],
  stored: readonly LaneId[] | undefined,
  nameOf: (id: LaneId) => string,
): LaneId[] {
  const alphabetical = (ids: readonly LaneId[]): LaneId[] =>
    [...ids].sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

  if (stored === undefined) return alphabetical(lanes);

  const present = new Set(lanes);
  const placed: LaneId[] = [];
  const seen = new Set<LaneId>();
  for (const id of stored) {
    // A stored id naming a lane that is not here is skipped rather than
    // rendered as a gap — and left in `stored`, so a source that goes away and
    // comes back returns to the slot the reader chose. Nothing prunes a stored
    // order against the feed, for the reason nothing else in the client prunes
    // against it either (AGENTS.md § Retiring a game).
    if (!present.has(id) || seen.has(id)) continue;
    seen.add(id);
    placed.push(id);
  }

  // A game we added later is not entitled to a position in an order the reader
  // made by hand, so it trails what they placed rather than slotting into the
  // middle of it. It also arrives switched off (`adoptNewLanes`), so settings —
  // where they would move it anyway — is where they meet it.
  return [...placed, ...alphabetical(lanes.filter((id) => !seen.has(id)))];
}

/**
 * Move one entry, shifting the rest.
 *
 * Applied to the list **as displayed**, and the whole result is what gets
 * stored. Both halves of that matter. The indices a drag or an arrow produces
 * are positions on screen, so applying them to a stored order that names only
 * some of the lanes would move the wrong game; and storing only the game that
 * moved would leave `orderGames` reading "that one, then everything else
 * alphabetically", which is not what dragging one row one notch means. Writing
 * back what the reader is looking at gets both right at once.
 *
 * An index off either end is a no-op rather than an error, which is what makes
 * the first row's ↑ and the last row's ↓ harmless to press — they are rendered
 * either way, because a control that vanishes at the ends moves the other one
 * under the reader's finger.
 */
export function moveGame(
  order: readonly LaneId[],
  from: number,
  to: number,
): LaneId[] {
  const next = [...order];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length) return next;
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return [...order];
  next.splice(to, 0, moved);
  return next;
}
