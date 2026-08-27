import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchFeed, type FeedState } from "./api.ts";
import { Controls } from "./components/Controls.tsx";
import { Dailies } from "./components/Dailies.tsx";
import { GameFocus } from "./components/GameFocus.tsx";
import { EventDetail } from "./components/EventDetail.tsx";
import { EventRow, type DailyBadge, type RowEvent } from "./components/EventRow.tsx";
import { NextUp } from "./components/NextUp.tsx";
import { Timeline } from "./components/Timeline.tsx";
import { Welcome } from "./components/Welcome.tsx";
import { Colophon } from "./components/Colophon.tsx";
import { Legend } from "./components/Legend.tsx";
import { Toast } from "./components/Toast.tsx";
import { UpdateNotice } from "./components/UpdateNotice.tsx";
import { KEYS } from "./state/storage.ts";
import { useAppUpdate } from "./state/useAppUpdate.ts";
import { useMarkSet } from "./state/useMarkSet.ts";
import { useProgress } from "./state/useProgress.ts";
import { useDailyLog, type DailyLogMap } from "./state/useDailyLog.ts";
import { adoptNewLanes, usePrefs } from "./state/usePrefs.ts";
import { snapDayWidth } from "./state/zoom.ts";
import { useCustom, type EventDraft } from "./state/useCustom.ts";
import { compareRows, SORT_MODES, type Activity, type SortMode } from "./state/sort.ts";
import {
  advanceFocus,
  countByGame,
  nextToExpire,
  outstanding,
  resolveFocus,
} from "./state/lens.ts";
import { clockFor, formatRemaining } from "../shared/time.ts";
import { dailySummary, isDaily, resolveDaily } from "../shared/daily.ts";
import { occurrenceForId, strandedOccurrences } from "../shared/recurrence.ts";
import { orderGames } from "./state/gameOrder.ts";
import { GameMetaProvider, type MetaResolver } from "./state/gameMeta.tsx";
import { metaOnTheme, useTheme } from "./state/theme.ts";
import {
  asOccurrenceEvent,
  recordFor,
  type CustomEvents,
  type CustomGames,
  type LaneId,
} from "../shared/custom.ts";
import { metaFor } from "../shared/games.ts";

/**
 * How many deadlines the headline carries.
 *
 * One was the whole panel, and one is what a reader who has just finished it
 * needs replacing. Three is what they asked for: enough to plan an evening
 * around, few enough that the closest one still owns the page.
 */
const HEADLINE_DEADLINES = 3;

/**
 * How many rows a section shows before it offers the rest.
 *
 * Two games already run to twenty-one live events and every game added doubles
 * down on that, which is the point at which a list stops being read at all.
 * This truncates the *view* and nothing else: the order is untouched, the
 * hidden rows are still counted in the header, still on the timeline, and one
 * tap away here.
 */
