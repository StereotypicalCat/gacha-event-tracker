import { eventId, type GachaEvent } from "../../shared/schema.ts";
import { latestBoundaryMs } from "../../shared/time.ts";
import { parseMonthDayYear, type ParsedInstant } from "../dates.ts";
import { text } from "../html.ts";
import type { ParseContext } from "../adapters/types.ts";
import { renderedHtml } from "./fandom.ts";
import type { SourceParser } from "./types.ts";

/**
 * Fandom's dated *history table* — the template behind the battle-pass pages
 * (`Nameless_Honor`, and next `New_Eridu_City_Fund` and `Miliastra_Pass`).
 *
 * It shares nothing with the event pages `fandom.ts` reads: there is no section
 * fence and no "ongoing" heading, only one `article-table` with a row per past
 * and current run of the pass —
 *
 *   Image | Name | Start | End | Version
 *
 * — whose Start and End cells print a bare date (`September 28, 2026`). The
 * cells also carry a `data-sort-value` with a clock (`2026-09-28 11:00:00`),
 * which is deliberately **not read**: the page states no zone for it, and the
 * visible text is the only claim the editors made. Every event is therefore
 * day precision, as in the Infinity Nikki reader (AGENTS.md § Fandom).
 *
 * Because the table is a history, inclusion is decided against `ctx.now` and
 * nothing else: a row whose end has passed is skipped, a current or upcoming
 * row is emitted. A row without a readable end is skipped, never given one.
 *
 * ## Adding the next source
 *
 * Reuse is one `PASS_SOURCES` entry below plus one `SOURCES` entry. Columns are
 * found by their *headings*, not by position, so a page that drops the Image
 * column or the Version column still reads. The entry says how that source
 * titles an event: a constant for a pass with one name, or a function of the
 * row's own name cell (`Miliastra Pass: <name>`). A source id with no entry
 * here emits nothing — a missing title is skipped rather than guessed.
 */

/** How one source titles the events it reads from a history table. */
export interface PassSource {
  /** The wiki's own words for what this page lists, for the doc and the log. */
  readonly pass: string;
  /** The event title, given the row's Name cell (already tag-stripped). */
  title(rowName: string): string;
}

/** Keyed by source id, because the title is a fact about the source. */
export const PASS_SOURCES: Readonly<Record<string, PassSource>> = {
  "hsr-fandom-nameless-honor": {
    // The Name cell reads `Nameless Honor 2026-09-28` — the run's dated
    // subpage, which `eventId` already carries as the start. Constant title.
    pass: "Nameless Honor",
    title: () => "Nameless Honor",
  },
  "genshin-fandom-miliastra-pass": {
    // The Name cell is the run's own chronicle name (`Silvery Moonlight
    // Chronicle`), a new one each version, so the title carries it.
    pass: "Miliastra Pass",
    title: (rowName) => `Miliastra Pass: ${rowName}`,
  },
};

/** The columns a pass table is recognised by, as normalised heading text. */
const NAME_HEADINGS = new Set(["name", "pass", "pass name", "event"]);

interface Columns {
  name: number;
  start: number;
  end: number;
}

interface Table {
  columns: Columns;
  rows: string[][];
  /** The anchor in each row's Name cell, for `sourceUrl`; `null` when absent. */
  links: Array<string | null>;
}

function cells(row: string, tag: "th" | "td"): string[] {
  return [
    ...row.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "gi")),
  ].map((c) => c[1] ?? "");
}

/**
 * Every table on the page whose headings are `Name | Start | End` (any order,
 * any extra columns except `Duration`).
 *
 * `Duration` is the one exclusion, and it is structural: the Version page
 * (Infinity Nikki's) also heads a table `Name | Version | Start | End`, but
 * adds a `Duration` column, and that table is a different template with a
 * different reader — it dates a *version*, not a pass.
 */
