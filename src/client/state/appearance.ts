import type { Theme } from "./theme.ts";
import { recordOf } from "./reader/actions.ts";
export interface AppearanceTokens {
  ground: string;
  surface: string;
  raised: string;
  ink: string;
  muted: string;
  faint: string;
  near: string;
  soon: string;
  critical: string;
  hairline: string;
}
const hex = (v: unknown, fallback: string) =>
  typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
const rgb = (h: string) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
const encode = (c: number[]) =>
  "#" + c.map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");
function luminance(h: string) {
  const c = rgb(h).map((x) => {
    const v = x / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
export function contrastRatio(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function mix(a: string, b: string, t: number) {
  const x = rgb(a),
    y = rgb(b);
  return encode(x.map((c, i) => c + (y[i]! - c) * t));
}
export function readableOnSurfaces(
  hue: string,
  backgrounds: readonly string[],
  minimum: number,
): string {
  const original = hex(hue, "#808080"),
    score = (c: string) =>
      Math.min(...backgrounds.map((bg) => contrastRatio(c, bg)));
  if (score(original) >= minimum) return original;
  let best = original,
    bestScore = score(best);
  for (let step = 1; step <= 255; step++)
    for (const end of ["#ffffff", "#000000"]) {
      const c = mix(original, end, step / 255),
        s = score(c);
      if (s >= minimum) return c;
      if (s > bestScore) {
        best = c;
        bestScore = s;
      }
    }
  for (let n = 0; n < 256; n++) {
    const c = encode([n, n, n]),
      s = score(c);
    if (s >= minimum) return c;
    if (s > bestScore) {
      best = c;
      bestScore = s;
    }
  }
  return best;
}
export function appearanceTokens(
  prefs: Record<string, unknown>,
  theme: Theme,
): AppearanceTokens {
  const light = theme === "light",
    scheme = prefs.scheme,
    structured = prefs.interface !== "relaxed";
  let ground = structured
      ? light
        ? "#eef0f5"
        : "#0e1117"
      : light
        ? "#f3f1ec"
        : "#1a1c24",
    surface = structured
      ? light
        ? "#ffffff"
        : "#141923"
      : light
        ? "#fffdf8"
        : "#22252f",
    text = light ? "#28272d" : "#eeeae3",
    accent = light ? "#315fa5" : "#8eb3f4";
  if (scheme === "warm") {
    ground = light ? "#f4eee5" : "#24201c";
    surface = light ? "#fffaf2" : "#302a24";
  }
  if (scheme === "plum") {
    ground = light ? "#f2edf5" : "#211c29";
    surface = light ? "#fffaff" : "#2c2536";
  }
  if (scheme === "custom") {
    const custom = recordOf(recordOf(prefs.customPalette)[theme]);
    ground = hex(custom.ground, ground);
    surface = hex(custom.surface, surface);
    text = hex(custom.text, text);
    accent = hex(custom.accent, accent);
  }
  // Preserve saved choices; keep rendered surfaces in one readable luminance family.
  if (luminance(ground) > 0.4 !== luminance(surface) > 0.4)
    surface = mix(surface, ground, 0.8);
  const backgrounds = [ground, surface],
    ink = readableOnSurfaces(text, backgrounds, 4.5),
    near = readableOnSurfaces(accent, backgrounds, 4.5);
  return {
    ground,
    surface,
    ink,
    near,
    raised: mix(surface, ink, 0.07),
    hairline: mix(surface, ink, 0.16),
    muted: readableOnSurfaces(mix(ink, surface, 0.3), backgrounds, 4.5),
    faint: readableOnSurfaces(mix(ink, surface, 0.4), backgrounds, 4.5),
    soon: readableOnSurfaces(light ? "#805a12" : "#e9b95b", backgrounds, 4.5),
    critical: readableOnSurfaces(
      light ? "#b12947" : "#ff8598",
      backgrounds,
      4.5,
    ),
  };
}
/**
 * The live site's urgency ramp: grey (a week+), blue (under a week), yellow
 * (under 3 days), red (under a day). Fixed rather than taken from the accent,
 * so a chosen accent never changes what "under a week" looks like. Each is
 * only nudged for contrast (3:1, the countdowns are large text) on custom
 * backgrounds; on the built-in schemes they stay live's values.
 */
export const URGENCY = {
  dark: {
    calm: "#55607f",
    near: "#5b8def",
    soon: "#e8b33c",
    critical: "#ff4d6a",
  },
  light: {
    calm: "#8a92a8",
    near: "#2b62c6",
    soon: "#8a6008",
    critical: "#c81e3c",
  },
} as const;
export type UrgencyStep = keyof (typeof URGENCY)["dark"];
export const URGENCY_STEPS: readonly UrgencyStep[] = [
  "calm",
  "near",
  "soon",
  "critical",
];

/**
 * The reader's own urgency colours for a theme, from `prefs.urgencyPalette`
 * (`{ dark: { near: "#…" }, light: {…} }`); a step left unset keeps live's.
 */
export function urgencyChoice(
  prefs: Record<string, unknown>,
  theme: "dark" | "light",
): Record<UrgencyStep, string> {
  const own = recordOf(recordOf(prefs.urgencyPalette)[theme]);
  return Object.fromEntries(
    URGENCY_STEPS.map((k) => [k, hex(own[k], URGENCY[theme][k])]),
  ) as Record<UrgencyStep, string>;
}

/**
 * What each step renders as: the reader's choice or live's, nudged only as far
 * as 3:1 contrast on the scheme's surfaces (the countdowns are large text).
 */
export function urgencyTokens(
  t: AppearanceTokens,
  prefs: Record<string, unknown> = {},
  theme: "dark" | "light" = luminance(t.ground) > 0.4 ? "light" : "dark",
): Record<UrgencyStep, string> {
  const chosen = urgencyChoice(prefs, theme),
    backgrounds = [t.ground, t.surface];
  return Object.fromEntries(
    URGENCY_STEPS.map((k) => [
      k,
      readableOnSurfaces(chosen[k], backgrounds, 3),
    ]),
  ) as Record<UrgencyStep, string>;
}
export function applyAppearance(
  prefs: Record<string, unknown>,
  theme: Theme,
  doc: Document = document,
) {
  const t = appearanceTokens(prefs, theme);
  for (const [k, v] of Object.entries(t))
    doc.documentElement.style.setProperty(`--color-${k}`, v);
  doc.documentElement.style.setProperty("--color-ink-strong", t.ink);
  doc.documentElement.style.setProperty("--color-glow", t.ground);
  doc.documentElement.style.setProperty("--color-calm", t.muted);
  for (const [k, v] of Object.entries(
    urgencyTokens(t, prefs, theme === "light" ? "light" : "dark"),
  ))
    doc.documentElement.style.setProperty(`--color-urgency-${k}`, v);
  doc.documentElement.dataset.interface =
    prefs.interface === "relaxed" ? "relaxed" : "structured";
  doc.documentElement.dataset.density =
    prefs.density === "compact" ? "compact" : "standard";
}
