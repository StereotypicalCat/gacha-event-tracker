import { text, decodeEntities } from "../html.ts";
import type { ParseContext } from "../adapters/types.ts";
import type { RedeemCode } from "../../shared/codes.ts";
function parseLatest(
  html: string,
  ctx: ParseContext,
): Omit<RedeemCode, "firstObservedAt">[] {
  const heading = /<h[23]\b[^>]*>\s*Latest Redeem Codes\s*<\/h[23]>/i.exec(
    html,
  );
  if (!heading)
    throw new Error("The current codes section could not be identified");
  const after = html.slice(heading.index + heading[0].length),
    end = after.search(/<h[23]\b/i),
    section = end < 0 ? after : after.slice(0, end);
  const table = /<table\b[^>]*>([\s\S]*?)<\/table>/i.exec(section);
  if (
    !table ||
    !/<th\b[^>]*>\s*Redeem Codes\s*<\/th>/i.test(table[0]) ||
    !/<th\b[^>]*>\s*Rewards\s*<\/th>/i.test(table[0])
  )
    throw new Error("The codes table has changed shape");
  const codes = new Map<string, Omit<RedeemCode, "firstObservedAt">>();
  for (const tr of table[1]!.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...tr[1]!.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)];
    if (!cells.length) continue;
    const input =
      /<input\b(?=[^>]*\bclass=["'][^"']*a-clipboard__textInput)(?=[^>]*\bvalue=["']([^"']+)["'])[^>]*>/i.exec(
        cells[0]![1]!,
      );
    if (!input) throw new Error("A current-code row has no readable code");
    const code = decodeEntities(input[1]!).trim();
    if (!code || code.length > 100) throw new Error("Invalid code text");
    const reward = cells[1] ? text(cells[1][1]!) : null;
    const id = JSON.stringify([ctx.game, code]);
    codes.set(id, {
      id,
      game: ctx.game,
      code,
      reward: reward || null,
      expiresAt: null,
      sourceUrl: ctx.sourceUrl,
    });
  }
  return [...codes.values()];
}

export function parseGame8Codes(
  html: string,
  ctx: ParseContext,
): Omit<RedeemCode, "firstObservedAt">[] {
  const codes = new Map(parseLatest(html, ctx).map((c) => [c.id, c]));
  const heading = /<h2\b[^>]*>\s*[\d.]+ Special Program Codes\s*<\/h2>/i.exec(
    html,
  );
  if (heading) {
    const after = html.slice(heading.index + heading[0].length),
      end = after.search(/<h2\b/i),
      section = end < 0 ? after : after.slice(0, end);
    const expiry =
      /cannot be redeemed after\s+([A-Z][a-z]+ \d{1,2}, \d{4})/.exec(
        text(section),
      );
    const expired =
      expiry &&
      Number.isFinite(Date.parse(expiry[1]! + " 00:00:00 GMT")) &&
      Date.parse(ctx.now) >=
        Date.parse(expiry[1]! + " 00:00:00 GMT") + 2 * 86400000;
    if (!expired) {
      for (const table of section.matchAll(
        /<table\b[^>]*>[\s\S]*?<\/table>/gi,
      )) {
        if (!/Global Codes/.test(table[0])) continue;
        const transformed =
          "<h3>Latest Redeem Codes</h3>" +
          table[0].replace("Global Codes", "Redeem Codes");
        for (const code of parseLatest(transformed, ctx)) {
          if (
            expiry &&
            Number.isFinite(Date.parse(expiry[1]! + " 00:00:00 GMT"))
          )
            code.expiresOn = new Date(Date.parse(expiry[1]! + " 00:00:00 GMT"))
              .toISOString()
              .slice(0, 10);
          codes.set(code.id, code);
        }
      }
    }
  }
  return [...codes.values()];
}

const EXTRA_CODE_HEADING =
  /\b(?:livestream|special\s+program)\s+codes?\b|^(?:all\s+.+?\s+)?(?:version\s+)?\d+\.\d+\s+codes?\b/i;

const PAST_EXPIRED_PROSE =
  /\b(?:expired\s+(?:on|at)|(?:has|have|are|is)\s+expired)\b/i;

