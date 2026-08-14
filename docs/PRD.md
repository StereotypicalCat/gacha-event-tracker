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
  is a plausible v2; it is out of scope for v1.)
- Not a damage calculator, build planner, or pull tracker.

## Users

One persona: a player of 2–5 gacha games who checks in a few times a week, most often on mobile.
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

Adding a game must require no schema change — only a `GameId` entry and a source registration.
That is the test of whether the data model is right. A game may have several sources; see
`docs/INGESTION.md` § Three layers.

### Features

**F1 — Calendar view (default).**
A horizontal timeline, one lane per game, spanning a scrollable date range with "today" pinned as a
vertical marker. Each event is a bar from `startsAt` to `endsAt`. Bars are colored by game, and
completed events render at reduced opacity with a check. Clicking a bar opens a detail panel with
title, type, exact start/end in the user's local timezone, source link, and a completion toggle.

An event with `endsAt: null` renders as a bar with a frayed right edge and the label "end date
unknown" — it must be visually distinct from an event that ends far in the future.

**F2 — Ends-soonest list.**
A flat list of all *currently running* events sorted ascending by end date, with a relative
countdown ("ends in 2 days", "ends in 4 hours"). Under 24 hours, the row is emphasized. This is the
view that justifies the app; it should be reachable in one tap from the calendar and is the better
default on narrow screens.

**F3 — Mark completed.**
A toggle on every event, in both views. State is written to `localStorage` immediately and
optimistically — there is no server round trip and no failure case. Completed events stay visible
but de-emphasized; a filter toggles them out entirely.

**F4 — Filters.**
Filter by game (multi-select, persisted) and by event type. Hiding a game hides it from both views.
Preferences persist in `localStorage`.

**F5 — Region selection.**
A user picks Asia / America / Europe once. For events where `regionScoped` is true, all displayed
end times resolve to that region's server reset. This is stored in `localStorage` and defaults to a
guess from the browser timezone, shown as a dismissible "showing America server times — change".

**F6 — Export / import.**
Because there are no accounts, moving between devices is manual: download a JSON file of completed
IDs and preferences, upload it elsewhere. Import merges rather than replaces, and never removes a
completion the user already has.

**F7 — Freshness disclosure.**
The footer shows when the feed was last updated, per game. If a game's data is more than 48 hours
stale, its lane carries a warning badge. Never present stale data as current — the whole value
proposition is trust in the dates.

## Out of scope for v1

Accounts and sync; push notifications; per-event checklists or progress tracking; in-game resource
or pull tracking; user-submitted events; mobile apps; localization beyond English.

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
- Should events the user has hidden by game filter still count toward "ends soonest"?
  (Assumption: no — the filter is global.)
- Is 6 hours the right refresh cadence? (Assumption: yes; events are announced days ahead, so
  sub-hourly refresh buys nothing and is rude to the sources.)
