import { eventId, type GachaEvent } from "../../shared/schema.ts";
import { latestBoundaryMs } from "../../shared/time.ts";
import { parseIsoDay, type ParsedInstant } from "../dates.ts";
import { text } from "../html.ts";
import type { ParseContext } from "../adapters/types.ts";
import { inferType } from "./game8.ts";
import type { SourceParser } from "./types.ts";

/**
 * The Blue Archive wiki's event schedule (`bluearchive.wiki`, a Miraheze wiki).
 *
 * The rendered page, not the API: Miraheze's `robots.txt` disallows `/w/` and
 * `/*?action=`, so the route `fandom.ts` takes is closed here and `/wiki/Events`
 * is the surface this site permits. It answers our own User-Agent with a 200,
 * so nothing has to be pretended.
 *
 * The schedule is a tabber with one panel per game version:
 *
 *   <article id="tabber-Japanese_version">
 *     <table class="wikitable"><tr><th>Name (EN)<th>Name (JP)<th>Start date …
 *   <article id="tabber-Global_version">
 *     <table class="wikitable">
 *       <tr><th>Name (EN)</th><th>Start date</th><th>End date</th><th>Notes</th>
 *       <tr><td><a href="/wiki/SLUG">TITLE</a></td>
 *           <td>2026-08-04</td><td>2026-08-18</td><td>Rerun</td>
 *
 * Four things about this page decide the code below.
 *
 * **Only the Global panel is ours.** The Japanese version runs four to nine
 * months ahead — the same hazard as the CN column on `akwiki.ts`, and the same
 * answer: a JP date on a Global calendar is a confidently wrong date, not a near
 * miss. The two panels are also shaped differently (JP carries an extra
 * `Name (JP)` column), so a reader that wandered into the wrong one would read
 * a Japanese title where it expected a start date.
 *
 * **Columns are resolved from the header row, never counted.** That difference
 * between the panels is exactly how a silent drop starts: if the Global table
 * ever gains a `Name (JP)` column, fixed indices would hand a title to the date
 * reader, every row would fail to parse, and the game's lane would empty with no
 * error anywhere.
 *
 * **This is an archive, not a schedule.** 98 Global rows go back to 2021, of
 * which two had not ended when the fixture was captured. Inclusion is therefore
 * decided against `ctx.now`, as in `fandom.ts`; there is no "ongoing" heading to
 * gate on.
 *
 * **The page states no time of day and no timezone — anywhere.** Every boundary
 * here is a bare date, so both are day precision. That also settles the five
 * other schedule tables further down the page (Mini-Event, Reward campaigns,
 * Attendance bonuses, Guide missions, Joint Firing Drill): those *do* state wall
 * clock times, `08/12/2026 11:00` style, but the page names no zone for them and
 * three of the five do not even say which server they describe. Reading those as
 * UTC would invent the fact that matters most, and rounding them to a day would
 * not save it — a 04:00 local boundary lands on either side of UTC midnight
 * depending on the offset assumed, and the start's day is part of the event ID.
 * So they are left unparsed deliberately. If a table there ever states its zone,
 * it is worth adding; until then it is a missing fact like any other.
 */

/**
 * Every element whose id names the Global tab — the panel *and* the tab button
 * in the nav above it, which carries `id="tabber-Global_version-label"` and,
 * being part of the header, comes first in the document.
 *
 * That button is the trap this parser exists to avoid walking into: slicing from
 * the first match runs from the nav through the Japanese panel, and the Japanese
 * schedule is four to nine months ahead of ours. The `-label` suffix is what
 * tells the two apart.
 */
const PANEL = /id="(tabber-Global[^"]*)"/gi;
const TABLE = /<table\b[^>]*>([\s\S]*?)<\/table>/i;
const ROW = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const CELL = /<t([dh])\b[^>]*>([\s\S]*?)<\/t\1>/gi;
/**
 * The event's own article. `Special:` is excluded because this wiki's
 * robots.txt disallows it, and it is the wrong page to send a reader to.
 */
const ARTICLE_LINK = /<a\b[^>]*href="(\/wiki\/(?!Special:)[^"#?]+)"/i;

const EVENT_TABLE = /<table\b[^>]*\bid="eventtable"[^>]*>([\s\S]*?)<\/table>/i;

