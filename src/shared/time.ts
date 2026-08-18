import type { DisplayEvent, LaneId } from "./custom.ts";
import { GAMES } from "./games.ts";
import type { GameId, Region } from "./schema.ts";

/**
 * Time is this product's entire subject, so the vocabulary lives in one place:
 * how long is left, how far through a window we are, and how alarmed to be.
 */

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/**
 * Server reset offsets from UTC. Gacha regions reset at 04:00 local, which lands
 * on different UTC instants — collapsing them loses up to 13 hours of accuracy.
 */
export const REGION_RESET_UTC_OFFSET: Record<Region, number> = {
  asia: 8, // UTC+8
  america: -5,
  europe: 1,
};

/**
 * Gacha servers roll the day at 04:00 local server time, not midnight — a
 * player finishing at 02:00 is still on the previous day's dailies. Getting
 * this wrong ticks the wrong box for four hours every night.
 */
export const RESET_HOUR_LOCAL = 4;

/**
 * The UTC offset of the server clock a reader's day rolls on.
 *
 * The reader's region is always the question; a game can just answer it
 * differently. Most run a server per region and take the default. One that
 * serves two regions off a single machine lists the regions that differ in
 * `resetOffsets` — Endfield's European players sit on the Americas server, so
 * `europe` resolves to UTC-5 there and to UTC+1 everywhere else.
 *
 * A blanket per-game offset would be the wrong shape: it would drag the regions
 * that *do* have their own server onto somebody else's clock, which is a
 * different bug in the same place.
 */
export function serverOffsetUtc(region: Region, game?: LaneId): number {
  // A lane the reader invented (PRD F13) has no server map to know about, and
  // neither does an id that has outlived its game, so both take the regional
  // default rather than being looked up and crashing.
  const override =
    game === undefined ? undefined : GAMES[game as GameId]?.resetOffsets?.[region];
  return override ?? REGION_RESET_UTC_OFFSET[region];
}

/**
 * The hour of its own server day a game rolls over on.
 *
 * Almost always `RESET_HOUR_LOCAL`. A game that resets on a different hour says
 * so in `resetHourLocal` (`games.ts`) — Reverse: 1999 rolls at 05:00 — and that
 * cannot be folded into `serverOffsetUtc`: shifting a game's stated offset to
 * land the right reset instant would misreport the server clock to everything
 * else that asks for it.
 *
 * A lane the reader invented has no server to know about and takes the default,
 * for the same reason `serverOffsetUtc` does.
 */
export function resetHourFor(game?: LaneId): number {
  const override =
    game === undefined ? undefined : GAMES[game as GameId]?.resetHourLocal;
  return override ?? RESET_HOUR_LOCAL;
}

/**
 * Offset from UTC midnight to this game's reset instant.
 *
 * `dayKey` and everything downstream of it is a **localStorage key**. Moving the
 * reset hour, a region offset, or a game's own override re-labels the game-day
 * some already-logged ticks fall in — at most by one day, and never by deleting
 * one, but it is still the reader's streak moving under them. Treat a change
 * here as a data change, not a constant.
 */
export function resetShiftMs(region: Region, game?: LaneId): number {
  return serverOffsetUtc(region, game) * HOUR - resetHourFor(game) * HOUR;
}

export function guessRegion(
  timeZoneOffsetMinutes: number = -new Date().getTimezoneOffset(),
): Region {
  const hours = timeZoneOffsetMinutes / 60;
  if (hours <= -2) return "america";
  if (hours >= 5) return "asia";
  return "europe";
}

/**
 * The boundary fields these helpers read.
 *
 * Structural rather than `GachaEvent` so a reader's own event (PRD F13) runs on
 * exactly the same clock as a scraped one — there is no second countdown
 * implementation to keep honest.
 */
export type EndBearing = Pick<
  DisplayEvent,
  "endsAt" | "regionScoped" | "regionEnds"
>;

/** The end instant to show this user, honouring a region-scoped event. */
export function effectiveEnd(
  event: EndBearing,
  region: Region,
): string | null {
  if (event.endsAt === null) return null;
  if (!event.regionScoped || event.regionEnds === null) return event.endsAt;
  return event.regionEnds[region] ?? event.endsAt;
}

export type Urgency = "expired" | "critical" | "soon" | "near" | "calm";

/**
 * Urgency is derived from absolute time remaining, deliberately independent of
 * how far through the window we are. A 90-day event with 3 hours left is just
 * as urgent as a 3-day event with 3 hours left.
 */
