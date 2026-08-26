import { eventId, type EventType, type GachaEvent } from "../../shared/schema.ts";
import type { ParseContext } from "../adapters/types.ts";
import type { SourceParser } from "./types.ts";

/**
 * AruStats' Honkai Impact 3rd version timeline (`www.arustats.com`).
 *
 * **Read this before trusting anything this parser emits: every boundary here
 * is an estimate, and the source says so itself.**
 *
 * The page draws a version as a grid of week columns and every event as a *bar
 * spanning whole weeks*. No event on the page states a date. The only dates are
 * on the week columns, and the header over them reads `GLB/SEA` /
 * `ESTIMATED WEEK`. So a boundary published from here is the edge of a bucket
 * the site estimated, not a date anyone announced — which is a weaker claim than
 * every other source in this repository makes, and weaker than the day-precision
 * reading Game8 and Infinity Nikki get, where the page did print a date per
 * event and we merely declined to invent a time of day for it.
 *
 * `docs/SOURCES.md` § 13 declined `marisaimpact.com` on exactly this ground.
 * Building this one anyway is a decision the repository owner took on
 * 2026-08-27 with that cost named; `docs/SOURCES.md` § 14 records it, and
 * `ESTIMATE_CONFIDENCE` below is what carries it into the data. Do not raise
 * that number without re-opening the decision — it is the only machine-readable
 * mark that separates this source from one that publishes announced dates.
 *
 * Two consequences worth holding in mind:
 *
 * - **`startsAt` is half of every event ID** (`AGENTS.md` § Event IDs are
 *   localStorage keys). These starts are estimated, so a week grid the site
 *   revises moves IDs and orphans completion marks — a hazard the wiki sources
 *   do not carry, because a wiki states a date and corrects it rarely.
 * - **`confidence` never reaches the client.** It weights merge dedupe and
 *   nothing else, so nothing on screen currently tells a reader this lane is
 *   estimated. Saying so on screen needs a schema field or a client change;
 *   both are design questions rather than adapter work.
 *
 * ---
 *
 * **Where the data comes from.** The page is Next.js and server-renders the
 * whole schedule into `__NEXT_DATA__`, so this parser reads that JSON rather
 * than the grid markup. The rendered bars carry their geometry in Tailwind
 * `grid-column: 2/8` inline styles, so a DOM reader would be positional — the
 * JSON states the same spans as integers.
 *
 * The two were cross-checked on capture: all sixteen rendered `grid-column`
 * pairs agree with the JSON's `startWeek`/`endWeek`, which is what confirms the
 * off-by-one below (column 1 is the row label, so `grid-column: S/E` is weeks
 * `S-1` to `E-1`) and that `endWeek` is exclusive. Reading the JSON also avoids
 * the hazard `fandom.ts` carries: the rendered cell holds
 * `Captain&#x27;s Wishing Tree Secrets` and the JSON holds it already decoded,
 * so no title here needs hand-decoding before it becomes a slug — and a slug is
 * a localStorage key.
 *
 * ```
 * props.pageProps.timeline = {
 *   version: "9.0",
 *   scheduleDates:      [{ startDate: "2026-8-20 0:0:0", endDate: "2026-8-28 0:0:0" }, ...],
 *   scheduleActivities: [{ row: "EVENT 1", content: [{ startWeek: 1, endWeek: 10, ... }] }],
 *   scheduleBosses:     [...],
 * }
 * ```
 *
 * **The URL is deliberately version-less, and that is the good news here.**
 * `/en-us/hi3/timeline` answers `307` to `/en-us/hi3/timeline/9.0`, so the site
 * names its own current version server-side and the runner's `redirect:
 * "follow"` lands on it. That is the stable route § 13 recorded marisaimpact as
 * lacking, and it means no version ever has to be edited into `SOURCES`. **Do
 * not pin a versioned URL here**: it would publish a finished version's schedule
 * as current the day the game moves on, which is § 11's stale-source failure on
 * a six-week clock.
 *
 * **Week index → date.** Weeks are 1-based into `scheduleDates`, and `endWeek`
 * is *exclusive*: a bar of `startWeek: 1, endWeek: 7` occupies weeks 1–6 and
 * ends as week 7 opens. `endWeek` therefore runs one past the grid — 10 against
 * nine buckets on v9.0, 9 against eight on v8.9 — and that overshoot is the
 * encoding for "runs to the end of the version", which resolves to the last
 * bucket's own `endDate`.
 *
 * **Every timestamp on the page is `0:0:0`.** That is the grid needing something
 * to draw a column with, not a clock the site published, so both boundaries are
 * `day` precision at 00:00Z and `clockFor` resolves them on the reader's server
 * like every other day-precision date here. No zone is stated anywhere on the
 * page, so there is nothing to convert and nothing is converted.
 *
 * **Titles arrive in two pieces, and which piece is which is decided by the
 * row.** `miniature.titleTop` is the name; `titleMid` is either the rest of the
 * name or a blurb, depending on where it sits:
 *
 * - A **trailing colon on `titleTop`** is the page saying the name continues —
 *   `"7-Day Login:"` + `"300 crystals (cont from v8.9)"`. Joining them is not
 *   cosmetic: v9.0 runs *two* 7-Day Login events from week 1, and taking
 *   `titleTop` alone would give both the same title, the same start and
 *   therefore the **same event ID**, silently collapsing two events into one.
 *   `test/adapters/arustats.test.ts` pins that pair.
 * - On a **supply row** `titleMid` continues the name too — `"Lone"` +
 *   `"Destruction"` is one battlesuit, not an event with a blurb.
 * - On an **`EVENT n` row** it is a description — `"P2 Finale"` /
 *   `"It's finally over"` — and becomes the summary.
 *
 * **Bosses are not read.** `scheduleBosses` is the only exactly-dated material
 * on the page (`"2026-8-21 0:0:0"`, weather `Shadow`), but those are Abyss and
 * Memorial Arena openings: a recurring competitive rotation with no end, three
 * a week, twenty-seven a version. A calendar of deadlines is not what they are,
 * and `endsAt: null` on each would render them as live-with-unknown-end forever.
 *
 * **Nothing is filtered against `ctx.now`.** Unlike `bawiki.ts` or `iopwiki.ts`
 * this page is not an archive — it is one version's ~9-week window, so a row
 * that has already finished is this version's own history rather than a back
 * catalogue, and the client decides what a finished event looks like. When the
 * game moves to 9.1 the redirect above swaps the whole page for the new one.
 */

