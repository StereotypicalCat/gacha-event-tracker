import { expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import {
  CelebrationsContext,
  Fireworks,
  celebrationsOn,
} from "../src/client/components/Fireworks.tsx";
import { finishesSection } from "../src/client/components/redesign/useSectionCelebration.ts";
import { AppearancePage } from "../src/client/components/redesign/AppearancePage.tsx";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";

test("celebrations are on unless the reader turned them off", () => {
  expect(celebrationsOn({})).toBe(true);
  expect(celebrationsOn({ celebrations: true })).toBe(true);
  expect(celebrationsOn({ celebrations: false })).toBe(false);
});

test("with celebrations off, no fireworks draw, big or small", () => {
  for (const grand of [false, true])
    expect(
      render(
        <CelebrationsContext value={false}>
          <Fireworks grand={grand} />
        </CelebrationsContext>,
      ),
    ).toBe("");
  expect(render(<Fireworks />)).toContain('class="fireworks"');
});

test("the item that finishes a section gets the big celebration, not the small burst too", () => {
  expect(finishesSection(3, 2)).toBe(true);
  expect(finishesSection(3, 1)).toBe(false);
  expect(finishesSection(1, 0)).toBe(true);
  expect(finishesSection(3, 3)).toBe(false);
});

test("Appearance offers a Celebrations switch, on by default", () => {
  const s = migrateLegacy(
    {},
    [],
    "2026-10-16T12:00:00.000Z",
    () => "account:test",
  );
  const on = render(
    <AppearancePage state={s} onAction={async () => ({ ok: true })} />,
  );
  expect(on).toContain("Celebrations");
  expect(on).toMatch(
    /<input type="checkbox" data-celebrations="true" checked=""/,
  );
  s.prefs.celebrations = false;
  const off = render(
    <AppearancePage state={s} onAction={async () => ({ ok: true })} />,
  );
  expect(off).not.toMatch(/data-celebrations="true" checked=""/);
});