export function urgency(msRemaining: number): Urgency {
  if (msRemaining <= 0) return "expired";
  if (msRemaining < 24 * HOUR) return "critical";
  if (msRemaining < 3 * DAY) return "soon";
  if (msRemaining < 7 * DAY) return "near";
  return "calm";
}

/**
 * Compact countdown: "4h 12m", "9d 3h", "31m".
 *
 * Deliberately drops to a finer unit as the deadline approaches — days are
 * useless at the point where minutes decide whether you make it.
 */
export function formatRemaining(msRemaining: number): string {
  if (msRemaining <= 0) return "ended";

  const days = Math.floor(msRemaining / DAY);
  const hours = Math.floor((msRemaining % DAY) / HOUR);
  const minutes = Math.floor((msRemaining % HOUR) / MINUTE);
  const seconds = Math.floor((msRemaining % MINUTE) / 1000);

  if (days >= 1) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours >= 1) return `${hours}h ${minutes}m`;
  if (minutes >= 1) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** Absolute date for the detail view, in the reader's own timezone. */
export function formatAbsolute(iso: string, withTime: boolean): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  if (!withTime) return date;
  return `${date}, ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

export interface EventClock {
  startsMs: number;
  endsMs: number | null;
  msRemaining: number | null;
  /** 0–1 through the event's own window. Null when the end is unknown. */
  progress: number | null;
  urgency: Urgency;
  live: boolean;
  upcoming: boolean;
  ended: boolean;
}

export function clockFor(
  event: EndBearing & Pick<DisplayEvent, "startsAt">,
  region: Region,
  now: number,
): EventClock {
  const startsMs = Date.parse(event.startsAt);
  const end = effectiveEnd(event, region);
  const endsMs = end === null ? null : Date.parse(end);

  const msRemaining = endsMs === null ? null : endsMs - now;
  const upcoming = now < startsMs;
  const ended = msRemaining !== null && msRemaining <= 0;

  let progress: number | null = null;
  if (endsMs !== null && endsMs > startsMs) {
    progress = Math.min(1, Math.max(0, (now - startsMs) / (endsMs - startsMs)));
  }

  return {
    startsMs,
    endsMs,
    msRemaining,
    progress,
    // An event with no announced end is never treated as urgent — we do not
    // know that it is ending, and pretending otherwise would be a guess.
    urgency: msRemaining === null ? "calm" : urgency(msRemaining),
    live: !upcoming && !ended,
    upcoming,
    ended,
  };
}

/** Sort key: live events by soonest end, then upcoming by soonest start. */
export function endingSoonestFirst(
  a: { clock: EventClock },
  b: { clock: EventClock },
): number {
  if (a.clock.upcoming !== b.clock.upcoming) return a.clock.upcoming ? 1 : -1;
  if (a.clock.upcoming) return a.clock.startsMs - b.clock.startsMs;
  // Unknown ends sort last among live events: they are real, but they are not
  // the thing the reader is here to worry about.
  if (a.clock.msRemaining === null) return b.clock.msRemaining === null ? 0 : 1;
  if (b.clock.msRemaining === null) return -1;
  return a.clock.msRemaining - b.clock.msRemaining;
}

/**
 * A plain-language caption for an event's window.
 *
 * The meter shows a proportion; this says what the proportion is *of*. Without
 * it a reader has to infer that ticks mean remaining time, which is exactly the
 * kind of "obvious to the author" encoding that leaves everyone else guessing.
 */
export function windowCaption(clock: EventClock, now: number): string {
  const on = (ms: number) =>
    new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });

  if (clock.upcoming) {
    return clock.endsMs === null
      ? `starts ${on(clock.startsMs)}`
      : `${on(clock.startsMs)} – ${on(clock.endsMs)} · not started yet`;
  }

  if (clock.endsMs === null) {
    return `started ${on(clock.startsMs)} · no end date announced`;
  }

  const totalDays = Math.max(
    1,
    Math.round((clock.endsMs - clock.startsMs) / DAY),
  );
  const leftMs = Math.max(0, clock.endsMs - now);
  const leftDays = Math.ceil(leftMs / DAY);

  const left =
    leftMs < DAY
      ? `${Math.max(1, Math.floor(leftMs / HOUR))} of ${totalDays * 24} hours left`
      : `${leftDays} of ${totalDays} days left`;

  return `${on(clock.startsMs)} – ${on(clock.endsMs)} · ${left}`;
}
