import type { GachaEvent, GameId } from "../../shared/schema.ts";
import { mergeEvents, type MergeResult } from "../merge.ts";
import { parserById } from "../parsers/index.ts";
import { SIX_HOURS_MS, type Adapter, type ParseContext } from "./types.ts";

/**
 * The source registry.
 *
 * One entry per (game, page). Adding a source for a site we already parse is a
 * single entry here. Adding a new site means a parser in `../parsers` first.
 */

interface SourceSpec {
  id: string;
  game: GameId;
  url: string;
  parserId: string;
  priority?: number;
  minIntervalMs?: number;
}

const SOURCES: SourceSpec[] = [
  {
    id: "genshin-game8-events",
    game: "genshin",
    url: "https://game8.co/games/Genshin-Impact/archives/301601",
    parserId: "game8",
  },
  {
    id: "nte-game8-events",
    game: "nte",
    url: "https://game8.co/games/Neverness-to-Everness/archives/592073",
    parserId: "game8",
  },
];

function toAdapter(spec: SourceSpec): Adapter {
  const parser = parserById(spec.parserId);
  if (parser === undefined) {
    throw new Error(
      `source '${spec.id}' references unknown parser '${spec.parserId}'`,
    );
  }

  return {
    id: spec.id,
    game: spec.game,
    url: spec.url,
    parserId: spec.parserId,
    minIntervalMs: spec.minIntervalMs ?? SIX_HOURS_MS,
    priority: spec.priority ?? 0,
    parse(html: string, ctx: ParseContext): GachaEvent[] {
      // A site redesign should fail the run loudly rather than publish an empty
      // calendar, which would read as "no events" to a user.
      if (!parser.canParse(html)) {
        throw new Error(
          `${spec.id}: document does not match the '${parser.label}' template; the source has likely been redesigned`,
        );
      }
      return parser.parse(html, ctx);
    },
  };
}

export const ADAPTERS: Adapter[] = SOURCES.map(toAdapter);

export function adaptersForGame(game: GameId): Adapter[] {
  return ADAPTERS.filter((a) => a.game === game);
}

export function adapterById(id: string): Adapter | undefined {
  return ADAPTERS.find((a) => a.id === id);
}

export function gamesWithSources(): GameId[] {
  return [...new Set(ADAPTERS.map((a) => a.game))];
}

/**
 * Parse every source for one game and combine them.
 *
 * Callers supply already-fetched documents so this stays pure and offline —
 * fetching is stage 1's job, not the parser's.
 */
export function parseGame(
  game: GameId,
  documents: Map<string, string>,
  now: string,
): MergeResult {
  const groups = adaptersForGame(game)
    .sort((a, b) => b.priority - a.priority)
    .flatMap((adapter) => {
      const html = documents.get(adapter.id);
      if (html === undefined) return [];
      return [
        adapter.parse(html, {
          now,
          sourceUrl: adapter.url,
          sourceId: adapter.id,
          game: adapter.game,
        }),
      ];
    });

  return mergeEvents(groups);
}

// Convenience handles for tests and scripts.
export const genshinGame8 = ADAPTERS.find(
  (a) => a.id === "genshin-game8-events",
)!;
export const nteGame8 = ADAPTERS.find((a) => a.id === "nte-game8-events")!;
