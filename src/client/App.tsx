import { useEffect, useMemo, useState } from "react";
import { fetchFeed, type FeedState } from "./api.ts";
import { Controls } from "./components/Controls.tsx";
import { EventDetail } from "./components/EventDetail.tsx";
import { EventRow, type RowEvent } from "./components/EventRow.tsx";
import { NextUp } from "./components/NextUp.tsx";
import { Timeline } from "./components/Timeline.tsx";
import { useCompletions } from "./state/useCompletions.ts";
import { usePrefs } from "./state/usePrefs.ts";
import { clockFor, DAY, endingSoonestFirst, formatRemaining } from "../shared/time.ts";
import type { GameId } from "../shared/schema.ts";

type View = "soon" | "calendar";

/** Ticks once a second so countdowns stay honest without re-fetching. */
function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function App() {
  const [state, setState] = useState<FeedState>({ status: "loading" });
  const [view, setView] = useState<View>("soon");
  const [openId, setOpenId] = useState<string | null>(null);
  const now = useNow();
  const { prefs, update, toggleGame } = usePrefs();
  const { completions, toggle, merge } = useCompletions();

  useEffect(() => {
    const ac = new AbortController();
    fetchFeed(ac.signal)
      .then((feed) => setState({ status: "ready", feed }))
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Could not load events.",
        });
      });
    return () => ac.abort();
  }, []);

  const allRows = useMemo<RowEvent[]>(() => {
    if (state.status !== "ready") return [];
    return state.feed.events
      .filter((e) => e.status === "published")
      .map((event) => ({ event, clock: clockFor(event, prefs.region, now) }));
    // `now` intentionally excluded: recomputing every clock each second is
    // wasteful, and the countdown text re-renders from `now` anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, prefs.region, Math.floor(now / 60_000)]);

  const games = useMemo<GameId[]>(
    () => [...new Set(allRows.map((r) => r.event.game))],
    [allRows],
  );

  const visible = useMemo(
    () =>
      allRows
        .filter((r) => !prefs.hiddenGames.includes(r.event.game))
        .filter((r) => !r.clock.ended)
        .filter((r) => prefs.showCompleted || completions[r.event.id] === undefined)
        .sort(endingSoonestFirst),
    [allRows, prefs.hiddenGames, prefs.showCompleted, completions],
  );

  const live = visible.filter((r) => r.clock.live);
  const upcoming = visible.filter((r) => r.clock.upcoming);
  const next = live.find((r) => r.clock.msRemaining !== null) ?? live[0] ?? null;
  const openRow = allRows.find((r) => r.event.id === openId) ?? null;

  if (state.status === "loading") {
    return <Shell><p className="px-4 py-16 text-sm text-muted">Loading events…</p></Shell>;
  }

  if (state.status === "error") {
    return (
      <Shell>
        <div className="px-4 py-16">
          <p className="eyebrow text-critical">Events unavailable</p>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
            {state.message}
          </p>
        </div>
      </Shell>
    );
  }

  const staleSources = state.feed.sources.filter(
    (s) => s.lastSuccessAt === null || now - Date.parse(s.lastSuccessAt) > 2 * DAY,
  );

  return (
    <Shell>
      <header className="flex items-center justify-between px-4 pb-3 pt-5">
        <div>
          <p className="font-display text-[0.9375rem] font-bold tracking-[0.02em]">
            EVENT<span className="text-near">CLOCK</span>
          </p>
          <p className="mt-0.5 text-xs text-faint">
            {live.length} live · {upcoming.length} upcoming
          </p>
        </div>

        <div
          role="tablist"
          aria-label="View"
          className="flex rounded-lg border border-hairline p-0.5"
        >
          {(
            [
              ["soon", "Ending soon"],
              ["calendar", "Calendar"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={`rounded-[6px] px-2.5 py-1.5 text-xs font-medium transition-colors ${
                view === id ? "bg-raised text-ink" : "text-faint hover:text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {view === "soon" ? (
        <>
          <NextUp row={next} onOpen={setOpenId} />

          {live.length > 0 && (
            <Section
              title="Running now"
              hint={
                live.length > 1
                  ? `next after this ends in ${formatRemaining(
                      live[1]?.clock.msRemaining ?? 0,
                    )}`
                  : undefined
              }
            >
              {live.map((row) => (
                <EventRow
                  key={row.event.id}
                  row={row}
                  completed={completions[row.event.id] !== undefined}
                  onToggle={toggle}
                  onOpen={setOpenId}
                />
              ))}
            </Section>
          )}

          {upcoming.length > 0 && (
            <Section title="Not started yet">
              {upcoming.map((row) => (
                <EventRow
                  key={row.event.id}
                  row={row}
                  completed={completions[row.event.id] !== undefined}
                  onToggle={toggle}
                  onOpen={setOpenId}
                />
              ))}
            </Section>
          )}

          {visible.length === 0 && (
            <p className="px-4 py-12 text-sm leading-relaxed text-muted">
              Nothing to show. Every game is switched off, or you've finished
              everything and hidden completed events.
            </p>
          )}
        </>
      ) : (
        <Timeline
          rows={visible}
          now={now}
          onOpen={setOpenId}
          completions={completions}
        />
      )}

      <Controls
        games={games}
        prefs={prefs}
        onToggleGame={toggleGame}
        onUpdate={update}
        onExport={() => exportProgress(completions, prefs)}
        onImport={(file) => void importProgress(file, merge)}
      />

      <footer className="px-4 pb-10 pt-2 text-xs leading-relaxed text-faint">
        <p>
          Dates come from community wikis and are shown in your local time. Every
          event links to its source — check there before the last hours.
        </p>
        {staleSources.length > 0 && (
          <p className="mt-2 text-soon">
            {staleSources.length} source
            {staleSources.length > 1 ? "s have" : " has"} not refreshed in over two
            days. Some end dates may have moved.
          </p>
        )}
      </footer>

      {openRow !== null && (
        <EventDetail
          row={openRow}
          completed={completions[openRow.event.id] !== undefined}
          onToggle={toggle}
          onClose={() => setOpenId(null)}
        />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-full max-w-2xl border-hairline sm:border-x">
      {children}
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <section className="pt-5">
      <div className="flex items-baseline justify-between gap-3 px-4 pb-2">
        <h2 className="eyebrow">{title}</h2>
        {hint !== undefined && <p className="text-xs text-faint">{hint}</p>}
      </div>
      <ul className="border-t border-hairline">{children}</ul>
    </section>
  );
}

function exportProgress(
  completions: Record<string, { completedAt: string }>,
  prefs: unknown,
) {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          format: "gacha-tracker-export",
          version: 1,
          exportedAt: new Date().toISOString(),
          completions,
          prefs,
        },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `event-clock-progress-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importProgress(
  file: File,
  merge: (c: Record<string, { completedAt: string }>) => void,
) {
  try {
    const parsed: unknown = JSON.parse(await file.text());
    const data = parsed as { format?: string; completions?: unknown };
    if (data.format !== "gacha-tracker-export") {
      alert("That file isn't an Event Clock export.");
      return;
    }
    if (typeof data.completions === "object" && data.completions !== null) {
      merge(data.completions as Record<string, { completedAt: string }>);
    }
  } catch {
    alert("That file couldn't be read. Export a fresh copy and try again.");
  }
}
