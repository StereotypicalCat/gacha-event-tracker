import { eventId, type GachaEvent } from "../../shared/schema.ts";
import { parseMonthDayRange, parseOpenRange, parseOrdinalDateTimeRange } from "../dates.ts";
import { text } from "../html.ts";
import type { ParseContext } from "../adapters/types.ts";
import { inferType } from "./game8.ts";
import type { SourceParser } from "./types.ts";

/**
 * Fandom wikis, read through the MediaWiki action API.
 *
 * **Why the API and not the page.** `reverse1999.fandom.com/wiki/Events`
 * answers a non-browser client with a Cloudflare interstitial ("Just a
 * moment…", HTTP 403), and dressing our fetcher up as a browser to get past it
 * would be defeating a deliberate access control — the reason `uma.moe` was
 * declined in AGENTS.md § Scraping conduct. The wiki's own `robots.txt` instead
 * *allows* `/api.php?action=` for `User-agent: *`, and that endpoint answers our
 * real User-Agent with a 200. So this parser reads the sanctioned surface with
 * no impersonation anywhere: same headers, a path the site put in writing.
 *
 * The body is therefore JSON rather than HTML:
 *
 *   {"parse":{"title":"Events","pageid":3479,"text":"<div …>"}}
 *
 * `parse.text` is the rendered wikitext, and the shape below is what this family
 * of pages puts in it — `wikitable`s under one `h2` per section:
 *
 *   <h2>Version Events</h2>
 *   <table class="wikitable sortable">
 *     <tr><th>Event</th><th>Time Period</th><th>Version</th></tr>
 *     <tr><td><span …><img …></span><br><b>TITLE</b></td>
 *         <td>August 13th, 05:00 - September 21st, 2026, 04:59 (UTC-5)</td>
 *         <td>3.7</td>
 *
 * Two details decide most of the code.
 *
 * **The title is the `<b>`, never the cell text.** The cell leads with a banner
 * image, and when that image is missing MediaWiki renders a red link whose
 * visible text is `File:A Stranger to Memory Lane Banner.png`. A cell-text
 * reader publishes that as the event's name. The `<b>` holds the title in both
 * cases.
 *
 * **These pages are archives, not schedules.** All five tables list every event
 * since 1.1 — 154 rows, of which six had not yet ended when the fixture was
 * captured. Publishing the rest would put three years of finished events on the
 * calendar and hand the validator a hundred rows whose start predates its
 * two-year sanity window. So inclusion is decided against `ctx.now`, which is
 * injected precisely so a parser can be time-aware without reading the clock.
 */

const SECTION = /<h2\b[^>]*>([\s\S]*?)<\/h2>|<table\b[^>]*>([\s\S]*?)<\/table>/gi;
const ROW = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const CELL = /<t([dh])\b[^>]*>([\s\S]*?)<\/t\1>/gi;
const BOLD = /<b\b[^>]*>([\s\S]*?)<\/b>/i;
const EDIT_SECTION = /<span\b[^>]*class="[^"]*mw-editsection[^"]*"[^>]*>[\s\S]*?<\/span>/gi;
/**
 * A link to the event's own article. `Special:` is excluded deliberately: a
 * missing banner image renders as a `Special:Upload` link, which is both the
 * wrong page to send a reader to and a path this wiki's robots.txt disallows.
 */
const ARTICLE_LINK = /<a\b[^>]*href="(\/wiki\/(?!Special:)[^"#?]+)"/i;

const FGO_TABLE = /<table\b[^>]*id="(\d{2})(\d{4})"[^>]*class="[^"]*wikitable"[^>]*>([\s\S]*?)<\/table>/gi;
const FGO_ROW_BLOCK = /<th\b[^>]*colspan="2"[^>]*>([\s\S]*?)<\/th>[\s\S]*?<td\b[^>]*>([\s\S]*?)<\/td>\s*<td\b[^>]*>([\s\S]*?)<\/td>/gi;

/** The rendered HTML inside an `action=parse` response, or null. */
export function renderedHtml(body: string): string | null {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return null;
  }

  const html = (payload as { parse?: { text?: unknown } } | null)?.parse?.text;
  if (typeof html === "object" && html !== null && '*' in html) {
    return (html as any)['*'] as string;
  }
  return typeof html === "string" ? html : null;
}

