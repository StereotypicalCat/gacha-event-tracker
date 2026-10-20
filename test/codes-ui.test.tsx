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

test("a code confirmed dead in game says so, in the redeemed-or-expired section", () => {
  const at = "2026-10-20T12:00:00.000Z";
  const html = render(
    <CodesPage
      game="genshin"
      state={migrateLegacy({}, ["genshin"], at, () => "account:t")}
      onAction={async () => ({ ok: true })}
      feed={{
        schemaVersion: 1,
        sources: [],
        codes: [
          {
            id: "dead",
            game: "genshin",
            code: "DEAD",
            reward: null,
            expiresAt: null,
            confirmedDead: "2026-10-20",
            firstObservedAt: at,
            sourceUrl: "https://example.com",
          },
        ],
      }}
    />,
  );
  expect(html).toContain("Redeemed or expired");
  expect(html).toContain("Confirmed expired in game, 2026-10-20.");
});

import { codeLanes } from "../src/client/components/redesign/CodesPage.tsx";
test("a code just redeemed shines in the open list before it moves, then lands below", () => {
  const codes = ["a", "b", "c"].map((id) => ({ id }));
  const done = (c: { id: string }) => c.id !== "a";
  // "b" was just redeemed: it holds in the open list while it shines.
  const shining = codeLanes(codes, done, new Set(["b"]));
  expect(shining.open.map((c) => c.id)).toEqual(["a", "b"]);
  expect(shining.closed.map((c) => c.id)).toEqual(["c"]);
  expect(shining.used(codes[1]!)).toBe(false);
  // Then it lands among the redeemed, greyed like the rest.
  const landed = codeLanes(codes, done, new Set());
  expect(landed.open.map((c) => c.id)).toEqual(["a"]);
  expect(landed.closed.map((c) => c.id)).toEqual(["b", "c"]);
  expect(landed.used(codes[1]!)).toBe(true);
});

test("an opened Codes tab plays nothing: no row shines or lands on arrival", () => {
  const at = "2026-10-18T12:00:00.000Z",
    s = migrateLegacy({}, ["genshin"], at, () => "account:one");
  s.codeRedeemed["account:one"] = { done: at };
  const code = (id: string) => ({
    id,
    game: "genshin" as const,
    code: id.toUpperCase(),
    reward: null,
    expiresAt: null,
    firstObservedAt: at,
    sourceUrl: "https://example.com",
  });
  const html = render(
    <CodesPage
      game="genshin"
      state={s}
      onAction={async () => ({ ok: true })}
      feed={{
        schemaVersion: 1,
        sources: [],
        codes: [code("open"), code("done")],
      }}
    />,
  );
  expect(html).toContain("Redeemed or expired");
  expect(html).not.toContain("data-shine");
  expect(html).not.toContain("data-landing");
  expect(html).not.toContain("data-fresh");
});

test("a shining code greys its text, as a completed event does on its way out", async () => {
  const css = await Bun.file(
    new URL("../src/client/redesign.css", import.meta.url),
  ).text();
  const opacity = (selector: RegExp) =>
    new RegExp(
      selector.source + String.raw`\s*\{[^}]*opacity:\s*([\d.]+)`,
      "s",
    ).exec(css)?.[1];
  const event = opacity(/\.event-list > li\[data-leaving\] > button > span/);
  expect(event).toBe("0.45");
  expect(opacity(/\.code-row\[data-shine\] > div:first-child > \*/)).toBe(
    event,
  );
});
