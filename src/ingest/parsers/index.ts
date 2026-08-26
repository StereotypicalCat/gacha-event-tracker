import { arknightsWikiParser } from "./akwiki.ts";
import { aruStatsParser } from "./arustats.ts";
import { blueArchiveWikiParser } from "./bawiki.ts";
import { fandomParser } from "./fandom.ts";
import { game8Parser } from "./game8.ts";
import { holodoriWikiParser } from "./holodori.ts";
import { iopWikiParser } from "./iopwiki.ts";
import { stellaSoraWikiParser } from "./stellasora.ts";
import { wikiGgParser } from "./wikigg.ts";
import type { SourceParser } from "./types.ts";

/**
 * Every known site template. Adding a source for a site already listed here is
 * an entry in `adapters/index.ts`; adding a new *site* means a parser module
 * here and one line below.
 */
export const PARSERS: SourceParser[] = [
  game8Parser,
  wikiGgParser,
  arknightsWikiParser,
  fandomParser,
  blueArchiveWikiParser,
  holodoriWikiParser,
  iopWikiParser,
  stellaSoraWikiParser,
  aruStatsParser,
];

export function parserById(id: string): SourceParser | undefined {
  return PARSERS.find((p) => p.id === id);
}

export type { SourceParser } from "./types.ts";
export { arknightsWikiParser } from "./akwiki.ts";
export { aruStatsParser } from "./arustats.ts";
export { blueArchiveWikiParser } from "./bawiki.ts";
export { fandomParser } from "./fandom.ts";
export { game8Parser } from "./game8.ts";
export { holodoriWikiParser } from "./holodori.ts";
export { iopWikiParser } from "./iopwiki.ts";
export { stellaSoraWikiParser } from "./stellasora.ts";
export { wikiGgParser } from "./wikigg.ts";
