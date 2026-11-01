import type { DisplayEvent } from "./custom.ts";
import type { EventClassification } from "./schema.ts";

/** The source's category vocabulary, rather than similarity between titles. */
export function classifySourceLabels(labels: string): EventClassification {
  const result: EventClassification = {};
  if (/\bMiliastra Wonderland\b/i.test(labels)) result.lane = "miliastra";
  if (/\bMiliastra Pass\b/i.test(labels)) {
    result.lane = "miliastra";
    result.activity = "battle-pass";
    result.family = "miliastra-pass";
  } else if (/\bBattle Pass\b/i.test(labels)) {
    result.activity = "battle-pass";
    result.family = "battle-pass";
  }
  // Named TCG families in Genshin Event's type glossary. Forge Realm was also
  // confirmed in game by the owner, 2026-11-01 (docs event audit).
  if (/Genius Invokation TCG|The Forge Realm['’]s Temper|Heated Battle Mode/i.test(labels)) result.tags = ["tcg"];
  return result;
}

/** Compatibility for source-backed snapshots/feeds predating the metadata. */
export function classificationFor(event: DisplayEvent): EventClassification {
  if (event.id.startsWith("myevent:") || event.sourceUrl === null) return {};
  if (event.classification?.unresolved) return {};
  let known: EventClassification = {};
  if (event.game === "genshin" || event.game === "miliastra") {
    let path = "";
    try {
      const url = new URL(event.sourceUrl);
      if (url.hostname === "genshin-impact.fandom.com") path = decodeURIComponent(url.pathname).replace(/_/g, " ");
    } catch { /* Unknown links provide no evidence. */ }
    if (/^\/wiki\/(Miliastra Pass|Starlit Gala|Starlight Voyage|Raiment Collection)(?:[/:]|$)/i.test(path)) known.lane = "miliastra";
    if (/^\/wiki\/Miliastra Pass\//i.test(path)) known = { ...known, activity: "battle-pass", family: "miliastra-pass" };
    if (/^\/wiki\/Battle Pass\//i.test(path)) known = { activity: "battle-pass", family: "battle-pass" };
    if (/^\/wiki\/(The Forge Realm['’]s Temper|Heated Battle Mode)(?:[/:]|$)/i.test(path)) known.tags = ["tcg"];
    // Game8's overview link does not identify the article. These two already
    // published pass names are pinned fixtures; future passes use source labels.
    if (event.sourceId === "genshin-game8-events" && /^(?:Battle Pass - )?(Moontrace|Frostfarer)$/.test(event.title)) known = { activity: "battle-pass", family: "battle-pass" };
  }
  const families: Record<string, string> = {
    "hsr-fandom-nameless-honor": "nameless-honor",
    "zzz-fandom-city-fund": "city-fund",
    "nikki-fandom-mira-journey": "mira-journey",
  };
  const family = families[event.sourceId];
  if (family) known = { activity: "battle-pass", family };
  return { ...known, ...event.classification };
}

export const displayGameFor = (event: DisplayEvent): string => classificationFor(event).lane ?? event.game;
export const passFamilyFor = (event: DisplayEvent): string | null => {
  const c = classificationFor(event);
  return c.activity === "battle-pass" ? c.family ?? "battle-pass" : null;
};
export const passPlacementId = (event: DisplayEvent): string | null => {
  const family = passFamilyFor(event);
  return family === null ? null : `feed-cycle:${displayGameFor(event)}:${family}`;
};
export const isTcgEvent = (event: DisplayEvent): boolean => classificationFor(event).tags?.includes("tcg") === true;
export const tracksEventCategory = (event: DisplayEvent, prefs: Record<string, unknown>): boolean => !(displayGameFor(event) === "genshin" && prefs.genshinTcg === false && isTcgEvent(event));
export function classifiedEvent(event: DisplayEvent): DisplayEvent {
  const game = displayGameFor(event);
  return game === event.game ? event : { ...event, game, classification: classificationFor(event) };
}
/** Miliastra consumes the same source bytes, freshness and attribution. */
export const sourceGameFor = (game: string): string => game === "miliastra" ? "genshin" : game;
