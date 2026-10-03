# Event check-in goals

**Date:** 2026-10-03

**Status:** proposed; not implemented

## Request and intended outcome

Some events require a fixed number of check-ins rather than participation every day.
The owner's example is Genshin's “To Temper Thyself and Journey Far”: five completions
out of seven days in a week. This example is the requested use case, not a verified
source schedule or a rule to hardcode by title.

An unfinished event must remain available in Dailies. The tracker should show how many
check-ins are required, count the reader's recorded days, and distinguish meeting this
week's requirement from completing the whole event.

## Current behavior and the gap

`src/shared/daily.ts` detects whether an event repeats and counts recorded game-days,
remaining opportunities, missed days and streaks. It has no required-count or weekly
goal. `DailyChecklist.tsx` reports recorded days against the event's whole window,
which cannot express “five of seven this week.”

`progress.daily` already lets the reader put an event in Dailies when source wording
does not identify it. `App.tsx` supplies live, outstanding repeating events to
`Dailies.tsx`; explicitly done or ignored events are excluded. A weekly goal must fit
this flow without treating a satisfied week as a permanent event completion.

## Proposed scope

Let the reader configure an optional check-in goal in the event detail sheet:

- **Across this event:** a required number of distinct game-days in the event window.
- **Each week:** a required number of distinct game-days in each seven-day period,
  with an explicitly chosen week-start day.

The weekly mode covers the reported example. The event-wide mode covers login campaigns
that require a smaller number of days than the full time available. Neither mode
requires consecutive days; streaks remain a separate fact.

Setting a goal makes the event eligible for Dailies even with experimental detection
off. Removing the goal returns to the existing detection and override behavior. The
existing “this isn't a daily event” action must offer to remove the goal too, rather
than leave a conflicting configuration hidden in storage.

Goals are reader input in this first version. No parser changes, inferred counts,
title-specific exceptions, or changes to `GachaEvent` are proposed.

## Counting and period boundaries

Count at most one check-in per game-day, using the existing recorded day keys and the
event's game and selected server region. All calculations take `now` explicitly.
Future days never count toward a goal.

A weekly period starts on the chosen weekday at the game's server reset, not browser
midnight or UTC midnight. Periods are seven game-days, intersected with the event's
actual start and end. An event-wide goal uses the event's resolved window, including
the existing handling of day-precision dates and region-specific ends.

Ticks outside the applicable window do not satisfy its goal, but remain stored and
editable through the existing history controls. Catch-up and corrections recalculate
the affected period; no week transition clears, rewrites or prunes recorded days.

A shortened first or last week retains the stated target. If fewer opportunities
remain than check-ins needed, show that fact without lowering the target or inventing
extra days. An unknown event end remains unknown; a configured weekly rule can still
define the current week's boundary without claiming an event end.

## Dailies and completion behavior

| State | Dailies behavior |
|---|---|
| Weekly goal unfinished | Keep the event visible; show, for example, `3 / 5 this week` and today's tick |
| Weekly goal met | Keep the unfinished event visible as `5 / 5 · Done this week`; stop presenting further check-ins as required |
| Next week opens | Recalculate against the new period and offer today's check-in again |
| Event-wide goal met | Show `5 / 5 · Goal reached`, with an explicit action to mark the event done |
| Event marked done or ignored | Exclude it from Dailies under the existing outstanding rule |
| Event expired | Follow the existing live-event rule; retain its goal and recorded history |

A goal never writes `status: "done"` automatically. Reaching a check-in count might
not finish other objectives or claim the rewards. Only the reader's explicit event
completion removes a live event from Dailies. Undoing completion brings it back with
its goal and ticks intact.

The detail checklist keeps past days editable, including after a target is reached.
Undoing a tick can make a goal unfinished again. For goals, describe remaining
opportunities and check-ins needed; do not label every unticked past day as a failure
when participation on every day was never required.

Dailies' daily completion count and celebration must treat a satisfied goal as having
no further work required today. This must not fabricate a tick for today. A real tick
and a satisfied period remain separate states in accessible labels and rendering.

## Storage and implementation boundaries

Store an optional goal alongside the reader's per-event progress. The proposed shape
is a discriminated Zod schema with a positive integer `required` and either
`period: "event"` or `period: "week"` plus `weekStartsOn` (ISO weekday 1–7). Weekly
targets are limited to 1–7; event-wide targets must not exceed a known opportunity
count at configuration time. Existing goals remain readable if source dates later
change, with any resulting shortfall disclosed rather than silently discarded.

Missing goal means today's behavior. No existing event ID, daily-log key, game-day
format, reset mapping or localStorage key changes. Preserve a progress record that
contains only a goal; include the new field in emptiness checks and export/import.
Import follows the existing last-edited progress merge and daily-log union rules.
Validate the goal without deleting unrelated status, notes or recorded ticks when
an imported goal is invalid.

Keep goal calculations pure in shared code. Wire the result into `App.tsx`,
`Dailies.tsx`, `DailyChecklist.tsx`, and `EventDetail.tsx`; extend the progress store
and backup validation. Reuse the shipped visual tokens and existing detail controls.
Custom event occurrence IDs keep their existing meaning; a goal applies to the
selected occurrence unless applying it to an entire recurring rule is separately
specified.

## Acceptance checks

1. A configured five-per-week event appears in Dailies with detection off and no
   explicit completion. At three distinct ticks it reads `3 / 5 this week`.
2. Five nonconsecutive days satisfy the week. The event remains visible, labelled
   done this week, without being marked done or requesting a sixth check-in.
3. The next weekly boundary makes the goal available again; previous ticks remain
   unchanged. Test immediately before and at reset for each supported region.
4. Backfilling a previous week never advances this week's count. Removing a current
   tick below the target restores the unfinished state.
5. A five-check-in event-wide goal in a seven-day window reaches its target on the
   fifth recorded day and waits for explicit event completion.
6. Done and ignored events remain excluded regardless of list-display preferences;
   undoing either restores the recorded goal and days while the event is live.
7. Partial weeks, unknown ends, future ticks, region-specific boundaries and games
   with reset overrides count correctly without invented dates or deleted history.
8. Goal-only progress survives reload and export/import. Old backups remain valid;
   invalid goals do not erase otherwise valid reader data.
9. Events with no goal retain current daily behavior, grouping, order and catch-up.
10. Accessible labels distinguish done today, done this week, and event completion.

Before shipping, update PRD F12 and the data-model sections for progress, daily
checklists and export/import. Update the design record for any new visible controls.
Run relevant unit tests, the full offline suite and typecheck, and inspect the built
interface in a browser.

## Decisions to confirm before implementation

- Verify the example's actual weekly reset and whether its requirement is per week
  or per another in-game training period. Do not infer this from the event title.
- Confirm that choosing a week-start weekday covers the desired games. If a source
  resets on another clock or uses event-anchored seven-day periods, specify that
  boundary explicitly before supporting it.
- Confirm the proposed event-wide mode and the choice to retain satisfied goals in
  Dailies until the reader marks the whole event done.
