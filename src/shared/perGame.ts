/**
 * Whether the app shows something it supplies on a game's behalf — a daily
 * chore, a built-in weekly task — for one game.
 *
 * One global answer, and the games that differ from it. Two lists rather than
 * one so an exception never changes meaning: a game on `off` is off whatever
 * `all` says, and flipping `all` rewrites nothing else. That is also what lets
 * `prefs.routineGames` — a list of games turned *on* since before this existed —
 * be the built-ins' `on` list unchanged, with no migration and no reader's
 * answer moved.
 */
export interface PerGame {
  all: boolean;
  on?: readonly string[] | undefined;
  off?: readonly string[] | undefined;
}

/** The answer for one game. A game in both lists can only come from hand-edited storage; it is shown. */
export function shownFor(rule: PerGame, game: string): boolean {
  if (rule.on?.includes(game)) return true;
  if (rule.off?.includes(game)) return false;
  return rule.all;
}

/**
 * The lists after the reader answers for one game. An exception is a
 * difference, not a restatement: an answer matching the global one clears the
 * game from both lists rather than recording it.
 */
export function setFor(
  rule: PerGame,
  game: string,
  value: boolean,
): { on: string[]; off: string[] } {
  const on = (rule.on ?? []).filter((g) => g !== game);
  const off = (rule.off ?? []).filter((g) => g !== game);
  if (value !== rule.all) (value ? on : off).push(game);
  return { on, off };
}

/**
 * The rule as one short line — `Every game`, `All but Genshin Impact`,
 * `Only 3 games` — counting only the games offered, so it never reports an
 * exception the reader cannot see beside it.
 */
export function exceptionLine(
  rule: PerGame,
  games: readonly string[],
  name: (game: string) => string,
): string {
  const odd = games.filter((g) => shownFor(rule, g) !== rule.all);
  if (odd.length === 0) return rule.all ? "Every game" : "No game";
  const which = odd.length === 1 ? name(odd[0]!) : `${odd.length} games`;
  return rule.all ? `All but ${which}` : `Only ${which}`;
}
