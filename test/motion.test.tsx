import { expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import { shineOn } from "../src/client/components/Fireworks.tsx";
import { AppearancePage } from "../src/client/components/redesign/AppearancePage.tsx";
import { leavingMarks } from "../src/client/components/redesign/ChecklistEvent.tsx";
import {
  applyAppearance,
  motionReduced,
} from "../src/client/state/appearance.ts";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";

const state = () =>
  migrateLegacy({}, [], "2026-10-20T12:00:00.000Z", () => "account:test");
// The opening tag of one of the Motion & celebrations cards.
const card = (html: string, name: string) =>
  new RegExp(`<button[^>]*${name}="true"[^>]*>`).exec(html)?.[0] ?? "";
const page = (prefs: Record<string, unknown>) => {
  const s = state();
  Object.assign(s.prefs, prefs);
  return render(
    <AppearancePage state={s} onAction={async () => ({ ok: true })} />,
  );
};

test("reduced motion follows the device unless the reader turns it on", () => {
  // No browser here, so the device asks for nothing.
  expect(motionReduced({})).toBe(false);
  expect(motionReduced({ reduceMotion: false })).toBe(false);
  expect(motionReduced({ reduceMotion: true })).toBe(true);
});

test("the reduced motion switch marks the page, so the stylesheet can stop animations", () => {
  const doc = {
    documentElement: {
      dataset: {} as Record<string, string>,
      style: { setProperty() {} },
    },
  };
  applyAppearance({ reduceMotion: true }, "dark", doc as unknown as Document);
  expect(doc.documentElement.dataset.motion).toBe("reduce");
  applyAppearance({}, "dark", doc as unknown as Document);
  expect(doc.documentElement.dataset.motion).toBe("system");
});

test("the stylesheet stops every animation and the fireworks when the page is marked", async () => {
  const css = await Bun.file(
    new URL("../src/client/styles.css", import.meta.url),
  ).text();
  expect(css).toMatch(
    /\[data-motion="reduce"\][^{]*\*[^{]*\{[^}]*animation: none !important/s,
  );
  expect(css).toMatch(
    /\[data-motion="reduce"\] \.fireworks\s*\{[^}]*display: none !important/s,
  );
});

test("Appearance has a Reduce motion switch that says what it does, off by default", () => {
  const off = page({});
  expect(off).toContain("Reduce motion");
  expect(off).toContain("your device");
  expect(card(off, "data-reduce-motion")).toContain('aria-pressed="false"');
  expect(card(page({ reduceMotion: true }), "data-reduce-motion")).toContain(
    'aria-pressed="true"',
  );
  // One section of cards, Reduce motion first.
  expect(off).toContain("Motion &amp; celebrations");
  expect(off.indexOf("data-reduce-motion")).toBeLessThan(
    off.indexOf("data-celebrations"),
  );
});

test("Celebrations has a Shine switch, on by default", () => {
  expect(shineOn({})).toBe(true);
  expect(shineOn({ shine: false })).toBe(false);
  expect(card(page({}), "data-shine-switch")).toContain('aria-pressed="true"');
  expect(card(page({ shine: false }), "data-shine-switch")).toContain(
    'aria-pressed="false"',
  );
});

test("with shine off, a completed event still greys on its way out but does not shine", () => {
  const t = { key: "row", label: "Completed", phase: "hold" };
  expect(leavingMarks(t, "row", false)).toEqual({
    className: "",
    "data-leaving": true,
    "data-shine": undefined,
  });
  expect(leavingMarks(t, "row")["data-shine"]).toBe(true);
});

test("with Reduce motion on, fireworks and shine are locked off without losing the choice", () => {
  const locked = page({ reduceMotion: true, celebrations: true, shine: true });
  for (const name of ["data-celebrations", "data-shine-switch"]) {
    expect(card(locked, name)).toContain('aria-pressed="false"');
    expect(card(locked, name)).toContain('disabled=""');
  }
  expect(locked).toContain("Off while Reduce motion is on");
  // Reduce motion off again: both come back as they were.
  const back = page({ reduceMotion: false, celebrations: true, shine: false });
  expect(card(back, "data-celebrations")).toContain('aria-pressed="true"');
  expect(card(back, "data-shine-switch")).toContain('aria-pressed="false"');
  expect(card(back, "data-celebrations")).not.toContain("disabled");
  expect(card(back, "data-shine-switch")).not.toContain("disabled");
});

test("the Motion & celebrations cards draw their outline outside a game's settings", async () => {
  const css = await Bun.file(
    new URL("../src/client/redesign.css", import.meta.url),
  ).text();
  expect(css).toMatch(/\.motion-cards\s*\{[^}]*--rule-strong:/s);
});