const LIST_CAP = 6;

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
  const [openId, setOpenId] = useState<string | null>(null);
  // The event most recently ignored, so it can be put back without hunting for
  // a row that just disappeared.
  const [lastIgnored, setLastIgnored] = useState<{ id: string; title: string } | null>(null);
  const now = useNow();
  const online = useOnline();
  const { prefs, update, toggleGame } = usePrefs();
  // Their answer from the first run, or their last tap on the tabs. Reading it
  // from `prefs` is what stops a reload putting a timeline reader back on the
  // list they did not choose.
  const view = prefs.view;
  const ignored = useMarkSet(KEYS.ignored);
  const prog = useProgress();
  const daily = useDailyLog();
  const custom = useCustom(now);
  // Colour only: which ground the page is drawn on, written to the document by
  // the hook. Nothing else in the app asks what it is — the tokens in
  // styles.css answer for every component — except the hues below.
  const theme = useTheme(prefs.theme);
  /**
   * How every lane in this tree is named and coloured.
   *
   * App owns it because App is the only thing holding the reader's own games,
   * and hands it down rather than letting components import a lookup that can
   * only ever answer for the tracked ones.
   *
   * It is also where a hue meets the theme. A hue is data — ours in `games.ts`,
   * theirs in their browser — and all of it was picked against the dark ground,
   * so on paper the bright ones need darkening to stay readable. Doing it here
   * means every lane label, chip, rail and bar in the tree gets the adjusted
   * answer without a single component knowing a theme exists.
   */
  const gameMeta = useMemo<MetaResolver>(
    () => (id) => metaOnTheme(metaFor(id, custom.games), theme),
    [custom.games, theme],
  );
  // "Completed" is now one status among several; the rest of the UI still asks
  // this question a lot, so keep a cheap shorthand.
  const isDone = (id: string) => prog.progress[id]?.status === "done";

  /**
   * How far into an event the reader is, for ordering only.
   *
   * Ticking a day off a repeating event counts as "doing it" without them
   * having to also set the status — the tick already said so, and asking twice
   * is how a sort ends up lying about what you were in the middle of.
   */
  const activityOf = (id: string): Activity => {
    const status = prog.progress[id]?.status;
    if (status === "done") return "done";
    if (status === "doing") return "doing";
    return daily.daysFor(id).length > 0 ? "doing" : "idle";
  };

  /**
   * Whether an event repeats, the reader's own answer included. Detection reads
   * the source's wording; they can overrule it either way.
   */
  const repeatsDaily = (row: RowEvent): boolean =>
    resolveDaily(
      row.event,
      prog.progress[row.event.id]?.daily,
      prefs.detectDaily,
    );

  /** Today's state for a repeating event, or undefined if it does not repeat. */
  const dailyBadge = (row: RowEvent): DailyBadge | undefined => {
    if (!repeatsDaily(row)) return undefined;
    const summary = dailySummary({
      startsMs: row.clock.startsMs,
      endsMs: row.clock.endsMs,
      region: prefs.region,
      game: row.event.game,
      now,
      logged: daily.daysFor(row.event.id),
    });
    return { doneToday: summary.doneToday, remaining: summary.remaining };
  };

  const isIgnored = (id: string) => ignored.marks[id] !== undefined;

  const toggleIgnored = (id: string, title: string) => {
    const wasIgnored = isIgnored(id);
    ignored.toggle(id);
    setLastIgnored(wasIgnored ? null : { id, title });
  };

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
    // The reader's own events are events. They sort, filter, focus, expire and
    // tick exactly like scraped ones — what sets them apart is only that
    // nothing is claimed about where their dates came from.
    return [
      ...state.feed.events.filter((e) => e.status === "published"),
      ...custom.rows,
    ].map((event) => ({ event, clock: clockFor(event, prefs.region, now) }));
    // `now` intentionally excluded: recomputing every clock each second is
    // wasteful, and the countdown text re-renders from `now` anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, custom.rows, prefs.region, Math.floor(now / 60_000)]);

  // Feed lanes come from rows, the reader's from the games themselves — so a
  // game they just created shows up in the filters before it holds anything.
  // It is still not a scraped game with an empty feed: it has no source row, no
  // freshness badge and no colophon credit.
  const games = useMemo<LaneId[]>(
    () => [...new Set([...allRows.map((r) => r.event.game), ...custom.lanes])],
    [allRows, custom.lanes],
  );

  /**
   * A lane the reader has never been offered starts switched off.
   *
   * Adding a source is our decision, not theirs, and a reader who plays two
   * games did not ask for the other twelve. So a lane that is new to *them*
   * is recorded and hidden, and the games chips in settings are where they
   * take it up — the one place that lists every lane, on or off.
   *
   * The seeding branch is the whole reason this is safe: an existing reader
   * has no `knownGames` at all, and treating that as "has been offered
   * nothing" would switch off every game they already read. Absent means
   * unrecorded, so the first pass records what is already on their screen and
   * changes nothing else.
   */
  useEffect(() => {
    if (state.status !== "ready") return;
    const patch = adoptNewLanes(games, prefs.knownGames, prefs.hiddenGames);
    if (patch !== null) update(patch);
  }, [state.status, games, prefs.knownGames, prefs.hiddenGames, update]);

  /**
   * Every lane in the order the reader reads them in.
   *
   * `games` above stays the lane-*identity* list: `adoptNewLanes` diffs it to
   * decide which games arrive switched off and `knownGames` is seeded from it,
   * so reordering it at source would let a display preference reach the logic
   * that hides a reader's games. Ordering is applied here instead, once, and
   * handed to every surface that shows a game.
   */
  const ordered = useMemo(
    () => orderGames(games, prefs.gameOrder, (id) => gameMeta(id).name),
    [games, prefs.gameOrder, gameMeta],
  );

  /** Games the reader plays, in their order. The focus bar rotates through these. */
  const enabled = useMemo(
    () => ordered.filter((g) => !prefs.hiddenGames.includes(g)),
    [ordered, prefs.hiddenGames],
  );

  // A focus on a game they have since switched off is ignored, not obeyed —
  // otherwise the page is blank for a reason that lives in a panel at the
  // bottom. The stored value is left alone so switching the game back on
  // restores where they were.
  const focus = resolveFocus(prefs.focusGame, enabled);

  /**
   * The filters that decide whether a row is on screen at all.
   *
   * Extracted from `inScope` so the timeline's expanded occurrences pass
   * through the same four questions. Restating them there would be a second
   * copy that drifts, and each drift is a row the reader told us to hide
   * appearing on the board.
   */
  const inScopeOf = useCallback(
    (rows: RowEvent[]) =>
      rows
        .filter((r) => !prefs.hiddenGames.includes(r.event.game))
        .filter((r) => !r.clock.ended)
        // Ignored events are gone from both views unless deliberately revealed
        // — that is the whole point of ignoring one.
        .filter((r) => prefs.showIgnored || !isIgnored(r.event.id))
        .filter((r) => prefs.showCompleted || !isDone(r.event.id)),
    [prefs.hiddenGames, prefs.showCompleted, prefs.showIgnored, prog.progress, ignored.marks],
  );

  /**
   * Everything the reader could be looking at, before focus narrows it. The
   * focus chips count off this, so a chip can say what is waiting in a game
   * that is not the one currently on screen.
   */
  const inScope = useMemo(() => inScopeOf(allRows), [allRows, inScopeOf]);

  const visible = useMemo(
    () =>
      inScope
        .filter((r) => focus === null || r.event.game === focus)
        // Sorting only ever groups: both modes fall back to soonest-ending
        // inside a group, so choosing one never costs the deadline order.
        .sort(compareRows(prefs.sort, activityOf)),
    [inScope, focus, prefs.sort, prog.progress, daily.logs],
  );

  /**
   * Fills the timeline's settled window with the rest of a rule's rhythm.
   *
   * Passed to `<Timeline>` as `expand` rather than inlined there — a hook
   * cannot be called inside JSX. Filtered through `inScopeOf` and the focus
   * chip so an expanded occurrence obeys exactly what a base row obeys: a
   * hidden game, an ignored event, or a finished one stays off the board.
   */
  const expandOccurrences = useCallback(
    (min: number, max: number) =>
      inScopeOf(
        custom
          .occurrencesIn(min, max)
          .map((event) => ({ event, clock: clockFor(event, prefs.region, now) })),
      ).filter((r) => focus === null || r.event.game === focus),
    // `now` is deliberately coarse here, as it is for `allRows`:
    // re-expanding every rule each second would be wasted work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [custom.occurrencesIn, inScopeOf, focus, prefs.region, Math.floor(now / 60_000)],
  );

  const live = visible.filter((r) => r.clock.live);
  const upcoming = visible.filter((r) => r.clock.upcoming);
  /**
   * The unstarted events the checklist actually lists.
   *
   * `upcoming` stays the full count either way, because the page header states
   * it — a section that is simply absent is indistinguishable from a quiet
   * fortnight, and this app does not leave a reader to infer what it is not
   * showing them.
   */
  const listedUpcoming = prefs.showUpcoming ? upcoming : [];

  /**
   * What the page is telling the reader to *do*, as opposed to what it is
   * letting them look at.
   *
   * The headline and the dailies strip are both instructions, so both drop
   * events the reader has finished or ignored — being pointed at a job you
   * already did is the bug whether the pointer is a countdown or a checkbox.
   * `showCompleted` deliberately does not reach this: that preference says keep
   * them on screen, not keep nagging me about them.
   */
  const todo = outstanding(live, isDone, isIgnored);
  const headline = nextToExpire(todo, HEADLINE_DEADLINES);

  // Counted across every game the reader plays, not just the focused one — a
  // chip has to say what is waiting behind it to be worth tapping.
  const scopedTodo = useMemo(
    () => outstanding(inScope, isDone, isIgnored),
    [inScope, prog.progress, ignored.marks],
  );
  const perGame = useMemo(() => countByGame(scopedTodo), [scopedTodo]);

  /**
   * The lists only ever build `allRows` from a rule's first two occurrences
   * (`LIST_OCCURRENCES`), but the timeline draws every occurrence the board
   * window admits — so a bar past the second names an id `allRows` cannot
   * resolve. Resolved through the rule behind it rather than dropped, or every
   * later bar would be a dead click with no way to reach per-occurrence
   * completion.
   */
  const openRow = (() => {
    const hit = allRows.find((r) => r.event.id === openId) ?? null;
    if (hit !== null || openId === null) return hit;
    const record = recordFor(custom.events, openId);
    if (record === undefined) return null;
    const occurrence = occurrenceForId(record, openId);
    if (occurrence === null) return null;
    const event = asOccurrenceEvent(record, occurrence);
    return { event, clock: clockFor(event, prefs.region, now) };
  })();

  /** One row, wired up. Both lists render the same thing from the same props. */
  const renderRow = (row: RowEvent) => (
    <EventRow
      key={row.event.id}
      row={row}
      now={now}
      completed={isDone(row.event.id)}
      status={prog.progress[row.event.id]?.status}
      effort={prog.progress[row.event.id]?.effort}
      daily={dailyBadge(row)}
      ignored={isIgnored(row.event.id)}
      onRestore={(id) => ignored.toggle(id)}
      onOpen={setOpenId}
    />
  );

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
  // don't play. Stored as hiddenGames (the inverse); what happens to a game
  // added *later* is decided by `knownGames` above, not by this shape.
  if (!prefs.onboarded) {
    return (
      <GameMetaProvider value={gameMeta}>
        <Shell>
          <Welcome
            available={ordered}
            onConfirm={(chosen, chosenView) =>
              update({
                onboarded: true,
                hiddenGames: games.filter((g) => !chosen.includes(g)),
                view: chosenView,
              })
            }
          />
        </Shell>
      </GameMetaProvider>
    );
  }

  /**
   * Working through games one at a time, which is how someone with four of them
   * actually plays: clear one, move on.
   *
   * It goes at the top of the column it filters, and past `lg` the checklist's
   * column is the rail: the bar rides with the deadlines and the dailies it
   * narrows, pinned and still above every one of them, instead of spending the
   * full width of a wide screen on a row of chips and pushing "next to expire"
   * — the answer the reader came for — down the page to make room. On a phone,
   * and on the timeline, which has no rail, that same rule puts it back at the
   * top of the page. Rendered once per view, never twice on one page.
   */
  const focusBar = (
    <GameFocus
      games={enabled}
      focus={focus}
      counts={perGame}
      total={scopedTodo.length}
      next={advanceFocus(focus, enabled)}
      onFocus={(focusGame) => update({ focusGame })}
      onAdvance={() => update({ focusGame: advanceFocus(focus, enabled) })}
    />
  );

  return (
    <GameMetaProvider value={gameMeta}>
    <Shell>
      <header className="flex items-center justify-between gap-4 border-b border-hairline px-4 pb-3 pt-5">
        <div>
          <p className="font-display text-[0.9375rem] font-bold tracking-[0.02em] lg:text-lg">
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
          {/* The id is a stored value (`prefs.view`) and the label is copy, so
              they are allowed to drift: renaming the tab must not silently move
              every reader to the other view. */}
          {(
            [
              ["soon", "Checklist"],
              ["timeline", "Timeline"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={view === id}
              onClick={() => update({ view: id })}
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
        /*
         * Two columns once the screen has room for them, and the split is the
         * one this codebase already draws everywhere else: what the page is
         * *telling* the reader to do on the left, what it is *showing* them on
         * the right. The deadlines and tonight's dailies are instructions, they
         * are short, and they are what the reader came for — so on a wide
         * screen they stop scrolling away and stay pinned beside the list, with
         * the focus bar that narrows them at the top of the same column.
         *
         * Below `lg` this is one column in exactly the old order, because on a
         * phone the same argument produces the same answer: put them first.
         */
        <div className="lg:grid lg:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[22rem_minmax(0,1fr)]">
          <aside>
            {/* The rule belongs to the panel, not to the column: the deadlines
                and the dailies are short and the list beside them is long, so a
                full-height divider would spend most of its length walling off
                an empty gap. It travels with the panel as that pins. */}
            <div className="scroll-pane lg:sticky lg:top-0 lg:max-h-screen lg:overflow-y-auto lg:border-r lg:border-hairline">
          {focusBar}

          <NextUp
            rows={headline}
            focused={focus === null ? null : gameMeta(focus).name}
            onOpen={setOpenId}
          />

          {/* The chores no wiki publishes, and the only thing on this page
              that expires tonight rather than next patch. */}
          {/* Standing chores are a tracked-game notion: there is no routine we
              could name on behalf of a game the reader invented, so their lanes
              contribute repeating events here but no chore of their own. That
              exclusion is `dailyGroups`' to make, not this call site's — filtering
              the lanes out here would also cost a reader's own game its place in
              the order their repeating events are grouped under. */}
          <Dailies
            games={focus === null ? enabled : [focus]}
            events={todo.filter(repeatsDaily).map((r) => r.event)}
            region={prefs.region}
            now={now}
            daysFor={daily.daysFor}
            onToggleDay={daily.toggleDay}
          />
            </div>
          </aside>

          <div className="min-w-0">
          {live.length > 0 && (
            <Section
              legend
              title="Running now"
              action={
                visible.length > 1 ? (
                  <SortControl
                    value={prefs.sort}
                    onChange={(sort) => update({ sort })}
                  />
                ) : undefined
              }
            >
              <EventList rows={live} render={renderRow} />
            </Section>
          )}

          {listedUpcoming.length > 0 && (
            <Section
              title="Not started yet"
              // The ordering control lives with the first list on the page, so
              // it is never missing when there is something to order.
              action={
                live.length === 0 && listedUpcoming.length > 1 ? (
                  <SortControl
                    value={prefs.sort}
                    onChange={(sort) => update({ sort })}
                  />
                ) : undefined
              }
            >
              <EventList rows={listedUpcoming} render={renderRow} />
            </Section>
          )}

          {/* Nothing listed is three different situations, and the reader can
              only act on the one they are actually in. Held-back events come
              first because that one has a switch behind it. */}
          {live.length === 0 && listedUpcoming.length === 0 && (
            <p className="px-4 py-12 text-sm leading-relaxed text-muted">
              {upcoming.length > 0
                ? `Nothing running right now. ${
                    upcoming.length === 1
                      ? "One event has"
                      : `${upcoming.length} events have`
                  } not started yet — switch on “Show events that haven't started”, under “What you see” in settings below.`
                : focus !== null
                  ? `Nothing running in ${gameMeta(focus).name}. Try another game, or show all of them.`
                  : "Nothing to show. Every game is switched off, or you've finished everything and hidden completed events."}
            </p>
          )}
          </div>
        </div>
      ) : (
        <>
          {focusBar}

          <Timeline
            rows={visible}
            now={now}
            // Snapped here rather than trusted: a stored number arrives from an
            // export written by another version of the ladder, or from a file a
            // reader edited, and a board one pixel wide is not a preference.
            dayWidth={snapDayWidth(prefs.timelineDayWidth)}
            onZoom={(timelineDayWidth) => update({ timelineDayWidth })}
            group={prefs.timelineGroup}
            onGroup={(timelineGroup) => update({ timelineGroup })}
            // The board holds these back itself rather than being handed a
            // shorter list, so it can say how many are waiting when there is
            // nothing else left to draw. The switch is in settings.
            showUpcoming={prefs.showUpcoming}
            splitUpcoming={prefs.timelineSplitUpcoming}
            // Lanes stack in the reader's game order, so their main game is the
            // top lane rather than whichever one held the first row.
            gameOrder={ordered}
            onOpen={setOpenId}
            isDone={isDone}
            expand={expandOccurrences}
          />
        </>
      )}

      <Controls
        games={ordered}
        prefs={prefs}
        onToggleGame={toggleGame}
        onUpdate={update}
        ignoredCount={Object.keys(ignored.marks).length}
        own={{
          games: custom.games,
          events: custom.events,
          // Every lane, not just theirs: a source can miss an event in a game
          // we do track, and that is the same job with the same form.
          lanes: games,
          onAddGame: custom.addGame,
          onEditGame: custom.editGame,
          onRemoveGame: custom.removeGame,
          onAddEvent: custom.addEvent,
        }}
        onExport={() =>
          exportProgress(prog.progress, daily.logs, ignored.marks, prefs, {
            games: custom.games,
            events: custom.events,
          })
        }
        onImport={(file) =>
          void importProgress(
            file,
            prog.merge,
            daily.merge,
            ignored.merge,
            custom.merge,
          )
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

      <Colophon sources={state.feed.sources} now={now} />

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
          completed={isDone(openRow.event.id)}
          ignored={isIgnored(openRow.event.id)}
          status={prog.progress[openRow.event.id]?.status}
          effort={prog.progress[openRow.event.id]?.effort}
          note={prog.progress[openRow.event.id]?.note ?? ""}
          region={prefs.region}
          now={now}
          daily={repeatsDaily(openRow)}
          detectedDaily={prefs.detectDaily && isDaily(openRow.event)}
          dailyDays={daily.daysFor(openRow.event.id)}
          onDaily={prog.setDaily}
          onToggleDay={daily.toggleDay}
          onStatus={prog.setStatus}
          onEffort={prog.setEffort}
          onNote={prog.setNote}
          onIgnore={(id) => toggleIgnored(id, openRow.event.title)}
          onClose={() => setOpenId(null)}
          own={(() => {
            // The row may be one occurrence of a rule. Marks key off the
            // occurrence; the record to edit is the rule behind it.
            const record = recordFor(custom.events, openRow.event.id);
            if (record === undefined) return undefined;
            return {
              record,
              lanes: games,
              games: custom.games,
              onSave: (_id: string, draft: EventDraft) =>
                custom.editEvent(record.id, draft),
              onDelete: () => custom.removeEvent(record.id),
              strandedBy: () =>
                strandedOccurrences(
                  record,
                  now,
                  (id) =>
                    prog.progress[id] !== undefined ||
                    (daily.logs[id]?.days.length ?? 0) > 0,
                ),
            };
          })()}
        />
      )}
    </Shell>
    </GameMetaProvider>
  );
}

