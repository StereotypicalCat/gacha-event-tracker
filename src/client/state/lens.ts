import type { GameId } from "../../shared/schema.ts";

/**
 * Which rows each part of the page gets to see.
 *
 * These decisions used to sit inline in `App`, where they were untestable and
 * quietly inconsistent with each other — the "next to expire" headline counted
 * events the reader had finished or ignored, and the dailies strip listed a
 * repeating event they had already marked done. They are the same question
 * asked twice, so they are one function asked twice, and pure so a test can
 * pin them down.
 */

/** The shape every lens here needs. Structural so this module stays cheap. */
interface Row {
  event: { id: string; game: GameId };
  clock: { msRemaining: number | null };
}

/**
 * Rows the reader still has something to do with.
 *
 * "Done" and "ignored" mean different things everywhere else in the app —
 * a done event stays visible and counted, an ignored one disappears — but to
 * anything answering *what is still on your plate?* they are the same answer:
 * not this one. The headline and the dailies strip are both that question.
 *
 * Note this is deliberately not the same as the main list's filters, which
 * honour `showCompleted` / `showIgnored`. Those preferences control what the
 * reader can *look at*; this controls what the app *tells them to do*, and
 * being reminded of a job you already finished is the bug either way.
 */
export function outstanding<T extends Row>(
  rows: readonly T[],
  isDone: (id: string) => boolean,
  isIgnored: (id: string) => boolean,
): T[] {
  return rows.filter((r) => !isDone(r.event.id) && !isIgnored(r.event.id));
}

/**
 * The single row closest to expiring.
 *
 * Reads the minimum rather than taking the first row, because the list it is
 * given is sorted by whatever mode the reader chose — under "doing first" the
 * head of the list is what they are partway through, which is not what a panel
 * headed "next to expire" is claiming to show.
 *
 * An event with no announced end can only ever be the answer when nothing else
 * is running: it is real, but it is not a deadline.
 */
export function firstToExpire<T extends Row>(rows: readonly T[]): T | null {
  let best: T | null = null;
  let bestMs = Infinity;
  for (const row of rows) {
    const ms = row.clock.msRemaining;
    if (ms === null) continue;
    if (ms < bestMs) {
      best = row;
      bestMs = ms;
    }
  }
  return best ?? rows[0] ?? null;
}
