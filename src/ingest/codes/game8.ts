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
