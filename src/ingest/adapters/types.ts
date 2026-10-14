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

  /**
   * A person's record that this source still answers but its editors have
   * stopped adding events, and that no other source can stand in for it.
   * `scripts/refresh-sources.ts` then reports an empty answer from it as a
   * warning rather than a broken source — and only an answer: one that stops
   * answering is broken as before. Never inferred; see AGENTS.md § Scraping
   * conduct, *A source that has lapsed*.
   */
  lapsed?: Lapsed;
}

export interface Lapsed {
  /** The day a person looked and wrote this down, `YYYY-MM-DD`. */
  recorded: string;
  /** What they saw, in a few words. */
  reason: string;
}

export const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