/**
 * Every screen goes through here, which is why the update notice lives here
 * rather than beside the list: a reader who is being told "events unavailable"
 * or is still picking their games needs the offer at least as much as one
 * reading a calendar — a bundle too old for the feed it just downloaded
 * (`fetchFeed`'s schemaVersion refusal) lands on exactly that error screen, and
 * a reload is the fix.
 */
function Shell({ children }: { children: React.ReactNode }) {
  const update = useAppUpdate();
  return (
    <div className="mx-auto min-h-full max-w-2xl border-hairline sm:border-x lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl">
      {children}
      {update.available && (
        <UpdateNotice
          applying={update.applying}
          onApply={update.apply}
          onDismiss={update.dismiss}
        />
      )}
    </div>
  );
}

/**
 * A titled block of the checklist, with room for one control on the right.
 *
 * There was a `hint` slot beside `action` — a line of prose for a section with
 * no control — rendered as `action ?? hint`. Nothing could ever reach it: its
 * only caller was "Running now", whose hint needed two live rows, and two live
 * rows are two visible rows, which is exactly when the sort control appears and
 * wins. What it would have said is on the page anyway, in the "Then" list of the
 * headline panel, which names those deadlines and counts them down.
 */
function Section({
  title,
  legend,
  action,
  children,
}: {
  title: string;
  legend?: boolean | undefined;
  /** A control that belongs to this section, e.g. how it is ordered. */
  action?: React.ReactNode | undefined;
  children: React.ReactNode;
}) {
  return (
    <section className="pt-5">
      <div className="flex items-baseline justify-between gap-3 px-4 pb-2">
        <h2 className="eyebrow">{title}</h2>
        {action}
      </div>
      {legend === true && <Legend />}
      {children}
    </section>
  );
}

