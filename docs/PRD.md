# Gacha Event Tracker — Product Spec

## The problem

A player of three or four gacha games is tracking a dozen concurrent, overlapping, time-boxed
events across as many different in-game calendars. The information exists — on wikis, in patch
notes, in-game — but never in one place and never sorted by the thing that actually matters:
**what expires next.** The failure mode is missing a limited event by a day.

## What this app is

A single-page web app that answers three questions:

1. What is running right now, across all my games?
2. What ends soonest?
3. Which of these have I already finished?

## What this app is not

- Not an account system. There is no login, no profile, no cloud sync.
- Not a wiki. It does not explain how to complete an event, only that it exists and when it ends.
- Not a notification service. No push, no email, no background alerts. (A browser-local reminder
  is a plausible v2; it is out of scope for v1.) F14 is not an exception to this: it is the open page
  disclosing something about *itself*, in the tab, while the reader is looking at it — nothing is
  delivered anywhere, and the app is never told to wake anybody up.
- Not a damage calculator, build planner, or pull tracker.

## Users

One persona: a player of 2–5 gacha games who checks in a few times a week, most often on mobile.

Most often is not only, and the desktop layout is not the phone layout stretched. Past `lg` the page
splits: what it is *telling* the reader to do — the next deadlines, tonight's dailies — pins to a
rail on the left and stays put, while the lists it is *showing* them scroll beside it. Below that
breakpoint the same split produces the same answer in one column: instructions first.
They care about accuracy of end dates above everything else — a wrong date is worse than a missing
event, because a missing event sends them to a wiki while a wrong one makes them miss content.

## Scope — v1

### Games at launch

| Game | ID |
|---|---|
| Genshin Impact | `genshin` |
| Honkai: Star Rail | `hsr` |
| Zenless Zone Zero | `zzz` |
| Wuthering Waves | `wuwa` |
| Arknights | `arknights` |
| Arknights: Endfield | `endfield` |
| Neverness to Everness | `nte` |

Added since launch, on the strength of the release thread (`docs/FEEDBACK.md` § P1): Infinity Nikki
(`nikki`), Persona 5: The Phantom X (`p5x`), Reverse: 1999 (`r1999`), Blue Archive (`ba`),
Fate/Grand Order (`fgo`), hololive Dreams (`holodori`).
**`GameId` in `src/shared/schema.ts` is the live answer** and `SOURCES` says which of them actually
have a source — this table is the launch scope, not a roster to keep in sync.

Adding a game must require no change to `GachaEvent` — only a `GameId` entry, its `games.ts`
metadata, and a source registration. That is the test of whether the data model is right, and it has
held: the thirteen games here have cost the event schema nothing. Per-game *metadata* does occasionally
grow (Reverse: 1999 needed `resetHourLocal` for a 05:00 reset), which is a different file and moves
no stored key. A game may have several sources; see `docs/INGESTION.md` § Three layers.

### Features

**F1 — Timeline view.**
A horizontal timeline, one lane per game, spanning a scrollable date range with "today" pinned as a
vertical marker. Each event is a bar from `startsAt` to `endsAt`. Bars are colored by game, and
completed events render at reduced opacity with a check. Clicking a bar opens a detail panel with
title, type, exact start/end in the user's local timezone, source link, and a completion toggle.

An event with `endsAt: null` renders as a bar with a frayed right edge and the label "end date
unknown" — it must be visually distinct from an event that ends far in the future.

It is a board rather than a stretch of page: its own pane, scrolling in both directions, with the
date axis pinned to the top and every name — the lane's and the event's — pinned to the left.
Those three used to scroll away together, which made a wide window worse rather than better: more
calendar on screen, and nothing left saying which day, whose game, or which event was being read. A
six-week bar starts weeks off-screen, so a name that rides off with its own start date leaves a
coloured rectangle behind.

**F2 — Ends-soonest list.**
A flat list of all *currently running* events sorted ascending by end date, with a relative
countdown ("ends in 2 days", "ends in 4 hours"). Under 24 hours, the row is emphasized. This is the
view that justifies the app, and it is one tap from the timeline.

**Which view opens is the reader's answer, not ours.** This spec said "calendar (default)" and the
app shipped opening on the list; both were a decision made on the reader's behalf and then forgotten
on every reload. So the first run asks (F8) and the answer is stored in `prefs.view`. The list is
what the question ships pre-answered with — a reader cannot choose between two layouts they have
not seen, and it is the view that answers "what expires next" in one look.

