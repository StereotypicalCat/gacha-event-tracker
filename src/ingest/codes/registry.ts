import { SIX_HOURS_MS, type Adapter } from "../adapters/types.ts";
import type { ParseContext } from "../adapters/types.ts";
import type { GameId } from "../../shared/schema.ts";
import { parseGame8Codes, parseGame8CodeTable } from "./game8.ts";

/**
 * One Game8 codes page per game. Genshin's page has its own parser (it also
 * reads livestream programmes); the others share `parseGame8CodeTable`, told
 * which heading opens the page's active section. `fixture` is the pinned page a
 * build uses until the refresh has stored a snapshot.
 *
 * Infinity Nikki is deliberately absent: Game8 stopped updating its guides and
 * the codes page is still titled July 2025 (checked 2026-10-18), so its
 * "active" list cannot be presented as current.
 */
function game8Table(
  game: GameId,
  url: string,
  heading: RegExp,
  statesNoCodes?: RegExp,
) {
  return {
    id: `${game}-game8-codes`,
    game,
    url,
    parserId: "game8-code-table",
    minIntervalMs: SIX_HOURS_MS,
    priority: 0,
    fixture: `fixtures/${game}/game8-codes-2026-10-18`,
    parse: (html: string, ctx: ParseContext) =>
      parseGame8CodeTable(html, ctx, heading),
    ...(statesNoCodes
      ? { statesNoEvents: (html: string) => statesNoCodes.test(html) }
      : {}),
  };
}

export const CODE_SOURCES = [
  {
    id: "genshin-game8-codes",
    game: "genshin" as const,
    url: "https://game8.co/games/Genshin-Impact/archives/304759",
    parserId: "game8-codes",
    minIntervalMs: SIX_HOURS_MS,
    priority: 0,
    fixture: "fixtures/genshin/game8-codes-2026-10-16",
    parse: parseGame8Codes,
  },
  game8Table(
    "hsr",
    "https://game8.co/games/Honkai-Star-Rail/archives/410296",
    /^Active Redeem Codes for/i,
  ),
  game8Table(
    "zzz",
    "https://game8.co/games/Zenless-Zone-Zero/archives/435683",
    /^Active Zenless Zone Zero Code/i,
  ),
  game8Table(
    "wuwa",
    "https://game8.co/games/Wuthering-Waves/archives/453149",
    /^Wuthering Waves All Active Codes$/i,
  ),
  game8Table(
    "endfield",
    "https://game8.co/games/Arknights-Endfield/archives/571509",
    /^All Active Codes in/i,
  ),
  game8Table(
    "nte",
    "https://game8.co/games/Neverness-to-Everness/archives/593718",
    /^All Active Redeem Codes$/i,
  ),
  game8Table(
    "p5x",
    "https://game8.co/games/Persona-5-Phantom-X/archives/531770",
    /^List of All Codes$/i,
  ),
  game8Table(
    "czn",
    "https://game8.co/games/Chaos-Zero-Nightmare/archives/557967",
    /^All Active Coupons$/i,
  ),
  // Global Umamusume has had no public codes yet; the page says so, and that
  // statement (not an empty table) is what lets an empty read be stored.
  game8Table(
    "uma",
    "https://game8.co/games/Umamusume-Pretty-Derby/archives/536130",
    /^List of Codes$/i,
    /No Publicly Released Codes Yet/i,
  ),
];
// Fetch policy only depends on source identity, interval and parse count. Event adapters keep
// their GachaEvent return contract; the scheduler can also count code records without faking events.
export type RefreshSource = Omit<Adapter, "parse"> & {
  parse: typeof parseGame8Codes | Adapter["parse"];
};