/**
 * A list of events, capped at a length someone will actually read.
 *
 * The reader who asked for this had two games switched on and twenty-one live
 * events, and said the list stopped being usable — so the default view shows a
 * handful and offers the rest. What it must never do is *reorder*: this slices
 * the front off a list that is already in the order the reader chose, so the
 * deadline guarantee holds for what is shown and what is hidden alike.
 *
 * Expanding is per-visit rather than a stored preference: it is an action taken
 * while reading one list, not a statement about how they want the app to work.
 */
function EventList({
  rows,
  render,
}: {
  rows: RowEvent[];
  render: (row: RowEvent) => React.ReactNode;
}) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? rows : rows.slice(0, LIST_CAP);
  const hidden = rows.length - shown.length;

  return (
    <>
      <ul className="border-t border-hairline">{shown.map(render)}</ul>
      {rows.length > LIST_CAP && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="w-full border-b border-hairline px-4 py-3 text-left text-xs font-medium text-muted transition-colors duration-150 hover:text-ink"
        >
          {showAll ? "Show fewer" : `Show all ${rows.length}`}
          {!showAll && (
            <span className="text-faint">{` · ${hidden} more below the cut`}</span>
          )}
        </button>
      )}
    </>
  );
}

/**
 * Order the list by deadline, or by what the reader is partway through.
 *
 * Sits in the list's own header rather than down in settings: ordering is a
 * thing you reach for while looking at the list, not a preference you go and
 * configure.
 */
