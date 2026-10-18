import { expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import { CodesPage } from "../src/client/components/redesign/CodesPage.tsx";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";
import { createAccount } from "../src/client/state/reader/accounts.ts";
test("redemption controls identify each server and unknown expiry stays unknown", () => {
  const at = "2026-10-16T12:00:00.000Z",
    s = migrateLegacy({}, ["genshin"], at, () => "account:test");
  s.accounts["account:two"] = createAccount(
    "genshin",
    "asia",
    at,
    "account:two",
  );
  const html = render(
    <CodesPage
      game="genshin"
      state={s}
      onAction={async () => ({ ok: true })}
      feed={{
        schemaVersion: 1,
        sources: [],
        codes: [
          {
            id: "code",
            game: "genshin",
            code: "TEST",
            reward: null,
            expiresAt: null,
            firstObservedAt: at,
            sourceUrl: "https://example.com",
          },
        ],
      }}
    />,
  );
  expect(html).toContain("Redeemed · europe");
  expect(html).toContain("Redeemed · asia");
  expect(html).toContain("Expiry not announced");
  expect(html).toContain('href="https://example.com"');
});

import { REDEEM } from "../src/shared/redeem.ts";
test("every game with a codes source says where to redeem, linking only official pages", async () => {
  const { CODE_SOURCES } = await import("../src/ingest/codes/registry.ts");
  for (const s of CODE_SOURCES) {
    const r = REDEEM[s.game];
    expect(r?.inGame.length ?? 0).toBeGreaterThan(0);
    if (r?.url)
      expect(new URL(r.url).hostname).toMatch(/(^|\.)hoyoverse\.com$/);
  }
});

test("the Codes tab links the official redeem page, or gives the in-game route", () => {
  const at = "2026-10-18T12:00:00.000Z";
  const feed = { schemaVersion: 1 as const, codes: [], sources: [] };
  const page = (game: string) =>
    render(
      <CodesPage
        game={game}
        state={migrateLegacy({}, [game as "genshin"], at, () => "account:t")}
        onAction={async () => ({ ok: true })}
        feed={feed}
      />,
    );
  const genshin = page("genshin");
  expect(genshin).toContain('href="https://genshin.hoyoverse.com/en/gift"');
  expect(genshin).toContain("Or in game:");
  const wuwa = page("wuwa");
  expect(wuwa).not.toContain("Redeem on the official site");
  expect(wuwa).toContain("Redeem in game:");
  expect(wuwa).toContain("Other Settings");
});

test("with one server, a code's checkbox does not name it", () => {
  const at = "2026-10-18T12:00:00.000Z";
  const html = render(
    <CodesPage
      game="hsr"
      state={migrateLegacy({}, ["hsr"], at, () => "account:one")}
      onAction={async () => ({ ok: true })}
      feed={{
        schemaVersion: 1,
        sources: [],
        codes: [
          {
            id: '["hsr","OMEGA"]',
            game: "hsr",
            code: "OMEGA",
            reward: "Stellar Jade x60",
            expiresAt: null,
            firstObservedAt: at,
            sourceUrl:
              "https://game8.co/games/Honkai-Star-Rail/archives/410296",
          },
        ],
      }}
    />,
  );
  expect(html).toContain("Redeemed");
  expect(html).not.toContain("Redeemed · ");
});
