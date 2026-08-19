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
  /**
   * The hour of the server's own day this game rolls over on, when it is not
   * `RESET_HOUR_LOCAL` (04:00).
   *
   * Most gacha servers reset at 04:00 local. Reverse: 1999 resets at 05:00, and
   * the difference is not cosmetic: `resetOffsets` alone cannot express it,
   * because bending a game's stated server offset to land the right instant
   * would put every other reader of that offset an hour out.
   *
   * Like `resetOffsets` this feeds `dayKey`, which is a **localStorage key**, so
   * the same warning applies — changing it for a game that already has readers
   * re-labels the game-day their logged ticks fall in. Absent means 04:00, which
   * is why adding this field moved no existing game.
   */
  resetHourLocal?: number | undefined;
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
  // Reverse: 1999 runs one global server on a fixed UTC-5 and rolls its day at
  // **05:00**, not the 04:00 every other game here uses. Both facts come from
  // the source rather than from habit: all 154 rows on the wiki's event list
  // state `(UTC-5)`, and every one of them starts at 05:00 and ends at 04:59 —
  // an event ending one minute before the reset that the next one begins on.
  r1999: { id: "r1999", name: "Reverse: 1999", short: "R1999", hue: "#C9A227" , studio: "Bluepoch", dailyTasks: "Daily missions", resetOffsets: { asia: -5, america: -5, europe: -5 }, resetHourLocal: 5 },
  // No `resetOffsets` and no `resetHourLocal`, for the reason p5x has none: the
  // source states no time of day anywhere — every date on bluearchive.wiki's
  // Global schedule is a bare `YYYY-MM-DD`. Blue Archive Global does run one
  // worldwide server, so an override is probably owed here eventually, but it
  // has to come from a source that states the clock. Inventing one moves real
  // readers' day keys, and a wrong guess ticks the wrong box every night.
  ba: { id: "ba", name: "Blue Archive", short: "Blue Archive", hue: "#3FCBDD" , studio: "Nexon Games", dailyTasks: "Daily missions, AP" },
  // No `resetOffsets`, and this one is a gap in the field rather than a gap in
  // the evidence. The English server is a single worldwide machine on US
  // Pacific time — every duration on the wiki's `Event_List_(US)` says so — but
  // Pacific observes daylight saving, and the page itself alternates `PDT` and
  // `PST` across the year. `resetOffsets` is one fixed number per region, so
  // there is no honest value: -7 is wrong all winter and -8 all summer, and
  // either way it re-labels day keys twice a year for readers who have logged
  // ticks under the other one. A game whose server clock shifts needs a field
  // that can shift with it — see the note in AGENTS.md § Event IDs.
  fgo: { id: "fgo", name: "Fate/Grand Order", short: "FGO", hue: "#1D3A8F", studio: "Lasengle", dailyTasks: "Daily Quests, AP" },
  // hololive Dreams runs a single worldwide service on a Japanese clock, and
  // both halves of that come from the source rather than from habit: every
  // boundary on holodori.wiki is stated once, in `(JST)`, with no per-region
  // column anywhere, and the game launched worldwide simultaneously. The reset
  // hour is evidenced the way Arknights' is — `Training Support Missions` ends
  // at 3:59AM JST, one minute before a 04:00 local reset — so the default hour
  // stands and only the offset is overridden. Setting it now costs nothing: no
  // reader has a day key for a game the app has never shipped, whereas adding
  // the same override later would re-label ticks they had already logged.
  holodori: { id: "holodori", name: "hololive Dreams", short: "holodori", hue: "#5FD3F3", studio: "QualiArts / COVER", dailyTasks: "Daily missions, stamina", resetOffsets: { asia: 9, america: 9, europe: 9 } },
  // No `resetOffsets`, and unusually the source is not silent here — it is
  // ambiguous, which comes to the same answer. Every IOP Wiki row states an
  // exact UTC instant, but the EN boundaries land on three different clocks:
  // 33 events end at 22:59, 11 at 08:59 and 5 at 02:59. Arknights and
  // Reverse: 1999 each earned an override from a single boundary the whole page
  // agreed on, one minute or second before a 04:00 local reset; three of them
  // is a patch window, not a reset hour. So this game takes the regional
  // default until something states its server clock outright.
  gfl2: { id: "gfl2", name: "Girls' Frontline 2: Exilium", short: "GFL2", hue: "#A9C23F", studio: "Sunborn", dailyTasks: "Daily missions" },
  // No `resetOffsets`, and this is the Fate/Grand Order gap rather than the
  // Blue Archive one: the source states an offset on every boundary, and the
  // offset it states is `-07:00` in August. That is US Pacific in summer, which
  // means it is `-08:00` in winter — one fixed number is wrong for half the year
  // in either direction, and `resetOffsets` holds one fixed number. The page
  // also never lands its boundaries on a single local hour (20:00 and 21:00
  // starts, 12:59 and 19:59 ends), so there is no reset hour to read off it
  // either. See the fgo entry below for the same reasoning at more length.
  stellasora: { id: "stellasora", name: "Stella Sora", short: "Stella Sora", hue: "#2E9E9E", studio: "Yostar", dailyTasks: "Daily missions" },
  // No `resetOffsets`: the source is Game8, which states day-precision prose
  // and no clock at all — the same silence p5x has, and the same answer.
  czn: { id: "czn", name: "Chaos Zero Nightmare", short: "CZN", hue: "#B84A9C", studio: "Smilegate", dailyTasks: "Daily missions" },
  // No `resetOffsets`. The source's own column is headed `Availability (UTC)`,
  // which states the zone the *dates* are in and says nothing about where the
  // server's day rolls — and every row on it is a bare date anyway, with no
  // time of day to read a reset out of. Same silence as p5x and czn.
  uma: { id: "uma", name: "Umamusume: Pretty Derby", short: "Umamusume", hue: "#6FBF44", studio: "Cygames", dailyTasks: "Daily races, missions" },
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
