import type { GameId } from "./schema.ts";

/**
 * Where a reader redeems a game's codes: the publisher's own web page when
 * one exists, and the in-game path in the game's words. Only for games with a
 * codes source; read from that source's own "How to redeem" section and dated
 * by when it was read. A URL is listed only when it is on the publisher's
 * domain and the source links it — Chaos Zero Nightmare names an official
 * coupon page without linking it, so it gets the in-game path only.
 */
export interface Redeem {
  /** The publisher's official redemption page. */
  url?: string;
  /** The in-game route, step by step. */
  inGame: string;
  /** Where the route and URL were read. */
  source: string;
  checked: string;
}

export const REDEEM: Partial<Record<GameId, Redeem>> = {
  genshin: {
    url: "https://genshin.hoyoverse.com/en/gift",
    inGame:
      "Paimon menu → Settings → Account → Redeem Code (Adventure Rank 10+)",
    source: "https://game8.co/games/Genshin-Impact/archives/304759",
    checked: "2026-10-18",
  },
  hsr: {
    url: "https://hsr.hoyoverse.com/gift",
    inGame: "Menu → ··· → Redemption Code",
    source: "https://game8.co/games/Honkai-Star-Rail/archives/410296",
    checked: "2026-10-18",
  },
  zzz: {
    url: "https://zenless.hoyoverse.com/redemption",
    inGame: "Menu → More → Redemption Code",
    source: "https://game8.co/games/Zenless-Zone-Zero/archives/435683",
    checked: "2026-10-18",
  },
  wuwa: {
    inGame: "Settings → Other Settings → Redemption Code",
    source: "https://game8.co/games/Wuthering-Waves/archives/453149",
    checked: "2026-10-18",
  },
  endfield: {
    inGame:
      "Menu → Settings → Platform & Account → Exchange Code (after the tutorial unlocks Mail)",
    source: "https://game8.co/games/Arknights-Endfield/archives/571509",
    checked: "2026-10-18",
  },
  nte: {
    inGame: "Menu → [...] → Redeem Code",
    source: "https://game8.co/games/Neverness-to-Everness/archives/593718",
    checked: "2026-10-18",
  },
  p5x: {
    inGame: "Menu → Exchange Code",
    source: "https://game8.co/games/Persona-5-Phantom-X/archives/531770",
    checked: "2026-10-18",
  },
  czn: {
    inGame: "Menu → Settings → Account Settings → Register Coupon",
    source: "https://game8.co/games/Chaos-Zero-Nightmare/archives/557967",
    checked: "2026-10-18",
  },
  uma: {
    inGame: "Menu → Enter Code",
    source: "https://game8.co/games/Umamusume-Pretty-Derby/archives/536130",
    checked: "2026-10-18",
  },
};