**The list is capped and offers the rest.** Two games already run to twenty-one live events, and a
reader who tried exactly that said the list stopped being usable. Each section shows a handful with
an explicit "show all N". This truncates the *view* only: the order is untouched, and the rows below
the cut are still counted in the header, still on the timeline, and one tap away.

**F3 — Mark completed.**
A toggle on every event, in both views. State is written to `localStorage` immediately and
optimistically — there is no server round trip and no failure case. Completed events stay visible
but de-emphasized; a filter toggles them out entirely.

**F4 — Filters.**
Filter by game (multi-select, persisted) and by event type. Hiding a game hides it from both views.
Preferences persist in `localStorage`.

**F4a — Focus one game at a time.**
Switching games on and off says *which games the reader plays*, and is set once. It is the wrong
tool for the thing a player of four games actually does while reading: clear one game, move to the
next. Doing that with the on/off switches costs two taps per game and leaves the settings panel no
longer describing what they play.

So focus is a **lens over the filter, not a second filter**: a bar at the top of the page, above
everything it affects, narrowing every view — headline, dailies, lists, calendar and counts — to one
game, with a "next game" control that steps through them and ends by returning to all. It never
changes `hiddenGames`, "All" is always one tap away, and a focus on a game that is switched off or
has left the feed is ignored rather than obeyed, so it can never strand the reader on a blank page
whose cause is elsewhere. Each chip carries that game's outstanding count, so a game with nothing
waiting says so before it is visited.

**F5 — Region selection.**
A user picks Asia / America / Europe once. For events where `regionScoped` is true, all displayed
end times resolve to that region's server reset. This is stored in `localStorage` and defaults to a
guess from the browser timezone, shown as a dismissible "showing America server times — change".

**F6 — Export / import.**
Because there are no accounts, moving between devices is manual: download a JSON file of completed
IDs and preferences, upload it elsewhere. Import merges rather than replaces, and never removes a
completion the user already has.

**F12 — Record your own progress and effort.**
Three states, not two: untouched, doing it, done. Plus an optional effort estimate — quick, short,
long, grind — and a free-text note.

Three states need three targets. A single control cycling untouched → doing → done makes a button
labelled "Mark done" produce "doing it", which is the control lying about itself; the detail sheet
has an explicit control per state, and its primary action goes straight to done and back.

Effort is not decoration. Combined with the time remaining it answers the question the calendar
can't: *can I still finish this?* The same two days is comfortable for a quick event and hopeless
for a grind, so an event carrying an effort estimate gets a "tight" or "running out of time" flag
when the remaining time no longer covers it.

The heuristic assumes about an hour of play a day and says so. It never hides or reorders anything —
it adds a flag the reader can ignore. **An event with no recorded effort never gets a warning**,
because inferring an estimate in order to warn about it would be fabricating their input.

**F13 — Your own games and your own events.**
No feasible adapter set covers everyone. Fourteen games were named in the first release thread and
the reader with the largest collection asked for exactly one thing — *"can you add a custom game
option, we can input our own event description and time frames?"* — and, separately, said they would
wait until "more are added **or we are able to customise it**." That is the tail no source list
reaches, and it needs no scraping, no ToS question and no server.

So a reader can define a game (a name and a lane colour) and enter events against it, or against a
game the app already tracks when a source missed something. Their events sit in the same lists,
timeline, sort and filters as scraped ones, and everything they can do to a scraped event — done,
doing, effort, note, ignore, daily checklist — works identically.

Four constraints, each protecting something that already exists:

- **Their events are visibly theirs.** A hand-entered date is never attributed to a source and never
  carries a source link. The reader must be able to tell, at a glance, which dates the app went and
  found and which ones they typed.
- **Their events never touch the ingest pipeline.** `sanitize.ts` and `merge.ts` exist for pages we
  do not control; a reader's own typing is neither untrusted markup nor a second opinion to
  reconcile. Nothing they enter is fetched, parsed, merged, scored or quarantined.
- **Their IDs live in their own key space.** Never `${game}:${slug}:${date}` — see
  `docs/DATA-MODEL.md` § Reader-authored key spaces.
- **They are in the backup.** An export that omitted hand-entered events would be a lossy backup,
  which is the same argument the code already makes for streaks. This is the *only* copy — there is
  no server to restore from.

