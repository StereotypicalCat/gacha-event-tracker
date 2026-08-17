import { eventId, type GachaEvent } from "../../shared/schema.ts";
import { parseYearFirstSlashRange, type ParsedInstant } from "../dates.ts";
import { text } from "../html.ts";
import type { ParseContext } from "../adapters/types.ts";
import { inferType } from "./game8.ts";
import type { SourceParser } from "./types.ts";

/**
 * The Arknights wiki's own event table (`arknights.wiki.gg`).
 *
 * Same host family as `wikigg.ts` but a different template entirely — that
 * parser reads the `mp-event` main-page cards, and this page has none. What it
 * has is an "Ongoing/upcoming" table, one row per event:
 *
 *   <table class="mrfz-wtable flex-table">
 *     <tr><td><b><a href="/wiki/SLUG">TITLE</a></b><img …></td>
 *         <td><div><b>CN:</b> 2026/02/24 – 2026/03/17</div>
 *             <div><b>Global:</b> 2026/07/30 – 2026/08/20
 *               <div class="countdown">; ends in
 *                 <span class="countdowndate">2026-08-20T10:59:59+00:00</span>
 *
 * Two things about this source shape decide most of the code below.
 *
 * **Only the Global line is ours.** Every row also carries the CN release,
 * which runs roughly five months ahead. A reader on the Global server told a CN
 * date would be told an event ended in March that has not started yet — the
 * exact confidently-wrong failure this codebase exists to prevent. CN, JP and
 * KR lines are skipped, and a row with no Global line yields no event at all
 * rather than borrowing one.
 *
 * **Each event states exactly one boundary precisely.** The countdown is on
 * whichever boundary is next: the end while an event is running, the start
 * while it is still upcoming. So one side is an exact instant from the source
 * and the other is the day-precision date from the table text, and which side
 * is which flips as the event goes live.
 */

/** Whitespace as this page writes it — sometimes a space, sometimes `&#32;`. */
const OTHER_SERVER = /<b>\s*(?:CN|JP|KR|TW)\s*:?\s*<\/b>/i;
const GLOBAL_LINE = /<b>\s*Global\s*:?\s*<\/b>([\s\S]*)$/i;
const TABLE = /<table\b[^>]*>([\s\S]*?)<\/table>/i;
const ROW = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const CELL = /<t([dh])\b[^>]*>([\s\S]*?)<\/t\1>/gi;
const WIKI_LINK = /<a href="(\/wiki\/[^"]+)"/i;

/**
 * `; ends in <span class="countdowndate">2026-08-20T10:59:59+00:00</span>`.
 *
 * The gap between the word and the span is `&#32;` rather than a space, so this
 * allows a short run of any non-tag text between them instead of matching
 * whitespace.
 */