const EXPIRY_DATE_PROSE =
  /(?:cannot be redeemed after|expires?\s+(?:on|at)|until)\s+([A-Z][a-z]+\.?\s+\d{1,2},?\s+\d{4})(?:\s*(?:at\s+)?(\d{1,2}):(\d{2})\s*(AM|PM)?\s*\(?\s*(?:UTC|GMT)\s*([+-]\d{1,2})(?::?(\d{2}))?\s*\)?)?/i;

type SectionExpiry =
  | { status: "expired" }
  | { status: "open"; expiresAt: string | null; expiresOn?: string };

/**
 * Reads an explicit expiry statement from a livestream/version section's prose.
 * Returns "expired" when the prose already states past-tense expiry or the
 * stated deadline has passed relative to `nowIso`.
 */
function parseSectionExpiry(plainText: string, nowIso: string): SectionExpiry {
  if (PAST_EXPIRED_PROSE.test(plainText)) return { status: "expired" };
  const match = EXPIRY_DATE_PROSE.exec(plainText);
  if (!match) return { status: "open", expiresAt: null };
  const cleanedDate = match[1]!
    .replace(/\./g, "")
    .replace(/(\d{1,2})\s+(\d{4})/, "$1, $2");
  const dayUtcMs = Date.parse(`${cleanedDate} 00:00:00 GMT`);
  if (!Number.isFinite(dayUtcMs)) return { status: "open", expiresAt: null };
  const nowMs = Date.parse(nowIso);

  if (match[2] && match[3] && match[5]) {
    const rawHour = Number(match[2]);
    const minute = Number(match[3]);
    const ampm = match[4]?.toUpperCase();
    const hour = ampm
      ? (rawHour % 12) + (ampm === "PM" ? 12 : 0)
      : rawHour;
    const offsetHours = Number(match[5]);
    const offsetMins = match[6] ? Number(match[6]) : 0;
    if (
      hour >= 0 &&
      hour <= 23 &&
      minute >= 0 &&
      minute <= 59 &&
      Math.abs(offsetHours) <= 14 &&
      offsetMins < 60
    ) {
      const sign = offsetHours < 0 ? -1 : 1;
      const offsetTotalMins = sign * (Math.abs(offsetHours) * 60 + offsetMins);
      const instantMs =
        dayUtcMs + (hour * 60 + minute - offsetTotalMins) * 60_000;
      if (Number.isFinite(nowMs) && instantMs <= nowMs)
        return { status: "expired" };
      return { status: "open", expiresAt: new Date(instantMs).toISOString() };
    }
  }

  if (Number.isFinite(nowMs) && nowMs >= dayUtcMs + 2 * 86_400_000)
    return { status: "expired" };
  return {
    status: "open",
    expiresAt: null,
    expiresOn: new Date(dayUtcMs).toISOString().slice(0, 10),
  };
}

function isExtraCodeHeading(title: string): boolean {
  return !/\bexpired\b/i.test(title) && EXTRA_CODE_HEADING.test(title);
}

