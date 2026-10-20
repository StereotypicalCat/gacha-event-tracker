import type { CodesFeed, RedeemCode } from "../../shared/codes.ts";
import type { CodeCheck } from "../../shared/codeChecks.ts";
export function buildCodesFeed(
  previous: CodesFeed | null,
  parsed: readonly Omit<RedeemCode, "firstObservedAt">[],
  at: string,
): CodesFeed {
  const first = new Map(previous?.codes.map((c) => [c.id, c.firstObservedAt]));
  return {
    schemaVersion: 1,
    codes: parsed.map((c) => ({
      ...c,
      firstObservedAt: first.get(c.id) ?? at,
    })),
    sources: previous?.sources ?? [],
  };
}
/**
 * Stamps each code the owner confirmed dead (`codeChecks.ts`) and returns the
 * checks that matched no code, for the build to report.
 */
export function applyCodeChecks(
  codes: readonly RedeemCode[],
  checks: readonly CodeCheck[],
): { codes: RedeemCode[]; unmatched: CodeCheck[] } {
  const byId = new Map(
    checks.map((c) => [JSON.stringify([c.game, c.code]), c]),
  );
  const seen = new Set<string>();
  const stamped = codes.map((c) => {
    const check = byId.get(c.id);
    if (!check) return c;
    seen.add(c.id);
    return { ...c, confirmedDead: check.checked };
  });
  return {
    codes: stamped,
    unmatched: checks.filter(
      (c) => !seen.has(JSON.stringify([c.game, c.code])),
    ),
  };
}