/**
 * What this source's dates are worth.
 *
 * Deliberately far below the 0.85–0.95 every other parser here emits, because
 * those publish a date their page stated and this one publishes the edge of a
 * bucket the site labelled `ESTIMATED WEEK`. It is the one machine-readable
 * place that difference is recorded, and `mergeEvents` prefers the higher number
 * — so a real HI3 source appearing later outranks this one automatically,
 * without anyone having to remember to retire it.
 */
export const ESTIMATE_CONFIDENCE = 0.4;

const NEXT_DATA =
  /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;

/** `2026-8-20 0:0:0` — unpadded, and the clock is always a placeholder. */
const BUCKET_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+\d{1,2}:\d{1,2}:\d{1,2})?$/;

interface WeekBucket {
  readonly startDate: string;
  readonly endDate: string;
}

interface Miniature {
  readonly titleTop?: string | null;
  readonly titleMid?: string | null;
}

interface Bar {
  readonly startWeek?: number;
  readonly endWeek?: number;
  readonly miniature?: Miniature | null;
}

interface ActivityRow {
  readonly row?: string;
  readonly content?: Bar[];
}

interface Timeline {
  readonly scheduleDates?: WeekBucket[];
  readonly scheduleActivities?: ActivityRow[];
}

function timelineOf(html: string): Timeline | null {
  const raw = NEXT_DATA.exec(html)?.[1];
  if (raw === undefined) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    const timeline = (
      parsed as { props?: { pageProps?: { timeline?: unknown } } }
    ).props?.pageProps?.timeline;
    return typeof timeline === "object" && timeline !== null
      ? (timeline as Timeline)
      : null;
  } catch {
    // A body that is not JSON is a redesign, not an empty schedule. `canParse`
    // is what turns that into a failed source rather than a blank calendar.
    return null;
  }
}

/**
 * `2026-8-20 0:0:0` → `2026-08-20T00:00:00.000Z`, or null.
 *
 * The clock is read and discarded: it is `0:0:0` on every cell of every version
 * — a placeholder the grid needs, not an instant — and the page states no zone
 * that could anchor a conversion anyway. Round-tripping through `Date.UTC`
 * rejects an impossible date (`2026-13-40`) rather than letting it roll over
 * into a plausible-looking one.
 */
function bucketInstant(input: string): string | null {
  const m = BUCKET_DATE.exec(input.trim());
  if (m === null) return null;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const ms = Date.UTC(year, month - 1, day);
  const back = new Date(ms);
  if (
    back.getUTCFullYear() !== year ||
    back.getUTCMonth() !== month - 1 ||
    back.getUTCDate() !== day
  ) {
    return null;
  }
  return back.toISOString();
}

/**
 * The instant a 1-based week index opens.
 *
 * An index one past the grid is the source's way of drawing a bar to the end of
 * the version, so it resolves to the final bucket's own end rather than being
 * dropped. An index further out than that is a shape this parser does not
 * understand, and gets no date at all.
 */
