import type { Prefs } from "../../state/usePrefs.ts";
export type AppPage = "soon" | "timeline" | "routines" | "archive" | "settings";
export const APP_PAGES: readonly [AppPage, string][] = [
  ["soon", "Checklist"],
  ["timeline", "Timeline"],
  ["routines", "Routines"],
  ["archive", "Archive"],
  ["settings", "Settings"],
];
export function mainViewPatch(page: AppPage): Partial<Prefs> {
  return page === "soon" || page === "timeline" ? { view: page } : {};
}
export function AppNavigation({
  page,
  onPage,
  counts = {},
}: {
  counts?: Partial<Record<AppPage, number>>;
  page: AppPage;
  onPage: (page: AppPage) => void;
}) {
  return (
    <nav className="app-navigation" aria-label="Main pages">
      {APP_PAGES.map(([id, label]) => (
        <button
          type="button"
          key={id}
          className={id === "settings" ? "gear" : undefined}
          aria-current={page === id ? "page" : undefined}
          onClick={() => onPage(id)}
        >
          {label}
          {counts[id] !== undefined && (
            <span className="n">
              {counts[id]}
              {id === "routines" ? " left" : ""}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
