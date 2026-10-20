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

test("pills under a settings explanation sit as far below it as the scheme choices do", async () => {
  const css = await Bun.file(
    new URL("../src/client/redesign.css", import.meta.url),
  ).text();
  const scheme = /\.scheme-choices\s*\{[^}]*margin-top:\s*(\d+px)/s.exec(
    css,
  )?.[1];
  const pills =
    /\.settings-group \.help \+ \.segmented\s*\{[^}]*margin-top:\s*(\d+px)/s.exec(
      css,
    )?.[1];
  expect(scheme).toBe("16px");
  expect(pills).toBe(scheme);
  // And they take the outlined buttons' type and, in Relaxed, a hairline tray.
  expect(css).toMatch(
    /\.settings-group \.segmented button\s*\{[^}]*font-size: 13px/s,
  );
  expect(css).toMatch(
    /:root\[data-interface="relaxed"\] \.settings-group \.segmented\s*\{[^}]*border: 1px solid var\(--color-hairline\)/s,
  );
});
