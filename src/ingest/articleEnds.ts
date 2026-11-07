import { Region, type GachaEvent } from "../shared/schema.ts";
import { REGION_RESET_UTC_OFFSET } from "../shared/time.ts";
import { text } from "./html.ts";

/**
 * The end a Genshin event's own wiki article states.
 *
 * Fandom's `Event` table prints a date, and the same printed date can mean 03:59
 * server time, 14:59 server time or one instant worldwide. So the table cannot
 * settle the time and the article's infobox can
 * (docs/superpowers/specs/2026-11-07-exact-end-times-design.md). Pure and
 * offline: fetching these is `scripts/refresh-articles.ts`'s job.
 */
export interface StatedEnd {
  /** The calendar date as printed, `YYYY-MM-DD`, for comparing with the table. */
  day: string;
  /** The instant, or the earliest region's: never promise more than a region gets. */
  endsAt: string;
  regionEnds: Record<Region, string> | null;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December",
];

const END_CELL = /<td\b[^>]*data-source="time_end"[^>]*>([\s\S]*?)<\/td>/i;
const PRINTED =
  /^([A-Z][a-z]+) (\d{1,2}), (\d{4}) (\d{1,2}):(\d{2}) (\(Server Time\)|GMT\+8)$/;

const HOUR_MS = 60 * 60 * 1000;

/** `body` is the API's JSON response. Anything but a stated time is `null`. */
export function parseArticleEnd(body: string): StatedEnd | null {
  let rendered: unknown;
  try {
    rendered = (JSON.parse(body) as { parse?: { text?: unknown } } | null)?.parse?.text;
  } catch {
    return null;
  }
  if (typeof rendered !== "string") return null;

  const cell = END_CELL.exec(rendered)?.[1];
  if (cell === undefined) return null;
  const printed = PRINTED.exec(text(cell));
  if (printed === null) return null;

  const [, monthName, dayText, yearText, hourText, minuteText, zone] = printed;
  const month = MONTHS.indexOf(monthName ?? "");
  const day = Number(dayText);
  const year = Number(yearText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (month < 0 || hour > 23 || minute > 59) return null;

  const wall = Date.UTC(year, month, day, hour, minute);
  // Date.UTC rolls 45 December into January rather than refusing it.
  if (new Date(wall).getUTCDate() !== day) return null;
  const printedDay = new Date(wall).toISOString().slice(0, 10);
  const at = (offsetHours: number) => new Date(wall - offsetHours * HOUR_MS).toISOString();

  if (zone === "GMT+8") return { day: printedDay, endsAt: at(8), regionEnds: null };

  const regionEnds = {
    asia: at(REGION_RESET_UTC_OFFSET.asia),
    america: at(REGION_RESET_UTC_OFFSET.america),
    europe: at(REGION_RESET_UTC_OFFSET.europe),
  };
  const endsAt = Object.values(regionEnds).sort()[0] ?? at(REGION_RESET_UTC_OFFSET.asia);
  return { day: printedDay, endsAt, regionEnds };
}

/** The decoded page title of a Genshin wiki article's URL, else `null`. */
export function articleTitle(sourceUrl: string): string | null {
  try {
    const url = new URL(sourceUrl);
    if (url.hostname !== "genshin-impact.fandom.com") return null;
    if (!url.pathname.startsWith("/wiki/")) return null;
    const title = decodeURIComponent(url.pathname.slice("/wiki/".length));
    return title.length === 0 ? null : title;
  } catch {
    return null;
  }
}

/** The instant a stated end has passed for every reader, whatever their region. */
export function latestStatedMs(end: StatedEnd): number {
  const all = end.regionEnds === null ? [end.endsAt] : Object.values(end.regionEnds);
  return Math.max(...all.map((iso) => Date.parse(iso)));
}

/**
 * Write stated ends onto the merged rows. After the merge on purpose: it keeps
 * the higher-confidence copy, which for several rows is Game8's day-precision one.
 *
 * `listed` is the Fandom parse before merging, the only place a row's article
 * link and its table date survive. Only the four end fields ever change: `id` and
 * `startsAt` are a reader's localStorage key.
 */
export function applyArticleEnds(
  merged: GachaEvent[],
  listed: GachaEvent[],
  ends: ReadonlyMap<string, StatedEnd>,
  warn: (line: string) => void,
): GachaEvent[] {
  const byId = new Map<string, { end: StatedEnd; tableDay: string | undefined }>();
  for (const row of listed) {
    const title = articleTitle(row.sourceUrl);
    const end = title === null ? undefined : ends.get(title);
    if (end !== undefined) byId.set(row.id, { end, tableDay: row.endsAt?.slice(0, 10) });
  }

  return merged.map((event) => {
    const found = [event.id, ...(event.mergedIds ?? [])]
      .map((id) => byId.get(id))
      .find((f) => f !== undefined);
    if (found === undefined) return event;
    // Another source stated this end to the minute; an article does not outrank it.
    if (event.endPrecision !== "day") return event;

    const { end, tableDay } = found;
    if (tableDay !== end.day || event.endsAt?.slice(0, 10) !== end.day) {
      warn(
        `"${event.title}": article says ${end.day}, table ${tableDay ?? "none"}, ` +
          `row ${event.endsAt?.slice(0, 10) ?? "none"}; keeping the row's date`,
      );
      return event;
    }
    return {
      ...event,
      endsAt: end.endsAt,
      endPrecision: "exact" as const,
      regionScoped: end.regionEnds !== null,
      regionEnds: end.regionEnds,
    };
  });
}
