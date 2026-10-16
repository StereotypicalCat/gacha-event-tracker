import { eventId, type GachaEvent } from "../../shared/schema.ts";
import { latestBoundaryMs } from "../../shared/time.ts";
import { parseMonthDayYear, type ParsedInstant } from "../dates.ts";
import { text } from "../html.ts";
import type { ParseContext } from "../adapters/types.ts";
import { renderedHtml } from "./fandom.ts";
import type { SourceParser } from "./types.ts";

/**
 * Fandom's *version table* — Infinity Nikki's `Version` page, one table per
 * major version —
 *
 *   Version Name | Version Number | Release Date | End Date | Duration
 *
 * (`The Feather of Justice | 2.10 | September 23, 2026 | October 29, 2026 |
 * 36 Days`). It dates a **version**, not a pass. A pass is emitted from it only
 * where somebody has *stated* that the pass runs with the version, and that
 * statement is written down once, per source, in `VERSION_PASSES` below with
 * who made it and when. A source id with no entry emits nothing.
 *
 * This is the other half of `fandomTable.ts`: that reader takes a table headed
 * `Name | Start | End` and refuses one with a `Duration` heading; this one
 * requires the version headings and a `Duration`. The two cannot claim each
 * other's page.
 *
 * Cells print a bare date, so every event is day precision. Inclusion is
 * decided against `ctx.now` only: a row already ended is skipped, a current or
 * upcoming row is emitted, and a row without a readable end is skipped, never
 * given one.
 *
 * ## Reuse
 *
 * Another site's version page (Endfield's wiki.gg) is a different markup and
 * its own reader; what carries over is the *entry shape* — a title, the stated
 * link, and the evidence for it — so the claim lives beside the code that
 * relies on it.
 */

/** Who said the pass follows the version, and when: never inferred. */
export interface VersionLinkEvidence {
  /** `owner` (in game) or `wiki` (a sentence the source prints). */
  readonly by: "owner" | "wiki";
  /** ISO date of the reading or capture. */
  readonly on: string;
  /** What was seen, in the words of the person or the wiki. */
  readonly reading: string;
}

/** What one source claims about the pass and its version. */
export interface VersionPass {
  /** The event title. */
  readonly title: string;
  /** The sentence the summary closes with: the stated link, with its source. */
  readonly link: string;
  readonly evidence: VersionLinkEvidence;
}

/** Keyed by source id, because the claim is a fact about the source. */
export const VERSION_PASSES: Readonly<Record<string, VersionPass>> = {
  "nikki-fandom-mira-journey": {
    title: "Mira Journey",
    link: "That the pass ends with the version was confirmed in game, 2026-10-16.",
    evidence: {
      by: "owner",
      on: "2026-10-16",
      reading:
        "in game, the pass read 13d 19h at 00:47 UTC, ending 2026-10-29 with version 2.10",
    },
  },
};

interface VersionRow {
  name: string;
  number: string;
  start: ParsedInstant;
  end: ParsedInstant;
}

function cells(row: string, tag: "th" | "td"): string[] {
  return [
    ...row.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "gi")),
  ].map((c) => c[1] ?? "");
}

function wholeDate(cell: string): ParsedInstant | null {
  const value = text(cell);
  if (!/^[A-Za-z]+\.? \d{1,2}, \d{4}$/.test(value)) return null;
  return parseMonthDayYear(value);
}

/**
 * Every row of every table headed `Version Name | Version Number | Release
 * Date | End Date | Duration` (found by heading, any order). All five are
 * required: the Duration column is what marks this template.
 */
function versionRows(rendered: string): { tables: number; rows: VersionRow[] } {
  const rows: VersionRow[] = [];
  let tables = 0;

  for (const table of rendered.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const body = table[1] ?? "";
    if (/<table\b/i.test(body)) continue;
    const rowHtml = body.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];
    const head = rowHtml[0];
    if (head === undefined) continue;

    const headings = cells(head, "th").map((h) =>
      text(h).toLowerCase().replace(/\s+/g, " "),
    );
    const name = headings.indexOf("version name");
    const number = headings.indexOf("version number");
    const start = headings.indexOf("release date");
    const end = headings.indexOf("end date");
    if (
      name === -1 ||
      number === -1 ||
      start === -1 ||
      end === -1 ||
      !headings.includes("duration")
    ) {
      continue;
    }
    tables += 1;

    for (const row of rowHtml.slice(1)) {
      const raw = cells(row, "td");
      if (raw.length !== headings.length) continue;
      const startsAt = wholeDate(raw[start] ?? "");
      const endsAt = wholeDate(raw[end] ?? "");
      const rowName = text(raw[name] ?? "");
      const rowNumber = text(raw[number] ?? "");
      if (startsAt === null || endsAt === null) continue;
      if (rowName === "" || rowNumber === "") continue;
      rows.push({ name: rowName, number: rowNumber, start: startsAt, end: endsAt });
    }
  }

  return { tables, rows };
}

function pageUrl(sourceUrl: string): string {
  const url = new URL(sourceUrl);
  const page = url.searchParams.get("page");
  return page === null
    ? url.origin
    : `${url.origin}/wiki/${encodeURIComponent(page).replace(/%2F/g, "/")}`;
}

export function parseFandomVersionTable(
  body: string,
  ctx: ParseContext,
): GachaEvent[] {
  const pass = VERSION_PASSES[ctx.sourceId];
  if (pass === undefined) return [];

  const rendered = renderedHtml(body);
  if (rendered === null) return [];

  const nowMs = Date.parse(ctx.now);
  const out: GachaEvent[] = [];

  for (const row of versionRows(rendered).rows) {
    if (row.end.iso <= row.start.iso) continue;
    // Day-precision end: judged by the last moment any reset could put it at,
    // not the UTC-midnight placeholder (AGENTS.md § Domain rules).
    if (latestBoundaryMs(row.end.iso, row.end.precision, ctx.game) < nowMs) {
      continue;
    }

    out.push({
      id: eventId(ctx.game, pass.title, row.start.iso),
      game: ctx.game,
      title: pass.title,
      type: "other",
      summary: `Follows version ${row.number} (${row.name}). ${pass.link}`,
      startsAt: row.start.iso,
      startPrecision: row.start.precision,
      endsAt: row.end.iso,
      endPrecision: row.end.precision,
      regionScoped: false,
      regionEnds: null,
      sourceUrl: pageUrl(ctx.sourceUrl),
      sourceId: ctx.sourceId,
      status: "published",
      confidence: 0.85,
      extractionMethod: "parser",
      version: 1,
      firstSeenAt: ctx.now,
      updatedAt: ctx.now,
    });
  }

  return out;
}

export const fandomVersionParser: SourceParser = {
  id: "fandomversion",
  label: "Fandom version table",
  canParse(body: string): boolean {
    // Structural: an `action=parse` envelope holding a table headed with the
    // version columns and a Duration. Never a row.
    const rendered = renderedHtml(body);
    return rendered !== null && versionRows(rendered).tables > 0;
  },
  parse: parseFandomVersionTable,
};
