import { useEffect, useState } from "react";
import type { GameMeta } from "../../shared/games.ts";

/**
 * Which ground the app is drawn on.
 *
 * Almost everything about this is settled in CSS: `styles.css` holds the dark
 * tokens as the defaults and re-strikes them under `[data-theme="light"]`, so
 * no component ever asks which theme it is in. Three things cannot be settled
 * there, and they are what this module is:
 *
 * - **Resolving the reader's answer.** "System" is a choice about a preference
 *   they set elsewhere, and it has to be read and watched.
 * - **The game hues.** They are data, not tokens — `games.ts` for the games we
 *   track, the reader's own typing for theirs — and they were picked for
 *   identity, not measured. On paper the brighter ones are unreadable, so they
 *   are darkened until they are not; on the dark ground the few that are too
 *   dim are lifted the same way.
 * - **The browser's own chrome.** `<meta name="theme-color">` is markup, so it
 *   is set from here rather than styled.
 */
export type Theme = "dark" | "light";

/**
 * What the reader chose, which is not the same as what gets drawn: `system`
 * defers to the device, and the other two override it outright.
 */
export type ThemeChoice = Theme | "system";

/**
 * Dark is the default and stays it.
 *
 * Not `system`: this app is a lit instrument panel and that is what it should
 * be on first sight, and a reader whose OS is in light mode has said something
 * about their OS rather than about this page. Defaulting to the device would
 * also silently move every existing reader the first time they load a build
 * that has this, which is the `knownGames` mistake in a different costume.
 * Choosing `system` is one tap, and then it *is* their answer.
 */
export const DEFAULT_THEME_CHOICE: ThemeChoice = "dark";

/** The media query "system" listens to. */
export const LIGHT_QUERY = "(prefers-color-scheme: light)";

/**
 * The `--color-ground` of each theme, duplicated out of `styles.css` because
 * `<meta name="theme-color">` is markup and cannot read a custom property. A
 * test pins the two copies together; the browser chrome disagreeing with the
 * page is exactly the kind of drift nobody files a bug about.
 */
export const THEME_COLOR: Record<Theme, string> = {
  dark: "#12141c",
  light: "#edf0f7",
};

/** What the reader's choice comes to on this device, right now. */
export function resolveTheme(
  choice: ThemeChoice,
  systemPrefersLight: boolean,
): Theme {
  if (choice === "system") return systemPrefersLight ? "light" : "dark";
  return choice;
}

// ---------------------------------------------------------------------------
// Game hues on either ground
// ---------------------------------------------------------------------------

/**
 * The smallest contrast a hue may have against the ground it is printed on.
 *
 * A hue is a lane label, a chip and a bar border — small text and thin lines,
 * so this is the 4.5:1 that applies to body copy rather than the 3:1 for large
 * text.
 */
const MIN_HUE_CONTRAST = 4.5;

