import { z } from "zod";
import { PeriodSchema } from "./period.ts";
import { GameId } from "./schema.ts";
import { MeasureSchema, type TaskShape } from "./task.ts";

/**
 * Weekly tasks the app ships for a game — the built-in counterpart of a
 * reader's own `mytask:` (PRD F17).
 *
 * Each is a claim about a game we did not write, so it is held to the bar the
 * standing chores in `games.ts` are: **a cited source, and the date that source
 * gives**, both shown to the reader. A figure from a ten-month-old guide is
 * then visibly ten months old rather than presented as current. Nothing here is
 * inferred; add one only when a page states it.
 *
 * Off unless the reader says yes, per game (`prefs.routineGames`). Its id is in
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
 * The built-ins on screen: those of games the reader said yes to, less any
 * they made their own (`Task.from`) — the copy replaces the original while it
 * exists, and deleting the copy brings the original back.
 */
export function activeRoutines(
  routineGames: readonly string[] | undefined,
  copiedFrom: ReadonlySet<string>,
): Routine[] {
  const on = new Set(routineGames ?? []);
  return ROUTINES.filter((r) => on.has(r.game) && !copiedFrom.has(r.id));
}

/**
 * The one game to ask "track its weekly tasks?" about, or null.
 *
 * Only a game on screen — asking about a game the reader switched off or is not
 * focused on would be asking about something they are not looking at — and
 * only once: an answer either way is recorded in `asked`.
 */
export function routineToAsk(
  visible: readonly string[],
  routineGames: readonly string[] | undefined,
  asked: readonly string[] | undefined,
): string | null {
  for (const game of visible) {
    if (routineGames?.includes(game) || asked?.includes(game)) continue;
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
