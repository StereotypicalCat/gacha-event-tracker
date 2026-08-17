import type { GachaEvent, GameId } from "../../shared/schema.ts";
import { mergeEvents, type MergeResult } from "../merge.ts";
import { parserById } from "../parsers/index.ts";
import { sanitizeEvents } from "../sanitize.ts";
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
    id: "hsr-game8-events",
    game: "hsr",
    url: "https://game8.co/games/Honkai-Star-Rail/archives/408749",
    parserId: "game8",
  },
  {
    id: "wuwa-game8-events",
    game: "wuwa",
    url: "https://game8.co/games/Wuthering-Waves/archives/453473",
    parserId: "game8",
  },
  {
    id: "zzz-game8-events",
    game: "zzz",
    url: "https://game8.co/games/Zenless-Zone-Zero/archives/457176",
    parserId: "game8",
  },
  {
    id: "endfield-game8-events",
    game: "endfield",
    url: "https://game8.co/games/Arknights-Endfield/archives/535443",
    parserId: "game8",
  },
  {
    id: "endfield-wikigg-events",
    game: "endfield",
    url: "https://endfield.wiki.gg/wiki/Event",
    parserId: "wikigg",
    // Exact timestamps and per-region ends beat Game8's day-precision prose,
    // so this source wins when the two disagree.
    priority: 10,
  },
  {
    id: "arknights-akwiki-events",
    game: "arknights",
    url: "https://arknights.wiki.gg/wiki/Event",
    parserId: "akwiki",
  },
  {
    id: "nte-game8-events",
    game: "nte",
    url: "https://game8.co/games/Neverness-to-Everness/archives/592073",
    parserId: "game8",
  },
  {
    id: "nikki-game8-events",
    game: "nikki",
    url: "https://game8.co/games/Infinity-Nikki/archives/487445",
    parserId: "game8",
  },
  {
    id: "p5x-game8-events",
    game: "p5x",
    url: "https://game8.co/games/Persona-5-Phantom-X/archives/532244",
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

      // The trust boundary. Everything a parser produces came from a page we do
      // not control, and this is the one place every source passes through:
      // `ADAPTERS` is built from `SOURCES` via this function, so a source added
      // tomorrow is sanitised without its author doing anything, and a parser
      // cannot opt out. Sanitising here rather than inside the parsers also
      // keeps parsers what they are — pure readers of one site's markup.
      //
      // `sanitizeEvents` logs to console.warn by default, so a repaired or
      // dropped event is never silent (CLAUDE.md § Silent drops).
      return sanitizeEvents(parser.parse(html, ctx), {
        sourceId: ctx.sourceId,
        fallbackUrl: ctx.sourceUrl,
      }).events;
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
