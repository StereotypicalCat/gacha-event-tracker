import { z } from "zod";
import { PeriodSchema } from "./period.ts";
import { GameId } from "./schema.ts";
import { shownFor, type PerGame } from "./perGame.ts";
import { MeasureSchema, type TaskShape } from "./task.ts";

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
    measure: { kind: "amount", target: 5, unit: "fates" },
    source: "https://genshin-impact.fandom.com/wiki/Paimon%27s_Bargains",
    asOf: "2026-08-23",
    checked: "2026-10-14",
    note: "Bought with Masterless Stardust. Confirmed in game, 2026-10-16.",
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
    measure: { kind: "amount", target: 5, unit: "passes" },
    source: "https://honkai-star-rail.fandom.com/wiki/Embers_Exchange",
    asOf: "2026-07-12",
    checked: "2026-10-14",
    note: "Bought with Undying Embers. The wiki says monthly; the 1st is ours. Confirmed in game, 2026-10-14.",
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

  // Arknights: Endfield.
  {
    id: "routine:endfield:weekly-routine",
    game: "endfield",
    title: "Weekly Routine",
    period: { unit: "week", startsOn: 1 },
    measure: { kind: "amount", target: 10, unit: "points" },
    source: "https://endfield.wiki.gg/wiki/Weekly_Routine",
    asOf: "2026-04-11",
    checked: "2026-10-13",
    note: "Unlocks at Authority Level 15.",
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
): Routine[] {
  return ROUTINES.filter(
    (r) => shownFor(rule, r.game) && !copiedFrom.has(r.id) && !hidden.has(r.id),
  );
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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `2025-12-02` → `2 Dec 2025`: the same in every locale, so it reads the same wherever it is quoted. */
export function asOfLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`;
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