/** `#abc` and `#aabbcc`, or null for anything else — a hue can be reader data. */
function parseHex(hex: string): [number, number, number] | null {
  const body = hex.trim().replace(/^#/, "");
  const full =
    body.length === 3
      ? body
          .split("")
          .map((c) => c + c)
          .join("")
      : body;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function toHex(channels: [number, number, number]): string {
  return `#${channels.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
}

/** WCAG relative luminance. */
function luminance([r, g, b]: [number, number, number]): number {
  const [lr, lg, lb] = [r, g, b].map((channel) => {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

const LIGHT_GROUND = parseHex(THEME_COLOR.light) as [number, number, number];
const DARK_GROUND = parseHex(THEME_COLOR.dark) as [number, number, number];

/** RGB channels as hue (0–1), saturation and lightness. */
function toHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const [rs, gs, bs] = [r / 255, g / 255, b / 255];
  const max = Math.max(rs, gs, bs);
  const min = Math.min(rs, gs, bs);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === rs
      ? ((gs - bs) / d + (gs < bs ? 6 : 0)) / 6
      : max === gs
        ? ((bs - rs) / d + 2) / 6
        : ((rs - gs) / d + 4) / 6;
  return [h, s, l];
}

function fromHsl([h, s, l]: [number, number, number]): [number, number, number] {
  const k = (n: number) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)].map((c) => Math.round(c * 255)) as [
    number,
    number,
    number,
  ];
}

/**
 * The same hue, readable on this theme's ground.
 *
 * On dark, a hue that already clears the bar is returned untouched — which is
 * fifteen of the twenty games, and those pixels do not move. The five that do
 * not were picked for identity rather than measured: Fate's navy is 1.8:1 on
 * the near-black ground, which made "Fate/Grand Order" under the headline
 * deadline nearly invisible, and Punishing, Persona, Chaos Zero and Honkai 3rd
 * sit between 3.4 and 4.3. Those are lifted in lightness alone, so the angle
 * and saturation that say which game it is survive and only the value moves —
 * Fate stays a blue, Punishing stays a red.
 *
 * On light it is a scale towards black — the channels keep their ratios, so
 * Genshin's blue stays Genshin's blue rather than becoming a computed
 * near-neighbour of Star Rail's. A hue that already reads (Fate's navy) is left
 * exactly as it is, and so is anything this cannot parse: a reader's stored
 * colour is not ours to reinterpret when we do not understand it.
 */
export function readableHue(hue: string, theme: Theme): string {
  const rgb = parseHex(hue);
  if (rgb === null) return hue;
  if (theme === "dark") {
    if (contrast(rgb, DARK_GROUND) >= MIN_HUE_CONTRAST) return hue;
    const [h, s, l] = toHsl(rgb);
    // Bisect the lightness, measuring the rounded colour that will actually
    // be written, for the same reason as the light branch below.
    let tooDim = l;
    let enough = 1;
    for (let i = 0; i < 20; i++) {
      const mid = (tooDim + enough) / 2;
      if (contrast(fromHsl([h, s, mid]), DARK_GROUND) >= MIN_HUE_CONTRAST) enough = mid;
      else tooDim = mid;
    }
    return toHex(fromHsl([h, s, enough]));
  }
  if (contrast(rgb, LIGHT_GROUND) >= MIN_HUE_CONTRAST) return hue;

  // Bisect the scale factor, measuring the colour that will actually be
  // written: rounding to 8-bit channels after the search would hand back
  // something a shade lighter than the one that passed, and by a hair's
  // breadth it can fail the bar it was chosen to clear.
  const at = (factor: number) =>
    rgb.map((c) => Math.round(c * factor)) as [number, number, number];

  // Twenty steps lands well inside one channel, and a fixed count keeps this
  // total — no loop that can fail to terminate on a colour nobody thought of.
  let tooDark = 0;
  let tooLight = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (tooDark + tooLight) / 2;
    if (contrast(at(mid), LIGHT_GROUND) >= MIN_HUE_CONTRAST) tooDark = mid;
    else tooLight = mid;
  }
  return toHex(at(tooDark));
}

/** A lane's metadata with its hue answered for this theme. */
export function metaOnTheme(meta: GameMeta, theme: Theme): GameMeta {
  const hue = readableHue(meta.hue, theme);
  return hue === meta.hue ? meta : { ...meta, hue };
}

// ---------------------------------------------------------------------------
// Applying it
// ---------------------------------------------------------------------------

/**
 * Put the resolved theme on the document.
 *
 * The attribute is what every token override in `styles.css` hangs off, and it
 * is the same attribute the pre-paint script in `index.html` sets — that script
 * is what stops a reader who chose light from being shown a dark page for the
 * length of a bundle download, and this keeps agreeing with it afterwards.
 */
export function applyTheme(theme: Theme, doc: Document = document): void {
  doc.documentElement.dataset["theme"] = theme;
  const meta = doc.querySelector('meta[name="theme-color"]');
  if (meta !== null) meta.setAttribute("content", THEME_COLOR[theme]);
}

function systemPrefersLight(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(LIGHT_QUERY).matches;
}

/**
 * The theme this render is in, kept in step with the device and written to the
 * document.
 *
 * The media query is watched whatever the choice is, so a reader on `system`
 * who flips their OS at sunset sees the page follow without a reload — and one
 * who has chosen a side is unaffected by it, because `resolveTheme` never asks.
 */
export function useTheme(choice: ThemeChoice): Theme {
  const [prefersLight, setPrefersLight] = useState(systemPrefersLight);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const query = window.matchMedia(LIGHT_QUERY);
    const sync = () => setPrefersLight(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const theme = resolveTheme(choice, prefersLight);
  useEffect(() => applyTheme(theme), [theme]);
  return theme;
}
