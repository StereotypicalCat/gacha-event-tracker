import { useCallback, useEffect, useMemo, useState } from "react";
import {
  asDisplayEvent,
  asOccurrenceEvent,
  CustomEvent,
  CustomGame,
  mintCustomEventId,
  mintCustomGameId,
  precisionOf,
  type CustomEvents,
  type CustomGames,
  type DisplayEvent,
  type LaneId,
} from "../../shared/custom.ts";
import { nextOccurrences, occurrencesOf, type Repeat } from "../../shared/recurrence.ts";
import type { EventType } from "../../shared/schema.ts";
import { KEYS, readJson, writeJson } from "./storage.ts";

/**
 * The reader's own games and events (PRD F13).
 *
 * Nothing here is fetched, parsed, merged or scored — this is the one part of
 * the app whose data the reader typed, and the ingest pipeline has no business
 * touching it. What it does share is everything downstream: the events are
 * projected into `DisplayEvent` and join the same lists, timeline, sort,
 * progress, ignore and daily stores as scraped ones.
 */

/** What a form hands over. Instants are already resolved; precision is not. */
export interface EventDraft {
  game: LaneId;
  title: string;
  type: EventType;
  summary: string | null;
  startsAt: string;
  startHasTime: boolean;
  endsAt: string | null;
  endHasTime: boolean;
  /** How it comes round again, or null when it does not. */
  repeat: Repeat | null;
}

/**
 * A date the reader typed, as a UTC instant.
 *
 * Read in **their** timezone, not UTC: someone who types 20 August means the
 * 20th where they are, and must see the 20th back. A start with no time is the
 * beginning of that day and an end with no time is the end of it, which is how
 * a person reads "20 Aug – 3 Sep" — the feed's own day-precision boundaries sit
 * at 00:00Z on both sides, but those are a parser declining to guess a time the
 * source never printed, and this reader is telling us directly.
 */
export function readerInstant(
  date: string,
  time: string | null,
  boundary: "start" | "end",
): string | null {
  const wall =
    time !== null && time !== ""
      ? `${date}T${time}`
      : `${date}T${boundary === "start" ? "00:00:00" : "23:59:59"}`;
  const ms = Date.parse(wall);
  if (Number.isNaN(ms)) return null;

  // `Date.parse` rolls an impossible date over rather than refusing it — 30
  // February becomes 2 March — and a silently shifted date is the one thing
  // this codebase never ships. `dates.ts` guards its parsers the same way.
  const [y, m, d] = date.split("-").map(Number);
  const at = new Date(ms);
  if (at.getFullYear() !== y || at.getMonth() + 1 !== m || at.getDate() !== d) {
    return null;
  }
  return at.toISOString();
}

/**
 * Read a store, keeping the records that still parse.
 *
 * A record that does not is dropped rather than taking the app down with it,
 * and says so — the same trade `readJson` makes, one level deeper. Silence is
 * the thing this codebase does not hand out for free.
 */
function readValid<T>(
  key: string,
  schema: Validator<T>,
  label: string,
): Record<string, T> {
  const raw = readJson<Record<string, unknown>>(key, {});
  const kept = validRecords(raw, schema);
  for (const id of Object.keys(raw)) {
    if (kept[id] === undefined) console.warn(`dropped an unreadable ${label}: ${id}`);
  }
  return kept;
}

interface Validator<T> {
  safeParse: (v: unknown) => { success: boolean; data?: T };
}

/**
 * Keep the records that parse, drop the ones that do not.
 *
 * Both the store and an import land here. An import especially: a file is not
 * necessarily one this reader wrote, and a hostile or merely stale record must
 * not be able to take the rest of their data down with it — or reach a `style`
 * attribute unchecked (see `CustomGame.hue`).
 */
