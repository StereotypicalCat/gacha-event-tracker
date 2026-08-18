import { eventId, type GachaEvent } from "../../shared/schema.ts";
import { parseFullRange, parseOrdinalDateTimeRange } from "../dates.ts";
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

/**
 * `Event_List_(US)` fences its three sections with banner images that carry
 * their label in an absolutely-positioned `<div>` drawn over the picture. That
 * label is the only thing in the markup naming a section — there is no heading
 * and no id — so it is what inclusion is decided on.
 */
const FGO_ONGOING_DIVIDER = />\s*ONGOING EVENTS\s*</i;
const FGO_FUTURE_DIVIDER = />\s*FUTURE EVENTS\s*</i;

/** The title link, and the duration line, inside one ongoing block. */
const FGO_TITLE_LINK = /<a\b[^>]*href="(\/wiki\/(?!Special:)[^"#?]+)"[^>]*>([^<]*)<\/a>/i;
const FGO_DURATION = /<b>\s*Duration:\s*<\/b>([^<]*)/i;

/**
 * The wiki disambiguates an English article from its Japanese counterpart by
 * appending `(US)` to the article name — `Archetype Inception Chapter Release`
 * exists twice, once per server. Every row this source publishes therefore
 * carries the suffix, which makes it constant noise on a calendar that shows
 * one server's schedule and names no other. It is stripped here rather than in
 * the sanitizer because it is a fact about *this page's naming convention*,
 * which is a parser's job to know.
 */
const FGO_ARTICLE_SUFFIX = /\s*\(US\)\s*$/;

/** The rendered HTML inside an `action=parse` response, or null. */
export function renderedHtml(body: string): string | null {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return null;
  }

  const html = (payload as { parse?: { text?: unknown } } | null)?.parse?.text;
  return typeof html === "string" ? html : null;
}

/**
 * True for `Event_List_(US)`, and the gate on the branch below.
 *
 * Every anchor the FGO reader depends on, asserted together: the two dividers
 * that fence the ongoing section, and the label carrying its dates. Asserting
 * them here rather than discovering them missing mid-parse is what turns a
 * template change into a stalled source — the runner rejects a body that parses
 * worse than the one it holds — instead of a lane that quietly goes empty.
 */
function isFgoEventList(rendered: string): boolean {
  return (
    FGO_ONGOING_DIVIDER.test(rendered) &&
    FGO_FUTURE_DIVIDER.test(rendered) &&
    FGO_DURATION.test(rendered)
  );
}

/**
 * The English-server half of the Fate/Grand Order wiki.
 *
 * **The page is chosen, not incidental.** This wiki publishes two schedules:
 * `Event_List` opens "This page lists all Events in Fate/Grand Order Japan",
 * and `Event_List_(US)` is the English server. They run months apart and the
 * Japanese one is the trap — the same hazard as the CN column on `akwiki` and
 * the JP tab on `bawiki`, and the same answer: publish the server our readers
 * are on. Each page links the other, so landing on the wrong one is easy and
 * silent.
 *
 * **Only the ongoing section is parsed**, of the three the page fences off:
 *
 * - `ONGOING EVENTS` — one `<h2>` per event with a `<b>Duration:</b>` line
 *   stating both boundaries. This is the section with dates in it.
 * - `FUTURE EVENTS` — an `Upcoming Events | ETA` table whose ETA column reads
 *   `August 2026`. A month with no day is not a start date, and a start date is
 *   half of an event id, so these are skipped rather than pinned to the 1st.
 * - `PAST EVENTS` — 111 monthly tables of finished events. Unlike the Japanese
 *   page, whose equivalent tables carry the month in a `MMYYYY` table id, these
 *   state no year anywhere in the markup. Undatable, and history regardless.
 *
 * **The dates state a zone but no clock.** Every duration ends `PDT`, which is
 * what makes the single Pacific-time server visible, but the boundaries are
 * bare calendar days. So they are read as day precision on the day the page
 * states and *not* shifted into UTC: with no time of day to anchor, converting
 * would move the stated day for a fact the page never published. `PDT` is also
 * a daylight abbreviation the page swaps for `PST` in winter, which is exactly
 * the shifting-offset case `NAMED_ZONE_OFFSET_MS` refuses to carry.
 *
 * **The section is sliced by index, then split on `<h2>`.** A single regex
 * spanning heading-to-duration needs nested lazy quantifiers, and on a 620KB
 * body those backtrack catastrophically the moment one of the anchors stops
 * matching — a renamed `Duration:` label would hang the refresh runner instead
 * of yielding nothing. Bounded character classes cannot do that.
 */
