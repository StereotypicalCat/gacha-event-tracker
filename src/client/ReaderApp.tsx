import { EFFORT, type Effort } from "../shared/effort.ts";
import { manyServers, serverSuffix } from "./state/reader/servers.ts";
import { mintAccountId } from "./state/reader/ids.ts";
import { trackedGames } from "./state/reader/updates.ts";
import { freshness, type SourceHealth } from "../shared/feed.ts";
import { formatInZone } from "./state/displayTime.ts";
import { aliasesFrom, RETIRED_IDS } from "./state/retiredIds.ts";
import { PinnedRoutine } from "./components/redesign/PinnedRoutine.tsx";
import { DisplayTimeContext } from "./state/displayTime.ts";
import type { CodesFeed } from "../shared/codes.ts";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchFeed,
  fetchCodesFeed,
  refreshOutcome,
  type FeedState,
  type RefreshOutcome,
} from "./api.ts";
import { createReaderStore, type ReaderStore } from "./state/reader/store.ts";
import { openReader } from "./state/reader/open.ts";
import { ReaderContext, useReader } from "./state/reader/useReader.ts";
import { saveBackup } from "./state/reader/backups.ts";
import {
  pairKey,
  type ReaderState,
  type ArchiveRecord,
} from "./state/reader/schema.ts";
import { actionMeta, recordOf } from "./state/reader/actions.ts";
import {
  readerEventRows,
  type ReaderEventRow,
} from "./state/reader/eventRows.ts";
import { routineRows } from "./state/reader/routines.ts";
import { setupReader } from "./state/reader/onboarding.ts";
import { resolveReaderClock, readerClockFor } from "../shared/readerClock.ts";
import {
  CustomGame,
  CustomEvent,
  type CustomGames,
  type CustomEvents,
  mintCustomGameId,
  mintCustomEventId,
  recordFor,
} from "../shared/custom.ts";
import { metaFor } from "../shared/games.ts";
import { readGoal } from "../shared/goal.ts";
import { isDaily, resolveDaily } from "../shared/daily.ts";
import { orderGames } from "./state/gameOrder.ts";
import { advanceFocus } from "./state/lens.ts";
import { restorePrefsValue } from "./state/usePrefs.ts";
import { readableAmounts } from "./state/useAmounts.ts";
import { validRecords, type EventDraft } from "./state/useCustom.ts";
import { useTheme } from "./state/theme.ts";
import {
  appearanceTokens,
  applyAppearance,
  readableOnSurfaces,
} from "./state/appearance.ts";
import { GameMetaProvider } from "./state/gameMeta.tsx";
import { useAppUpdate } from "./state/useAppUpdate.ts";
import { ENTRIES, NOTES, newestId, unseen } from "../shared/changelog.ts";
import {
  ChecklistEvent,
  LedgerColumns,
  UrgencyLegend,
  NextDeadline,
} from "./components/redesign/ChecklistEvent.tsx";
import { EventDetail } from "./components/EventDetail.tsx";

import { FocusPicker } from "./components/redesign/FocusPicker.tsx";
import { YourOwn } from "./components/YourOwn.tsx";
import { AboutPage } from "./components/redesign/AboutPage.tsx";
import { parseRoute, routeHash } from "./state/route.ts";

import { UpdateNotice } from "./components/UpdateNotice.tsx";
import {
  AppNavigation,
  mainViewPatch,
  type AppPage,
} from "./components/redesign/AppNavigation.tsx";
import {
  SettingsLayout,
  type SettingsPage,
} from "./components/redesign/SettingsLayout.tsx";
import { ChangelogPage } from "./components/redesign/ChangelogPage.tsx";
import { GameSettings } from "./components/redesign/GameSettings.tsx";
import { RoutinesPage } from "./components/redesign/RoutinesPage.tsx";
import { DailyPanel } from "./components/redesign/DailyPanel.tsx";
import { RoutineGroup } from "./components/redesign/RoutineGroup.tsx";
import {
  TimelinePage,
  timelineLook,
} from "./components/redesign/TimelinePage.tsx";
import { focusBarShown } from "./components/redesign/FocusPicker.tsx";
import { ArchiveDetail } from "./components/redesign/ArchiveDetail.tsx";
import { ArchivePage } from "./components/redesign/ArchivePage.tsx";
import { BackupPage } from "./components/redesign/BackupPage.tsx";
import { AppearancePage } from "./components/redesign/AppearancePage.tsx";
import { TimeSettings } from "./components/redesign/TimeSettings.tsx";
import { UpdatesPanel } from "./components/redesign/UpdatesPanel.tsx";
import { DataSourcesPage } from "./components/redesign/DataSourcesPage.tsx";
import { FeedFooter } from "./components/redesign/FeedFooter.tsx";
import { SetupWizard } from "./components/redesign/SetupWizard.tsx";
import {
  ReturningTour,
  TOUR_DONE,
  tourMode,
} from "./components/redesign/ReturningTour.tsx";

/** The upcoming section's sub-line: "3 events in 2 games". */
function upcomingSummary(rows: readonly { event: { game: string } }[]): string {
  const games = new Set(rows.map((r) => r.event.game)).size;
  return `${rows.length} ${rows.length === 1 ? "event" : "events"} in ${games} ${games === 1 ? "game" : "games"}`;
}

