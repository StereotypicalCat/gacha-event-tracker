import type { GameId } from "./schema.ts";

/**
 * Codes the repository owner tried in game and found dead, while the source
 * still lists them as active (owner, 2026-10-20). The in-game check is the
 * evidence, as for a routine marked `Confirmed in game` (`routines.ts`): the
 * reader sees "Confirmed expired in game, YYYY-MM-DD." on the code.
 *
 * Only "dead" is recorded; there is no "still works". An entry whose code the
 * source has since dropped matches nothing and is logged by `build-codes`, so
 * prune it whenever convenient.
 */
export interface CodeCheck {
  game: GameId;
  /** Exactly as the source spells it. */
  code: string;
  /** The day it was tried and refused. */
  checked: string;
}

export const CODE_CHECKS: readonly CodeCheck[] = [
  { game: "genshin", code: "Y1INABQB6DEX", checked: "2026-10-20" },
  { game: "genshin", code: "2BJ64QRZ7RT8", checked: "2026-10-20" },
  { game: "genshin", code: "PLDXIB886Y1S", checked: "2026-10-20" },
];