**F8 — First-run setup.**
Before any events are shown, the reader picks which games they play, and how they want to read
them. A calendar full of games they
don't play is worse than an empty one — it buries the thing they came for. Nothing is preselected
and the button stays disabled until something is chosen; guessing on their behalf and hoping they
notice is worse than asking. The choice is stored as *hidden* games, the inverse, so a game added
later appears by default rather than staying invisible forever.

The view question (F2) sits under it, with each option drawn rather than only described — the words
"list" and "timeline" mean nothing until you have seen this app's version of them. Unlike the games,
it arrives already answered, and the screen says where to change it afterwards: the tabs are small
text in a corner, which is the one control a first-time reader will not find on their own.

**F9 — Ignore an event.**
Distinct from completing one. "Done" keeps an event visible and counted; "not interested" removes it
from both views entirely. Ignored events stay recoverable: a count and a reveal toggle appear in
settings once there is something to reveal.

**F10 — Works offline.**
The reader's question is answered entirely by data already on the device, and countdowns run off the
local clock, so losing signal should not lose the app. A service worker caches the shell and serves
the last feed it downloaded. Offline is disclosed in the header and above the footer — see F7; stale
data must never be presented as current.

**F11 — Credit and disclaimer.**
The sources that compile these calendars, and the studios that make the games, are named on the same
screen as the data rather than one navigation step away. The page states plainly that it is
unofficial and unaffiliated, and that the source page is the authority when the two disagree.

**F14 — Say when a new version of the app is ready.**
F10 caches the shell so the app survives losing signal, and the same cache is why a reader who never
closes the tab keeps running the version they first loaded. A new game, a repaired parser or a
corrected date then reaches their device and sits there unused, with the page looking unchanged and
nothing saying why. **Presenting an old app as current is the same failure as presenting old events
as current** (F7), so it is disclosed the same way: a notice on any screen, with one action that
reloads into the new version.

It is an offer, not a swap. The app never reloads itself — doing so mid-sentence while someone types
in their own event (F13) would cost them work to save the app a tap. It says what a reload costs
(their place on the page) and what it does not (everything they have marked, typed or ticked lives in
`localStorage`, not in the bundle). Dismissing is free and the offer returns on the next load, which
is also why it need not nag.

A first install is not an update and is not announced — nothing is being replaced, and telling a
first-time reader a new version is available would be false. Neither is a feed refresh: new events
arrive without a reload, and calling that a new version would train readers to dismiss the notice
unread.

**F7 — Freshness disclosure.**
The footer shows when the feed was last updated, per game. If a game's data is more than 48 hours
stale, its lane carries a warning badge. Never present stale data as current — the whole value
proposition is trust in the dates.

## Out of scope for v1

Accounts and sync; push notifications; in-game resource or pull tracking; native mobile apps (the
web app installs to a home screen, which is enough); localization beyond English.

Two entries left this list after v1 shipped and readers used it. Per-event checklists became F12 and
the daily strip; **user-submitted events became F13**, on the strength of the release thread — the
reader juggling ten games asked for it twice and asked for nothing else, and no adapter roadmap
answers them. The decision is recorded here rather than left implicit in the code.

## Success criteria

- A user can identify their next expiring event within **5 seconds** of load, on mobile.
- Published end dates are correct for **99%+** of events. This is a data-quality target, and it is
  what the review gate in `docs/INGESTION.md` exists to protect. Prefer publishing nothing to
  publishing a guess.
- Adding a new game is an adapter plus a fixture plus a test — no schema migration, no client
  change.

## Quality bar for dates — the core product rule

The app's entire value is that the dates are right. Therefore:

- An event with an uncertain end date is published with `endsAt: null`, **not** with a plausible
  guess.
- An event whose confidence is below threshold, or whose sources disagree, is not published at all
  until a human approves it.
- Every event links to its source so a skeptical user can verify in one click.

An empty calendar is a recoverable disappointment. A confidently wrong end date is the failure this
product exists to prevent.

## Open questions

- Does the calendar need a month/grid view, or is the timeline enough? (Assumption: timeline is
  enough for v1; revisit after use.)
- Should an ignored event still count toward the "N live" header total? (Assumption: no — ignoring
  means gone.)
- Should events the user has hidden by game filter still count toward "ends soonest"?
  (Assumption: no — the filter is global.)
- Is 6 hours the right refresh cadence? (Assumption: yes; events are announced days ahead, so
  sub-hourly refresh buys nothing and is rude to the sources.)
