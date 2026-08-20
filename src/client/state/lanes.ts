import type { LaneId } from "../../shared/custom.ts";
import { byDeadline, endingSoonestFirst, type EventClock } from "../../shared/time.ts";

/**
 * How the timeline is stacked: a lane per game, or every game together in
 * deadline order.
 *
 * Two different questions, and one board cannot answer both. Lanes answer "how
 * does this game's patch lay out?" — they keep a game's events adjacent and
 * comparable, which is what makes the board readable for someone playing four
 * of them. But a reader with four games also has one queue of deadlines, and
 * lanes scatter it: the thing ending tonight sits three lanes below the thing
 * ending next month, and no amount of scrolling puts them next to each other.
 *
 * Pure, and its own module rather than logic inside `Timeline`, because `prefs`
 * stores the chosen mode and the two must agree on what is valid — the same
 * reason `zoom.ts` exists.
 */
export type TimelineGroup = "game" | "ending";

export const TIMELINE_GROUPS: Array<{
  id: TimelineGroup;
  label: string;
  hint: string;
}> = [
  { id: "game", label: "By game", hint: "One lane per game" },
  {
    id: "ending",
    label: "Ending soonest",
    hint: "Every game together, in deadline order",
  },
];

/** The shape this module needs. Structural, so it stays cheap to call. */
interface Row {
  event: { game: LaneId };
  clock: EventClock;
}

/**
 * One stack of bars on the board.
 *
 * `game` is null on the merged board, which is what tells the renderer to drop
 * the lane heading and name the game on each bar instead: the colour alone
 * cannot say which game an event belongs to once thirteen of them share a
 * stack.
 */
export interface Lane<T> {
  /** React key and lane identity — the game id, or `all` when merged. */
  id: string;
  game: LaneId | null;
  rows: T[];
}

/**
 * Stack the board's rows the way the reader asked for.
 *
 * The merged mode sorts with `endingSoonestFirst`, the same comparator the
 * list's "Ending soonest" uses, rather than a bare end-date sort — otherwise
 * the two views would mean different things by the same words, and an event
 * that has not started yet would cut in above one that is running out tonight.
 * It also carries the `endsAt: null` rule for free: an unannounced end sorts
 * behind every dated one instead of pretending to a position in the queue.
 *
 * Lane mode leaves the order it was given alone. The rows arrive sorted by
 * whatever the reader chose in the list, and grouping them by game is not a
 * licence to re-sort inside a game.
 *
 * `split` is the exception to that last sentence, and deliberately so. Both
 * orders above hold every unstarted event behind every running one, which is
 * the segregation the board's "Not started yet" heading names — so a reader who
 * asks for them mixed in is asking for exactly that clause to be dropped, and
 * `byDeadline` is the same comparator with it gone. It applies in **both**
 * modes, lane mode included: leaving a lane's given order alone there would
 * produce the block it was told not to draw, minus the heading that explained
 * it, which is the worst of both answers.
 *
 * `gameOrder` stacks the lanes themselves — the reader's own game order, so
 * their main game is the top lane instead of whichever one held the first row.
 * It orders **lanes and never the rows inside one**, which is the same rule as
 * above read one level up. A game the order does not name sorts after the ones
 * it does, in the order its rows arrived, so this stays total for a lane the
 * reader never placed. Omitted leaves the stacking exactly as it was.
 *
 * The merged mode ignores it, having one lane and no game to order by.
 */
export function timelineLanes<T extends Row>(
  rows: readonly T[],
  mode: TimelineGroup,
  split = true,
  gameOrder?: readonly LaneId[],
): Array<Lane<T>> {
  const order = split ? endingSoonestFirst : byDeadline;

  if (mode === "ending") {
    if (rows.length === 0) return [];
    return [{ id: "all", game: null, rows: [...rows].sort(order) }];
  }

  const byGame = new Map<LaneId, T[]>();
  for (const row of rows) {
    byGame.set(row.event.game, [...(byGame.get(row.event.game) ?? []), row]);
  }

  let lanes = [...byGame];
  if (gameOrder !== undefined) {
    // Unplaced lanes take a rank past every placed one, and ties keep their
    // arrival order — `sort` is stable, so a game the reader never placed does
    // not jump the ones they did.
    const rank = (game: LaneId) => {
      const at = gameOrder.indexOf(game);
      return at === -1 ? gameOrder.length : at;
    };
    lanes = lanes.sort(([a], [b]) => rank(a) - rank(b));
  }

  return lanes.map(([game, laneRows]) => ({
    id: game,
    game,
    rows: split ? laneRows : [...laneRows].sort(byDeadline),
  }));
}
