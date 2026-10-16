import { z } from "zod";
import { PeriodSchema } from "./period.ts";
import { GameId, Region } from "./schema.ts";
import { shownFor, type PerGame } from "./perGame.ts";
import { MeasureSchema, type TaskShape } from "./task.ts";

export { asOfLabel } from "./task.ts";

/**
 * Weekly and monthly tasks the app ships for a game — the built-in counterpart of a
 * reader's own `mytask:` (PRD F17).
 *
 * Each is a claim about a game we did not write, so it is held to the bar the
 * standing chores in `games.ts` are: **a cited source, and the date that source
 * gives**, both shown to the reader. A figure from a ten-month-old guide is
 * then visibly ten months old rather than presented as current. Nothing here is
 * inferred; add one only when a page states it.
 *
 * The one exception is a figure the repository owner confirmed in the game
 * when no page states it (owner, 2026-10-14). It still links the best page
 * there is, and its `note` says `Confirmed in game, YYYY-MM-DD.` so the reader
 * can tell which figure is ours rather than the page's.
 *
 * Off unless the reader says yes — for every game (`prefs.showRoutines`) or for
 * one (`prefs.routineGames`, `prefs.routinesOff`; see `perGame.ts`). Its id is in
 * the reserved `routine:` space, and its ticks and numbers are stored under that
 * id exactly as a reader's task's are.
 */
export const RoutineSchema = z.object({
  id: z.string().regex(/^routine:[a-z0-9]+:[a-z0-9-]+$/),
  game: GameId,
  title: z.string().min(1).max(80),
  period: PeriodSchema,
  measure: MeasureSchema,
  /** The page that states it. */
  source: z.string().url().startsWith("https://"),
  /** The date that page gives for itself — what the figure is as of. */
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** When we last read it. */
  checked: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Anything the reader needs to know before relying on it. */
  note: z.string().max(140).optional(),
  /**
   * Gacha pulls a shop sells, by banner. Most shops stock both: the premium
   * (limited) line is offered with the game's other built-ins, the standard
   * line only when the reader also asks for standard pulls
   * (`prefs.standardPulls`, owner, 2026-10-16). Absent on everything else.
   */
  pulls: z.enum(["premium", "standard"]).optional(),
  /**
   * The server whose reset this rolls on for every reader — for a cycle that
   * ends at one instant everywhere, such as NTE's Beyond the Rails on Asia's
   * (spec 2026-10-16, decision 3). Code only, never stored; *Make it mine*
   * leaves it behind, since a reader's task has no such field.
   */
  clock: Region.optional(),
});
export type Routine = z.infer<typeof RoutineSchema> & TaskShape;

