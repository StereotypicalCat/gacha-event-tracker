import { game8Parser } from "./game8.ts";
import type { SourceParser } from "./types.ts";

/**
 * Every known site template. Adding a source for a site already listed here is
 * an entry in `adapters/index.ts`; adding a new *site* means a parser module
 * here and one line below.
 */
export const PARSERS: SourceParser[] = [game8Parser];

export function parserById(id: string): SourceParser | undefined {
  return PARSERS.find((p) => p.id === id);
}

export type { SourceParser } from "./types.ts";
export { game8Parser } from "./game8.ts";