const COUNTDOWN =
  /(starts|ends)[^<]{0,24}<span[^>]*class="[^"]*countdowndate[^"]*"[^>]*>([^<]+)<\/span>/i;

/**
 * The "Ongoing/upcoming" section only.
 *
 * The same page lists every event the game has ever run under "By year"
 * further down, in the same table class. Publishing those would put a hundred
 * finished events on the calendar, so inclusion stops at the next heading.
 */
function ongoingSection(html: string): string | null {
  const anchor = /id="Ongoing(?:\/|\.2F)upcoming"/i.exec(html);
  if (anchor === null) return null;

  const from = anchor.index;
  const afterHeading = html.indexOf("</h3>", from);
  const body = html.slice(afterHeading < 0 ? from : afterHeading + 5);
  const next = body.search(/<h[23]\b/i);
  return next < 0 ? body : body.slice(0, next);
}

/** The Global server's half of a date cell, with the other servers' cut off. */
function globalHalf(cell: string): string | null {
  const m = GLOBAL_LINE.exec(cell);
  if (m === null) return null;
  const rest = m[1] ?? "";
  const other = OTHER_SERVER.exec(rest);
  return other === null ? rest : rest.slice(0, other.index);
}

function sameUtcDay(a: string, b: string): boolean {
  return a.slice(0, 10) === b.slice(0, 10);
}

/**
 * Replace a day-precision boundary with the source's exact instant — but only
 * when the two fall on the same UTC day.
 *
 * This guard is about event IDs, not about accuracy. An ID ends in
 * `startsAt.slice(0, 10)`, and this page publishes an exact *start* only while
 * an event is upcoming: the moment it goes live the countdown switches to the
 * end and the start falls back to the table's date. If an exact start could
 * ever carry a different UTC day than the date beside it, the event's ID would
 * change on the day it began — silently orphaning every completion mark anyone
 * had made against it. Keeping the day fixed makes that impossible rather than
 * unlikely.
 */
function refine(day: ParsedInstant, exact: string): ParsedInstant {
  const ms = Date.parse(exact);
  if (Number.isNaN(ms)) return day;
  const iso = new Date(ms).toISOString();
  return sameUtcDay(iso, day.iso) ? { iso, precision: "exact" } : day;
}

export function parseArknightsWikiEventsPage(
  html: string,
  ctx: ParseContext,
): GachaEvent[] {
  const section = ongoingSection(html.replace(/\s+/g, " "));
  if (section === null) return [];

  const table = TABLE.exec(section)?.[1];
  if (table === undefined) return [];

  const out: GachaEvent[] = [];

  for (const row of table.matchAll(ROW)) {
    const body = row[1] ?? "";
    const cells = [...body.matchAll(CELL)].map((c) => ({
      tag: c[1] ?? "",
      html: c[2] ?? "",
    }));
    // The header row is `<th>Event</th><th>Date</th>`.
    if (cells.length < 2 || cells.some((c) => c.tag === "h")) continue;

    const titleCell = cells[0]?.html ?? "";
    const title = text(titleCell);
    if (title.length === 0) continue;

    const half = globalHalf(cells[1]?.html ?? "");
    // No Global line means the event has only been announced for another
    // server. There is no honest date to publish, so there is no event.
    if (half === null) continue;

    const range = parseYearFirstSlashRange(text(half));
    if (range === null) continue;

    let { start, end } = range;
    const countdown = COUNTDOWN.exec(half);
    if (countdown !== null) {
      const exact = countdown[2] ?? "";
      if (/^ends$/i.test(countdown[1] ?? "")) end = refine(end, exact);
      else start = refine(start, exact);
    }

    if (end.iso <= start.iso) continue;

    // Same scoring as the Game8 parser: an exact boundary is firmer evidence
    // than a date with the time of day left off.
    let confidence = 0.95;
    if (start.precision === "day") confidence -= 0.05;
    if (end.precision === "day") confidence -= 0.05;

    const href = WIKI_LINK.exec(titleCell)?.[1];

    out.push({
      id: eventId(ctx.game, title, start.iso),
      game: ctx.game,
      title,
      type: inferType(title),
      summary: null,
      startsAt: start.iso,
      startPrecision: start.precision,
      endsAt: end.iso,
      endPrecision: end.precision,
      // Arknights runs one Global server for all three of our regions, so an
      // end really is a single worldwide instant here. This is the opposite of
      // Endfield next door, and saying so is not a shortcut: `regionScoped`
      // means the source distinguishes regions, and this one does not.
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

export const arknightsWikiParser: SourceParser = {
  id: "akwiki",
  label: "Arknights Wiki",
  canParse(html: string): boolean {
    // Both halves matter. The table class alone also appears under "By year",
    // and the anchor alone would survive the table being replaced by the image
    // grid this wiki uses elsewhere — either on its own could return zero
    // events and read downstream as "Arknights has nothing on".
    return (
      /mrfz-wtable/.test(html) && /id="Ongoing(?:\/|\.2F)upcoming"/i.test(html)
    );
  },
  parse: parseArknightsWikiEventsPage,
};
