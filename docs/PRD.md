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
rail on the left and stays put, while the lists it is *showing* them scroll beside it. The focus bar
(F4a) rides at the top of that rail, because it narrows what is in it. Below that breakpoint the same
split produces the same answer in one column: instructions first.
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
held: the nineteen games here have cost the event schema nothing. Per-game *metadata* does occasionally
grow (Reverse: 1999 needed `resetHourLocal` for a 05:00 reset), which is a different file and moves
no stored key. A game may have several sources; see `docs/INGESTION.md` § Three layers.

### Features

**F1 — Timeline view.**
A horizontal timeline, by default one lane per game, spanning a scrollable date range with "today"
pinned as a vertical marker. Each event is a bar from `startsAt` to `endsAt`. Bars are colored by game, and
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

**The reader chooses how it stacks.** Lanes keep a game's events adjacent and comparable, which is
what makes the board readable for someone playing four of them — but that reader also has one queue
of deadlines, and lanes scatter it: what ends tonight sits three lanes below what ends next month,
and no scroll position puts them side by side. So a pair of pills in the board's header switches
between **By game** and **Ending soonest**, and the choice is remembered (`prefs.timelineGroup`,
default `"game"` — the board every existing reader already has). Merged, the order is
`endingSoonestFirst`, the same comparator behind the list's "Ending soonest" (F2), so the two views
cannot mean different things by the same words and an unannounced end still sorts behind every dated
one rather than claiming a place in the queue. Merged there is also no lane heading to say whose
event a bar is, and hue alone cannot answer that once nineteen games share a stack — so each bar
carries its game's short name, with the full name in its tooltip. A bar too narrow for a tag and a
title both keeps the title: a chopped game name reads as a broken word, and the hue and the tooltip
still answer it.

**The reader sets the scale.** A patch cycle is six weeks and a login campaign can run for months,
so no single density answers both "what am I in the middle of this week?" and "how do the next three
months line up?". A pair of controls steps through a ladder of day widths, and the choice is
remembered (`prefs.timelineDayWidth`) — the same argument as the view tabs: a reader who has said how
they want to read this should not have to say it again on the next load. Two things it has to get
right. Zooming holds the middle of the view still, because rescaling around the left edge of a
three-month board throws away whatever the reader had scrolled to. And the dated ticks thin out as
the scale shrinks, since a week is 42px at the widest setting and the dates would sit on top of one
another; the gridlines stay weekly either way, because they carry the rhythm rather than the reading.

The close end of the ladder goes to a day being wider than a fingertip (108px). That is not a
flourish: events routinely end within a day of each other, and at a scale where their bar ends are a
few pixels apart the board is being asked the one question it exists to answer and telling the
reader to squint. It also gives a one-day event a bar to read and to tap rather than the 34px
minimum every short bar collapses to.

**Upcoming events are optional and off initially.** New setup asks “Show events that haven't
started” under “What do you want to track?”. The same saved answer governs Checklist and Timeline;
Checklist separates them under “Upcoming events”. Existing saved choices survive migration.

On the board that is structural as well as editorial: the window is drawn from what is plotted, so
showing the future stretches the right edge weeks past today and squeezes the running bars the
reader came for down to nothing.

**Held back is never merely absent.** A section that simply is not there is indistinguishable from a
quiet fortnight, and this app does not leave a reader to infer what it is not showing them. So the
page header states `N live · N upcoming` whatever the setting says, and either view left with
nothing to show says so in words and names the setting rather than rendering an empty column.

The switch lives in Settings → Lists, because it decides which events enter both main views.
Done and ignored events live in Archive; Lists has no redundant Archive link or reveal switches.

**Switched on, the board says in words where they begin.** A bar drawn to the right of the "now"
rule is only *implicitly* in the future, and implicitly is not a standard this product holds itself
to anywhere else a date is involved. Gacha schedules are not a smooth stream of start dates either —
a game ships a patch and six things open at once — so the honest unit is the clump: a dashed rule at
each group of starts, labelled `5 start Aug 24–Aug 27`, in its own band under the `now` chip. Two
clumps that land within a label's width of each other merge and the label states the span it covers,
rather than claiming one date the board is not ruling at. The bars themselves take a dashed left
edge and a thinner wash of their game's hue, so what is running and what is merely scheduled
separate at a glance without reading a single date.

