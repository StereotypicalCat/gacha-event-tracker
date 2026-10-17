import { Fragment, type ReactNode } from "react";
import type { SourceHealth } from "../../../shared/feed.ts";
import { useGameMeta } from "../../state/gameMeta.tsx";
import {
  AUTHOR,
  BUG_URL,
  FEATURE_URL,
  IDEA_CREDITS,
  REPO_URL,
  RESET_CLOCK_CREDIT,
  siteFor,
} from "../Colophon.tsx";

/**
 * The Round 6 B “About Event Clock” pane: credits and the disclaimer only.
 * Data freshness lives in Data & sources.
 */
export function AboutPage({
  sources,
}: {
  /** Every source read, so every editor and game is credited, not just the reader's. */
  sources: SourceHealth[];
}) {
  const meta = useGameMeta();
  const sites = [
    ...new Map(
      sources.map((s) => siteFor(s.url)).map((s) => [s.url, s]),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));
  const games = [...new Set(sources.map((s) => s.game))];
  const studios = [
    ...new Set(sources.map((s) => meta(s.game).studio).filter(Boolean)),
  ];
  const link = (href: string, label: ReactNode) => (
    <a href={href} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
  const dotted = (items: ReactNode[]) =>
    items.map((item, i) => (
      <Fragment key={i}>
        {i > 0 && " · "}
        {item}
      </Fragment>
    ));
  return (
    <section className="about-page">
      <h1>About Event Clock</h1>
      <div className="about-prose">
        <p>
          Live and upcoming gacha events, sorted by what expires next. An
          unofficial, fan-made calendar with progress saved in your browser.
        </p>
        <h3>Made by</h3>
        <p>
          {link(AUTHOR.site, AUTHOR.name)} ·{" "}
          {link(AUTHOR.github, "StereotypicalCat")}
        </p>
        <p className="about-links">
          {link(REPO_URL, "Source code")}
          {link(BUG_URL, "Report a problem")}
          {link(FEATURE_URL, "Request a feature")}
          {link(AUTHOR.kofi, "Support the project")}
        </p>
        <h3>With thanks to the source editors</h3>
        <p>
          The source communities compile and maintain the schedules; Event Clock
          rearranges their work. {dotted(sites.map((s) => link(s.url, s.name)))}
          .
        </p>
        <p>
          {link(RESET_CLOCK_CREDIT.url, RESET_CLOCK_CREDIT.name)} provides the
          reference for per-server reset clocks.
        </p>
        <h3>The studios and games</h3>
        <p>
          {studios.join(" · ")}, who make the games worth keeping track of:{" "}
          {dotted(
            games.map((g) => (
              <span className="game-name" style={{ color: meta(g).hue }}>
                {meta(g).name}
              </span>
            )),
          )}
          . All game names, event names and trademarks belong to their
          respective owners.
        </p>
        <h3>Ideas and acknowledgements</h3>
        <p>{dotted(IDEA_CREDITS.map((c) => link(c.url, c.handle)))}.</p>
        <h3>Unofficial and unaffiliated</h3>
        <p>
          Not endorsed by or connected to any game publisher or source named
          here. Dates can be wrong or go out of date: check the original source
          before the final hours.
        </p>
      </div>
    </section>
  );
}