interface Columns {
  title: number;
  start: number;
  end: number;
  notes: number | undefined;
}

interface EventTableColumns {
  event: number;
  glPeriod: number;
  notes: number | undefined;
}

/**
 * Where each column sits in the redesigned unified schedule table (#eventtable).
 */
function eventTableColumns(headers: string[]): EventTableColumns | null {
  const at = (match: (h: string) => boolean) => {
    const i = headers.findIndex((h) => match(h));
    return i < 0 ? undefined : i;
  };

  const event = at((h) => h === "event" || h === "name (en)");
  const glPeriod = at((h) => h === "gl period" || h === "global period");
  if (event === undefined || glPeriod === undefined) {
    return null;
  }
  return { event, glPeriod, notes: at((h) => h === "notes") };
}

/**
 * The redesigned unified schedule table, located by its ID (#eventtable).
 */
function globalEventTable(
  html: string,
): { cols: EventTableColumns; body: string } | null {
  const body = EVENT_TABLE.exec(html)?.[1];
  if (body === undefined) return null;

  const headers = [...body.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(
    (h) => text(h[1] ?? "").toLowerCase(),
  );
  const cols = eventTableColumns(headers);
  if (cols === null) return null;
  return { cols, body };
}

/**
 * Where each column sits, read off the header row of the legacy tabber.
 *
 * Returns null when the table is not a schedule at all, which is what keeps the
 * per-event infoboxes elsewhere on the page from being read as one.
 */
function columns(headers: string[]): Columns | null {
  const at = (match: (h: string) => boolean) => {
    const i = headers.findIndex((h) => match(h));
    return i < 0 ? undefined : i;
  };

  // "Name (EN)", and deliberately not a plain "Name": that is how the page's
  // four other schedule tables head the same column, and telling this table
  // apart from those is the whole job of this function.
  const title = at((h) => h === "name (en)");
  const start = at((h) => h === "start date");
  const end = at((h) => h === "end date");
  if (title === undefined || start === undefined || end === undefined) {
    return null;
  }
  return { title, start, end, notes: at((h) => h === "notes") };
}

/**
 * The Global version panel's schedule table, and where its columns sit (legacy format).
 *
 * There are three Global panels on this page, not one: the schedule, plus the
 * Mini-Event and Joint Firing Drill tabbers further down, whose ids are the same
 * name with `_2` and `_3` appended. So the right panel is found by the shape of
 * the table inside it rather than by its position — the schedule is the one
 * headed `Name (EN)`, and the other two head that column `Name`. Position would
 * work today and would quietly start reading a different section the day the
 * page is reordered or the schedule tabber is renumbered.
 */
function globalSchedule(
  html: string,
): { cols: Columns; body: string } | null {
  for (const m of html.matchAll(PANEL)) {
    // The nav button that names the tab, not the tab itself. It sits in the
    // header above *both* panels, so slicing from it runs straight through the
    // Japanese schedule — four to nine months ahead of ours.
    if ((m[1] ?? "").endsWith("-label")) continue;

    // Bounded at whichever comes first: the end of this panel, or the start of
    // the next tab. Either alone would do today — the panel is an <article> and
    // Global is the last tab in its tabber — and neither alone survives the
    // tabs being reordered or the extension emitting a different element.
    const from = m.index;
    const bounds = [
      html.indexOf("</article>", from + 1),
      html.indexOf('id="tabber-', from + 1),
    ].filter((i) => i >= 0);
    const section =
      bounds.length === 0
        ? html.slice(from)
        : html.slice(from, Math.min(...bounds));

    const body = TABLE.exec(section)?.[1];
    if (body === undefined) continue;

    const headers = [...body.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(
      (h) => text(h[1] ?? "").toLowerCase(),
    );
    const cols = columns(headers);
    if (cols !== null) return { cols, body };
  }
  return null;
}

function parseNewEventTable(
  schedule: { cols: EventTableColumns; body: string },
  ctx: ParseContext,
): GachaEvent[] {
  const { cols } = schedule;
  const nowMs = Date.parse(ctx.now);
  const out: GachaEvent[] = [];

  for (const row of schedule.body.matchAll(ROW)) {
    const rowAttrs = row[0] ?? "";
    const cells = [...(row[1] ?? "").matchAll(CELL)].map((c) => ({
      tag: c[1] ?? "",
      html: c[2] ?? "",
    }));
    if (cells.length === 0 || cells.some((c) => c.tag === "h")) continue;

    const eventCell = cells[cols.event]?.html ?? "";
    // Prefer the Global title if present; fallback to the JP title or the whole cell
    const glBlock =
      /<div\b[^>]*class="[^"]*event-region-gl[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i.exec(
        eventCell,
      );
    const targetBlock = glBlock?.[1] ?? eventCell;
    const titleSpan =
      /<span\b[^>]*class="[^"]*event-title[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(
        targetBlock,
      );
    const titleInner = titleSpan?.[1] ?? targetBlock;
    const title = text(titleInner);
    if (title.length === 0) continue;

    const glCell = cells[cols.glPeriod]?.html ?? "";
    if (glCell.includes("event-unannounced") || /\bTBD\b/i.test(glCell)) continue;

    const isoDates = [
      ...glCell.matchAll(/data-datetime="(\d{4}-\d{2}-\d{2})/g),
    ].map((m) => m[1]);

    let start: ParsedInstant | null = null;
    let end: ParsedInstant | null = null;

    if (isoDates.length > 0) {
      start = parseIsoDay(isoDates[0]!);
      if (isoDates.length > 1 && isoDates[1]) {
        end = parseIsoDay(isoDates[1]);
      }
    } else {
      const textDates = [
        ...glCell.matchAll(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/g),
      ]
        .map((m) =>
          parseIsoDay(
            `${m[1]}-${m[2]?.padStart(2, "0")}-${m[3]?.padStart(2, "0")}`,
          ),
        )
        .filter((d): d is ParsedInstant => d !== null);
      if (textDates.length > 0) {
        start = textDates[0]!;
        if (textDates.length > 1 && textDates[1]) {
          end = textDates[1];
        }
      }
    }

    if (start === null) continue;

    if (end === null) {
      if (latestBoundaryMs(start.iso, start.precision, ctx.game) < nowMs) {
        continue;
      }
    } else {
      if (end.iso <= start.iso) continue;
      if (latestBoundaryMs(end.iso, end.precision, ctx.game) < nowMs) continue;
    }

    const release = /data-release="([^"]*)"/i.exec(rowAttrs)?.[1]?.toLowerCase();
    const notes =
      cols.notes === undefined ? "" : text(cells[cols.notes]?.html ?? "");
    const summary =
      notes.length > 0 ? notes : release === "rerun" ? "Rerun" : null;
    const type = release === "rerun" ? "rerun" : inferType(`${title} ${notes}`);

    const href =
      ARTICLE_LINK.exec(titleInner)?.[1] ??
      ARTICLE_LINK.exec(eventCell)?.[1];

    let confidence = 0.95 - 0.05;
    confidence -= end === null ? 0.15 : 0.05;

    out.push({
      id: eventId(ctx.game, title, start.iso),
      game: ctx.game,
      title,
      type,
      summary,
      startsAt: start.iso,
      startPrecision: start.precision,
      endsAt: end === null ? null : end.iso,
      endPrecision: end === null ? "unknown" : end.precision,
      regionScoped: false,
      regionEnds: null,
      sourceUrl:
        href === undefined
          ? ctx.sourceUrl
          : new URL(href, ctx.sourceUrl).toString(),
      sourceId: ctx.sourceId,
      status: "published",
      confidence: Math.round(confidence * 100) / 100,
      extractionMethod: "parser",
      version: 1,
      firstSeenAt: ctx.now,
      updatedAt: ctx.now,
    });
  }

  return out.sort((a, b) =>
    a.startsAt === b.startsAt
      ? a.id.localeCompare(b.id)
      : a.startsAt.localeCompare(b.startsAt),
  );
}

function parseLegacySchedule(
  schedule: { cols: Columns; body: string },
  ctx: ParseContext,
): GachaEvent[] {
  const { cols } = schedule;
  const nowMs = Date.parse(ctx.now);
  const out: GachaEvent[] = [];

  for (const row of schedule.body.matchAll(ROW)) {
    const cells = [...(row[1] ?? "").matchAll(CELL)].map((c) => ({
      tag: c[1] ?? "",
      html: c[2] ?? "",
    }));
    if (cells.length === 0 || cells.some((c) => c.tag === "h")) continue;

    const titleCell = cells[cols.title]?.html ?? "";
    const title = text(titleCell);
    if (title.length === 0) continue;

    const start = parseIsoDay(text(cells[cols.start]?.html ?? ""));
    if (start === null) continue;

    const end: ParsedInstant | null = parseIsoDay(
      text(cells[cols.end]?.html ?? ""),
    );

    if (end === null) {
      // A row this reader cannot date on the end is publishable only while its
      // start is still ahead: that is a real, announced event whose end the wiki
      // has not filled in, and `endsAt: null` is the honest way to say so. Once
      // the start has passed, the end is the only thing separating a live event
      // from any of the ninety-odd finished rows above it, and without one there
      // is no way to tell — so that row yields nothing rather than a guess.
      if (latestBoundaryMs(start.iso, start.precision, ctx.game) < nowMs) {
        continue;
      }
    } else {
      if (end.iso <= start.iso) continue;
      // Live and upcoming only. Everything else is history the page keeps and
      // the calendar does not want.
      //
      // Every boundary on this page is day precision, so both checks resolve
      // through `latestBoundaryMs` rather than reading the stored UTC midnight
      // as an instant: that placeholder retires a row hours before the reader's
      // own reset does, which loses a live event on the day it ends.
      if (latestBoundaryMs(end.iso, end.precision, ctx.game) < nowMs) continue;
    }

    // The source's own annotation: "Rerun", "Collaboration Event",
    // "Special Operation Part 1". A better type signal than the title alone,
    // which for a rerun is simply the original event's name again.
    const notes =
      cols.notes === undefined ? "" : text(cells[cols.notes]?.html ?? "");

    const href = ARTICLE_LINK.exec(titleCell)?.[1];

    // Same scoring as the other parsers here: a day-precision boundary is
    // weaker evidence than an exact one, and an unannounced end weaker still.
    let confidence = 0.95 - 0.05;
    confidence -= end === null ? 0.15 : 0.05;

    out.push({
      id: eventId(ctx.game, title, start.iso),
      game: ctx.game,
      title,
      type: inferType(`${title} ${notes}`),
      summary: notes.length > 0 ? notes : null,
      startsAt: start.iso,
      startPrecision: start.precision,
      endsAt: end === null ? null : end.iso,
      endPrecision: end === null ? "unknown" : end.precision,
      // The panels here are game *versions* — Japanese and Global are separate
      // releases on separate schedules — not our asia/america/europe regions.
      // Blue Archive Global is one worldwide server and this page draws no
      // distinction inside it, so there is nothing region-scoped to report.
      regionScoped: false,
      regionEnds: null,
      sourceUrl:
        href === undefined
          ? ctx.sourceUrl
          : new URL(href, ctx.sourceUrl).toString(),
      sourceId: ctx.sourceId,
      status: "published",
      confidence: Math.round(confidence * 100) / 100,
      extractionMethod: "parser",
      version: 1,
      firstSeenAt: ctx.now,
      updatedAt: ctx.now,
    });
  }

  return out.sort((a, b) =>
    a.startsAt === b.startsAt
      ? a.id.localeCompare(b.id)
      : a.startsAt.localeCompare(b.startsAt),
  );
}

export function parseBlueArchiveWikiEventsPage(
  html: string,
  ctx: ParseContext,
): GachaEvent[] {
  const norm = html.replace(/\s+/g, " ");
  const newSchedule = globalEventTable(norm);
  if (newSchedule !== null) {
    return parseNewEventTable(newSchedule, ctx);
  }

  const legacySchedule = globalSchedule(norm);
  if (legacySchedule !== null) {
    return parseLegacySchedule(legacySchedule, ctx);
  }

  return [];
}

export const blueArchiveWikiParser: SourceParser = {
  id: "bawiki",
  label: "Blue Archive Wiki",
  canParse(html: string): boolean {
    const norm = html.replace(/\s+/g, " ");
    return globalEventTable(norm) !== null || globalSchedule(norm) !== null;
  },
  parse: parseBlueArchiveWikiEventsPage,
};