**And the boundary itself is named.** A dashed edge says *this bar* has not started; it does not say
where the running ones stopped, and a board read at a glance should not have to be decoded bar by
bar to answer the question the reader opened it with. So the line between the two gets a label —
`Not started yet`, the same object as a lane's name: a small eyebrow pinned to the left edge, in
muted ink rather than a hue, since a hue on this board means *whose event is this*. One per lane,
because "where does this stop running?" is a different answer for each of them.

**Two readings of that board, and the reader picks** — the board's alone, since the checklist splits
these into a section with a heading of its own either way (`prefs.timelineSplitUpcoming`, default
`true` — the board as it was before the choice existed). Split keeps the unstarted events in their
own block under that heading, and answers "what is on now, and what is queued behind it" — the shape
of a patch. **Mixed in** drops the block for one deadline order, started or not, and answers "what
runs out first", which is the question a Gantt chart is for: an event opening on Friday and closing
on Sunday is a nearer deadline than one running now until October, and the split order can never
show it. Mixed is therefore *not* the heading switched off — every order this board can be handed
holds unstarted rows behind running ones, so dropping the label alone would leave the same block
with nothing explaining it. `timelineLanes` re-sorts on `byDeadline`, which is `endingSoonestFirst`
with exactly that clause removed, and it is the one case where lane mode is allowed to reorder
inside a lane.

**The board draws at most two months of past.** A standing login campaign can have been running for
half a year, and drawing from the earliest start bought months of empty calendar that nobody scrolls
back through and that pushed every other bar off to the right. An event older than the board keeps
its faded left edge rather than being redrawn as though it started at the edge — the same honesty
the frayed right edge carries for an unannounced end.

**F2 — Checklist (the ends-soonest list).**
A flat list of all *currently running* events sorted ascending by end date, with a relative
countdown ("ends in 2 days", "ends in 4 hours"). Under 24 hours, the row is emphasized. This is the
view that justifies the app, and it is one tap from the timeline.

**"Not started yet" is a second section, on for a new reader** (`prefs.showUpcoming`, F1 — the
same switch the board reads, set at first run). Running events are the list's whole claim; what has not opened is
context, and on fourteen lanes it is more rows than the thing the reader came for. Split into its
own section rather than mixed into the order, because that is what the list *is*: a queue of jobs
you can do now, and one you cannot do yet does not belong among them. The board offers the mixed
reading instead, where a nearer deadline genuinely is a nearer deadline (F1).

The tab reads **Checklist**, which is what a reader with four games is doing with it: working down a
list of jobs with deadlines. Its stored id stays `"soon"` — that value is in `prefs.view` on real
devices, and renaming a label must never move a reader to the other view.

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
Done writes durable progress and a metadata snapshot immediately. A confirmation remains for about
1.5 seconds before the row fades/collapses into Archive. Undo is available for eight seconds;
Archive Restore remains available afterwards. A failed write is disclosed and never presented as
saved. Reduced motion removes the fade.

**F4 — Settings and visibility.**
Settings has named pages: General, Your games, Appearance, Lists, Region & time, Data & sources,
Backup, About Event Clock, and Changelog. Your games controls visibility/order, tracking choices,
servers, reset overrides and colours; Lists controls upcoming events and timeline grouping.
Routines owns follows and independent Checklist/Timeline pins. Utility navigation does not replace
the saved default main view. Empty states name where to change the relevant choice.

**F4a — Focus one game at a time.**
Switching games on and off says *which games the reader plays*, and is set once. It is the wrong
tool for the thing a player of four games actually does while reading: clear one game, move to the
next. Doing that with the on/off switches costs two taps per game and leaves the settings panel no
longer describing what they play.

So focus is a **lens over the filter, not a second filter**: a bar above everything it affects,
narrowing every view — headline, dailies, lists, calendar and counts — to one game, with a "next
game" control that steps through them and ends by returning to all. "Above everything it affects" is
the top of the page on a phone and on the timeline, and past `lg` it is the top of the checklist's
rail: there the bar pins with the deadlines and dailies it narrows, rather than spending the full
width of a wide screen on a row of chips and pushing "next to expire" — the answer the reader opened
the page for — below the fold to make room. It never
changes `hiddenGames`, "All" is always one tap away, and a focus on a game that is switched off or
has left the feed is ignored rather than obeyed, so it can never strand the reader on a blank page
whose cause is elsewhere. Each chip carries that game's outstanding count, so a game with nothing
waiting says so before it is visited.