function parseFgoEventsPage(rendered: string, ctx: ParseContext): GachaEvent[] {
  const flat = rendered.replace(EDIT_SECTION, "").replace(/\s+/g, " ");
  const nowMs = Date.parse(ctx.now);
  const out: GachaEvent[] = [];

  const ONGOING_BLOCK = /<h2\b[^>]*>[\s\S]*?<a\b[^>]*href="(\/wiki\/(?!Special:)[^"#?]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>[\s\S]*?<b>Duration:<\/b>\s*([\s\S]*?)(?:<\/p>|<br\s*\/?>)/gi;

  for (const match of flat.matchAll(ONGOING_BLOCK)) {
    const href = match[1] ?? "";
    const titleHtml = match[2] ?? "";
    const title = text(titleHtml).normalize("NFKC").trim();
    if (!title || /permanent/i.test(title)) continue;

    let rawDate = text(match[3] ?? "").replace(/&#160;/g, " ").replace(/~/g, "-").replace(/JST/i, "").trim();
    if (!rawDate) continue;

    rawDate = rawDate.replace(/(,\s*\d{4})\s*-/, " -");

    const parts = rawDate.split(/[-–—]/).map((s) => s.trim());
    let start: any = null;
    let end: any = null;

    if (parts.length === 1 && parts[0]) {
      const openMatch = parseOpenRange(parts[0]);
      if (openMatch) {
        start = openMatch.start;
        end = null;
      }
    } else if (parts.length >= 2 && parts[0] && parts[1]) {
      const rangeMatch = parseMonthDayRange(rawDate);
      if (rangeMatch) {
        start = rangeMatch.start;
        end = rangeMatch.end;
      }
    }

    if (!start) continue;
    if (end && end.iso <= start.iso) continue;
    const endMs = end ? Date.parse(end.iso) : Date.parse(start.iso) + 86400000;
    if (endMs < nowMs) continue;

    out.push({
      id: eventId(ctx.game, title, start.iso),
      game: ctx.game,
      title,
      type: inferType(title),
      summary: null,
      startsAt: start.iso,
      startPrecision: start.precision,
      endsAt: end ? end.iso : null,
      endPrecision: end ? end.precision : "unknown",
      regionScoped: false,
      regionEnds: null,
      sourceUrl: new URL(href, ctx.sourceUrl).toString(),
      sourceId: ctx.sourceId,
      status: "published",
      confidence: 0.95,
      extractionMethod: "parser",
      version: 1,
      firstSeenAt: ctx.now,
      updatedAt: ctx.now,
    });
  }

  for (const tableMatch of flat.matchAll(FGO_TABLE)) {
    const tableYear = parseInt(tableMatch[2]!, 10);
    const innerHtml = tableMatch[3] ?? "";

    for (const blockMatch of innerHtml.matchAll(FGO_ROW_BLOCK)) {
      const thHtml = blockMatch[1] ?? "";
      const imgTdHtml = blockMatch[2] ?? "";
      const dateTdHtml = blockMatch[3] ?? "";

      // Normalize NFKC immediately so it matches the sanitizer's fixed point.
      const title = text(thHtml).normalize("NFKC").trim();
      if (!title) continue;

      let rawDate = text(dateTdHtml).replace(/&#160;/g, " ").replace(/~/g, "-").trim();
      if (!rawDate) continue;

      const parts = rawDate.split(/[-–—]/).map((s) => s.trim());
      let start: any = null;
      let end: any = null;

      if (parts.length === 1 && parts[0]) {
        const openMatch = parseOpenRange(parts[0] + ", " + tableYear);
        if (openMatch) {
          start = openMatch.start;
          end = null;
        }
      } else if (parts.length >= 2 && parts[0] && parts[1]) {
        const mStart = /([A-Za-z]+)/.exec(parts[0])?.[1]?.toLowerCase() || "";
        const mEnd = /([A-Za-z]+)/.exec(parts[1])?.[1]?.toLowerCase() || "";
        const monthsList = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
        const startM = monthsList.findIndex((x) => mStart.startsWith(x));
        const endM = monthsList.findIndex((x) => mEnd.startsWith(x));
        
        let endYear = tableYear;
        if (startM > -1 && endM > -1 && startM > endM) {
          endYear = tableYear + 1;
        }

        const rangeStr = parts[0] + " - " + parts[1] + ", " + endYear;
        const rangeMatch = parseMonthDayRange(rangeStr);
        if (rangeMatch) {
          start = rangeMatch.start;
          end = rangeMatch.end;
        }
      }

      if (!start) continue;
      if (/permanent/i.test(title)) continue;
      if (end && end.iso <= start.iso) continue;
      const endMs = end ? Date.parse(end.iso) : Date.parse(start.iso) + 86400000;
      if (endMs < nowMs) continue;

      const href = ARTICLE_LINK.exec(thHtml)?.[1] || ARTICLE_LINK.exec(imgTdHtml)?.[1];

      out.push({
        id: eventId(ctx.game, title, start.iso),
        game: ctx.game,
        title,
        type: inferType(title),
        summary: null,
        startsAt: start.iso,
        startPrecision: start.precision,
        endsAt: end ? end.iso : null,
        endPrecision: end ? end.precision : "unknown",
        regionScoped: false,
        regionEnds: null,
        sourceUrl: href === undefined ? ctx.sourceUrl : new URL(href, ctx.sourceUrl).toString(),
        sourceId: ctx.sourceId,
        status: "published",
        confidence: 0.95,
        extractionMethod: "parser",
        version: 1,
        firstSeenAt: ctx.now,
        updatedAt: ctx.now,
      });
    }
  }
  return out;
}

export function parseFandomEventsPage(
  body: string,
  ctx: ParseContext,
): GachaEvent[] {
  const rendered = renderedHtml(body);
  if (rendered === null) return [];

  // Branch for FGO
  if (/<table\b[^>]*id="\d{6}"[^>]*class="[^"]*wikitable"/i.test(rendered)) {
    const events = parseFgoEventsPage(rendered, ctx);
    return events.sort((a, b) =>
      a.startsAt === b.startsAt
        ? a.id.localeCompare(b.id)
        : a.startsAt.localeCompare(b.startsAt),
    );
  }

  const flat = rendered.replace(EDIT_SECTION, "").replace(/\s+/g, " ");
  const nowMs = Date.parse(ctx.now);
  const out: GachaEvent[] = [];
  let section = "";

  for (const node of flat.matchAll(SECTION)) {
    const heading = node[1];
    if (heading !== undefined) {
      section = text(heading);
      continue;
    }

    const table = node[2] ?? "";
    // Every section table states the same three columns. Checking them keeps a
    // navbox or an infobox elsewhere in the page from being read as a schedule.
    const headers = [...table.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(
      (h) => text(h[1] ?? "").toLowerCase(),
    );
    if (!headers.includes("event") || !headers.includes("time period")) continue;

    for (const row of table.matchAll(ROW)) {
      const cells = [...(row[1] ?? "").matchAll(CELL)].map((c) => ({
        tag: c[1] ?? "",
        html: c[2] ?? "",
      }));
      if (cells.length < 2 || cells.some((c) => c.tag === "h")) continue;

      const titleCell = cells[0]?.html ?? "";
      const title = text(BOLD.exec(titleCell)?.[1] ?? "");
      if (title.length === 0) continue;

      const range = parseOrdinalDateTimeRange(text(cells[1]?.html ?? ""));
      // A row stating no year on either half is unresolvable — the fixture has
      // exactly one — and a row this reader cannot date yields no event rather
      // than a guessed one.
      if (range === null) continue;

      const { start, end } = range;
      if (end.iso <= start.iso) continue;

      // Live and upcoming only. An event whose end has passed is history this
      // page keeps and the calendar does not want.
      if (Date.parse(end.iso) < nowMs) continue;

      const href = ARTICLE_LINK.exec(titleCell)?.[1];

      out.push({
        id: eventId(ctx.game, title, start.iso),
        game: ctx.game,
        title,
        // The section heading is the source's own classification, and a better
        // signal than the title alone — "Character Story Events" names a story
        // event whose title says nothing about it.
        type: inferType(`${title} ${section}`),
        summary: section.length > 0 ? section : null,
        startsAt: start.iso,
        startPrecision: start.precision,
        endsAt: end.iso,
        endPrecision: end.precision,
        // One global server on a single stated offset: every row on the page
        // reads (UTC-5), and the page draws no distinction between regions.
        // `regionScoped` means the source separates them, and this one does not.
        regionScoped: false,
        regionEnds: null,
        sourceUrl:
          href === undefined
            ? ctx.sourceUrl
            : new URL(href, ctx.sourceUrl).toString(),
        sourceId: ctx.sourceId,
        status: "published",
        // Both boundaries are exact instants converted from a stated offset,
        // with nothing inferred — the same footing as the wiki.gg timers.
        confidence: 0.95,
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

export const fandomParser: SourceParser = {
  id: "fandom",
  label: "Fandom",
  canParse(body: string): boolean {
    // Structural, and deliberately about the envelope as much as the content:
    // this source is an API, so a body that is not an `action=parse` response
    // is the failure worth catching loudly — an error payload, a login wall, or
    // the Cloudflare interstitial the plain page serves would all land here.
    const rendered = renderedHtml(body);
    if (rendered === null) return false;
    const isStandard = /class="[^"]*wikitable/.test(rendered) && /Time Period/i.test(rendered);
    const isFgo = /<table\b[^>]*id="\d{6}"[^>]*class="[^"]*wikitable"/i.test(rendered);
    return isStandard || isFgo;
  },
  parse: parseFandomEventsPage,
};
