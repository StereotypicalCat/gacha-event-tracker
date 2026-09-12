import {
  eventId,
  type EventType,
  type GachaEvent,
} from "../../shared/schema.ts";
import { parseWeekdayDayMonthYearUtc } from "../dates.ts";
import { decodeEntities } from "../html.ts";
import type { ParseContext } from "../adapters/types.ts";
import { inferType } from "./game8.ts";
import type { SourceParser } from "./types.ts";

/**
 * Karendar: Punishing: Gray Raven community event calendar (karendar.com).
 *
 * Sourced directly from the server-rendered HTML of the home page.
 *
 * Key details:
 * 1. All published times are for the Global server in UTC with explicit minute
 *    precision ("Mon, 7 Sept 2026, 07:00 UTC").
 * 2. Active sections are `week` ("Ends this week"), `ongoing` ("On-going"),
 *    and `upcoming` ("Upcoming"). The site moves events that end in the current
 *    week into `week` instead of duplicating them in `ongoing`.
 * 3. `archive` holds past ended events and is deliberately skipped.
 * 4. `tbc` holds unannounced events whose dates are "Unknown" for both start and
 *    end. Skipped because startsAt is unknown.
 * 5. `codes` holds in-game redemption codes, not time-boxed calendar events.
 * 6. "Permanent" or "Unknown" ends become `endsAt: null` with `endPrecision: "unknown"`.
 */

const ACTIVE_SECTIONS = ["week", "ongoing", "upcoming"];

function inferKarendarType(tags: string[], title: string): EventType {
  const t = tags.map((x) => x.toLowerCase());
  const titleLower = title.toLowerCase();

  if (
    t.includes("maintenance") ||
    t.includes("patch end") ||
    titleLower.includes("maintenance")
  ) {
    return "maintenance";
  }
  if (titleLower.includes("rerun") || t.includes("rerun")) {
    return "rerun";
  }
  if (
    t.includes("banner") ||
    t.includes("construct") ||
    t.includes("cub") ||
    t.includes("weapon") ||
    /\b(rate-up|banner)\b/i.test(title)
  ) {
    return "banner";
  }
  if (/\b(sign-in|login|check-in)\b/i.test(title)) {
    return "login";
  }
  if (t.includes("story") || t.includes("affection")) {
    return "story";
  }
  if (t.includes("combat") || t.includes("challenge") || t.includes("boss")) {
    return "challenge";
  }
  if (
    t.includes("shop") ||
    t.includes("coating") ||
    t.includes("weapon coating")
  ) {
    return "shop";
  }
  return inferType(`${tags.join(" ")} ${title}`);
}

export function parseKarendarEventsPage(
  html: string,
  ctx: ParseContext,
): GachaEvent[] {
  const events: GachaEvent[] = [];

  for (const secId of ACTIVE_SECTIONS) {
    const secMarker = `id="${secId}"`;
    const secStart = html.indexOf(secMarker);
    if (secStart === -1) continue;

    const nextSecStart = html.indexOf("<section id=", secStart + secMarker.length);
    const sectionChunk = html.slice(
      secStart,
      nextSecStart !== -1 ? nextSecStart : undefined,
    );

    const articleChunks = sectionChunk
      .split("<article ")
      .slice(1)
      .map((a) => "<article " + a.split("</article>")[0] + "</article>");

    for (const article of articleChunks) {
      const titleMatch = /<h3[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/.exec(article);
      if (!titleMatch || !titleMatch[1]) continue;
      const title = decodeEntities(titleMatch[1].trim());
      if (!title) continue;

      const startMatch = /<dt[^>]*>Start<\/dt>\s*<dd[^>]*>([^<]+)<\/dd>/.exec(
        article,
      );
      if (!startMatch || !startMatch[1]) continue;
      const startInstant = parseWeekdayDayMonthYearUtc(startMatch[1].trim());
      if (startInstant === null) continue;

      const endMatch = /<dt[^>]*>End<\/dt>\s*<dd[^>]*>([^<]+)<\/dd>/.exec(article);
      const endRaw = endMatch?.[1]?.trim() ?? "Unknown";
      const isIndefinite =
        endRaw === "Permanent" ||
        endRaw === "Unknown" ||
        endRaw.toLowerCase() === "tba" ||
        endRaw.toLowerCase() === "tbd";
      const endInstant = isIndefinite
        ? null
        : parseWeekdayDayMonthYearUtc(endRaw);

      const tagMatches = [
        ...article.matchAll(
          /<span class="rounded-full px-2 py-0\.5 text-xs font-medium[^"]*">([^<]+)<\/span>/g,
        ),
      ];
      const tags = tagMatches.map((m) => decodeEntities((m[1] ?? "").trim()));

      const descMatch = /<p class="mt-1 text-sm text-muted">([\s\S]*?)<\/p>/.exec(
        article,
      );
      const summary =
        descMatch && descMatch[1] && descMatch[1].trim().length > 0
          ? decodeEntities(descMatch[1].trim()).slice(0, 500)
          : null;

      let confidence = 0.95;
      if (startInstant.precision === "day") confidence -= 0.05;
      if (endInstant === null) confidence -= 0.15;
      else if (endInstant.precision === "day") confidence -= 0.05;

      const ev: GachaEvent = {
        id: eventId(ctx.game, title, startInstant.iso),
        game: ctx.game,
        title,
        type: inferKarendarType(tags, title),
        summary,
        startsAt: startInstant.iso,
        startPrecision: startInstant.precision,
        endsAt: endInstant ? endInstant.iso : null,
        endPrecision: endInstant ? endInstant.precision : "unknown",
        regionScoped: false,
        regionEnds: null,
        sourceUrl: ctx.sourceUrl,
        sourceId: ctx.sourceId,
        status: "published",
        confidence,
        extractionMethod: "parser",
        version: 1,
        firstSeenAt: ctx.now,
        updatedAt: ctx.now,
      };

      events.push(ev);
    }
  }

  return events.sort((a, b) =>
    a.startsAt === b.startsAt
      ? a.id.localeCompare(b.id)
      : a.startsAt.localeCompare(b.startsAt),
  );
}

export const karendarParser: SourceParser = {
  id: "karendar",
  label: "Karendar",
  canParse(html: string): boolean {
    return (
      /id=['"]ongoing['"]/.test(html) &&
      /id=['"]upcoming['"]/.test(html) &&
      /karendar/i.test(html)
    );
  },
  parse: parseKarendarEventsPage,
};