**F5 — Servers and display timezone.**
Default server is chosen in setup and Region & time. Each locally tracked game/server has its own
stable account identity and progress. “Add another server” is for simultaneously playing multiple
servers: it starts fresh tracking choices and never clones marks. Server/reset changes append clock
revisions so history stays on its original clock. Overrides can revert to Automatic. Display timezone
is Automatic by default or a searchable IANA zone; it changes printed dates and manual date entry,
never a source's exact timestamps or game-day keys.

**F6 — Export / import and backup.**
No login is involved. Export progress / Import progress merges per game/server, retaining local
preferences and active reset configuration. Day logs union; newer records/amounts win conflicts.
Imported clock revisions remain accessible as historical clocks. Unknown extensions are retained in
the envelope. Export all / Import all restores the complete validated envelope through a preview,
with a recovery copy before replacement. Undo last restore reverses it. Version-1 exports remain
convertible; original v1 browser keys are retained after migration.

Local backup history keeps seven daily, four weekly and six monthly snapshots while the app is
used. UTC buckets keep their latest snapshot; backups never contain other backups. View backup
opens the preview; Restore this backup is the separate committing action. Storage failures are
visible. Browser deletion removes local history; export is the way to keep an external copy.

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

**A day you did but never ticked can be recorded.** People play at midnight and tick at breakfast, or
forget for a week and come back — a log that only accepts today is a log that goes wrong on its first
bad evening and is never trusted again. An event whose end was announced already allowed this, since
its checklist draws every day of the run and past days are clickable. The two that did not are the
ones this closes: a game's **standing chore**, which had no history surface at all and is the
most-missed thing in these games, and an event with **`endsAt: null`**, whose checklist could draw no
run and so offered only today. Both now show the last fortnight as a strip of days, on the dailies
section behind a "Catch up" disclosure and in the detail sheet respectively.

Three rules hold it honest:

- **Never a day later than today.** A tick is a claim that you did it, and tomorrow is not something
  anyone can have done, so a future day is absent rather than shown and disabled.
- **An event's strip starts when the event did**, capped at the same fortnight. A standing login
  campaign that opened in March gets fourteen days, not a hundred and eighty — and never a day before
  it was claimable.
- **The window bounds what is shown and never what is stored.** A tick from five weeks ago stays
  logged, keeps counting toward the streak and the totals, and is simply off-screen. Nothing removes a
  day the reader did not remove themselves.

**Some events want a number of days, not every day.** Genshin's “To Temper Thyself and Journey
Far” asks for five check-ins out of seven each week. Ticking it as a daily calls two unticked days a
failure and keeps it outstanding when the week is already done. So a repeating event can carry a
**check-in goal**: N days each week (weeks starting on a weekday the reader picks, at the game's own
reset), or N days across the whole event. It is always the reader's input — nothing is read off a
title — and a goal makes an event a daily even with detection off.

- **A met week stays in the strip** as done this week, counted complete in the header, and comes
  back when the next week opens. No tick is invented for it, and only a real tick celebrates.
- **Meeting a goal never marks the event done.** A count may not have claimed the rewards. An
  event-wide goal reached offers *Mark event done*; the reader decides.
- **The target is never lowered.** A short first or last week keeps it and says when too few days
  are left; an unknown end leaves the days left unknown.
- **Set up from the strip, not just the sheet.** Giving Temper Thyself its goal used to mean finding
  it in the list, opening it, saying it repeats and then setting the goal. The strip's **Edit** —
  beside *Catch up*, and like it a mode of the section rather than a control on a chip — lists
  everything the strip carries, by game: the game's standing chore, its built-in tasks (F17), then
  its events with each goal in words. An event opens to the sheet's goal control, *Open details* and
  *Stop tracking*; the chore and built-ins, which have no goal, carry *Stop tracking* on the row.
  Under each game, *Track · N* lists what it could carry and does not — a chore or built-in that is
  off, and running events not in the strip yet; tracking an event opens its goal at once. It writes
  exactly what the sheet and settings write, so nothing about a goal, an override or a switch
  changes meaning.

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
- **They are reachable whenever the app is.** Settings lists every event the reader has made,
  whatever state it is in, and opens the same detail sheet a row does. "Whenever the app is" is
  literal: settings renders on the ready path, so a feed that fails to load takes the whole panel
  with it — a pre-existing limit worth naming rather than implying otherwise. Every other surface drops an event once it has
  ended, so without this list a one-off of their own became unreachable the day it finished —
  impossible to edit, and impossible to delete out of a store nothing else can see. Events filed
  under a game we track are listed too; the form allows that, so the index has to.
