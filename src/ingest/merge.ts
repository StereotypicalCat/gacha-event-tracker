import type { GachaEvent } from "../shared/schema.ts";
import { recordedSame } from "./aliases.ts";

/**
 * Combine events for one game from several sources.
 *
 * Two sources covering the same game will disagree: different titles for the
 * same event, dates that differ by a day, one listing something the other
 * misses. This decides what the feed shows.
 *
 * The rules, in order:
 *   1. Same event ID  → same event. Keep the higher-confidence copy.
 *   2. Near match     → same event under different titles. Keep the
 *                       higher-confidence copy and record corroboration.
 *   3. Otherwise      → distinct events; keep both.
 *
 * Corroboration is the point of running multiple sources: two independent
 * sources agreeing on a date is much stronger evidence than one asserting it,
 * and that shows up as a confidence bump. Two sources *disagreeing* on an end
 * date is flagged rather than silently resolved — see `conflicts`.
 */

export interface MergeResult {
  events: GachaEvent[];
  /**
   * Pairs that look like the same event but disagree on an end date by more
   * than the tolerance. These are the cases a human should look at; the
   * pipeline routes them to quarantine.
   */
  conflicts: Array<{
    kept: GachaEvent;
    rejected: GachaEvent;
    field: "endsAt" | "startsAt";
    deltaHours: number;
  }>;
}

export interface MergeOptions {
  /** How far two boundaries may differ and still count as agreement. */
  toleranceHours?: number;
  /** Title similarity above which two events are considered the same. */
  titleThreshold?: number;
  /** Confidence added when an independent source agrees. */
  corroborationBonus?: number;
}

const DEFAULTS = {
  toleranceHours: 24,
  /**
   * 0.8, not higher: a two-word title with one extra decorative token
   * ("Stygian Onslaught" vs "Stygian Onslaught Event") scores exactly 0.8, and
   * failing to merge those puts duplicate rows in front of the user. The real
   * guard against false positives is start-date proximity, not this number — a
   * rerun reuses the name but starts months later.
   */
  titleThreshold: 0.8,
  corroborationBonus: 0.1,
} as const;

export function mergeEvents(
  groups: GachaEvent[][],
  options: MergeOptions = {},
): MergeResult {
  const toleranceHours = options.toleranceHours ?? DEFAULTS.toleranceHours;
  const titleThreshold = options.titleThreshold ?? DEFAULTS.titleThreshold;
  const bonus = options.corroborationBonus ?? DEFAULTS.corroborationBonus;

  const kept: GachaEvent[] = [];
  const conflicts: MergeResult["conflicts"] = [];

  const all = groups.flat();
  for (const incoming of all) {
    const matchIndex = kept.findIndex(
      (existing) =>
        existing.game === incoming.game &&
        isSameEvent(existing, incoming, titleThreshold, toleranceHours, all),
    );

    if (matchIndex === -1) {
      kept.push(incoming);
      continue;
    }

    const existing = kept[matchIndex];
    if (existing === undefined) continue;

    const conflict = findConflict(existing, incoming, toleranceHours);
    const [ranked, loser] =
      incoming.confidence > existing.confidence
        ? ([incoming, existing] as const)
        : ([existing, incoming] as const);
    const winner = absorb(ranked, loser);

    if (conflict !== null) {
      // Independent sources disagree on when this ends. Do not average, do not
      // silently prefer one — surface it. A wrong end date is the failure this
      // product exists to prevent.
      conflicts.push({ kept: winner, rejected: loser, ...conflict });
      kept[matchIndex] = winner;
      continue;
    }

    // Agreement from a different source is real evidence; from the same source
    // it is just the same row seen twice.
    const corroborated =
      winner.sourceId !== loser.sourceId
        ? { ...winner, confidence: Math.min(1, winner.confidence + bonus) }
        : winner;

    kept[matchIndex] = corroborated;
  }

  kept.sort((a, b) =>
    a.startsAt === b.startsAt
      ? a.id.localeCompare(b.id)
      : a.startsAt.localeCompare(b.startsAt),
  );

  return { events: kept, conflicts };
}

/**
 * The winner, carrying every id the fusion took off the calendar.
 *
 * An id merge drops may already be on readers' devices as a localStorage key —
 * the copy fused today may have been published alone yesterday, before a rule
 * learned to pair it. The feed says which ids were folded into which, and the
 * client moves marks across on its own (`src/client/state/retiredIds.ts`), so a
 * new fusion never needs a hand-edited table to keep a reader's ticks.
 */
function absorb(winner: GachaEvent, loser: GachaEvent): GachaEvent {
  const ids = [
    ...(winner.mergedIds ?? []),
    ...(loser.id === winner.id ? [] : [loser.id]),
    ...(loser.mergedIds ?? []),
  ].filter((id, i, all) => id !== winner.id && all.indexOf(id) === i);
  return ids.length === 0 ? winner : { ...winner, mergedIds: ids };
}