function passTables(rendered: string): Table[] {
  const out: Table[] = [];

  for (const table of rendered.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const body = table[1] ?? "";
    // A nested table would cut this match short and shift every column.
    if (/<table\b/i.test(body)) continue;

    const rowHtml = body.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];
    const head = rowHtml[0];
    if (head === undefined) continue;

    const headings = cells(head, "th").map((h) =>
      text(h).toLowerCase().replace(/\s+/g, " "),
    );
    if (headings.includes("duration")) continue;

    const name = headings.findIndex((h) => NAME_HEADINGS.has(h));
    const start = headings.indexOf("start");
    const end = headings.indexOf("end");
    if (name === -1 || start === -1 || end === -1) continue;

    // Row cells only line up with the headings when the row has the same
    // number of them: a rowspan'd or short row is skipped, not realigned.
    const width = headings.length;
    const rows: string[][] = [];
    const links: Array<string | null> = [];
    for (const row of rowHtml.slice(1)) {
      const raw = cells(row, "td");
      if (raw.length !== width) continue;
      rows.push(raw);
      links.push(/<a\b[^>]*\bhref="([^"]+)"/i.exec(raw[name] ?? "")?.[1] ?? null);
    }

    out.push({ columns: { name, start, end }, rows, links });
  }

  return out;
}

/** A cell that is exactly one `Month D, YYYY` date and nothing else. */
function wholeDate(cell: string): ParsedInstant | null {
  const value = text(cell);
  if (!/^[A-Za-z]+\.? \d{1,2}, \d{4}$/.test(value)) return null;
  return parseMonthDayYear(value);
}

/**
 * The wiki page the source reads, as a URL, from the API URL's `page=`.
 * Pure, and only used when a row's own Name cell carries no link.
 */
function pageUrl(sourceUrl: string): string {
  const url = new URL(sourceUrl);
  const page = url.searchParams.get("page");
  return page === null
    ? url.origin
    : `${url.origin}/wiki/${encodeURIComponent(page).replace(/%2F/g, "/")}`;
}

export function parseFandomHistoryTable(
  body: string,
  ctx: ParseContext,
): GachaEvent[] {
  const source = PASS_SOURCES[ctx.sourceId];
  if (source === undefined) return [];

  const rendered = renderedHtml(body);
  if (rendered === null) return [];

  const nowMs = Date.parse(ctx.now);
  const out: GachaEvent[] = [];

  for (const table of passTables(rendered)) {
    const { name, start, end } = table.columns;

    table.rows.forEach((row, i) => {
      const rowName = text(row[name] ?? "");
      if (rowName === "") return;

      const startsAt = wholeDate(row[start] ?? "");
      const endsAt = wholeDate(row[end] ?? "");
      // No readable end is not an open end here: a history row is one run of a
      // pass, and a run with no stated end is skipped rather than guessed.
      if (startsAt === null || endsAt === null) return;
      if (endsAt.iso <= startsAt.iso) return;

      // `latestBoundaryMs`, not `Date.parse`: the end is day precision, and the
      // raw value is UTC midnight — a placeholder the countdown resolves to the
      // reader's own reset (AGENTS.md § Domain rules). Retiring the row on the
      // placeholder would drop a pass hours before the game does.
      if (latestBoundaryMs(endsAt.iso, endsAt.precision, ctx.game) < nowMs) {
        return;
      }

      const title = source.title(rowName);
      const href = table.links[i];
      out.push({
        id: eventId(ctx.game, title, startsAt.iso),
        game: ctx.game,
        title,
        type: "other",
        summary: null,
        startsAt: startsAt.iso,
        startPrecision: startsAt.precision,
        endsAt: endsAt.iso,
        endPrecision: endsAt.precision,
        // The page prints a date and no clock or server; nothing here is per
        // region, and nothing is invented to make it so.
        regionScoped: false,
        regionEnds: null,
        sourceUrl:
          href === null || href === undefined
            ? pageUrl(ctx.sourceUrl)
            : new URL(href, ctx.sourceUrl).toString(),
        sourceId: ctx.sourceId,
        status: "published",
        confidence: 0.85,
        extractionMethod: "parser",
        version: 1,
        firstSeenAt: ctx.now,
        updatedAt: ctx.now,
      });
    });
  }

  return out;
}

export const fandomTableParser: SourceParser = {
  id: "fandomtable",
  label: "Fandom dated history table",
  canParse(body: string): boolean {
    // Structural: an `action=parse` envelope holding a table headed
    // `Name | Start | End`. Never a row, so a pass page that is between runs
    // still identifies itself.
    const rendered = renderedHtml(body);
    return rendered !== null && passTables(rendered).length > 0;
  },
  parse: parseFandomHistoryTable,
};