function weekStart(weeks: WeekBucket[], index: number): string | null {
  if (!Number.isInteger(index) || index < 1) return null;

  const bucket = weeks[index - 1];
  if (bucket !== undefined) return bucketInstant(bucket.startDate ?? "");

  const last = weeks[weeks.length - 1];
  if (index === weeks.length + 1 && last !== undefined) {
    return bucketInstant(last.endDate ?? "");
  }
  return null;
}

/** Supply rows are gacha windows; `EVENT n` rows are everything else. */
function isSupplyRow(row: string): boolean {
  return /SUPPLY|ASCENSION|ARMAMENT/i.test(row);
}

function typeFor(row: string, title: string): EventType {
  if (isSupplyRow(row)) return "banner";
  // An outfit window is a purchase deadline rather than a rate-up.
  if (/OUTFIT/i.test(row)) return "shop";
  // `daily.ts` reads this, and the wording it looks for is on the title here:
  // "7-Day Login", "8-Day Login". Detection still ships off (prefs.detectDaily).
  if (/\blog[- ]?in\b|\bcheck[- ]?in\b/i.test(title)) return "login";
  return "other";
}

/**
 * Split `titleTop`/`titleMid` into a name and a summary. See the module note —
 * a trailing colon or a supply row means `titleMid` finishes the name, and
 * getting that wrong collides two event IDs rather than merely reading oddly.
 */
function nameAndSummary(
  row: string,
  mini: Miniature,
): { title: string; summary: string | null } {
  const top = (mini.titleTop ?? "").trim();
  const mid = (mini.titleMid ?? "").trim();

  if (mid.length === 0) return { title: top, summary: null };
  if (top.endsWith(":") || isSupplyRow(row)) {
    return { title: `${top} ${mid}`.trim(), summary: null };
  }
  return { title: top, summary: mid };
}

export function parseAruStatsTimeline(
  html: string,
  ctx: ParseContext,
): GachaEvent[] {
  const timeline = timelineOf(html);
  if (timeline === null) return [];

  const weeks = timeline.scheduleDates ?? [];
  const rows = timeline.scheduleActivities ?? [];
  if (weeks.length === 0) return [];

  const out: GachaEvent[] = [];
  const seen = new Set<string>();

  for (const activity of rows) {
    const row = (activity.row ?? "").trim();
    for (const bar of activity.content ?? []) {
      const mini = bar.miniature;
      if (mini === undefined || mini === null) continue;

      const { title, summary } = nameAndSummary(row, mini);
      if (title.length === 0) continue;

      const startsAt = weekStart(weeks, bar.startWeek ?? 0);
      const endsAt = weekStart(weeks, bar.endWeek ?? 0);
      // Skip, never guess: a bar this parser cannot place on the grid is
      // dropped rather than pinned to the version's edges.
      if (startsAt === null || endsAt === null) continue;
      if (endsAt <= startsAt) continue;

      const id = eventId(ctx.game, title, startsAt);
      if (seen.has(id)) continue;
      seen.add(id);

      out.push({
        id,
        game: ctx.game,
        title,
        type: typeFor(row, title),
        summary: summary === null || summary.length === 0 ? null : summary,
        startsAt,
        startPrecision: "day",
        endsAt,
        endPrecision: "day",
        // One `GLB/SEA` grid, with no per-region column anywhere on the page.
        // There is nothing region-scoped to report, and inventing a split from
        // that one label would be reporting a server map the source never gave.
        regionScoped: false,
        regionEnds: null,
        sourceUrl: ctx.sourceUrl,
        sourceId: ctx.sourceId,
        status: "published",
        confidence: ESTIMATE_CONFIDENCE,
        extractionMethod: "parser",
        version: 1,
        firstSeenAt: ctx.now,
        updatedAt: ctx.now,
      });
    }
  }

  return out.sort((a, b) =>
    a.startsAt === b.startsAt
      ? a.id.localeCompare(b.id)
      : a.startsAt.localeCompare(b.startsAt),
  );
}

export const aruStatsParser: SourceParser = {
  id: "arustats",
  label: "AruStats Timeline",
  canParse(html: string): boolean {
    // Assert every structure the parser depends on, so a redesign fails the
    // source loudly instead of reporting that Honkai Impact 3rd has nothing on.
    const timeline = timelineOf(html);
    if (timeline === null) return false;

    const weeks = timeline.scheduleDates;
    const rows = timeline.scheduleActivities;
    return (
      Array.isArray(weeks) &&
      weeks.length > 0 &&
      bucketInstant(weeks[0]?.startDate ?? "") !== null &&
      Array.isArray(rows) &&
      rows.length > 0
    );
  },
  parse: parseAruStatsTimeline,
};