function isSameEvent(
  a: GachaEvent,
  b: GachaEvent,
  titleThreshold: number,
  toleranceHours: number,
  all: readonly GachaEvent[],
): boolean {
  if (a.id === b.id) return true;

  // Near-match fusion reconciles two *sources* describing one event under
  // different titles. Within one source it has no such job to do: the page has
  // already told us these are two rows, the parser has already dropped repeats
  // of the same id, and fusing them here overrules a distinction the publisher
  // made on purpose. Game8's Umamusume page is the case that surfaced it — its
  // `3 Star Guaranteed 1.5 Anniversary Scout (Character)` and `(Support)` are
  // two concurrent banners whose titles differ by one parenthetical, which
  // scores far above any workable threshold and starts on the same day. Fusing
  // them dropped a real banner off the calendar with nothing reporting it,
  // which is the silent drop this codebase treats as the dangerous failure.
  if (a.sourceId === b.sourceId) return false;

  // Overlap alone misses a source that appends a qualifier: "Bedazzling
  // Dawnstar" vs "Bedazzling Dawnstar Sign-In" scores 0.67, well under any
  // safe threshold, yet is plainly one event.
  // Similar titles are not enough — reruns reuse names. Require the start dates
  // to be close before treating two entries as one event.
  if (hoursBetween(a.startsAt, b.startsAt) > toleranceHours) return false;

  const titled = (x: GachaEvent, y: GachaEvent) =>
    titleSimilarity(x.title, y.title) >= titleThreshold ||
    titleExtends(x.title, y.title);
  if (titled(a, b) || recordedSame(a.id, b.id)) return true;
  if (!namesTheOther(a, b, toleranceHours)) return false;

  // A blurb may name a *different* event that runs the same window — a
  // festival's shop naming the festival. If either copy already has a twin by
  // title in the other source, the mention is about that other event, and
  // fusing on it would take a real row off the calendar.
  const twinIn = (x: GachaEvent, source: string, skip: GachaEvent) =>
    all.some(
      (c) =>
        c !== skip &&
        c.sourceId === source &&
        c.game === x.game &&
        hoursBetween(c.startsAt, x.startsAt) <= toleranceHours &&
        titled(x, c),
    );
  return !twinIn(a, b.sourceId, b) && !twinIn(b, a.sourceId, a);
}

/**
 * True when one title is the other with words added at either end — the shape
 * a source qualifier actually takes. Appended: "Bedazzling Dawnstar" → "…
 * Sign-In". Prepended: Game8's "Battle Pass - Moontrace" beside Fandom's
 * "Moontrace", where the other source files the category in a column instead.
 *
 * Deliberately an edge test, not a subset test. Subset matching would also
 * fuse "Gold Clash" with "Gold Rush Clash Royale", which are different events.
 * Two words is the floor at both ends: a one-word title would swallow half the
 * calendar.
 */
export function titleExtends(a: string, b: string): boolean {
  const ta = tokenList(a);
  const tb = tokenList(b);
  const [small, large] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (small.length < 2 || small.length === large.length) return false;
  const offset = large.length - small.length;
  return (
    small.every((word, i) => large[i] === word) ||
    small.every((word, i) => large[offset + i] === word)
  );
}

/**
 * True when one copy's summary names the other's whole title, and the two run
 * the same window.
 *
 * Some pairs share no word at all. Game8 calls Genshin's anniversary selectors
 * by what they are (`Free Limited 5-Star Anniversary Selector`) and Fandom by
 * the event's name (`Tabletop Troupe: A Gathering on Adventure's Eve`), and the
 * dates cannot tell the two selectors apart. But Game8's blurb says "…limited
 * 5-star selector, Tabletop Troupe: A Gathering on Adventure's Eve!" — the page
 * itself linking the two, which is exactly what a person read to pair them.
 *
 * Narrower than it looks, on purpose. A blurb may mention *another* event
 * ("clear X to unlock this"), so both boundaries must agree, not only the
 * start — a mentioned event that runs a different window is a different event.
 * And the title must be at least two words, matched as a contiguous run: a
 * one-word name turns up in prose by accident. `isSameEvent` adds the last
 * guard, which needs the whole batch: a mention never pairs a copy that already
 * has a twin by title in the other source, because then the blurb is naming a
 * neighbour — a festival's shop naming the festival. Measured on every two-source page
 * held (2026-10-14), it fired on the two selector pairs and otherwise only on
 * pairs already matched by title.
 */
function namesTheOther(
  a: GachaEvent,
  b: GachaEvent,
  toleranceHours: number,
): boolean {
  if (a.endsAt === null || b.endsAt === null) return false;
  if (hoursBetween(a.endsAt, b.endsAt) > toleranceHours) return false;
  return mentions(a.summary, b.title) || mentions(b.summary, a.title);
}

function mentions(summary: string | null, title: string): boolean {
  if (summary === null) return false;
  const needle = tokenList(title);
  if (needle.length < 2) return false;
  const hay = tokenList(summary);
  for (let i = 0; i + needle.length <= hay.length; i += 1) {
    if (needle.every((word, j) => hay[i + j] === word)) return true;
  }
  return false;
}

function findConflict(
  a: GachaEvent,
  b: GachaEvent,
  toleranceHours: number,
): { field: "endsAt" | "startsAt"; deltaHours: number } | null {
  if (a.endsAt !== null && b.endsAt !== null) {
    const delta = hoursBetween(a.endsAt, b.endsAt);
    if (delta > toleranceHours) return { field: "endsAt", deltaHours: delta };
  }
  const startDelta = hoursBetween(a.startsAt, b.startsAt);
  if (startDelta > toleranceHours) {
    return { field: "startsAt", deltaHours: startDelta };
  }
  return null;
}

function hoursBetween(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 3_600_000;
}

/**
 * Token-overlap (Dice) similarity on normalised titles. Deliberately simple:
 * it only needs to catch "Stygian Onslaught" vs "Stygian Onslaught (Event)",
 * not to do fuzzy natural-language matching.
 */
export function titleSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return (2 * shared) / (ta.size + tb.size);
}

function tokenList(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

function tokens(title: string): Set<string> {
  return new Set(tokenList(title));
}