function parseFgoOngoingEvents(
  rendered: string,
  ctx: ParseContext,
): GachaEvent[] {
  const flat = rendered.replace(EDIT_SECTION, "").replace(/\s+/g, " ");

  const start = flat.search(FGO_ONGOING_DIVIDER);
  if (start === -1) return [];
  const rest = flat.slice(start);
  const end = rest.search(FGO_FUTURE_DIVIDER);
  // Both dividers are asserted by `canParse`. Bailing rather than reading to
  // the end of the body keeps a renamed divider from sweeping the whole past
  // archive into the ongoing section.
  if (end === -1) return [];

  const nowMs = Date.parse(ctx.now);
  const out: GachaEvent[] = [];

  for (const block of rest.slice(0, end).split(/<h2\b/i).slice(1)) {
    const link = FGO_TITLE_LINK.exec(block);
    if (link === null) continue;

    const title = text(link[2] ?? "").replace(FGO_ARTICLE_SUFFIX, "");
    if (title === "") continue;

    const duration = FGO_DURATION.exec(block);
    if (duration === null) continue;

    // The page separates the two boundaries with a tilde. Everything else about
    // the line — both years stated, trailing zone — `parseFullRange` already
    // reads, and it returns null rather than inferring a missing half.
    const range = parseFullRange(text(duration[1] ?? "").replace(/~/g, "-"));
    if (range === null) continue;
    if (range.end.iso <= range.start.iso) continue;

    // "Ongoing" is maintained by hand and goes stale before anyone moves a row,
    // so the heading vouching for an event is not enough on its own.
    if (Date.parse(range.end.iso) < nowMs) continue;

    out.push({
      id: eventId(ctx.game, title, range.start.iso),
      game: ctx.game,
      title,
      type: inferType(title),
      summary: null,
      startsAt: range.start.iso,
      startPrecision: range.start.precision,
      endsAt: range.end.iso,
      endPrecision: range.end.precision,
      // One worldwide server on Pacific time — the `PDT` on every duration is
      // the evidence — so there is no per-region end to scope.
      regionScoped: false,
      regionEnds: null,
      sourceUrl: new URL(link[1] ?? "", ctx.sourceUrl).toString(),
      sourceId: ctx.sourceId,
      status: "published",
      confidence: 0.95,
      extractionMethod: "parser",
      version: 1,
      firstSeenAt: ctx.now,
      updatedAt: ctx.now,
    });
  }

  return out;
}

export function parseFandomEventsPage(
  body: string,
  ctx: ParseContext,
): GachaEvent[] {
  const rendered = renderedHtml(body);
  if (rendered === null) return [];

  // Two Fandom wikis, two page templates, one host family — the same split
  // `game8.ts` carries for seven shapes. The divider layout is what tells them
  // apart, and `canParse` asserts it, so a template change fails the source
  // loudly instead of routing an FGO page through the `Time Period` reader and
  // emptying the lane.
  if (isFgoEventList(rendered)) {
    return parseFgoOngoingEvents(rendered, ctx).sort((a, b) =>
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
    const isTimePeriodTable =
      /class="[^"]*wikitable/.test(rendered) && /Time Period/i.test(rendered);
    return isTimePeriodTable || isFgoEventList(rendered);
  },
  parse: parseFandomEventsPage,
};
