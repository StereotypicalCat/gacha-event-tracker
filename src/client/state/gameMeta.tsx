import { createContext, useContext } from "react";
import type { CustomGames, LaneId } from "../../shared/custom.ts";
import { metaFor, type GameMeta } from "../../shared/games.ts";

/**
 * How a component turns a lane id into a name, a short label and a hue.
 *
 * It used to be a direct import of `gameMeta`, which could only answer for the
 * games in `GAMES`. Now a lane can also be one the reader invented (PRD F13),
 * and those live in their browser rather than in a module — so the resolver has
 * to come from somewhere with access to that state.
 *
 * A context rather than module-level mutable state: `metaFor` stays pure and
 * takes the reader's games as an argument, and nothing renders off a registry
 * that some other part of the app has been quietly writing to.
 */
export type MetaResolver = (id: LaneId) => GameMeta;

const NO_CUSTOM_GAMES: CustomGames = {};

const GameMetaContext = createContext<MetaResolver>((id) =>
  metaFor(id, NO_CUSTOM_GAMES),
);

export const GameMetaProvider = GameMetaContext.Provider;

/**
 * The lane resolver for this tree.
 *
 * The default answers for tracked games only, which is the correct answer
 * anywhere the reader's own games cannot appear — and a safe one everywhere
 * else, since `metaFor` is total.
 */
export function useGameMeta(): MetaResolver {
  return useContext(GameMetaContext);
}