export const ROUTINES: readonly Routine[] = [
  // Genshin Impact. Every weekly item rolls with the Monday reset, which each
  // page states for itself; the monthly two name their own day.
  {
    id: "routine:genshin:weekly-bosses",
    game: "genshin",
    title: "Weekly Bosses",
    period: { unit: "week", startsOn: 1 },
    // The three discounted claims; a fourth costs full resin.
    measure: { kind: "amount", target: 3, unit: "runs" },
    source: "https://genshin-impact.fandom.com/wiki/Weekly_Boss",
    asOf: "2026-08-21",
    checked: "2026-10-14",
    note: "Trounce Domains: three runs at half the Resin. Confirmed in game, 2026-10-16.",
  },
  {
    id: "routine:genshin:battle-pass-exp",
    game: "genshin",
    title: "Battle Pass weekly EXP",
    period: { unit: "week", startsOn: 1 },
    measure: { kind: "amount", target: 10000, unit: "EXP" },
    source: "https://genshin-impact.fandom.com/wiki/Battle_Pass",
    asOf: "2026-01-08",
    checked: "2026-10-14",
    note: "The cap on EXP from daily and weekly missions. Confirmed in game, 2026-10-14.",
  },
  {
    id: "routine:genshin:bounties",
    game: "genshin",
    title: "Reputation Bounties",
    period: { unit: "week", startsOn: 1 },
    measure: { kind: "amount", target: 3, unit: "bounties" },
    source: "https://genshin-impact.fandom.com/wiki/Bounties",
    asOf: "2026-06-13",
    checked: "2026-10-14",
    note: "Counted apart from Reputation Requests. Confirmed in game, 2026-10-16.",
  },
  {
    id: "routine:genshin:requests",
    game: "genshin",
    title: "Reputation Requests",
    period: { unit: "week", startsOn: 1 },
    measure: { kind: "amount", target: 3, unit: "requests" },
    source: "https://genshin-impact.fandom.com/wiki/Request",
    asOf: "2026-06-13",
    checked: "2026-10-14",
    note: "Three across all nations, not three each; apart from Bounties. Confirmed in game, 2026-10-16.",
  },
  {
    id: "routine:genshin:realm-depot",
    game: "genshin",
    title: "Realm Depot: Realm Treasures",
    // The page says weekly and names no day; Monday is the owner's in-game
    // restock timer. No one target either, so it is ticked once a week.
    period: { unit: "week", startsOn: 1 },
    measure: { kind: "days", required: 1 },
    source: "https://genshin-impact.fandom.com/wiki/Serenitea_Pot/Realm_Depot",
    asOf: "2026-10-12",
    checked: "2026-10-16",
    note: "Bought with Realm Currency; the whole stock costs 13,100. The wiki says weekly; the Monday is ours. Confirmed in game, 2026-10-16.",
  },
  {
    id: "routine:genshin:paimons-bargains",
    game: "genshin",
    title: "Paimon's Bargains: Intertwined Fates",
    period: { unit: "month", startsOn: 1 },
    pulls: "premium",
    measure: { kind: "amount", target: 5, unit: "fates" },
    source: "https://genshin-impact.fandom.com/wiki/Paimon%27s_Bargains",
    asOf: "2026-08-23",
    checked: "2026-10-14",
    note: "Bought with Masterless Stardust. Confirmed in game, 2026-10-16.",
  },
  {
    id: "routine:genshin:paimons-bargains-acquaint",
    game: "genshin",
    title: "Paimon's Bargains: Acquaint Fates",
    period: { unit: "month", startsOn: 1 },
    pulls: "standard",
    measure: { kind: "amount", target: 5, unit: "fates" },
    source: "https://genshin-impact.fandom.com/wiki/Paimon%27s_Bargains",
    asOf: "2026-08-23",
    checked: "2026-10-16",
    note: "The standard-banner line beside the Intertwined Fates, bought with Masterless Stardust.",
  },
  {
    id: "routine:genshin:spiral-abyss",
    game: "genshin",
    title: "Spiral Abyss",
    // The page names the reset and no target, so it is ticked once a cycle.
    period: { unit: "month", startsOn: 16 },
    measure: { kind: "days", required: 1 },
    source: "https://genshin-impact.fandom.com/wiki/Spiral_Abyss",
    asOf: "2026-08-29",
    checked: "2026-10-14",
    note: "Confirmed in game, 2026-10-16.",
  },
  {
    id: "routine:genshin:imaginarium-theater",
    game: "genshin",
    title: "Imaginarium Theater",
    period: { unit: "month", startsOn: 1 },
    measure: { kind: "days", required: 1 },
    source: "https://genshin-impact.fandom.com/wiki/Imaginarium_Theater",
    asOf: "2026-09-01",
    checked: "2026-10-14",
    note: "Confirmed in game, 2026-10-16.",
  },

  // Honkai: Star Rail.
  {
    id: "routine:hsr:echo-of-war",
    game: "hsr",
    title: "Echo of War",
    period: { unit: "week", startsOn: 1 },
    measure: { kind: "amount", target: 3, unit: "runs" },
    source: "https://honkai-star-rail.fandom.com/wiki/Echo_of_War",
    asOf: "2025-10-17",
    checked: "2026-10-14",
    note: "Confirmed in game, 2026-10-14.",
  },
  {
    id: "routine:hsr:nameless-honor-exp",
    game: "hsr",
    title: "Nameless Honor weekly EXP",
    // Monday is Star Rail's weekly reset, as Echo of War's page states it.
    period: { unit: "week", startsOn: 1 },
    measure: { kind: "amount", target: 8000, unit: "EXP" },
    source: "https://honkai-star-rail.fandom.com/wiki/Nameless_Honor",
    asOf: "2026-08-26",
    checked: "2026-10-14",
    note: "The pass's weekly EXP cap; the wiki doesn't state it. Confirmed in game, 2026-10-14.",
  },
  {
    id: "routine:hsr:embers-exchange",
    game: "hsr",
    title: "Embers Exchange: Star Rail Special Pass",
    // The wiki marks the stock as refreshing monthly; the 1st is the owner's
    // in-game countdown on 2026-10-14, which ends at the reset on 1 Nov 2026.
    period: { unit: "month", startsOn: 1 },
    pulls: "premium",
    measure: { kind: "amount", target: 5, unit: "passes" },
    source: "https://honkai-star-rail.fandom.com/wiki/Embers_Exchange",
    asOf: "2026-07-12",
    checked: "2026-10-14",
    note: "Bought with Undying Embers. The wiki says monthly; the 1st is ours. Confirmed in game, 2026-10-14.",
  },
  {
    id: "routine:hsr:embers-exchange-standard",
    game: "hsr",
    title: "Embers Exchange: Star Rail Pass",
    // Resets with the Special Pass line beside it: the 1st.
    period: { unit: "month", startsOn: 1 },
    pulls: "standard",
    measure: { kind: "amount", target: 5, unit: "passes" },
    source: "https://honkai-star-rail.fandom.com/wiki/Embers_Exchange",
    asOf: "2026-07-12",
    checked: "2026-10-16",
    note: "The standard-banner line beside the Special Pass, bought with Undying Embers.",
  },
  {
    id: "routine:hsr:points",
    game: "hsr",
    title: "Divergent Universe & Currency Wars points",
    // One pool for both modes since 4.2, rolling with the Monday reset the
    // Simulated Universe page states.
    period: { unit: "week", startsOn: 1 },
    measure: { kind: "amount", target: 18000, unit: "points" },
    source: "https://honkai-star-rail.fandom.com/wiki/Version/4.2",
    asOf: "2026-09-07",
    checked: "2026-10-16",
    note: "One cap shared by both modes, weekly since 4.2. Confirmed in game, 2026-10-14.",
  },
  // The three endgame modes: each refreshes every six weeks, two weeks apart.
  // Each anchor is the day after the end the owner read in game (2026-10-14).
  {
    id: "routine:hsr:pure-fiction",
    game: "hsr",
    title: "Pure Fiction",
    period: { unit: "cycle", days: 42, from: "2026-10-19" },
    measure: { kind: "days", required: 1 },
    source: "https://honkai-star-rail.fandom.com/wiki/Interastral_Peace_Guide/Treasures_Lightward",
    asOf: "2026-08-15",
    checked: "2026-10-16",
    note: "Six-week rotation, one mode every two weeks.",
  },
  {
    id: "routine:hsr:memory-of-chaos",
    game: "hsr",
    title: "Memory of Chaos",
    period: { unit: "cycle", days: 42, from: "2026-11-02" },
    measure: { kind: "days", required: 1 },
    source: "https://honkai-star-rail.fandom.com/wiki/Interastral_Peace_Guide/Treasures_Lightward",
    asOf: "2026-08-15",
    checked: "2026-10-16",
    note: "Forgotten Hall. Six-week rotation, one mode every two weeks.",
  },
  {
    id: "routine:hsr:apocalyptic-shadow",
    game: "hsr",
    title: "Apocalyptic Shadow",
    period: { unit: "cycle", days: 42, from: "2026-11-16" },
    measure: { kind: "days", required: 1 },
    source: "https://honkai-star-rail.fandom.com/wiki/Interastral_Peace_Guide/Treasures_Lightward",
    asOf: "2026-08-15",
    checked: "2026-10-16",
    note: "Six-week rotation, one mode every two weeks.",
  },

  // Zenless Zone Zero.
  {
    id: "routine:zzz:ridu-weekly",
    game: "zzz",
    title: "Ridu Weekly",
    period: { unit: "week", startsOn: 1 },
    // The last milestone; every reward is claimed by then. Was 1,300 until the
    // wiki recorded 2,100 on 2026-01-05 — Game8's page still says 1,300.
    measure: { kind: "amount", target: 2100, unit: "points" },
    source: "https://zenless-zone-zero.fandom.com/wiki/Ridu_Weekly",
    asOf: "2026-08-31",
    checked: "2026-10-14",
    note: "Confirmed in game, 2026-10-16.",
  },
  {
    id: "routine:zzz:bounty-commissions",
    game: "zzz",
    title: "Bounty Commissions",
    period: { unit: "week", startsOn: 1 },
    measure: { kind: "amount", target: 8000, unit: "points" },
    source: "https://zenless-zone-zero.fandom.com/wiki/Hollow_Zero/Bounty_Commission",
    asOf: "2025-03-21",
    checked: "2026-10-14",
    note: "One cap shared by Lost Void and Enigma of the Labyrinth. Confirmed in game, 2026-10-16.",
  },
  {
    id: "routine:zzz:notorious-hunt",
    game: "zzz",
    title: "Notorious Hunt",
    // The page says per week and names no day; Monday is ZZZ's weekly reset,
    // as Ridu Weekly's page states it and the owner confirmed in game.
    period: { unit: "week", startsOn: 1 },
    measure: { kind: "amount", target: 3, unit: "runs" },
    source: "https://zenless-zone-zero.fandom.com/wiki/Notorious_Hunt",
    asOf: "2026-02-26",
    checked: "2026-10-16",
    note: "Three a week at no Battery cost. Confirmed in game, 2026-10-16.",
  },
  {
    id: "routine:zzz:city-fund-exp",
    game: "zzz",
    title: "New Eridu City Fund weekly EXP",
    // Monday is ZZZ's weekly reset, as Ridu Weekly's page states it.
    period: { unit: "week", startsOn: 1 },
    measure: { kind: "amount", target: 10000, unit: "EXP" },
    source: "https://zenless-zone-zero.fandom.com/wiki/New_Eridu_City_Fund",
    asOf: "2026-09-04",
    checked: "2026-10-16",
    note: "The battle pass's weekly EXP cap; the wiki doesn't state it. Confirmed in game, 2026-10-16.",
  },
  {
    id: "routine:zzz:signal-shop-tapes",
    game: "zzz",
    title: "Signal Shop: Encrypted Master Tapes",
    // The wiki marks the Fading Signal stock as refreshing monthly; the 1st is
    // the owner's in-game timer on 2026-10-16, which ends at the reset on 1 Nov.
    period: { unit: "month", startsOn: 1 },
    pulls: "premium",
    measure: { kind: "amount", target: 5, unit: "tapes" },
    source: "https://zenless-zone-zero.fandom.com/wiki/Signal_Shop",
    asOf: "2026-09-09",
    checked: "2026-10-16",
    note: "Bought with Fading Signal; 5 a month per the wiki. The monthly reset on the 1st is ours. Confirmed in game, 2026-10-16.",
  },
  {
    id: "routine:zzz:signal-shop-master-tapes",
    game: "zzz",
    title: "Signal Shop: Master Tapes",
    // Resets with the Encrypted Master Tape line beside it: the 1st.
    period: { unit: "month", startsOn: 1 },
    pulls: "standard",
    measure: { kind: "amount", target: 5, unit: "tapes" },
    source: "https://zenless-zone-zero.fandom.com/wiki/Signal_Shop",
    asOf: "2026-09-09",
    checked: "2026-10-16",
    note: "The standard-banner line beside the Encrypted Master Tapes, bought with Fading Signal.",
  },
  {
    id: "routine:zzz:signal-shop-boopons",
    game: "zzz",
    title: "Signal Shop: Boopons",
    // The Bangbuck section's monthly stock, which resets with the Fading Signal
    // one (the 1st, per the owner's in-game timer).
    period: { unit: "month", startsOn: 1 },
    pulls: "premium",
    measure: { kind: "amount", target: 5, unit: "Boopons" },
    source: "https://zenless-zone-zero.fandom.com/wiki/Signal_Shop",
    asOf: "2026-09-09",
    checked: "2026-10-16",
    note: "Bought with Bangbucks, 5 a month per the wiki; Boopons pay for Bangboo pulls. Confirmed in game, 2026-10-16.",
  },
  // The two endgame modes alternate Fridays, each every two weeks. Anchors are
  // the owner's in-game readings (2026-10-16): Shiyu rolled that day, Deadly
  // Assault a week later.
  {
    id: "routine:zzz:shiyu-defense",
    game: "zzz",
    title: "Shiyu Defense",
    period: { unit: "cycle", days: 14, from: "2026-10-16" },
    measure: { kind: "days", required: 1 },
    source: "https://zenless-zone-zero.fandom.com/wiki/Shiyu_Defense/Critical_Node",
    asOf: "2026-01-02",
    checked: "2026-10-16",
    note: "Critical Node. Fridays, alternating weeks with Deadly Assault.",
  },
  {
    id: "routine:zzz:deadly-assault",
    game: "zzz",
    title: "Deadly Assault",
    period: { unit: "cycle", days: 14, from: "2026-10-23" },
    measure: { kind: "days", required: 1 },
    source: "https://zenless-zone-zero.fandom.com/wiki/Deadly_Assault",
    asOf: "2026-07-31",
    checked: "2026-10-16",
    note: "Fridays, alternating weeks with Shiyu Defense.",
  },

  // Arknights: Endfield.
  {
    id: "routine:endfield:weekly-routine",
    game: "endfield",
    title: "Weekly Routine",
    period: { unit: "week", startsOn: 1 },
    measure: { kind: "amount", target: 10, unit: "points" },
    source: "https://endfield.wiki.gg/wiki/Weekly_Routine",
    asOf: "2026-04-11",
    checked: "2026-10-14",
    note: "Unlocks at Authority Level 15. Confirmed in game, 2026-10-14.",
  },
  {
    id: "routine:endfield:focus-commissions",
    game: "endfield",
    title: "Etchspace Salvage: Focus Commissions",
    // The page says weekly; Monday is the wiki's own stated weekly reset.
    period: { unit: "week", startsOn: 1 },
    measure: { kind: "amount", target: 3, unit: "commissions" },
    source: "https://endfield.wiki.gg/wiki/Etchspace_Salvage",
    asOf: "2026-09-01",
    checked: "2026-10-14",
    note: "Unlocks after Aberrant Exploration III.",
  },

  // Wuthering Waves. Game8 is the fresher source here: the wiki's per-season
  // pages stop in early 2026.
  {
    id: "routine:wuwa:weekly-challenge",
    game: "wuwa",
    title: "Weekly Challenge",
    period: { unit: "week", startsOn: 1 },
    measure: { kind: "amount", target: 3, unit: "claims" },
    source: "https://game8.co/games/Wuthering-Waves/archives/453471",
    asOf: "2026-09-30",
    checked: "2026-10-14",
    note: "Confirmed in game, 2026-10-16.",
  },
  {
    id: "routine:wuwa:pioneer-podcast-exp",
    game: "wuwa",
    title: "Pioneer Podcast weekly EXP",
    period: { unit: "week", startsOn: 1 },
    measure: { kind: "amount", target: 12000, unit: "EXP" },
    source: "https://wutheringwaves.fandom.com/wiki/Pioneer_Podcast/2026-02-05",
    asOf: "2026-07-03",
    checked: "2026-10-14",
    note: "The wiki's newest season page (v3.1) says 10,000; the game now shows 12,000. Confirmed in game, 2026-10-16.",
  },
  {
    id: "routine:wuwa:weekly-activities",
    game: "wuwa",
    title: "Weekly Activities",
    period: { unit: "week", startsOn: 1 },
    // The last milestone; every reward is claimed by then.
    measure: { kind: "amount", target: 6000, unit: "points" },
    source: "https://game8.co/games/Wuthering-Waves/archives/605757",
    asOf: "2026-06-18",
    checked: "2026-10-14",
    note: "Fantasies of the Thousand Gateways or Phantasma Dreamland Rhapsoda, whichever you play. Confirmed in game, 2026-10-16."
  },
  {
    id: "routine:wuwa:tower-of-adversity",
    game: "wuwa",
    title: "Tower of Adversity",
    // Anchored on the reset the owner read in game (2026-10-16).
    period: { unit: "cycle", days: 28, from: "2026-11-09" },
    measure: { kind: "days", required: 1 },
    source: "https://gamemarket.gg/news/wuthering-waves/wuthering-waves-tower-of-adversity-guide-zones-vigor-rewards",
    asOf: "2026-08-25",
    checked: "2026-10-16",
    note: "The Hazard Zone; the source says roughly 28 days.",
  },

  // Infinity Nikki. The wiki's Reset page puts the weekly reset on Monday at
  // 04:00 server time and lists both of these among what it renews.
  {
    id: "routine:nikki:mira-journey-exp",
    game: "nikki",
    title: "Mira Journey weekly EXP",
    period: { unit: "week", startsOn: 1 },
    measure: { kind: "amount", target: 8000, unit: "Journey EXP" },
    source: "https://infinity-nikki.fandom.com/wiki/Mira_Journey",
    asOf: "2026-09-24",
    checked: "2026-10-16",
    note: "The battle pass's weekly cap, from weekly and phase tasks. Confirmed in game, 2026-10-16.",
  },
  {
    id: "routine:nikki:realm-of-breakthrough",
    game: "nikki",
    title: "Realm of Breakthrough",
    // Two Phantom Trials, each once a week.
    period: { unit: "week", startsOn: 1 },
    measure: { kind: "amount", target: 2, unit: "trials" },
    source: "https://infinity-nikki.fandom.com/wiki/Realm_of_Breakthrough",
    asOf: "2026-01-01",
    checked: "2026-10-16",
    note: "Wish Master Chigda and Guardian Beast Whirls, once a week each, for Evolution materials.",
  },
  {
    id: "routine:nikki:resonance-revelation",
    game: "nikki",
    title: "Resonance Store: Revelation Crystals",
    // The wiki marks the Tranquility Droplet stock monthly; the 1st is the
    // owner's in-game timer on 2026-10-16, which ends at the reset on 1 Nov.
    period: { unit: "month", startsOn: 1 },
    pulls: "premium",
    measure: { kind: "amount", target: 5, unit: "crystals" },
    source: "https://infinity-nikki.fandom.com/wiki/Tranquility_Droplet",
    asOf: "2025-12-26",
    checked: "2026-10-16",
    note: "Bought with Tranquility Droplets, 5 a month. The 1st is ours. Confirmed in game, 2026-10-16.",
  },
  {
    id: "routine:nikki:resonance-resonite",
    game: "nikki",
    title: "Resonance Store: Resonite Crystals",
    // Resets with the Revelation Crystal line beside it: the 1st.
    period: { unit: "month", startsOn: 1 },
    pulls: "standard",
    measure: { kind: "amount", target: 5, unit: "crystals" },
    source: "https://infinity-nikki.fandom.com/wiki/Tranquility_Droplet",
    asOf: "2025-12-26",
    checked: "2026-10-16",
    note: "The standard-banner line beside the Revelation Crystals, bought with Tranquility Droplets.",
  },

  // Neverness to Everness.
  {
    id: "routine:nte:season-pass-exp",
    game: "nte",
    title: "Season Pass weekly EXP",
    period: { unit: "week", startsOn: 1 },
    measure: { kind: "amount", target: 12000, unit: "EXP" },
    source: "https://gamewith.net/nte/74371",
    asOf: "2026-09-03",
    checked: "2026-10-14",
    note: "The cap on EXP from daily and weekly quests; season quests don't count. Confirmed in game, 2026-10-16.",
  },
  {
    id: "routine:nte:anomaly-pilgrimage",
    game: "nte",
    title: "Anomaly Pilgrimage",
    // Game8's boss list says once per boss; the owner settled it in game.
    period: { unit: "week", startsOn: 1 },
    measure: { kind: "amount", target: 3, unit: "claims" },
    source: "https://allthings.how/nte-weekly-activities-guide-every-reset-task-in-neverness-to-everness/",
    asOf: "2026-05-06",
    checked: "2026-10-16",
    note: "Weekly bosses: three reward claims in total, not three per boss. Confirmed in game, 2026-10-16.",
  },
  {
    id: "routine:nte:city-stamina",
    game: "nte",
    title: "City Stamina",
    // The page says only "full bar to spend"; the 700 is the owner's reading.
    period: { unit: "week", startsOn: 1 },
    measure: { kind: "amount", target: 700, unit: "stamina" },
    source: "https://allthings.how/nte-weekly-activities-guide-every-reset-task-in-neverness-to-everness/",
    asOf: "2026-05-06",
    checked: "2026-10-16",
    note: "Spent on Hethereau Hobbies; refills at the weekly reset. Confirmed in game, 2026-10-16.",
  },
  {
    id: "routine:nte:realm-of-greed",
    game: "nte",
    title: "Realm of Greed",
    // One payout a week; its size scales with Blind Mammon's level, so it is
    // ticked once rather than counted.
    period: { unit: "week", startsOn: 1 },
    measure: { kind: "days", required: 1 },
    source: "https://allthings.how/nte-weekly-activities-guide-every-reset-task-in-neverness-to-everness/",
    asOf: "2026-05-06",
    checked: "2026-10-16",
    note: "Blind Mammon at home: one Fons payout a week; Gold Heist resets every Monday at 5:00. Confirmed in game, 2026-10-16.",
  },
  {
    id: "routine:nte:special-city-commission",
    game: "nte",
    title: "Special City Commission",
    period: { unit: "week", startsOn: 1 },
    measure: { kind: "days", required: 1 },
    source: "https://allthings.how/nte-weekly-activities-guide-every-reset-task-in-neverness-to-everness/",
    asOf: "2026-05-06",
    checked: "2026-10-16",
    note: "The delivery from the Old Mailbox in your second apartment: one claim a week. Confirmed in game, 2026-10-16.",
  },
  // Two fortnightly cycles, anchored on the owner's in-game timers (2026-10-16).
  {
    id: "routine:nte:beyond-the-rails",
    game: "nte",
    title: "Beyond the Rails",
    period: { unit: "cycle", days: 14, from: "2026-10-22" },
    // Read on Europe as ending Wednesday 21:00 UTC: Asia's Thursday reset.
    clock: "asia",
    measure: { kind: "days", required: 1 },
    source: "https://gamewith.net/nte/74216",
    asOf: "2026-08-13",
    checked: "2026-10-16",
    note: "Special routes. Ends at the Asia server's reset on every server, as read on Europe on 2026-10-16.",
  },
  {
    id: "routine:nte:tycoon-fund",
    game: "nte",
    title: "Tycoon Incentive Fund",
    period: { unit: "cycle", days: 14, from: "2026-10-26" },
    measure: { kind: "amount", target: 1000000, unit: "fons" },
    source: "https://allthings.how/neverness-to-everness-tycoon-encouragement-fund-what-changed-for-pink-paws-heist/",
    asOf: "2026-08-15",
    checked: "2026-10-16",
    note: "The base cap; the Puka Membership Program raises yours. Make it mine to set it.",
  },
];

