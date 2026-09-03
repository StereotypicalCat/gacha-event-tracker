import type { GachaEvent, GameId } from "../../shared/schema.ts";

export interface ParseContext {
  /**
   * Injected wall-clock, never read from Date.now() inside a parser. This is
   * what lets a fixture captured months ago assert byte-identical output.
   */
  now: string;
  sourceUrl: string;
  sourceId: string;
  game: GameId;
}

/**
 * An adapter binds one URL, for one game, to one parser.
 *
 * It holds no parsing logic of its own — that lives in `../parsers`, keyed by
 * site template. A game may have several adapters (several sources); their
 * outputs are combined by `mergeEvents`.
 */
export interface Adapter {
  /** Unique, stable: "<game>-<site>-<page>", e.g. "genshin-game8-events". */
  id: string;
  game: GameId;
  url: string;
  /** Parser id from `../parsers`. */
  parserId: string;
  minIntervalMs: number;
  /**
   * Higher wins when two sources disagree and neither is clearly better.
   * Official feeds should outrank community wikis.
   */
  priority: number;

  parse(html: string, ctx: ParseContext): GachaEvent[];

  /**
   * True when the page itself states that it currently lists no events, so an
   * empty parse is this source's real answer rather than a source that broke.
   * Absent unless the underlying parser implements it — see
   * `SourceParser.statesNoEvents`.
   */
  statesNoEvents?(html: string): boolean;
}

export const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