function SortControl({
  value,
  onChange,
}: {
  value: SortMode;
  onChange: (mode: SortMode) => void;
}) {
  return (
    <div role="group" aria-label="Sort events" className="flex gap-1">
      {SORT_MODES.map((mode) => {
        const on = value === mode.id;
        return (
          <button
            key={mode.id}
            type="button"
            onClick={() => onChange(mode.id)}
            aria-pressed={on}
            title={mode.hint}
            className={`rounded-full border px-2.5 py-1 text-[0.6875rem] font-medium transition-colors ${
              on
                ? "border-ink/60 text-ink"
                : "border-transparent text-faint hover:text-muted"
            }`}
          >
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}

function exportProgress(
  progress: Record<string, unknown>,
  daily: DailyLogMap,
  ignored: Record<string, { at: string }>,
  prefs: unknown,
  own: { games: CustomGames; events: CustomEvents },
) {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          format: "gacha-tracker-export",
          version: 1,
          exportedAt: new Date().toISOString(),
          progress,
          // Streaks live nowhere else — not on a server, not in the feed — so
          // an export that omitted them would quietly be a lossy backup.
          daily,
          ignored,
          // The reader's own games and events exist nowhere else at all — not
          // in the feed, not on a server. An export without them is a backup
          // that quietly loses the half they typed themselves.
          customGames: own.games,
          customEvents: own.events,
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
  // In the document, and revoked on a later task. This is the only copy of
  // everything the reader typed, ticked and marked — there is no account and no
  // server that has ever seen it — so a download that quietly does not happen is
  // the lossy backup this function exists to prevent. A detached anchor is not
  // reliably clickable, and revoking the URL in the same task can pull the blob
  // out from under a download that had not started reading it yet.
  a.style.display = "none";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function importProgress(
  file: File,
  mergeProgress: (c: Record<string, { at: string }>) => void,
  mergeDaily: (c: DailyLogMap) => void,
  mergeIgnored: (c: Record<string, { at: string }>) => void,
  mergeCustom: (games: unknown, events: unknown) => void,
) {
  try {
    const parsed: unknown = JSON.parse(await file.text());
    const data = parsed as {
      format?: string;
      progress?: unknown;
      completions?: unknown;
      daily?: unknown;
      ignored?: unknown;
      customGames?: unknown;
      customEvents?: unknown;
    };
    if (data.format !== "gacha-tracker-export") {
      alert("That file isn't an Event Clock export.");
      return;
    }
    const asMarks = (v: unknown) =>
      typeof v === "object" && v !== null
        ? (v as Record<string, { at: string }>)
        : null;
    // Accept exports from before progress replaced completions: membership
    // there meant "done", so map it forward rather than dropping it.
    const p = asMarks(data.progress);
    const legacy = asMarks(data.completions);
    const i = asMarks(data.ignored);
    if (p !== null) mergeProgress(p);
    else if (legacy !== null) {
      mergeProgress(
        Object.fromEntries(
          Object.entries(legacy).map(([id, m]) => [id, { ...m, status: "done" }]),
        ),
      );
    }
    // An export written before daily checklists existed simply has no `daily`
    // key; that is not an error, it just leaves the streaks it never held.
    const d = data.daily;
    if (typeof d === "object" && d !== null) mergeDaily(d as DailyLogMap);
    if (i !== null) mergeIgnored(i);
    // Additive keys: an export written before F13 has neither, which is a file
    // from a device that had none rather than an error. An event and the game
    // it belongs to always travel together, so this can never land a lane with
    // nothing to name it.
    mergeCustom(data.customGames, data.customEvents);
  } catch {
    alert("That file couldn't be read. Export a fresh copy and try again.");
  }
}
