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

/**
 * Game8's per-game codes pages share the copy-input markup but not their
 * headings or columns, so this reads one page by the heading of its "active
 * codes" section (an h2 runs to the next h2, an h3 to the next h2/h3).
 *
 * Within that section, a table counts only if it carries copy inputs and does
 * not say its codes have expired — Wuthering Waves keeps an expired table at the
 * top of its active section. A row's reward is its other cells, or for a single
 * cell that holds both (Wuthering Waves, P5X) the cell's text after the code.
 * Expiry is left null: these pages print "Expires TBA" or a range without a
 * year, and a guessed year is a fabricated date.
 *
 * A missing heading throws (the page changed shape). A section with no code
 * tables returns nothing; whether that is stored is `statesNoCodes`' call.
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
  for (const table of section.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    if (!/a-clipboard__textInput/.test(table[1]!)) continue;
    if (/\bexpired\b/i.test(text(table[1]!))) continue;
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
      codes.set(id, {
        id,
        game: ctx.game,
        code,
        reward: tidy || null,
        expiresAt: null,
        sourceUrl: ctx.sourceUrl,
      });
    }
  }
  return [...codes.values()];
}