export function validRecords<T>(
  input: unknown,
  schema: Validator<T>,
): Record<string, T> {
  if (typeof input !== "object" || input === null) return {};
  const out: Record<string, T> = {};
  for (const [id, value] of Object.entries(input as Record<string, unknown>)) {
    const parsed = schema.safeParse(value);
    if (parsed.success && parsed.data !== undefined) out[id] = parsed.data;
  }
  return out;
}

/**
 * How many occurrences of a rule the lists carry.
 *
 * Two: the one that has not finished, and the one after it. A rule repeating
 * weekly would otherwise put thirteen rows into the lists that exist to answer
 * "what ends soonest", which is the clutter PRD F1 is built to avoid. The
 * timeline is the surface where repetition is the reading, and it asks for the
 * whole range instead — see `occurrencesInFor`.
 */
const LIST_OCCURRENCES = 2;

/**
 * The reader's events as rows, rules expanded.
 *
 * Pure and exported so the expansion is testable without mounting anything —
 * the same reason `gameOrder.ts` and `daily.ts` keep their logic outside React.
 */
export function rowsFor(events: CustomEvents, nowMs: number): DisplayEvent[] {
  const out: DisplayEvent[] = [];
  for (const event of Object.values(events)) {
    if (event.repeat === null) {
      out.push(asDisplayEvent(event));
      continue;
    }
    for (const occurrence of nextOccurrences(event, nowMs, LIST_OCCURRENCES)) {
      out.push(asOccurrenceEvent(event, occurrence));
    }
  }
  return out;
}

/**
 * Every occurrence of every rule inside a range.
 *
 * Only rules. A non-repeating event is already in `rowsFor`, and returning it
 * here as well would draw each of the reader's plain events twice on the board.
 */
export function occurrencesInFor(
  events: CustomEvents,
  minMs: number,
  maxMs: number,
): DisplayEvent[] {
  const out: DisplayEvent[] = [];
  for (const event of Object.values(events)) {
    if (event.repeat === null) continue;
    for (const occurrence of occurrencesOf(event, minMs, maxMs)) {
      out.push(asOccurrenceEvent(event, occurrence));
    }
  }
  return out;
}

/**
 * `nowMs` is passed in rather than read here, for the reason everything else in
 * this codebase takes its clock as an argument — and because the rows have to
 * change as time passes: the occurrence a rule is showing rolls to the next one
 * when the current one finishes.
 */
