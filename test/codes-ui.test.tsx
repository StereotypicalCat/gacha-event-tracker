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
