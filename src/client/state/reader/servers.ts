import type { ReaderState } from "./schema.ts";

/**
 * Whether a game is tracked on more than one server, so a row has to say which.
 * With one server the name is noise: every row of that game is on it.
 * Archive views pass `retired` so records from a dropped server keep their label.
 */
export function manyServers(
  state: ReaderState,
  game: string,
  retired = false,
): boolean {
  return (
    Object.values(state.accounts).filter(
      (a) => a.game === game && (retired || !a.retiredAt),
    ).length > 1
  );
}

/** `" · asia"` when the game has several servers, otherwise nothing. */
export function serverSuffix(
  state: ReaderState,
  game: string,
  region: string | null | undefined,
  retired = false,
): string {
  return region && manyServers(state, game, retired) ? ` · ${region}` : "";
}