- **Their IDs live in their own key space.** Never `${game}:${slug}:${date}` — see
  `docs/DATA-MODEL.md` § Reader-authored key spaces.
- **They are in the backup.** An export that omitted hand-entered events would be a lossy backup,
  which is the same argument the code already makes for streaks. This is the *only* copy — there is
  no server to restore from.

A reader's event may also state how it comes round again. The form asks that
(**How often**) directly after the name, before it asks for any date, because
the answer decides which dates are even questions. Its five answers read *Once ·
Every day · Every week · Every month · On its own cycle* on screen; the table
names them by what is stored:

| Cadence | What it asks for | What it stores |
|---|---|---|
| one-off | start, end, or "I don't know when it ends" | no rule |
| daily / weekly / monthly | a start, and nothing else | no end, a one-unit cycle |
| custom | start, an end it still allows to be unknown, and how it repeats | whatever the reader states |

**A preset carries no window.** Choosing weekly says the week *is* the window —
each occurrence runs until the next opens — so there is no end date to type and
no ignorance to admit. A dated recurring event ("1–16 September, and again
every month") is therefore a `custom`, not a preset.

Under `custom` the reader says whether it repeats **forever** — reopening the
moment it closes — or **after a delay**, and the cadence is measured from the
dates they already gave rather than asked for again. A delay is stated as the
wait between closing and reopening, so it cannot describe a rule that comes
round before it ends; a hand-stated cycle length can, and is refused.

Which of the five a saved event opens in is derived from the rule itself, so an
event made before this control existed, or one that arrived by import, opens in
whichever answer actually describes it.

**Examples to start from.** Readers who knew what they wanted could not see which answers produced
it, so *Add an event* and *Add a task* open with a row of examples — a banner with a known end, a
login event, a monthly shop reset, a recurring endgame cycle, maintenance; a weekly points target, a
few days each week, a monthly shop buy-out, a monthly target (`src/shared/templates.ts`). One tap
sets the form's **shape** — kind, how often, how it repeats, how it is measured — and nothing else:
never a name (the example's text is only a placeholder), a date, a time, a target or a game, and no
date is guessed, not even today. A figure the reader did not type would read as one we sourced, the
bar built-in tasks are held to. Save stays disabled until every date and figure the shape needs is
typed, and says what is still needed rather than greying out in silence. Editing never shows the
examples.

The rule is stored; its occurrences are derived, and each one is an ordinary
event everywhere in the app: its own countdown, its own completion, its own
daily checklist.

**The schedule can stop on a date (`until`), but the form has no control for
setting one.** The field exists in the schema — descoped from the form during
planning rather than removed from the data — so a rule already carrying one,
reachable today only by importing a file that has it, keeps it: editing such a
rule preserves its `until` rather than resetting it to "never" on save. There
is simply no way for a reader to give a rule an end date through the form
itself.

**An occurrence need not state its end.** With none, it runs until the next one
opens. That is not the app inventing a date to fill a form — it is entailed by
the interval the reader typed, and it is what separates a rule from the
unbounded rotation § Quality bar refuses to publish. It also means a plain
"resets every Monday" needs no end date at all.

The lists carry two occurrences of any rule — the one that has not finished and
the one after it — because they answer "what ends soonest". The timeline draws
every occurrence in view, because it answers "what is the rhythm".

**F8 — First-run setup.**
Before events are shown, a four-step wizard asks for games, default server and preferred appearance,
tracking kinds, and the default main view. Games are alphabetical, nothing selected. Events are the
only initially selected tracking kind. Dailies, weekly/monthly and cycles have short descriptions;
unavailable kinds remain selectable and say nothing is currently detected. Upcoming visibility
belongs to that tracking step and starts off. Server and appearance can be changed later.

Returning readers get a one-time introduction and optional four-step tour. Skipping or finishing
preserves progress and the saved main view; General can replay it.



**A game added later arrives switched off.** Adding a source is our decision, not the reader's, and
someone who plays two games did not ask for the other twelve; a calendar that fills itself up is the
thing this screen exists to prevent. `prefs.knownGames` records every lane a reader has been offered,
and a lane missing from it is recorded and hidden on sight. The games chips in settings list every
lane, on or off, which is where they take a new one up — and the cost of this is real and worth
stating: a reader whose game finally arrives is not told, so the roadmap line in the colophon
(`docs/FEEDBACK.md` P1c) matters more, not less.

An absent `knownGames` means *unrecorded*, never *offered nothing* — every reader who installed
before it existed is in that state, and reading it the other way would switch off every game they
already read. The first pass records what is already on their screen and changes nothing else.
Lanes the reader invented (`mygame:`) are recorded but never hidden: typing a game in is asking for
it.

The view question (F2) sits under it, with each option drawn rather than only described — the words
"list" and "timeline" mean nothing until you have seen this app's version of them. Unlike the games,
it arrives already answered, and the screen says where to change it afterwards: the tabs are small
text in a corner, which is the one control a first-time reader will not find on their own.

**F9 — Ignore and Archive.**
Ignore saves immediately and follows the same confirmation/Undo transition as Done. Both move to
Archive with event metadata, notes, goals, logs, resolved end and clock revision. Previously seen
followed events that expire unfinished also enter Archive; unknown-end events never expire by a
guessed date. Per-game history is default, with an alternate chronological history. Story statistics
include completion, check-ins and shortfalls where known; ignored events are excluded from success
rates. Restore recovers saved progress without pretending an expired event is live.

**F10 — Works offline.**
The reader's question is answered entirely by data already on the device, and countdowns run off the
local clock, so losing signal should not lose the app. A service worker caches the shell and serves
the last feed it downloaded. Offline is disclosed in the header and above the footer — see F7; stale
data must never be presented as current.

**F11 — Credit and disclaimer.**
Settings → About Event Clock preserves the full colophon, source credits, unofficial/unaffiliated
disclaimer and feedback links. The footer links About. Each game's About lists the real data sources,
links and thanks; event detail links its authoritative source.

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
The footer always states data age, never build age. Only tracked games with stale data produce a
compact “Event data may be out of date” row in the shared updates area. New events and new codes
remain distinct notices. Data & sources and event detail expose the last successful check, last
content change, source links and recorded reasons. A successful 304 confirms a check without
claiming the wiki changed.

Check for new data revalidates event and code feeds, compares their content rather than generatedAt,
and reports updated, unchanged or failure. It does not scrape source sites from the browser.

**F15 — Appearance.**
Relaxed (Round 7) and Structured (Round 6 B rail) share one component/state tree. Structured is the default (owner decision, 2026-10-17); an explicitly saved Relaxed preference is preserved.
Interface choice, Standard/Compact density, Dark/Light/System theme and Slate/Warm/Plum/Custom
scheme are independent. Custom stores ground/surface/text/accent separately for light and dark;
rendered colours derive readable contrast without overwriting the saved choices. Per-game colours
have a picker, hex field, preview and reset. Checklist dailies can occupy a separate direct-tick panel
or grouped routines, with collapsed/expanded/always-expanded policies; these controls also live in
Routines. Numeric routines use native step-one inputs. A **Celebrations** switch (on by default)
covers the fireworks: a small burst for finishing one daily, routine or event, and the grand one for
finishing every daily or every routine in a game's group. Off means none at all, big or small.

The earlier theme rationale below still applies to both interfaces.
The app is a lit instrument panel and that is what it should be on first sight, but it is also read
on a train in daylight and by people who find a dark UI harder rather than moodier. A public fork
worked a theme toggle out first and is credited for the idea in the colophon. So the ground is
the reader's choice: **Dark**, **Light**, or **System** to follow the device, in Settings → Appearance, separately from the
region — both are "how do I read this?" and neither changes what the page knows.

Dark is what it ships as, and deliberately not `System`. A reader whose laptop is in light mode has
said something about their laptop, not about this page; defaulting to the device would also move
every existing reader the first time they loaded a build that had this, which is the `knownGames`
mistake in a different costume (F8). Choosing `System` is one tap, and from then on it *is* their
answer.

Three things the light theme has to get right, because they are what a second palette usually gets
wrong:

- **It is a re-strike, not an inversion.** Every colour in the UI is a token, and light redefines the
  tokens rather than adding a second set of rules to components. Nothing in the app asks which theme
  it is in, so a new component cannot forget to support one.
- **Urgency still reads.** The heat ramp carries meaning, and the dark theme's amber is 1.9:1 on
  paper — an urgency the reader cannot read is not urgency. Every step is re-struck to clear 4.5:1
  against the light ground, keeping its order and its meaning.
- **A game keeps its colour.** The hues are identity (F1) and were all picked against a near-black
  ground; on paper the bright ones vanish. They are darkened until they read, along the same hue, so
  Wuthering Waves is still the green one — including the hues a reader picked for a game they
  invented (F13). The same bar holds on dark: five hues were too dim for the ground they were
  picked against (Fate's navy at 1.8:1), so those alone are lifted in lightness until they clear
  4.5:1, and every hue that already read is left exactly as it shipped.

Switching is instant, costs nothing and saves nothing: no reload, and nothing marked, typed or
ticked is touched. And it survives the load it is chosen on — the shell sets the theme before first
paint, so a reader on light is never shown a dark page while the bundle downloads.

**F16 — Your own game order.**
Nothing used to decide the order games appear in. The focus bar, the settings list, the timeline's
lanes and the dailies strip all rendered whichever game happened to hold the first event row — which
is arbitrary, and shifts as events come and go. Two answers, and the reader gets both:

- **A rule, for everybody.** Absent any choice of theirs, games are alphabetical by name, which is
  what the first-run picker does (F8). Absent means *they have never placed a game*, not that they
  have no order — so every existing reader gets the rule rather than an empty list, the same
  distinction `knownGames` draws.
- **An order, for anyone who wants one.** Games can be dragged, or nudged with arrows, into any order
  in settings. Every surface that lists a game follows it, so the game they actually play is first
  everywhere at once.

**Reordering lives in settings and nowhere else.** The focus bar and the dailies strip are the fastest
tap targets in the app — the strip is the part of the page answerable in ten seconds — and a drag
target on top of a tick target costs somebody a streak the first time it misfires. Both a drag handle
and arrow buttons ship, because touch fires no drag events at all and a drag-only list is unreachable
on a phone and by keyboard alike.

A game added later is not slotted into an order the reader made by hand: it trails everything they
placed. It also arrives switched off (F8), so settings is where they meet it, which is where they
would move it anyway. **A game's dailies stay together** — a repeating event the reader marked sits
with the standing chore of the game it came from, because the reader thinks in games and not in kinds.

**F17 — Routines.**
Routines is the library and management page for daily, weekly, monthly and cycle tasks. Follow each
per server; pin independently to Checklist and Timeline. Built-ins offer Make it mine, copying only
that account's logs; custom routines remain editable. Catch up & recorded history exposes logs on
their original reset revisions. A separate Timeline reset strip sits directly after its game's events;
with strips off, Ending soonest remains a single cross-game deadline queue.

The cadence and goal semantics below remain the domain contract; the redesign moves their controls
from the former Your own section to Routines.
Some chores roll weekly or monthly rather than daily — earning ZZZ's weekly activity points,
finishing Endfield's weekly routine — and no source publishes them, so they were nowhere in the app.
A reader can now set them up per game in *Your own*: a title, every week (from a weekday they pick),
every month (from a day of the month) or **every N days** (from a day a cycle began — a two-week
endgame mode, say), and either **tick it off** (N days in the period, one by
default) or **reach a number** (a target such as 2,100, with an optional unit). The form opens with
examples to start from, held to the same bar as the event form's (F13, *Examples to start from*).

- **They roll on the game's clock.** A week starts at the game's daily reset on the chosen day, on
  the reader's server — the same clock every daily tick is cut on, so nothing new to get wrong.
- **They sit under the dailies, and are counted apart.** Tasks have a row of their own under today's
  chips — in game order — headed by the periods it holds (*This week & month*, *This week, month &
  cycle*), and the header counts them under *Weekly*, *Monthly* or *Cycles*, not "today": a chore
  due by Sunday is not waiting on anyone every morning, and only today's dailies celebrate. A
  cycle's chip shows the days left in it. **Each period can be switched off** (`showWeeklyTasks`,
  `showMonthlyTasks`, `showCycleTasks`), in *What you see* and in the strip's Edit panel, offered
  only once a task of that period exists. Off hides tasks only — an event with a goal stays — and discards nothing.
- **A number is entered, not ticked.** Its chip opens an editor under the strip — the value as the
  game shows it, not an increment — because a chip is one target. Catch up offers last period's
  number the way it offers yesterday's tick.
- **An event's check-in goal (F12) can be a number too**, entered in its detail sheet.
- **Theirs, kept and exported.** Deleting a task removes the task only; its ticks and numbers stay.
  Both travel in the export, and import never rolls a newer week back.

**Some games' weekly and monthly tasks are built in** — weekly bosses, battle pass EXP caps, a
monthly shop buy-out, endgame resets; the list per game, with the sentence each figure rests on and
what was looked for and not found, is in `docs/superpowers/specs/2026-10-14-built-in-routines-design.md`.
Each comes from a cited page and is shown with the date that page gives, so a figure from an old
guide is visibly old, and an item no page states is not shipped. They are **off until the reader says yes**: the strip asks
once, in one line, about a game on screen that has them — until the reader answers for every game —
and *What you see* governs them after: one switch for all of them, and *Choose games* for the games
that differ. The standing daily chores take the same shape, so a reader who wants Genshin's chore
and not Star Rail's can say so without losing either game's events. Built-ins are not edited in place; **Make it mine** copies one into the reader's
own tasks with its ticks and numbers, and hides the original while the copy exists. **Any single
built-in can be tracked or not** — Endfield's weekly items but not one of them — from the strip's
Edit panel or *Your own*, which lists every built-in of the games that are on, untracked ones
included, so none is ever off with no way back. Stopping one keeps its ticks and numbers and never
changes the game's switch.
**A shop's pulls come in two lines** — the premium (limited-banner) pulls, tracked with the other
built-ins, and the standard-banner pulls most shops sell beside them, added only when the reader
switches on *Include standard-banner pulls* under the built-ins switch. One answer for every game;
off by default, so the reader chooses between premium only and both.
**Endgame modes on longer cycles are built in too** — Star Rail's six-week rotations, ZZZ's
two-week Shiyu Defense and Deadly Assault, Wuthering Waves' Tower of Adversity, NTE's fortnightly
Beyond the Rails and Tycoon Incentive Fund — each ticked once a cycle unless a page states a number;
see `docs/superpowers/specs/2026-10-16-cycle-routines-design.md`. A built-in whose cycle ends at one
instant on every server rolls on that server's reset for every reader.

**F18 — What changed.**
The app now says what changed, in two tiers, both tied to git. **Short entries** — one line each,
tagged New, Fixed, or Games & sources — appear once as *What's new*, above the lists, after a new
version loads; *Got it* dismisses them. **Release notes** — a few paragraphs per feature or
milestone, summarised from the history and the design specs — are in Settings → *Changelog*, each
linked to the commits it covers and the specs it draws on. Data refreshes are not changes in this
sense; the footer already states the data's age.

- **After the reload, not before.** The update notice (F14) is the old app, which cannot know what
  the new one brings, so the news waits for the version that carries it. Nothing is fetched.
- **A new reader is not shown a history.** First-run setup marks them up to date. A reader from
  before the changelog existed is shown the last two weeks once, so its arrival is announced.
- **Written for readers, by a person or an agent, at development time** — never generated at
  runtime (AGENTS.md constraint 2).

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
- **A date with no time is resolved on the game's clock, never on UTC's.** Most sources print
  "August 19, 2026" and no time of day, which is stored as 00:00Z — a placeholder, not an instant.
  The countdown reads it as that game-day's server reset for the reader's region, because a literal
  reading retires an event up to nine hours before the game does and the reader is standing in the
  game while we say it. This is a reading of the date the source printed, not a time invented for
  it, and the detail sheet says as much.

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
