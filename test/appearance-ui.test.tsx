import { expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import { AppearancePage } from "../src/client/components/redesign/AppearancePage.tsx";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";
test("both interface choices, Custom schemes and routine disclosure are available together", () => {
  const s = migrateLegacy(
    {},
    [],
    "2026-10-16T12:00:00.000Z",
    () => "account:test",
  );
  s.prefs.scheme = "custom";
  const html = render(
    <AppearancePage state={s} onAction={async () => ({ ok: true })} />,
  );
  for (const label of [
    "Relaxed",
    "Structured",
    "Custom",
    "Dark colours",
    "Light colours",
    "Always expanded",
    "Separate panel",
  ])
    expect(html).toContain(label);
});