function readCodeTables(
  sectionHtml: string,
  ctx: ParseContext,
  options: { skipCn?: boolean } = {},
): Omit<RedeemCode, "firstObservedAt">[] {
  const out: Omit<RedeemCode, "firstObservedAt">[] = [];
  for (const table of sectionHtml.matchAll(
    /<table\b[^>]*>([\s\S]*?)<\/table>/gi,
  )) {
    if (!/a-clipboard__textInput/.test(table[1]!)) continue;
    const tableText = text(table[1]!);
    if (/\bexpired\b/i.test(tableText)) continue;
    if (options.skipCn && /\b(?:CN|Chinese)\s+Codes?\b/i.test(tableText))
      continue;
    for (const tr of table[1]!.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...tr[1]!.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(
        (c) => c[1]!,
      );
      const at = cells.findIndex((c) => /a-clipboard__textInput/.test(c));
      if (at < 0) continue;
      const input =
        /<input\b(?=[^>]*\bclass=["'][^"']*a-clipboard__textInput)(?=[^>]*\bvalue=["']([^"']+)["'])[^>]*>/i.exec(
          cells[at]!,
        );
      if (!input) throw new Error("A current-code row has no readable code");
      const code = decodeEntities(input[1]!).trim();
      if (!code || code.length > 100) throw new Error("Invalid code text");
      const others = cells.filter((_, i) => i !== at);
      // A date column (P5X's "Date Added") is not the reward.
      const rewardCells = others.filter(
        (c) => !/^\s*\d{2}\/\d{2}\/\d{4}\s*$/.test(text(c)),
      );
      const reward = rewardCells.length
        ? rewardCells.map((c) => text(c)).join(" ")
        : text(cells[at]!)
            .replace(/^\s*Copied\s*/i, "")
            .trim();
      // NTE and CZN list rewards as "・ A ・ B" / "• A"; read them as a list.
      const tidy = reward
        .replace(/\s*[・•]\s*/g, ", ")
        .replace(/^,\s*/, "")
        .trim();
      const id = JSON.stringify([ctx.game, code]);
      out.push({
        id,
        game: ctx.game,
        code,
        reward: tidy || null,
        expiresAt: null,
        sourceUrl: ctx.sourceUrl,
      });
    }
  }
  return out;
}

function readExtraSectionTables(
  sectionHtml: string,
  ctx: ParseContext,
): Omit<RedeemCode, "firstObservedAt">[] {
  const parts = sectionHtml.split(/(?=<h3\b)/i);
  const out: Omit<RedeemCode, "firstObservedAt">[] = [];
  for (const part of parts) {
    const h3 = /^<h3\b[^>]*>([\s\S]*?)<\/h3>/i.exec(part);
    if (h3) {
      const title = text(h3[1]!);
      if (/\b(?:expired|CN|Chinese)\b/i.test(title)) continue;
    }
    out.push(...readCodeTables(part, ctx, { skipCn: true }));
  }
  return out;
}

/**
 * Game8's per-game codes pages share the copy-input markup but not their
 * headings or columns, so this reads one page by the heading of its "active
 * codes" section (an h2 runs to the next h2, an h3 to the next h2/h3), and also
 * picks up separate version/livestream h2 sections when their stated expiry has
 * not passed.
 *
 * Within each section, a table counts only if it carries copy inputs and does
 * not say its codes have expired — Wuthering Waves keeps an expired table at the
 * top of its active section. A row's reward is its other cells, or for a single
 * cell that holds both (Wuthering Waves, P5X) the cell's text after the code.
 * Expiry is left null unless an extra livestream/version section states one.
 *
 * A missing primary heading throws (the page changed shape). A section with no
 * code tables returns nothing; whether that is stored is `statesNoCodes`' call.
 */
export function parseGame8CodeTable(
  html: string,
  ctx: ParseContext,
  heading: RegExp,
): Omit<RedeemCode, "firstObservedAt">[] {
  const found = [...html.matchAll(/<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].find(
    (m) => heading.test(text(m[2]!)),
  );
  if (!found)
    throw new Error("The current codes section could not be identified");
  const after = html.slice(found.index! + found[0].length),
    end = after.search(found[1] === "2" ? /<h2\b/i : /<h[23]\b/i),
    section = end < 0 ? after : after.slice(0, end);
  const codes = new Map<string, Omit<RedeemCode, "firstObservedAt">>();
  for (const code of readCodeTables(section, ctx)) {
    codes.set(code.id, code);
  }

  const primaryH2Index = found[1] === "2" ? found.index! : -1;
  for (const h2 of html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)) {
    if (h2.index === primaryH2Index) continue;
    if (!isExtraCodeHeading(text(h2[1]!))) continue;
    const extraAfter = html.slice(h2.index! + h2[0].length);
    const extraEnd = extraAfter.search(/<h2\b/i);
    const extraSection =
      extraEnd < 0 ? extraAfter : extraAfter.slice(0, extraEnd);
    const expiry = parseSectionExpiry(text(extraSection), ctx.now);
    if (expiry.status === "expired") continue;
    for (const code of readExtraSectionTables(extraSection, ctx)) {
      const withExpiry: Omit<RedeemCode, "firstObservedAt"> = {
        ...code,
        expiresAt: expiry.expiresAt,
        ...(expiry.expiresOn ? { expiresOn: expiry.expiresOn } : {}),
      };
      const existing = codes.get(code.id);
      if (existing) {
        if (existing.expiresAt === null && !existing.expiresOn) {
          codes.set(code.id, {
            ...existing,
            expiresAt: expiry.expiresAt,
            ...(expiry.expiresOn ? { expiresOn: expiry.expiresOn } : {}),
          });
        }
      } else {
        codes.set(code.id, withExpiry);
      }
    }
  }
  return [...codes.values()];
}