/** A game's built-ins, in the order listed. */
export function routinesFor(game: string): Routine[] {
  return ROUTINES.filter((r) => r.game === game);
}

/**
 * The built-ins on screen: those of games the rule shows, less any the reader
 * made their own (`Task.from`) — the copy replaces the original while it
 * exists, and deleting the copy brings the original back — and less any they
 * stopped tracking one by one (`prefs.routinesHidden`). Leave `hidden` out to
 * get every built-in the reader could track, which is what settings lists.
 */
export function activeRoutines(
  rule: PerGame,
  copiedFrom: ReadonlySet<string>,
  hidden: ReadonlySet<string> = new Set(),
  standardPulls = false,
): Routine[] {
  return ROUTINES.filter(
    (r) =>
      shownFor(rule, r.game) && offered(r, standardPulls) && !copiedFrom.has(r.id) && !hidden.has(r.id),
  );
}

/**
 * Whether a built-in is on offer at all: a shop's standard-banner line only
 * when the reader asked for standard pulls, everything else always. Below the
 * game rule and per-item tracking, not instead of them.
 */
export function offered(routine: Routine, standardPulls: boolean): boolean {
  return routine.pulls !== "standard" || standardPulls;
}

/**
 * `prefs.routinesHidden` after the reader tracks one built-in or stops. Per
 * item and never per game, so it moves nothing the game's switch says, and a
 * built-in we ship later for that game still arrives. Absent when empty, like
 * the other lists.
 */
