import type { CustomGames, LaneId } from "./custom.ts";
import type { GameId, Region } from "./schema.ts";

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
  /**
   * Server clock offsets that differ from the regional default, per region.
   *
   * Not every game runs one server per region. Where a game serves two of our
   * regions off a single machine, the reader's region is still the right
   * question — it just gets a different answer for that game than
   * `REGION_RESET_UTC_OFFSET` gives.
   *
   * Deliberately a sparse override rather than a full table: listing only the
   * regions that actually differ keeps the diff to the fact that changed, and
   * a region absent here keeps the default answer it has always had.
   *
   * This feeds `dayKey`, which is a **localStorage key**. Adding or changing an
   * entry re-labels the game-day some already-logged ticks fall in, for readers
   * in that region only — see `src/shared/daily.ts` § shift and
   * docs/DATA-MODEL.md.
   */
  resetOffsets?: Partial<Record<Region, number>> | undefined;
}

export const GAMES: Record<GameId, GameMeta> = {
  genshin: { id: "genshin", name: "Genshin Impact", short: "Genshin", hue: "#4EA8DE" , studio: "HoYoverse", dailyTasks: "Commissions, resin" },
  hsr: { id: "hsr", name: "Honkai: Star Rail", short: "Star Rail", hue: "#7B8CFF" , studio: "HoYoverse", dailyTasks: "Daily training, Trailblaze Power" },
  zzz: { id: "zzz", name: "Zenless Zone Zero", short: "ZZZ", hue: "#F2A03D" , studio: "HoYoverse", dailyTasks: "Daily missions, battery" },
  wuwa: { id: "wuwa", name: "Wuthering Waves", short: "Wuwa", hue: "#3DD6A0" , studio: "Kuro Games", dailyTasks: "Daily activity, waveplate" },
  // Arknights runs a single Global (EN) server for all three of our regions on
  // a fixed UTC-7, so every region gets the same override rather than the
  // regional default. Evidenced by the source rather than assumed: every ending
  // event on arknights.wiki.gg carries an exact end of 10:59:59Z, which is
  // 03:59:59 at UTC-7 — one second before a 04:00 reset. Without this a
  // European reader's Arknights day would roll at 03:00 UTC while the game
  // rolls at 11:00, ticking the wrong box for eight hours.
  arknights: { id: "arknights", name: "Arknights", short: "Arknights", hue: "#9AA3B8" , studio: "Hypergryph", dailyTasks: "Daily missions, sanity", resetOffsets: { asia: -7, america: -7, europe: -7 } },
  // Endfield has two server groups, not three: Europe is served off the same
  // machine as the Americas, on a fixed UTC-5. So a European player's day rolls
  // at 09:00 UTC — 11:00 in Copenhagen in summer, 10:00 in winter — six hours
  // after the HoYo/Kuro pattern above. Asia has its own server and is unchanged,
  // and `america` already resolves to -5, so Europe is the only real override.
  endfield: { id: "endfield", name: "Arknights: Endfield", short: "Endfield", hue: "#E8635A" , studio: "Hypergryph", dailyTasks: "Daily missions", resetOffsets: { europe: -5 } },
  nte: { id: "nte", name: "Neverness to Everness", short: "NTE", hue: "#C77DFF" , studio: "Hotta Studio", dailyTasks: "Daily tasks" },
  nikki: { id: "nikki", name: "Infinity Nikki", short: "Nikki", hue: "#F27BB0" , studio: "Infold Games", dailyTasks: "Daily tasks, Vital Energy" },
  // No `resetOffsets`: nothing in the source states a server map that differs
  // from the regional default, and an offset invented here would move real
  // readers' day keys. Add one only against evidence — see games.ts § resetOffsets.
  p5x: { id: "p5x", name: "Persona 5: The Phantom X", short: "P5X", hue: "#D62246" , studio: "Perfect World", dailyTasks: "Daily missions, stamina" },
};

export const GAME_LIST: GameMeta[] = Object.values(GAMES);

export function gameMeta(id: GameId): GameMeta {
  return GAMES[id];
}

/**
 * Meta for any lane, including one the reader invented (PRD F13).
 *
 * Pure, and total. Total matters: a lane id can outlive the game it names —
 * an import can carry an event whose game did not come with it, and a reader
 * can delete a game a stale render is still holding. Returning a neutral
 * placeholder keeps that a visible oddity rather than a blank screen, which is
 * the trade this codebase makes everywhere else in the client.
 */
export function metaFor(id: LaneId, custom: CustomGames): GameMeta {
  const tracked = GAMES[id as GameId];
  if (tracked !== undefined) return tracked;

  const own = custom[id];
  if (own !== undefined) {
    return {
      id: own.id as GameId,
      name: own.name,
      short: shortLabel(own.name),
      hue: own.hue,
      // Not credited in the colophon and contributing no standing chore: the
      // colophon lists the sources we fetch, and this game has none. See
      // docs/DATA-MODEL.md § Reader-authored key spaces.
      studio: "",
      dailyTasks: "",
    };
  }

  return {
    id: id as GameId,
    name: "Unknown game",
    short: "?",
    hue: "#9AA3B8",
    studio: "",
    dailyTasks: "",
  };
}

/** A name that still fits a narrow lane label or a chip. */
export function shortLabel(name: string): string {
  if (name.length <= 12) return name;
  const first = name.split(/\s+/)[0] ?? name;
  return first.length <= 12 ? first : `${name.slice(0, 11)}…`;
}
