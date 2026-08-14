import { useEffect, useMemo, useState } from "react";
import { fetchFeed, type FeedState } from "./api.ts";
import { Controls } from "./components/Controls.tsx";
import { EventDetail } from "./components/EventDetail.tsx";
import { EventRow, type RowEvent } from "./components/EventRow.tsx";
import { NextUp } from "./components/NextUp.tsx";
import { Timeline } from "./components/Timeline.tsx";
import { Welcome } from "./components/Welcome.tsx";
import { Colophon } from "./components/Colophon.tsx";
import { Legend } from "./components/Legend.tsx";
import { Toast } from "./components/Toast.tsx";
import { KEYS } from "./state/storage.ts";
import { useMarkSet } from "./state/useMarkSet.ts";
import { usePrefs } from "./state/usePrefs.ts";
import { clockFor, DAY, endingSoonestFirst, formatRemaining } from "../shared/time.ts";
import type { GameId } from "../shared/schema.ts";

type View = "soon" | "calendar";

/**
 * Connection state. Offline is not an error here — the service worker serves
 * the last feed it saw and countdowns run off the local clock — but it does
 * change what the reader can trust, so it is surfaced rather than hidden.
 */
function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

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
  // The event most recently ignored, so it can be put back without hunting for
  // a row that just disappeared.
  const [lastIgnored, setLastIgnored] = useState<{ id: string; title: string } | null>(null);
  const now = useNow();
  const online = useOnline();
  const { prefs, update, toggleGame } = usePrefs();
  const completed = useMarkSet(KEYS.completions);
  const ignored = useMarkSet(KEYS.ignored);

  const toggleIgnored = (id: string, title: string) => {
    const wasIgnored = ignored.marks[id] !== undefined;
    ignored.toggle(id);
    setLastIgnored(wasIgnored ? null : { id, title });
  };
  const completions = completed.marks;
  const toggle = completed.toggle;

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
        // Ignored events are gone from both views unless deliberately revealed
        // — that is the whole point of ignoring one.
        .filter((r) => prefs.showIgnored || ignored.marks[r.event.id] === undefined)
        .filter((r) => prefs.showCompleted || completions[r.event.id] === undefined)
        .sort(endingSoonestFirst),
    [allRows, prefs.hiddenGames, prefs.showCompleted, prefs.showIgnored, completions, ignored.marks],
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

  // First run: ask which games before showing a calendar full of ones they
  // don't play. Stored as hiddenGames (the inverse) so a game added later shows
  // up by default rather than staying invisible.
  if (!prefs.onboarded) {
    return (
      <Shell>
        <Welcome
          available={games}
          onConfirm={(chosen) =>
            update({
              onboarded: true,
              hiddenGames: games.filter((g) => !chosen.includes(g)),
            })
          }
        />
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
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-faint">
            {live.length} live · {upcoming.length} upcoming
            {!online && (
              <span className="inline-flex items-center gap-1 text-soon">
                <span aria-hidden className="size-1.5 rounded-full bg-soon" />
                offline
              </span>
            )}
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
              legend
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
                  ignored={ignored.marks[row.event.id] !== undefined}
                  onToggle={toggle}
                  onRestore={(id) => ignored.toggle(id)}
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
                  ignored={ignored.marks[row.event.id] !== undefined}
                  onToggle={toggle}
                  onRestore={(id) => ignored.toggle(id)}
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
        ignoredCount={Object.keys(ignored.marks).length}
        onExport={() => exportProgress(completions, ignored.marks, prefs)}
        onImport={(file) =>
          void importProgress(file, completed.merge, ignored.merge)
        }
      />

      {!online && (
        <p className="border-t border-hairline px-4 py-3 text-xs leading-relaxed text-soon">
          You're offline. These are the events last downloaded
          {" "}
          {formatRemaining(now - Date.parse(state.feed.generatedAt))} ago, and
          countdowns are still running. Anything rescheduled since then won't
          show until you reconnect.
        </p>
      )}

      <Colophon sources={state.feed.sources} staleCount={staleSources.length} />

      {lastIgnored !== null && (
        <Toast
          message={`Ignored "${lastIgnored.title}"`}
          actionLabel="Undo"
          onAction={() => {
            ignored.toggle(lastIgnored.id);
            setLastIgnored(null);
          }}
          onDismiss={() => setLastIgnored(null)}
        />
      )}

      {openRow !== null && (
        <EventDetail
          row={openRow}
          completed={completions[openRow.event.id] !== undefined}
          ignored={ignored.marks[openRow.event.id] !== undefined}
          onIgnore={(id) => toggleIgnored(id, openRow.event.title)}
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
  legend,
  children,
}: {
  title: string;
  hint?: string | undefined;
  legend?: boolean | undefined;
  children: React.ReactNode;
}) {
  return (
    <section className="pt-5">
      <div className="flex items-baseline justify-between gap-3 px-4 pb-2">
        <h2 className="eyebrow">{title}</h2>
        {hint !== undefined && <p className="text-xs text-faint">{hint}</p>}
      </div>
      {legend === true && <Legend />}
      <ul className="border-t border-hairline">{children}</ul>
    </section>
  );
}

function exportProgress(
  completions: Record<string, { at: string }>,
  ignored: Record<string, { at: string }>,
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
          ignored,
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
  mergeCompleted: (c: Record<string, { at: string }>) => void,
  mergeIgnored: (c: Record<string, { at: string }>) => void,
) {
  try {
    const parsed: unknown = JSON.parse(await file.text());
    const data = parsed as {
      format?: string;
      completions?: unknown;
      ignored?: unknown;
    };
    if (data.format !== "gacha-tracker-export") {
      alert("That file isn't an Event Clock export.");
      return;
    }
    const asMarks = (v: unknown) =>
      typeof v === "object" && v !== null
        ? (v as Record<string, { at: string }>)
        : null;
    const c = asMarks(data.completions);
    const i = asMarks(data.ignored);
    if (c !== null) mergeCompleted(c);
    if (i !== null) mergeIgnored(i);
  } catch {
    alert("That file couldn't be read. Export a fresh copy and try again.");
  }
}
