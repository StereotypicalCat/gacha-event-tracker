import type { AppPage } from "../components/redesign/AppNavigation.tsx";
import {
  SETTINGS_PAGES,
  type SettingsPage,
} from "../components/redesign/SettingsLayout.tsx";

/**
 * Where the reader is, kept in the address bar so a reload returns them there.
 *
 * `#checklist`, `#timeline`, `#routines`, `#archive`, `#settings/<section>`
 * and `#settings/games/<game>`. Not a preference: the default view still
 * decides where a fresh visit with no hash opens.
 */
export interface Route {
  page: AppPage;
  settings?: SettingsPage | undefined;
  /** A game's settings page, when `settings` is "games". */
  game?: string | undefined;
}

const PAGE_SLUG: Record<Exclude<AppPage, "settings">, string> = {
  soon: "checklist",
  timeline: "timeline",
  routines: "routines",
  archive: "archive",
};
const SECTIONS = new Set<string>([
  ...SETTINGS_PAGES.map(([id]) => id),
  "games",
]);

export function routeHash(route: Route): string {
  if (route.page !== "settings") return `#${PAGE_SLUG[route.page]}`;
  const section = route.settings ?? "appearance";
  return section === "games" && route.game
    ? `#settings/games/${encodeURIComponent(route.game)}`
    : `#settings/${section}`;
}

/** The route a hash names, or null when it names none this app knows. */
export function parseRoute(hash: string): Route | null {
  const [head, section, game] = hash.replace(/^#\/?/, "").split("/");
  const page = (Object.keys(PAGE_SLUG) as (keyof typeof PAGE_SLUG)[]).find(
    (p) => PAGE_SLUG[p] === head,
  );
  if (page) return { page };
  if (head !== "settings") return null;
  if (section === undefined || section === "")
    return { page: "settings", settings: "appearance" };
  // Default view moved into Appearance; old links still land there.
  if (section === "general")
    return { page: "settings", settings: "appearance" };
  // The Lists options moved into Data & sources.
  if (section === "lists") return { page: "settings", settings: "sources" };
  if (!SECTIONS.has(section)) return null;
  if (section === "games") {
    // Game order lives in Appearance; a game's own settings need its id.
    if (game === undefined) return { page: "settings", settings: "appearance" };
    if (game === "") return null;
    return {
      page: "settings",
      settings: "games",
      game: decodeURIComponent(game),
    };
  }
  return { page: "settings", settings: section as SettingsPage };
}
