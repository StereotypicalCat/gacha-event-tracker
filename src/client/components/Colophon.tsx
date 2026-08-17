import { gameMeta } from "../../shared/games.ts";
import type { SourceHealth } from "../../shared/feed.ts";

export const REPO_URL = "https://github.com/StereotypicalCat/gacha-event-tracker";

/** Who built this, and where to find them. */
export const AUTHOR = {
  name: "Lucas Winther",
  site: "https://lucaswinther.info",
  github: "https://github.com/StereotypicalCat",
} as const;

const LINK =
  "text-muted underline decoration-hairline underline-offset-2 transition-colors duration-150 hover:text-ink hover:decoration-near";

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor" aria-hidden>
      <path d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38l-.01-1.49c-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48l-.01 2.19c0 .21.15.46.55.38A8 8 0 0 0 8 0Z" />
    </svg>
  );
}

/** Display name and homepage for a source host. */
const SITES: Record<string, { name: string; url: string }> = {
  "game8.co": { name: "Game8", url: "https://game8.co" },
  "endfield.wiki.gg": { name: "wiki.gg", url: "https://wiki.gg" },
};

function siteFor(url: string): { name: string; url: string } {
  try {
    const host = new URL(url).host;
    return SITES[host] ?? { name: host, url: `https://${host}` };
  } catch {
    return { name: url, url };
  }
}

/**
 * Credit, disclaimer, and where the code lives.
 *
 * Everything here is derived from the feed rather than written down, so adding
 * a source or a game credits the right people automatically. A hardcoded list
 * silently goes stale the moment someone adds the seventh source, and the one
 * thing a credit must not be is out of date.
 */
export function Colophon({
  sources,
  staleCount,
}: {
  sources: SourceHealth[];
  staleCount: number;
}) {
  const games = [...new Set(sources.map((s) => s.game))].map(gameMeta);
  const studios = [...new Set(games.map((g) => g.studio))];

  const sites = [...new Map(sources.map((s) => {
    const site = siteFor(s.url);
    return [site.name, site] as const;
  })).values()];

  const named = [...sites.map((s) => s.name), ...studios];

  return (
    <footer className="border-t border-hairline px-4 pb-12 pt-6 text-xs leading-relaxed text-faint">
      <p>
        Dates are shown in your local time. Every event links to the page it came
        from — check there before the last hours.
      </p>

      {staleCount > 0 && (
        <p className="mt-2 text-soon">
          {staleCount} source{staleCount > 1 ? "s have" : " has"} not refreshed in
          over two days. Some end dates may have moved.
        </p>
      )}

      <div className="mt-5">
        <p className="eyebrow">With thanks to</p>
        <p className="mt-1.5">
          {sites.map((site, i) => (
            <span key={site.name}>
              {i > 0 && (i === sites.length - 1 ? " and " : ", ")}
              <a
                href={site.url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-muted underline decoration-hairline underline-offset-2 transition-colors duration-150 hover:text-ink hover:decoration-near"
              >
                {site.name}
              </a>
            </span>
          ))}
          {", whose editors compile and maintain the event calendars this reads from. The schedules are their work; this page only rearranges them."}
        </p>
        <p className="mt-2">
          And to{" "}
          {studios.map((studio, i) => (
            <span key={studio}>
              {i > 0 && (i === studios.length - 1 ? " and " : ", ")}
              {studio}
            </span>
          ))}
          , who make the games worth keeping track of —{" "}
          {games.map((game, i) => (
            <span key={game.id}>
              {i > 0 && ", "}
              <span style={{ color: game.hue }}>{game.name}</span>
            </span>
          ))}
          {"."}
        </p>
      </div>

      <div className="mt-5 border-t border-hairline pt-4">
        <p>
          <strong className="font-semibold text-muted">Not affiliated</strong>{" "}
          with {named.join(", ")}, or any other publisher or source named here.
          This is an unofficial fan-made tool, not endorsed by or connected to
          any of them. All game names, event names and trademarks belong to their
          respective owners.
        </p>
        <p className="mt-2">
          Event dates can be wrong or go out of date. Treat the source page as
          the authority, not this one.
        </p>
      </div>

      <p className="mt-5">
        Built by{" "}
        <a
          href={AUTHOR.site}
          target="_blank"
          rel="noreferrer noopener me"
          className={LINK}
        >
          {AUTHOR.name}
        </a>
        {"."}
      </p>

      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <a
          href={AUTHOR.github}
          target="_blank"
          rel="noreferrer noopener me"
          className="inline-flex items-center gap-1.5 text-muted transition-colors duration-150 hover:text-ink"
        >
          <GitHubMark />
          @StereotypicalCat
        </a>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 text-muted transition-colors duration-150 hover:text-ink"
        >
          <GitHubMark />
          Source code
        </a>
      </p>
    </footer>
  );
}