export function hiddenAfter(
  hidden: readonly string[] | undefined,
  id: string,
  track: boolean,
): string[] | undefined {
  const rest = (hidden ?? []).filter((h) => h !== id);
  const next = track ? rest : [...rest, id];
  return next.length > 0 ? next : undefined;
}

/**
 * The one game to ask "track its weekly tasks?" about, or null.
 *
 * Only a game on screen — asking about a game the reader switched off or is not
 * focused on would be asking about something they are not looking at — and
 * only once: an answer either way is recorded in `asked`. Never once the reader
 * has `answered` the global switch: that answer covers every game at once.
 */
export function routineToAsk(
  visible: readonly string[],
  rule: PerGame,
  asked: readonly string[] | undefined,
  answered: boolean,
): string | null {
  if (answered) return null;
  for (const game of visible) {
    if (shownFor(rule, game) || asked?.includes(game)) continue;
    if (routinesFor(game).length > 0) return game;
  }
  return null;
}

/**
 * A reader's own task copied from a built-in, remembering where it came from.
 * The copy is theirs to edit; the original stays hidden while it exists.
 */
export function mineFrom(routine: Routine): {
  game: string;
  title: string;
  period: Routine["period"];
  measure: Routine["measure"];
  from: string;
} {
  return {
    game: routine.game,
    title: routine.title,
    period: routine.period,
    measure: routine.measure,
    from: routine.id,
  };
}

/**
 * What *Make it mine* hands the day log and the amounts store: the built-in's
 * record, filed under the copy's id. Pure, and only ever merged in — the
 * originals stay under the routine's id, so deleting the copy shows the
 * built-in exactly as it was.
 */
export function copyRoutineState<L, A>(
  logs: Readonly<Record<string, L>>,
  amounts: Readonly<Record<string, A>>,
  fromId: string,
  toId: string,
): { daily: Record<string, L>; amounts: Record<string, A> } {
  const log = logs[fromId];
  const numbers = amounts[fromId];
  return {
    daily: log === undefined ? {} : { [toId]: log },
    amounts: numbers === undefined ? {} : { [toId]: numbers },
  };
}
