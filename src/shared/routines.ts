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
  {
    id: "routine:zzz:ridu-weekly",
    game: "zzz",
    title: "Ridu Weekly",
    period: { unit: "week", startsOn: 1 },
    // The last milestone; every reward is claimed by then.
    measure: { kind: "amount", target: 1300, unit: "points" },
    source: "https://game8.co/games/Zenless-Zone-Zero/archives/484723",
    asOf: "2025-12-02",
    checked: "2026-10-13",
  },
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