export function ReaderApp() {
  const [codes, setCodes] = useState<CodesFeed | null>(null);
  const [feed, setFeed] = useState<FeedState>({ status: "loading" });
  const [store, setStore] = useState<ReaderStore | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const ac = new AbortController();
    void fetchCodesFeed(ac.signal)
      .then(setCodes)
      .catch(() => {});
    void fetchFeed(ac.signal)
      .then(async (feed) => {
        const opened = await openReader(
          localStorage,
          [
            ...new Set([
              ...feed.sources.map((s) => s.game),
              ...feed.events.map((e) => e.game),
            ]),
          ],
          new Date().toISOString(),
          mintAccountId,
        );
        if (ac.signal.aborted) return;
        if (!opened.ok) {
          setError(
            opened.reason === "restore"
              ? "Your interrupted restore could not be recovered. Free browser storage and reload; saved data has been retained."
              : "Your saved data could not be opened safely. It has been retained. Check browser storage access and reload.",
          );
          return;
        }
        const created = createReaderStore(localStorage, opened.state);
        setStore(created);
        setFeed({ status: "ready", feed });
      })
      .catch((e) => {
        if (!ac.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Events could not be loaded.",
          );
      });
    return () => ac.abort();
  }, []);
  useEffect(() => () => store?.dispose(), [store]);
  if (error)
    return (
      <main className="app-shell reader-ui">
        <h1>Event Clock could not open</h1>
        <p>{error}</p>
        <button
          type="button"
          onClick={() => {
            try {
              const raw: Record<string, string> = {};
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key?.startsWith("gacha-tracker:"))
                  raw[key] = localStorage.getItem(key)!;
              }
              const url = URL.createObjectURL(
                new Blob(
                  [
                    JSON.stringify(
                      {
                        format: "gacha-tracker-raw-recovery",
                        savedAt: new Date().toISOString(),
                        raw,
                      },
                      null,
                      2,
                    ),
                  ],
                  { type: "application/json" },
                ),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "event-clock-recovery.json";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            } catch {
              setError(
                "Browser storage cannot be read. Your stored data has not been changed; enable storage access and reload.",
              );
            }
          }}
        >
          Export saved data for recovery
        </button>
        <button type="button" onClick={() => location.reload()}>
          Try again
        </button>
      </main>
    );
  if (feed.status !== "ready" || store === null)
    return (
      <main className="app-shell reader-ui">
        <p>Loading events…</p>
      </main>
    );
  return (
    <ReaderContext value={store}>
      <ReaderContent
        codes={codes}
        onCodes={setCodes}
        feed={feed.feed}
        onFeed={(next) => setFeed({ status: "ready", feed: next })}
      />
    </ReaderContext>
  );
}
function ReaderContent({
  feed,
  onFeed,
  codes,
  onCodes,
}: {
  onCodes: (codes: CodesFeed) => void;
  codes: CodesFeed | null;
  feed: Extract<FeedState, { status: "ready" }>["feed"];
  onFeed: (feed: Extract<FeedState, { status: "ready" }>["feed"]) => void;
}) {
  const { state, dispatch, saveError } = useReader();
  const prefs = restorePrefsValue(state.prefs);
  const theme = useTheme(prefs.theme);
  const tokens = useMemo(
    () => appearanceTokens(state.prefs, theme),
    [state.prefs, theme],
  );
  const [now, setNow] = useState(Date.now());
  const [online, setOnline] = useState(navigator.onLine);
  const [hashTick, setHashTick] = useState(0);
  // A reload returns to the page in the address bar; with none, the default view.
  const [startRoute] = useState(() =>
    typeof location === "undefined" ? null : parseRoute(location.hash),
  );
  const [page, setPage] = useState<AppPage>(startRoute?.page ?? prefs.view);
  const [settingsPage, setSettingsPage] = useState<SettingsPage>(
    startRoute?.settings ?? "appearance",
  );
  // A new tab starts at its top. Without this the window kept the last page's
  // scroll, so leaving a scrolled Settings page opened the Checklist part-way
  // down. The first render is skipped so a reload's restored scroll stands.
  const firstPage = useRef(true);
  useEffect(() => {
    if (firstPage.current) {
      firstPage.current = false;
      return;
    }
    window.scrollTo(0, 0);
  }, [page]);
  // Everyone takes the tour once before using the app; a replay from Settings
  // is optional. A returning reader who has not taken it starts on Relaxed.
  const tour = prefs.onboarded
    ? tourMode(state.prefs.redesignTourSeen)
    : "done";
  // At most once per page load, and never after this tab saw the tour
  // finished: if another tab or a stale write ever put an old marker back,
  // the reader is not moved to Relaxed and sent round the tour again.
  const tourSettled = useRef(false);
  if (tour === "done" && prefs.onboarded) tourSettled.current = true;
  useEffect(() => {
    if (tour !== "unseen" || tourSettled.current) return;
    tourSettled.current = true;
    void dispatch({
      type: "prefs",
      patch: { interface: "relaxed", redesignTourSeen: "returning" },
      ...actionMeta(),
    });
  }, [tour]);
  const touring = tour === "new" || tour === "returning" || tour === "replay";
  const tourForced = tour === "new" || tour === "returning";
  const [gameTab, setGameTab] = useState<"setup" | "codes">("setup");
  const [codesGame, setCodesGame] = useState<string | undefined>(
    startRoute?.game,
  );
  useEffect(() => {
    if (!prefs.onboarded || typeof location === "undefined") return;
    const hash = routeHash({
      page,
      settings: settingsPage,
      game: settingsPage === "games" ? codesGame : undefined,
    });
    // Replaced, not pushed: the address follows the page without adding a
    // history entry for every tab the reader clicks.
    if (location.hash !== hash) history.replaceState(null, "", hash);
  }, [page, settingsPage, codesGame, prefs.onboarded, hashTick]);
  useEffect(() => {
    const follow = () => {
      const route = parseRoute(location.hash);
      // An address naming no page keeps the current one, and says so.
      if (!route) return setHashTick((n) => n + 1);
      setPage(route.page);
      if (route.settings) setSettingsPage(route.settings);
      setCodesGame(route.game);
    };
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, []);
  const [archivedOpen, setArchivedOpen] = useState<ArchiveRecord | null>(null);
  const [open, setOpen] = useState<ReaderEventRow | null>(null);
  const [transition, setTransition] = useState<{
    key: string;
    accountId: string;
    eventId: string;
    title: string;
    label: string;
    phase: "hold" | "fade" | "hidden";
  } | null>(null);
  const [backupError, setBackupError] = useState("");
  const appUpdate = useAppUpdate();
  const zone =
    typeof state.prefs.timezone === "string" ? state.prefs.timezone : null;
  const customGames = useMemo(
    () => validRecords(state.customGames, CustomGame),
    [state.customGames],
  );
  const customEvents = useMemo(
    () => validRecords(state.customEvents, CustomEvent),
    [state.customEvents],
  );
  const meta = useMemo(
    () => (id: string) => {
      const original = metaFor(id, customGames);
      const override = recordOf(state.prefs.gameColors)[id];
      return {
        ...original,
        hue: readableOnSurfaces(
          typeof override === "string" ? override : original.hue,
          [tokens.ground, tokens.surface],
          4.5,
        ),
      };
    },
    [customGames, state.prefs.gameColors, tokens],
  );
  useEffect(() => {
    applyAppearance(state.prefs, theme);
  }, [state.prefs, theme]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000),
      update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    const table = { ...RETIRED_IDS, ...aliasesFrom(feed.events) };
    if (
      Object.values(state.data).some((d) =>
        [
          d.progress,
          d.ignored,
          ...Object.values(d.daily),
          ...Object.values(d.amounts),
        ].some((map) =>
          Object.keys(table).some((id) => Object.hasOwn(map, id)),
        ),
      ) ||
      [
        ...Object.values(state.archive),
        ...Object.values(state.seenEvents),
      ].some((r) => Object.hasOwn(table, r.event.id))
    )
      void dispatch({ type: "aliases", table, ...actionMeta() });
  }, [feed.events, state.data, state.archive, state.seenEvents, dispatch]);
  const all = useMemo(
    () => readerEventRows(state, feed.events, now),
    [
      state.accounts,
      state.customEvents,
      state.seenEvents,
      feed.events,
      Math.floor(now / 60000),
    ],
  );
  useEffect(() => {
    if (!prefs.onboarded) return;
    const records = all
      .filter(
        (r) =>
          !r.clock.ended ||
          state.data[r.accountId]?.progress[r.event.id] ||
          state.data[r.accountId]?.ignored[r.event.id],
      )
      .filter((r) => {
        const previous = state.seenEvents[pairKey(r.accountId, r.event.id)];
        return (
          !previous ||
          JSON.stringify(previous.event) !== JSON.stringify(r.event) ||
          previous.clockRevision !== r.clockRevision
        );
      })
      .map((r) => ({
        accountId: r.accountId,
        event: r.event,
        firstSeenAt: new Date(now).toISOString(),
        lastSeenAt: new Date(now).toISOString(),
        clockRevision: r.clockRevision,
      }));
    if (records.length)
      void dispatch({ type: "seenEvents", records, ...actionMeta() }).then(() =>
        dispatch({ type: "reconcile", ...actionMeta() }),
      );
    const entries = Object.values(state.accounts)
      .filter((a) => state.eventSeen[a.id] === undefined)
      .map((a) => ({
        id: a.id,
        ids: feed.events.filter((e) => e.game === a.game).map((e) => e.id),
      }));
    if (entries.length)
      void dispatch({ type: "seenBatch", entries, ...actionMeta() });
  }, [all, feed.events, state.eventSeen, prefs.onboarded, dispatch]);
  useEffect(() => {
    if (!prefs.onboarded) return;
    const needs = Object.values(state.seenEvents).some((s) => {
      const a = state.accounts[s.accountId];
      return (
        a &&
        !a.retiredAt &&
        !state.archive[pairKey(a.id, s.event.id)] &&
        (readerClockFor(s.event, a, now).ended ||
          recordOf(state.data[a.id]?.progress[s.event.id]).status === "done" ||
          state.data[a.id]?.ignored[s.event.id])
      );
    });
    if (needs) void dispatch({ type: "reconcile", ...actionMeta() });
  }, [
    prefs.onboarded,
    state.seenEvents,
    state.archive,
    state.data,
    Math.floor(now / 60000),
    dispatch,
  ]);
  useEffect(() => {
    if (!prefs.onboarded) return;
    const timer = setTimeout(() => {
      const r = saveBackup(localStorage, state, new Date().toISOString());
      setBackupError(
        r.ok
          ? ""
          : "Automatic backup could not be saved. Export a copy in Settings → Backup.",
      );
    }, 1200);
    return () => clearTimeout(timer);
  }, [state.revision, prefs.onboarded]);
  useEffect(() => {
    if (!transition) return;
    const t = setTimeout(
      () => setTransition((t) => (t ? { ...t, phase: "fade" } : null)),
      1500,
    );
    const collapse = setTimeout(
      () => setTransition((t) => (t ? { ...t, phase: "hidden" } : null)),
      1750,
    );
    const undo = setTimeout(() => setTransition(null), 8000);
    return () => {
      clearTimeout(t);
      clearTimeout(collapse);
      clearTimeout(undo);
    };
  }, [transition?.key]);
  const changePage = (next: AppPage) => {
    setPage(next);
    const patch = mainViewPatch(next);
    if (Object.keys(patch).length)
      void dispatch({ type: "prefs", patch, ...actionMeta() });
  };
  /** Ask for the newest published feed and codes; shared by the footer and Data & sources. */
  const refreshFeed = async (): Promise<RefreshOutcome> => {
    try {
      const [next, nextCodes] = await Promise.all([
        fetchFeed(undefined, { fresh: true }),
        fetchCodesFeed(undefined, { fresh: true }).catch(() => null),
      ]);
      if (nextCodes) onCodes(nextCodes);
      const result = refreshOutcome(feed, next);
      if (result === "updated") onFeed(next);
      if (!nextCodes) return "partial";
      return result === "same" &&
        nextCodes &&
        JSON.stringify(codes) !== JSON.stringify(nextCodes)
        ? "updated"
        : result;
    } catch {
      return "failed";
    }
  };
  const showSettings = (next: SettingsPage) => {
    setSettingsPage(next);
    setPage("settings");
  };
  const accounts = Object.values(state.accounts).filter(
    (a) =>
      !a.retiredAt &&
      !prefs.hiddenGames.includes(a.game) &&
      (a.intent.events || Object.values(a.routines).some((r) => r.followed)),
  );
  const ordered = orderGames(
    [...new Set(accounts.map((a) => a.game))],
    prefs.gameOrder,
    (id) => meta(id).name,
  );
  // A view without its focus bar shows every game: a focus chosen elsewhere
  // must never filter a page that offers no way to see or clear it.
  const focus =
    focusBarShown(state.prefs, page) && ordered.includes(prefs.focusGame ?? "")
      ? prefs.focusGame
      : null;
  const progress = (r: ReaderEventRow) =>
    recordOf(state.data[r.accountId]?.progress[r.event.id]);
  const outstanding = all.filter(
    (r) =>
      !r.clock.ended &&
      !state.archive[pairKey(r.accountId, r.event.id)] &&
      progress(r).status !== "done" &&
      !state.data[r.accountId]?.ignored[r.event.id],
  );
  const scoped = outstanding.filter(
    (r) => focus === null || r.event.game === focus,
  );
  const counts = Object.fromEntries(
    ordered.map((game) => [
      game,
      outstanding.filter((r) => r.event.game === game).length,
    ]),
  );
  const pins = accounts
    .filter((a) => focus === null || a.game === focus)
    .flatMap((a) => routineRows(state, a.id, now))
    .filter((r) => r.placement.followed && r.placement.checklist);
  const separate = state.prefs.dailyLayout !== "grouped";
  const visible = all.filter(
    (r) =>
      (focus === null || r.event.game === focus) &&
      !r.clock.ended &&
      (!r.clock.upcoming || prefs.showUpcoming) &&
      (!state.archive[pairKey(r.accountId, r.event.id)] ||
        (transition?.key === pairKey(r.accountId, r.event.id) &&
          transition.phase !== "hidden")),
  );
  if (prefs.sort === "doing")
    visible.sort(
      (a, b) =>
        Number(progress(b).status === "doing") -
          Number(progress(a).status === "doing") ||
        (a.clock.endsMs ?? Infinity) - (b.clock.endsMs ?? Infinity),
    );
  const focusBar = (
    <FocusPicker
      games={ordered}
      focus={focus}
      counts={counts}
      total={outstanding.length}
      next={advanceFocus(focus, ordered)}
      onFocus={(focusGame) =>
        void dispatch({ type: "prefs", patch: { focusGame }, ...actionMeta() })
      }
      onAdvance={() =>
        void dispatch({
          type: "prefs",
          patch: { focusGame: advanceFocus(focus, ordered) },
          ...actionMeta(),
        })
      }
    />
  );
  const outcome = async (row: ReaderEventRow, kind: "done" | "ignored") => {
    const r = await dispatch({
      type: "outcome",
      accountId: row.accountId,
      eventId: row.event.id,
      outcome: kind,
      ...actionMeta(),
    });
    if (r.ok) {
      setOpen(null);
      setTransition({
        key: pairKey(row.accountId, row.event.id),
        accountId: row.accountId,
        eventId: row.event.id,
        title: row.event.title,
        label: kind === "done" ? "Completed" : "Ignored",
        phase: "hold",
      });
    }
  };
  const renderRow = (row: ReaderEventRow) => {
    const key = pairKey(row.accountId, row.event.id),
      p = progress(row);
    return (
      <li
        key={key}
        className={
          transition?.key === key && transition.phase === "fade"
            ? "archive-fading"
            : ""
        }
      >
        <ChecklistEvent
          row={row}
          now={now}
          doing={p.status === "doing"}
          server={manyServers(state, row.event.game)}
          compact={prefs.density === "compact"}
          onOpen={() => setOpen(row)}
        />
        {transition?.key === key && transition.phase !== "hidden" && (
          <p className="archive-confirm" role="status">
            {transition.label} · Moved to Archive
          </p>
        )}
      </li>
    );
  };
  const mainUpdates = (
    <>
      <UpdatesPanel
        codes={codes}
        onCodes={(game) => {
          setGameTab("codes");
          setCodesGame(game);
          showSettings("games");
        }}
        state={state}
        feed={feed}
        now={now}
        onSources={() => showSettings("sources")}
        onAction={dispatch}
      />
      {unseen(
        ENTRIES,
        prefs.changelogSeen,
        new Date(now).toISOString().slice(0, 10),
      ).length > 0 && (
        <div className="release-update update-row">
          <strong>What's new in Event Clock</strong>
          <button onClick={() => showSettings("changelog")}>
            Read the release notes
          </button>
          <button
            onClick={() =>
              void dispatch({
                type: "prefs",
                patch: { changelogSeen: newestId(ENTRIES) },
                ...actionMeta(),
              })
            }
          >
            Got it
          </button>
        </div>
      )}
    </>
  );
  const ownProps = readerOwnProps(
    state,
    customGames,
    customEvents,
    dispatch,
    setOpen,
    all,
    now,
  );
  return (
    <DisplayTimeContext value={zone}>
      <GameMetaProvider value={meta}>
        <main
          className="app-shell reader-ui"
          data-touring={touring || undefined}
        >
          {/* During the tour, forced or replayed, the page behind shows each
              stop but takes no clicks or focus. `display: contents` keeps the
              layout as if this wrapper were not here. */}
          <div className="tour-behind" inert={touring}>
            <header className="top">
              {prefs.onboarded ? (
                <button
                  type="button"
                  className="mark"
                  aria-label="Event Clock — go to your default view"
                  onClick={() => changePage(prefs.view)}
                >
                  Event<span>Clock</span>
                </button>
              ) : (
                <p className="mark">
                  Event<span>Clock</span>
                </p>
              )}
              {prefs.onboarded && (
                <AppNavigation
                  page={page}
                  onPage={changePage}
                  counts={{
                    soon: outstanding.filter((r) => r.clock.live).length,
                    routines: accounts
                      .flatMap((a) => routineRows(state, a.id, now))
                      .filter((r) => r.placement.followed && !r.status.met)
                      .length,
                    archive: Object.keys(state.archive).length,
                  }}
                />
              )}
            </header>
            {saveError && !saveError.ok && (
              <p role="alert" className="save-error">
                Your last change could not be saved ({saveError.reason}). Your
                previous data remains available. Try again or export it in
                Backup.
              </p>
            )}
            {backupError && (
              <p role="status" className="help">
                {backupError}
              </p>
            )}
            {!prefs.onboarded ? (
              <SetupWizard
                state={state}
                meta={meta}
                onFinish={async (draft) => {
                  const next = setupReader(
                    draft,
                    state,
                    new Date().toISOString(),
                    mintAccountId,
                  );
                  for (const account of Object.values(next.accounts)) {
                    const result = await dispatch({
                      type: "account",
                      account,
                      ...actionMeta(),
                    });
                    if (!result.ok) return;
                  }
                  // No navigation here: the tour opens next and leads the way,
                  // ending on the chosen view.
                  // Only what setup changed, so a setup finished in a second,
                  // stale tab leaves alone every setting setup does not set.
                  await dispatch({
                    type: "prefs",
                    patch: Object.fromEntries(
                      Object.entries(next.prefs).filter(
                        ([k, v]) =>
                          JSON.stringify(v) !== JSON.stringify(state.prefs[k]),
                      ),
                    ),
                    ...actionMeta(),
                  });
                }}
              />
            ) : (
              <>
                {page === "soon" && (
                  <div className="checklist-layout">
                    <aside className="checklist-rail">
                      <div className="rail">
                        {focusBarShown(state.prefs, "soon") && focusBar}
                        <NextDeadline
                          row={scoped.find((r) => r.clock.live)}
                          then={scoped.filter((r) => r.clock.live).slice(1, 4)}
                          servers={(game) => manyServers(state, game)}
                          onOpen={setOpen}
                        />
                        {separate && (
                          <DailyPanel
                            onManage={() => changePage("routines")}
                            rows={pins.filter((r) => r.cadence === "day")}
                            state={state}
                            onAction={dispatch}
                            now={now}
                          />
                        )}
                        <section className="pinned-routines">
                          <div className="pinned-heading">
                            <div>
                              <h2>Routines</h2>
                              <p className="sub">Showing only pinned</p>
                            </div>
                            <button onClick={() => changePage("routines")}>
                              Edit pins
                            </button>
                          </div>
                          {accounts
                            .filter((a) => focus === null || a.game === focus)
                            .map((a) => {
                              const rows = pins.filter(
                                (r) =>
                                  r.accountId === a.id &&
                                  (!separate || r.cadence !== "day"),
                              );
                              return rows.length ? (
                                <RoutineGroup
                                  key={
                                    a.id +
                                    focus +
                                    String(state.prefs.routineDisclosure)
                                  }
                                  title={`${meta(a.game).short}${serverSuffix(state, a.game, a.region)}`}
                                  hue={meta(a.game).hue}
                                  done={rows.filter((r) => r.status.met).length}
                                  total={rows.length}
                                  summary={
                                    rows.every((r) => r.status.met)
                                      ? `All ${rows.length} done`
                                      : `${rows.filter((r) => r.status.met).length} of ${rows.length} completed`
                                  }
                                  policy={
                                    state.prefs.routineDisclosure === "always"
                                      ? "always"
                                      : state.prefs.routineDisclosure ===
                                          "expanded"
                                        ? "expanded"
                                        : "collapsed"
                                  }
                                  focused={focus !== null}
                                >
                                  {rows.map((row) => (
                                    <PinnedRoutine
                                      key={row.id}
                                      row={row}
                                      hue={meta(a.game).hue}
                                      onAction={dispatch}
                                      now={now}
                                    />
                                  ))}
                                </RoutineGroup>
                              ) : null;
                            })}
                          <button
                            type="button"
                            className="quiet"
                            onClick={() => changePage("routines")}
                          >
                            Manage routines
                          </button>
                        </section>
                      </div>
                    </aside>
                    <div className="checklist-main">
                      {mainUpdates}
                      <div className="list-heading running-heading">
                        <h1>Running now</h1>
                        <div className="list-tools">
                          <div className="segmented">
                            {["standard", "compact"].map((d) => (
                              <button
                                type="button"
                                key={d}
                                aria-pressed={prefs.density === d}
                                onClick={() =>
                                  void dispatch({
                                    type: "prefs",
                                    patch: { density: d },
                                    ...actionMeta(),
                                  })
                                }
                              >
                                {d === "standard" ? "Standard" : "Compact"}
                              </button>
                            ))}
                          </div>
                          <div className="segmented" aria-label="Sort events">
                            {(["ending", "doing"] as const).map((sort) => (
                              <button
                                key={sort}
                                aria-pressed={prefs.sort === sort}
                                onClick={() =>
                                  void dispatch({
                                    type: "prefs",
                                    patch: { sort },
                                    ...actionMeta(),
                                  })
                                }
                              >
                                {sort === "ending"
                                  ? "Ending soonest"
                                  : "Doing first"}
                              </button>
                            ))}
                          </div>
                        </div>
                        {/* One line under the title and the buttons: the count
                          on the left, live's legend on the right. */}
                        <div className="heading-meta">
                          <p className="sub">
                            {visible.filter((r) => r.clock.live).length} events
                            in {new Set(visible.map((r) => r.event.game)).size}{" "}
                            games · sorted by what ends first
                            {!online ? " · offline" : ""}
                          </p>
                          <UrgencyLegend />
                        </div>
                      </div>
                      {visible.length ? (
                        <>
                          {prefs.density === "compact" && <LedgerColumns />}
                          <ul className="event-list">
                            {visible
                              .filter((r) => !r.clock.upcoming)
                              .map(renderRow)}
                          </ul>
                          {visible.some((r) => r.clock.upcoming) && (
                            <section className="upcoming-events">
                              <div className="list-heading">
                                <div>
                                  <p className="eyebrow">Coming up</p>
                                  <h2>Not started yet</h2>
                                  <p className="sub">
                                    {upcomingSummary(
                                      visible.filter((r) => r.clock.upcoming),
                                    )}
                                  </p>
                                </div>
                              </div>
                              {prefs.density === "compact" && (
                                <LedgerColumns upcoming />
                              )}
                              <ul className="event-list">
                                {visible
                                  .filter((r) => r.clock.upcoming)
                                  .map(renderRow)}
                              </ul>
                            </section>
                          )}
                        </>
                      ) : (
                        <p className="empty-state">
                          No events to show. Choose another game or change
                          tracking in Settings → Your games.
                        </p>
                      )}
                      <p className="list-foot">
                        Done or ignored events leave this list and wait in the{" "}
                        <button onClick={() => changePage("archive")}>
                          Archive
                        </button>
                        .
                      </p>
                    </div>
                  </div>
                )}
                {page === "timeline" && (
                  <>
                    {mainUpdates}
                    <TimelinePage
                      state={state}
                      focus={focus}
                      focusBar={
                        focusBarShown(state.prefs, "timeline") ? focusBar : null
                      }
                      rows={visible}
                      now={now}
                      onAction={dispatch}
                      onOpen={setOpen}
                    />
                  </>
                )}
                {page === "routines" && (
                  <RoutinesPage state={state} onAction={dispatch} now={now} />
                )}
                {page === "archive" && (
                  <ArchivePage
                    state={state}
                    onAction={dispatch}
                    now={now}
                    onOpen={setArchivedOpen}
                  />
                )}
                {page === "settings" && (
                  <SettingsLayout
                    state={state}
                    codes={codes}
                    game={codesGame}
                    page={settingsPage}
                    onPage={(p) => {
                      setCodesGame(undefined);
                      setSettingsPage(p);
                    }}
                    onGame={(g) => {
                      setCodesGame(g);
                      setGameTab("setup");
                      setSettingsPage("games");
                    }}
                  >
                    {settingsPage === "appearance" ||
                    (settingsPage === "games" && !codesGame) ? (
                      <AppearancePage
                        state={state}
                        onAction={dispatch}
                        onReplayTour={() => {
                          void dispatch({
                            type: "prefs",
                            patch: { redesignTourSeen: "replay" },
                            ...actionMeta(),
                          });
                        }}
                      />
                    ) : settingsPage === "games" && codesGame ? (
                      <GameSettings
                        key={`${codesGame}-${gameTab}`}
                        initialTab={gameTab}
                        codes={codes}
                        initialGame={codesGame}
                        state={state}
                        sources={feed.sources}
                        onAction={dispatch}
                      />
                    ) : settingsPage === "time" ? (
                      <TimeSettings
                        state={state}
                        now={now}
                        onAction={dispatch}
                      />
                    ) : settingsPage === "sources" ? (
                      <DataSourcesPage
                        sources={feed.sources.filter((s) =>
                          trackedGames(state).has(s.game),
                        )}
                        now={now}
                        timezone={zone}
                        online={online}
                        onRefresh={refreshFeed}
                        showUpcoming={prefs.showUpcoming}
                        detectDaily={prefs.detectDaily}
                        standardPulls={state.prefs.standardPulls === true}
                        onPrefs={(patch) =>
                          void dispatch({
                            type: "prefs",
                            patch,
                            ...actionMeta(),
                          })
                        }
                      />
                    ) : settingsPage === "backup" ? (
                      <BackupPage state={state} />
                    ) : settingsPage === "changelog" ? (
                      <ChangelogPage notes={NOTES} entries={ENTRIES} />
                    ) : settingsPage === "about" ? (
                      <AboutPage sources={feed.sources} />
                    ) : settingsPage === "own" ? (
                      <section>
                        <h1>Your own events and games</h1>
                        <p className="help">
                          Only what you added yourself. Routines live on the
                          Routines tab.
                        </p>
                        <YourOwn {...ownProps} />
                      </section>
                    ) : null}
                  </SettingsLayout>
                )}
                <FeedFooter
                  sources={feed.sources}
                  now={now}
                  online={online}
                  timezone={zone}
                  onAbout={() => showSettings("about")}
                  onRefresh={refreshFeed}
                />
              </>
            )}
            {transition && (
              <aside className="archive-toast" role="status">
                {transition.label} “{transition.title}” · Moved to Archive{" "}
                <button
                  type="button"
                  onClick={() => {
                    void dispatch({
                      type: "restore",
                      accountId: transition.accountId,
                      eventId: transition.eventId,
                      ...actionMeta(),
                    });
                    setTransition(null);
                  }}
                >
                  Undo
                </button>
              </aside>
            )}
            {archivedOpen && (
              <ArchiveDetail
                record={archivedOpen}
                state={state}
                onAction={dispatch}
                onClose={() => setArchivedOpen(null)}
              />
            )}
            {open && (
              <ReaderDetail
                sources={feed.sources}
                onSources={() => {
                  setOpen(null);
                  showSettings("sources");
                }}
                row={open}
                state={state}
                now={now}
                timezone={zone}
                onAction={dispatch}
                onOutcome={(kind) => void outcome(open, kind)}
                onClose={() => setOpen(null)}
                ownProps={ownProps}
              />
            )}
            {appUpdate.available && (
              <UpdateNotice
                applying={appUpdate.applying}
                onApply={appUpdate.apply}
                onDismiss={appUpdate.dismiss}
              />
            )}
          </div>
          {touring && (
            <>
              <ReturningTour
                intro={tour === "replay" ? undefined : tour}
                closable={!tourForced}
                looks={{
                  interface: prefs.interface ?? "structured",
                  timelineLook: timelineLook(state.prefs),
                }}
                onLook={(patch) =>
                  void dispatch({ type: "prefs", patch, ...actionMeta() })
                }
                onStep={(stop) => {
                  setOpen(null);
                  setArchivedOpen(null);
                  if (stop === "settings" || stop === "replay") {
                    setCodesGame(undefined);
                    showSettings("appearance");
                    return;
                  }
                  if (
                    stop !== "codes-game" &&
                    stop !== "codes-tab" &&
                    stop !== "codes"
                  ) {
                    setPage(stop);
                    return;
                  }
                  // A tracked game that has codes, else any tracked game:
                  // its Codes tab says when none are published.
                  const game =
                    accounts
                      .map((a) => a.game)
                      .find((g) => codes?.codes.some((c) => c.game === g)) ??
                    accounts[0]?.game;
                  if (!game) {
                    setPage("soon");
                    return;
                  }
                  setGameTab(stop === "codes" ? "codes" : "setup");
                  setCodesGame(game);
                  showSettings("games");
                }}
                onFinish={() => {
                  void dispatch({
                    type: "prefs",
                    patch: { redesignTourSeen: TOUR_DONE },
                    ...actionMeta(),
                  });
                  setPage(prefs.view);
                }}
              />
            </>
          )}
        </main>
      </GameMetaProvider>
    </DisplayTimeContext>
  );
}
function readerOwnProps(
  state: ReaderState,
  games: CustomGames,
  events: CustomEvents,
  onAction: import("./components/redesign/GameSettings.tsx").ActionHandler,
  onOpen: (row: ReaderEventRow) => void,
  rows: ReaderEventRow[],
  now: number,
): React.ComponentProps<typeof YourOwn> {
  const lanes = [...new Set(Object.values(state.accounts).map((a) => a.game))];
  const saveEvent = (id: string, draft: EventDraft) => {
    const at = new Date().toISOString();
    void onAction({
      type: "record",
      collection: "customEvents",
      id,
      value: {
        ...recordOf(state.customEvents[id]),
        ...draft,
        id,
        startPrecision: draft.startHasTime ? "exact" : "day",
        endPrecision:
          draft.endsAt === null
            ? "unknown"
            : draft.endHasTime
              ? "exact"
              : "day",
        summary: draft.summary?.trim() || null,
        at: events[id]?.at ?? at,
        updatedAt: at,
      },
      ...actionMeta(),
    });
  };
  return {
    games,
    events,
    lanes,
    now,
    onOpen: (id) => {
      const row =
        rows.find((r) => r.event.id === id) ||
        rows.find((r) => r.event.id.startsWith(id + "#"));
      if (row) onOpen(row);
    },
    onAddGame: (name, hue) => {
      const at = new Date().toISOString(),
        id = mintCustomGameId(name, Object.keys(games));
      void onAction({
        type: "record",
        collection: "customGames",
        id,
        value: { id, name, hue, at, updatedAt: at },
        ...actionMeta(),
      }).then(async () => {
        const { createAccount } = await import("./state/reader/accounts.ts");
        await onAction({
          type: "account",
          account: createAccount(
            id,
            restorePrefsValue(state.prefs).region,
            at,
            mintAccountId(),
          ),
          ...actionMeta(),
        });
      });
    },
    onEditGame: (id, name, hue) =>
      void onAction({
        type: "record",
        collection: "customGames",
        id,
        value: {
          ...recordOf(state.customGames[id]),
          name,
          hue,
          updatedAt: new Date().toISOString(),
        },
        ...actionMeta(),
      }),
    onRemoveGame: (id) => {
      const blockedBy = Object.values(events).filter(
        (e) => e.game === id,
      ).length;
      if (blockedBy) return { removed: false, blockedBy };
      void onAction({
        type: "record",
        collection: "customGames",
        id,
        value: null,
        ...actionMeta(),
      });
      for (const a of Object.values(state.accounts).filter(
        (a) => a.game === id,
      ))
        void onAction({
          type: "account",
          account: { ...a, retiredAt: new Date().toISOString() },
          ...actionMeta(),
        });
      return { removed: true, blockedBy: 0 };
    },
    onAddEvent: (draft) => saveEvent(mintCustomEventId(), draft),
  };
}
function ReaderDetail({
  row,
  state,
  now,
  timezone,
  onAction,
  onOutcome,
  onClose,
  ownProps,
  sources,
  onSources,
}: {
  sources: SourceHealth[];
  onSources: () => void;
  row: ReaderEventRow;
  state: ReaderState;
  now: number;
  timezone: string | null;
  onAction: import("./components/redesign/GameSettings.tsx").ActionHandler;
  onOutcome: (outcome: "done" | "ignored") => void;
  onClose: () => void;
  ownProps: React.ComponentProps<typeof YourOwn>;
}) {
  const a = state.accounts[row.accountId]!;
  const timing = resolveReaderClock(a, now);
  const data = state.data[a.id]!;
  const p = recordOf(data.progress[row.event.id]);
  const raw = recordOf(data.daily[timing.revision]?.[row.event.id]);
  const days = Array.isArray(raw.days)
    ? raw.days.filter((d): d is string => typeof d === "string")
    : [];
  const goal = readGoal(p.goal);
  const patch = (patch: Record<string, unknown>) =>
    void onAction({
      type: "progress",
      accountId: a.id,
      itemId: row.event.id,
      patch,
      ...actionMeta(),
    });
  const own = recordFor(ownProps.events, row.event.id);
  const stale = freshness(
    sources.filter((s) => s.game === row.event.game),
    now,
  ).stale;
  return (
    <EventDetail
      sourceNotice={
        stale.length ? (
          <div className="detail-source-notice">
            <p>Event data may be out of date.</p>
            {stale[0]!.sources.map((s) => (
              <p className="help" key={s.sourceId}>
                {s.sourceId} ·
                {s.lastConfirmedAt
                  ? `Last checked ${formatInZone(s.lastConfirmedAt, true, timezone)}`
                  : "No successful source check recorded"}
                {s.contentChangedAt
                  ? ` · content changed ${formatInZone(s.contentChangedAt, true, timezone)}`
                  : ""}
              </p>
            ))}
            <button type="button" onClick={onSources}>
              Details & reasons
            </button>
          </div>
        ) : undefined
      }
      row={{ ...row, clock: readerClockFor(row.event, a, now) }}
      completed={p.status === "done"}
      ignored={Boolean(data.ignored[row.event.id])}
      status={
        p.status === "doing" || p.status === "done" ? p.status : undefined
      }
      effort={
        typeof p.effort === "string" && Object.hasOwn(EFFORT, p.effort)
          ? (p.effort as Effort)
          : undefined
      }
      note={typeof p.note === "string" ? p.note : ""}
      region={a.region}
      timing={timing}
      timezone={timezone}
      now={now}
      daily={
        goal !== undefined ||
        resolveDaily(
          row.event,
          typeof p.daily === "boolean" ? p.daily : undefined,
          state.prefs.detectDaily === true,
        )
      }
      detectedDaily={state.prefs.detectDaily === true && isDaily(row.event)}
      dailyDays={days}
      goal={goal}
      hasStoredGoal={p.goal !== undefined}
      amounts={readableAmounts(
        data.amounts[timing.revision]?.[row.event.id] as
          Record<string, unknown> | undefined,
      )}
      onSetAmount={(id, period, value) =>
        void onAction({
          type: "amount",
          accountId: a.id,
          revisionId: timing.revision,
          itemId: id,
          period,
          value,
          ...actionMeta(),
        })
      }
      onDaily={(_id, daily, clearsGoal) =>
        patch({
          ...((clearsGoal ?? false) ? { goal: null } : {}),
          daily: daily ?? null,
        })
      }
      onGoal={(_id, goal) =>
        patch({ goal: goal ?? null, ...(goal ? { daily: null } : {}) })
      }
      onToggleDay={(id, day) =>
        void onAction({
          type: "day",
          accountId: a.id,
          revisionId: timing.revision,
          itemId: id,
          day,
          checked: !days.includes(day),
          ...actionMeta(),
        })
      }
      onIgnore={() => onOutcome("ignored")}
      onStatus={(_id, status) => {
        if (status === "done") onOutcome("done");
        else patch({ status: status ?? null });
      }}
      onEffort={(_id, effort) => patch({ effort: effort ?? null })}
      onNote={(_id, note) => patch({ note })}
      onClose={onClose}
      own={
        own
          ? {
              record: own,
              lanes: ownProps.lanes,
              games: ownProps.games,
              onSave: (id, draft) =>
                void onAction({
                  type: "record",
                  collection: "customEvents",
                  id,
                  value: {
                    ...recordOf(state.customEvents[id]),
                    ...draft,
                    startPrecision: draft.startHasTime ? "exact" : "day",
                    endPrecision:
                      draft.endsAt === null
                        ? "unknown"
                        : draft.endHasTime
                          ? "exact"
                          : "day",
                    summary: draft.summary?.trim() || null,
                    updatedAt: new Date().toISOString(),
                  },
                  ...actionMeta(),
                }),
              onDelete: (id) => {
                void onAction({
                  type: "record",
                  collection: "customEvents",
                  id,
                  value: null,
                  ...actionMeta(),
                });
                onClose();
              },
              strandedBy: () =>
                Object.keys(data.progress).filter((id) =>
                  id.startsWith(own.id + "#"),
                ).length,
            }
          : undefined
      }
    />
  );
}
