import { expect, test } from "bun:test";
import {
  appearanceTokens,
  readableOnSurfaces,
  contrastRatio,
} from "../src/client/state/appearance.ts";
test("custom colours retain contrast on both page and surface", () => {
  const t = appearanceTokens(
    {
      scheme: "custom",
      customPalette: {
        dark: {
          ground: "#111111",
          surface: "#222222",
          text: "#111111",
          accent: "#222222",
        },
      },
    },
    "dark",
  );
  expect(contrastRatio(t.ink, t.ground)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(t.ink, t.surface)).toBeGreaterThanOrEqual(4.5);
  const hue = readableOnSurfaces("#8bcfff", [t.ground, t.surface], 4.5);
  expect(contrastRatio(hue, t.surface)).toBeGreaterThanOrEqual(4.5);
});
test("palette and theme are independent from interface and density", () => {
  expect(
    appearanceTokens(
      { scheme: "warm", interface: "structured", density: "compact" },
      "light",
    ),
  ).toEqual(
    appearanceTokens(
      { scheme: "warm", interface: "relaxed", density: "standard" },
      "light",
    ),
  );
});

test("Structured is the default while a saved Relaxed choice remains distinct", () => {
  expect(appearanceTokens({}, "dark").ground).toBe("#0e1117");
  expect(appearanceTokens({ interface: "relaxed" }, "dark").ground).toBe(
    "#1a1c24",
  );
});

import { urgencyTokens } from "../src/client/state/appearance.ts";
test("urgency follows the live ramp, grey to blue to yellow to red, whatever the accent", () => {
  const dark = urgencyTokens(appearanceTokens({ accent: "#ff00ff" }, "dark"));
  expect(dark.near).toBe("#5b8def");
  expect(dark.soon).toBe("#e8b33c");
  expect(dark.critical).toBe("#ff4d6a");
  // Live's grey, nudged only as far as large-text contrast needs.
  expect(dark.calm).not.toBe(dark.near);
  const light = urgencyTokens(appearanceTokens({}, "light"));
  expect(light.near).toBe("#2b62c6");
  expect(light.soon).toBe("#8a6008");
  expect(light.critical).toBe("#c81e3c");
  expect(light.calm).not.toBe(light.near);
});

import { urgencyChoice } from "../src/client/state/appearance.ts";
test("the reader's urgency colours apply per theme; unset or invalid steps keep live's", () => {
  const prefs = {
    urgencyPalette: {
      dark: { critical: "#a020f0", soon: "not a colour" },
      light: { near: "#123456" },
    },
  };
  const dark = urgencyChoice(prefs, "dark");
  expect(dark.critical).toBe("#a020f0");
  expect(dark.soon).toBe("#e8b33c");
  expect(dark.near).toBe("#5b8def");
  expect(urgencyChoice(prefs, "light").near).toBe("#123456");
  expect(urgencyChoice({ urgencyPalette: "junk" }, "dark").critical).toBe(
    "#ff4d6a",
  );
  // Applied, a chosen colour is kept when it already reads on the surfaces.
  expect(
    urgencyTokens(appearanceTokens(prefs, "dark"), prefs, "dark").critical,
  ).toBe("#a020f0");
});
