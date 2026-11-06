import type { TimerPeriod } from "./period.ts";
import type { GameId } from "./schema.ts";
import { DAY } from "./time.ts";

/**
 * Version timers, per game — what a routine that "resets with the version"
 * follows (spec 2026-10-22).
 *
 * Hand-kept and held to the bar `ROUTINES` is: a cited page and the day we
 * read it, and a figure the repository owner read in game says so in `note`
 * (`Confirmed in game, YYYY-MM-DD.`). No feed source dates these yet; one can
 * replace entries later.
 *
 * A version ends at an **instant** — when the next version's stock appears,
 * the same on every server — not at a daily reset, which on Asia would roll
 * the shop about fourteen hours before it restocks.
 *
 * **Only a recorded `end` rolls anything.** Past the newest recorded end the
 * window is the version that began there, open until someone records its end;
 * the estimate from `VERSION_DAYS` is printed and never acted on. AGENTS.md:
 * never act on an invented date.
 */
export interface GameVersion {
  game: GameId;
  /** A label, never parsed: 3.8 may be followed by 4.0. */
  number: string;
  /** ISO UTC instant the version went live. */
  start: string;
  /** ISO UTC instant the next version's stock appears; absent when unknown. */
  end?: string;
  /** The next version's number, when a page or the owner names it. */
  next?: string;
  source: string;
  /** When we last read it. */
  checked: string;
  note?: string;
}

export const VERSIONS: readonly GameVersion[] = [
  {
    game: "wuwa",
    number: "3.7",
    // 11:00 UTC+8 on 30 September, after maintenance (FandomWire, Gematsu).
    start: "2026-09-30T03:00:00Z",
    // The owner's in-game shop timer: 19d 20h at about 14:30 UTC on
    // 2026-10-22, and "11 Nov ~10–11 UTC" on 2026-10-16. Pages give the day only.
    end: "2026-11-11T10:30:00Z",
    next: "3.8",
    source: "https://allthings.how/wuthering-waves-3-7-banners-schedule-hsin-and-suoming-release-dates/",
    checked: "2026-10-22",
    note: "The page gives 30 Sep to 11 Nov; the hour of the end is the shop's timer. Confirmed in game, 2026-10-22.",
  },
];

/** A version's usual length in days, for the estimate only. */
export const VERSION_DAYS: Partial<Record<GameId, number>> = {
  // 3.7 ran 42 days (allthings.how, above); AGENTS.md: patch cycles are ~6 weeks.
  wuwa: 42,
};

/**
 * Banner rotations, for a shop that restocks when a game's character and weapon
 * banners change together rather than with its version. Same shape and same rule
 * as `VERSIONS`: only a recorded `end` rolls anything, and each new entry's `start`
 * is the last one's `end`, so amounts already stored stay where they are. It gets
 * a table of its own so that a rotation is never reported as a game version, and
 * so Endfield's real versions can be added to `VERSIONS` later without colliding.
 * `number` here is a label and is not shown.
 */
export const BANNERS: readonly GameVersion[] = [
  {
    game: "endfield",
    number: "Argent Flow",
    // The day Pocket Tactics gives, at the hour the wiki opens this rotation's events.
    start: "2026-11-05T04:00:00Z",
    // The weapon banner's in-game details: "Ending at 11-24 17:00 (UTC-5)". The
    // AIC Quota Exchange's timer read 18d alongside it; it shows days only.
    end: "2026-11-24T22:00:00Z",
    source: "https://www.pockettactics.com/arknights-endfield-banner",
    checked: "2026-11-06",
    note: "The page gives 5 to 25 Nov; the instant is the banner's own. Confirmed in game, 2026-11-06.",
  },
];

/** A rotation's usual length in days, for the estimate only. */
export const BANNER_DAYS: Partial<Record<GameId, number>> = {
  // 15 Oct to 5 Nov was 21 and 5 to 24 Nov is 19 (Pocket Tactics, above; the game).
  endfield: 20,
};

export interface VersionWindow {
  /** The version holding `now`; undefined when no page or reading names it. */
  number?: string | undefined;
  /** The start instant's UTC date: the period key amounts are stored under. */
  key: string;
  start: number;
  /** Only when recorded. */
  end?: number | undefined;
  /** start + the usual length, when no end is recorded. Shown, never acted on. */
  estimate?: number | undefined;
  nextNumber?: string | undefined;
  /** What the caption says resets it. Absent means a version. */
  noun?: "banner";
}

const keyOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The version holding `now`, or undefined for a game with none listed (or before the first). */
export function versionWindow(
  game: string,
  now: number,
  versions: readonly GameVersion[] = VERSIONS,
  days: Partial<Record<string, number>> = VERSION_DAYS,
): VersionWindow | undefined {
  const list = versions
    .filter((v) => v.game === game)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const usual = days[game];
  const open = (start: number, number: string | undefined, nextNumber: string | undefined): VersionWindow => ({
    number,
    key: keyOf(start),
    start,
    end: undefined,
    estimate: usual === undefined ? undefined : start + usual * DAY,
    nextNumber,
  });
  for (let i = list.length - 1; i >= 0; i--) {
    const v = list[i]!;
    const start = Date.parse(v.start);
    if (now < start) continue;
    if (v.end === undefined) return open(start, v.number, v.next);
    const end = Date.parse(v.end);
    if (now < end)
      return { number: v.number, key: keyOf(start), start, end, estimate: undefined, nextNumber: v.next };
    // Past a recorded end with no entry after it: the version that began there.
    return open(end, v.next, undefined);
  }
  return undefined;
}

/** The banner rotation holding `now`, or undefined for a game with none listed. */
export function bannerWindow(game: string, now: number): VersionWindow | undefined {
  const w = versionWindow(game, now, BANNERS, BANNER_DAYS);
  return w && { ...w, noun: "banner" };
}

/** The window a timer period is counting down, whichever table it reads. */
export const timerWindow = (period: TimerPeriod, game: string, now: number): VersionWindow | undefined =>
  period.unit === "banner" ? bannerWindow(game, now) : versionWindow(game, now);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** `11 Nov`, in UTC — the same wherever it is read, like `asOfLabel`. */
const dayLabel = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

/** "resets with 3.8 · 11 Nov", or the next-version form with its estimate. */
export function versionCaption(w: VersionWindow, now: number): string {
  const next = `next ${w.noun ?? "version"}`;
  if (w.end !== undefined)
    return `resets with ${w.nextNumber ?? next} · ${dayLabel(w.end)}`;
  const head = `resets with ${next}${w.nextNumber ? ` (${w.nextNumber})` : ""}`;
  if (w.estimate === undefined) return head;
  return `${head} · expected ~${dayLabel(w.estimate)}${now > w.estimate ? ", not yet confirmed" : ""}`;
}
