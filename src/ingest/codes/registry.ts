import { SIX_HOURS_MS, type Adapter } from "../adapters/types.ts";
import { parseGame8Codes } from "./game8.ts";
export const CODE_SOURCES = [
  {
    id: "genshin-game8-codes",
    game: "genshin" as const,
    url: "https://game8.co/games/Genshin-Impact/archives/304759",
    parserId: "game8-codes",
    minIntervalMs: SIX_HOURS_MS,
    priority: 0,
    parse: parseGame8Codes,
  },
];
// Fetch policy only depends on source identity, interval and parse count. Event adapters keep
// their GachaEvent return contract; the scheduler can also count code records without faking events.
export type RefreshSource = Omit<Adapter, "parse"> & {
  parse: typeof parseGame8Codes | Adapter["parse"];
};