export function useCustom(nowMs: number) {
  const [games, setGames] = useState<CustomGames>(() =>
    readValid(KEYS.customGames, CustomGame, "custom game"),
  );
  const [events, setEvents] = useState<CustomEvents>(() =>
    readValid(KEYS.customEvents, CustomEvent, "custom event"),
  );

  useEffect(() => {
    writeJson(KEYS.customGames, games);
  }, [games]);
  useEffect(() => {
    writeJson(KEYS.customEvents, events);
  }, [events]);

  const addGame = useCallback((name: string, hue: string): string => {
    const id = mintCustomGameId(name, Object.keys(games));
    const game = CustomGame.parse({
      id,
      name: name.trim(),
      hue,
      at: new Date().toISOString(),
    });
    setGames((prev) => ({ ...prev, [id]: game }));
    return id;
  }, [games]);

  const editGame = useCallback((id: string, name: string, hue: string) => {
    setGames((prev) => {
      const existing = prev[id];
      if (existing === undefined) return prev;
      // The id never follows the name — see docs/DATA-MODEL.md. Renaming a game
      // must not move the lane its events point at.
      return { ...prev, [id]: { ...existing, name: name.trim(), hue } };
    });
  }, []);

  /**
   * Remove a game, if nothing of theirs still lives in it.
   *
   * Refused rather than cascading: deleting a lane should not quietly take a
   * fortnight of events with it, and the count is more use than an undo.
   */
  const removeGame = useCallback(
    (id: string): { removed: boolean; blockedBy: number } => {
      const holding = Object.values(events).filter((e) => e.game === id).length;
      if (holding > 0) return { removed: false, blockedBy: holding };
      setGames((prev) => {
        const { [id]: _gone, ...rest } = prev;
        return rest;
      });
      return { removed: true, blockedBy: 0 };
    },
    [events],
  );

  const addEvent = useCallback((draft: EventDraft): string => {
    const now = new Date().toISOString();
    const event = CustomEvent.parse({
      id: mintCustomEventId(),
      game: draft.game,
      title: draft.title.trim(),
      type: draft.type,
      summary: draft.summary === null || draft.summary.trim() === ""
        ? null
        : draft.summary.trim(),
      startsAt: draft.startsAt,
      startPrecision: precisionOf(draft.startHasTime),
      endsAt: draft.endsAt,
      // An unannounced end is a supported answer here exactly as it is in the
      // feed. Nobody is made to invent a date to satisfy a form.
      endPrecision: draft.endsAt === null ? "unknown" : precisionOf(draft.endHasTime),
      repeat: draft.repeat,
      at: now,
      updatedAt: now,
    });
    setEvents((prev) => ({ ...prev, [event.id]: event }));
    return event.id;
  }, []);

  const editEvent = useCallback((id: string, draft: EventDraft) => {
    setEvents((prev) => {
      const existing = prev[id];
      if (existing === undefined) return prev;
      const next = CustomEvent.parse({
        ...existing,
        game: draft.game,
        title: draft.title.trim(),
        type: draft.type,
        summary: draft.summary === null || draft.summary.trim() === ""
          ? null
          : draft.summary.trim(),
        startsAt: draft.startsAt,
        startPrecision: precisionOf(draft.startHasTime),
        endsAt: draft.endsAt,
        endPrecision: draft.endsAt === null ? "unknown" : precisionOf(draft.endHasTime),
        repeat: draft.repeat,
        updatedAt: new Date().toISOString(),
      });
      return { ...prev, [id]: next };
    });
  }, []);

  /**
   * Forget an event the reader entered.
   *
   * Their marks and logged days for it stay where they are. Reaching into three
   * other stores on a single tap is how a misclick costs someone a streak, and
   * an orphaned mark costs them nothing.
   */
  const removeEvent = useCallback((id: string) => {
    setEvents((prev) => {
      const { [id]: _gone, ...rest } = prev;
      return rest;
    });
  }, []);

  /** Import: union by id, never removing what this device already has. */
  const merge = useCallback(
    (incomingGames: unknown, incomingEvents: unknown) => {
      const g = validRecords(incomingGames, CustomGame);
      const e = validRecords(incomingEvents, CustomEvent);
      if (Object.keys(g).length > 0) setGames((prev) => ({ ...g, ...prev }));
      if (Object.keys(e).length > 0) setEvents((prev) => ({ ...e, ...prev }));
    },
    [],
  );

  /**
   * The reader's events, in the shape every view reads, rules expanded.
   *
   * Bucketed to the minute rather than recomputed per tick: expanding every
   * rule each second would be wasted work, and no countdown is wrong by less
   * than a minute's delay in rolling to the next occurrence.
   */
  const minute = Math.floor(nowMs / 60_000);
  const rows = useMemo<DisplayEvent[]>(
    () => rowsFor(events, minute * 60_000),
    [events, minute],
  );

  /** Every occurrence of every rule inside a range — the timeline's question. */
  const occurrencesIn = useCallback(
    (minMs: number, maxMs: number) => occurrencesInFor(events, minMs, maxMs),
    [events],
  );

  /** Lanes the reader defined, so filters and focus can see them. */
  const lanes = useMemo<LaneId[]>(() => Object.keys(games), [games]);

  return {
    games,
    events,
    rows,
    occurrencesIn,
    lanes,
    addGame,
    editGame,
    removeGame,
    addEvent,
    editEvent,
    removeEvent,
    merge,
  };
}
