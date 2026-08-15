import type { GameId } from "./schema.ts";

export interface GameMeta {
  id: GameId;
  name: string;
  /** Short label for narrow lanes and chips. */
  short: string;
  /**
   * Hue identity. This axis encodes *which game* only — urgency is a separate
   * axis (see time.ts). Keeping them orthogonal is what lets a glance answer
   * "whose event is this?" and "how long have I got?" at the same time.
   */
  hue: string;
  /** Who makes it. Credited in the colophon, derived rather than hardcoded. */
  studio: string;
  /**
   * What the game's standing daily chore actually consists of, in the terms
   * the game itself uses. Deliberately the routine every player recognises —
   * this is a reminder, not a guide, and a wrong specific would be worse than
   * no hint at all.
   */
  dailyTasks: string;
}

export const GAMES: Record<GameId, GameMeta> = {
  genshin: { id: "genshin", name: "Genshin Impact", short: "Genshin", hue: "#4EA8DE" , studio: "HoYoverse", dailyTasks: "Commissions, resin" },
  hsr: { id: "hsr", name: "Honkai: Star Rail", short: "Star Rail", hue: "#7B8CFF" , studio: "HoYoverse", dailyTasks: "Daily training, Trailblaze Power" },
  zzz: { id: "zzz", name: "Zenless Zone Zero", short: "ZZZ", hue: "#F2A03D" , studio: "HoYoverse", dailyTasks: "Daily missions, battery" },
  wuwa: { id: "wuwa", name: "Wuthering Waves", short: "Wuwa", hue: "#3DD6A0" , studio: "Kuro Games", dailyTasks: "Daily activity, waveplate" },
  arknights: { id: "arknights", name: "Arknights", short: "Arknights", hue: "#9AA3B8" , studio: "Hypergryph", dailyTasks: "Daily missions, sanity" },
  endfield: { id: "endfield", name: "Arknights: Endfield", short: "Endfield", hue: "#E8635A" , studio: "Hypergryph", dailyTasks: "Daily missions" },
  nte: { id: "nte", name: "Neverness to Everness", short: "NTE", hue: "#C77DFF" , studio: "Hotta Studio", dailyTasks: "Daily tasks" },
};

export const GAME_LIST: GameMeta[] = Object.values(GAMES);

export function gameMeta(id: GameId): GameMeta {
  return GAMES[id];
}
