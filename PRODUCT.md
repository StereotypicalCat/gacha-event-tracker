# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

An installable single-page web app (PWA with a service worker and manifest) that works offline. Native
mobile apps are out of scope: installing to a home screen is enough (`docs/PRD.md` § Out of scope).

## Users

**The repository owner comes first.** Event Clock is the owner's own tool for keeping track of the
gacha games they play. When the owner's use and a public reader's request conflict, the owner's use
wins.

**Public readers come second, and they are welcome.** The app has been posted to r/gachagaming and is
served publicly. The typical public reader matches the PRD persona: someone playing 2–5 gacha games
who checks in a few times a week, usually on a phone. Their situation is a dozen overlapping,
time-limited events spread across as many in-game calendars, and the thing they fear is missing a
limited event by a day. A smaller group plays 6–10 games or more. For those readers, custom games and
events (F13) cover what no list of sources ever will.

The desktop layout is a real layout, not the phone layout stretched, but mobile is the main use case.

## Product Purpose

Event Clock answers three questions in one screen, across every game the reader plays:

1. What is running right now?
2. What ends soonest?
3. Which of these have I already finished, or am I partway through?

It collects live and upcoming events from community wikis, sorts them by end date, and plots them on
a timeline. Readers can mark an event done or in progress, estimate how much effort it takes, and tick
off daily progress on events that repeat.

Success is measured as follows (`docs/PRD.md` § Success criteria):

- A reader can find their next expiring event within 5 seconds of load, on mobile.
- At least 99% of published end dates are correct.
- A new game can be added without a schema migration or a client change.

## Positioning

**One screen for every game, ordered by what runs out next.** Each game publishes its own calendar,
and none of them talk to each other. paimon.moe, Game8 and in-game timers each answer the question
for one game. Event Clock answers it across all of them in a single deadline order. Cross-game
coverage is the core of the product, so the number and range of supported games matter directly.
The most common reason the public thread gave for not using the app was a missing game.

Date discipline is how the product is built rather than the headline claim, but it is never traded
away for more coverage (see Product Principles).

## Operating Context

- Readers check in a few times a week, usually on a phone, often between other things. The dailies
  strip is meant to be answerable in about ten seconds.
- A reader has a game open, sees its in-game timer, and compares it with ours. Countdowns therefore
  resolve on the game's own server reset for the reader's region (Asia, America or Europe), not on
  UTC.
- Readers either work down a checklist of deadlines, or look at a game-by-game timeline in the style
  of paimon.moe, which the public thread named as the reference.
- Some readers are catching up on games they set aside rather than busy with all of them. The app
  serves them through the in-progress status and effort fields, and never nags them about a game they
  stopped playing.
- Data is refreshed twice a day from community wikis. Some sources (the nine Game8 pages) cannot be
  fetched by the scheduled runner and are refreshed by hand. The data's age is therefore a fact the
  reader is shown, not one they have to assume.

## Capabilities and Constraints

**Capabilities.** The full feature set is specified as F1–F16 in `docs/PRD.md`:

- A timeline: one lane per game, or a single queue sorted by soonest end.
- A checklist of everything running, sorted by soonest end.
- Done and in-progress marks, effort estimates and notes.
- Daily checklists, with past days that can still be filled in.
- Ignoring an event, and filters by game or type.
- Focusing on one game at a time.
- Region selection.
- JSON export and import.
- The reader's own games and events, one-off or repeating.
- First-run setup.
- Offline use.
- A notice when a new version of the app is ready.
- Dark or light mode, plus a "follow the system" option.
- The reader's own game order.

The app currently covers twenty games from twenty-two sources.

**Hard constraints** (`AGENTS.md` § Three constraints):

- **No accounts, logins or user records.** All reader state lives in `localStorage`. Moving to
  another device works through export and import, never a server-side user.
- **No LLM in the pipeline.** Event data comes only from deterministic parsers.
- **A Bun server owns fetching and parsing.** The client only ever calls this app's own `/api/*`.
- **Some stored keys must never move.** Event IDs, `dailies:<game>`, game-day keys and the
  reader-authored `mygame:` / `myevent:` IDs are `localStorage` keys. Changing how any of them is
  built silently wipes readers' progress, and there is no server copy to restore from.
- **Scraping conduct is binding:** honour `robots.txt`, refresh each source at most once every six
  hours, space requests to the same host, and never get around an access control.

**Not the product** (`docs/PRD.md`):

- A wiki or event guide
- A notification or push service
- A pull tracker, damage calculator or build planner
- Localised beyond English

**Terminology:**

- The user is a **reader**.
- The two views are **Checklist** (stored id `"soon"`) and **Timeline**.
- An event's states are **untouched**, **doing it** and **done**.
- **Ignore** is not the same as done.
- A **lane** is one game's row or source.
- The daily **reset** is the boundary between game-days.

**Undecided:**

- Whether a month grid is needed in addition to the timeline.
- The formal accessibility standard (see below).
- The SQLite layer and the review queue for quarantined events are specified but not built.

## Brand Commitments

- **Name:** Event Clock.
- **Tagline:** "Live and upcoming gacha events, sorted by what expires next."
- **Unofficial and unaffiliated.** The app says so plainly. It credits the source wikis and the game
  studios on the same screen as the data, and treats the source page as the authority when the two
  disagree (F11).
- **Every event links to its source.** A date the reader typed in is visibly theirs and never
  credited to a source (F13).
- **Game hues are identity.** A game keeps its colour across views and themes (F15).
- **Dark is the default theme.** Light mode and a "follow the system" option are available (F15).
- **Voice:** plain, specific and honest about uncertainty. The app says "end date unknown" rather
  than implying a date, and states what it is holding back ("N live · N upcoming") instead of leaving
  the reader to infer it. Do not use the "AI slop" self-description in promotion (`docs/FEEDBACK.md`
  P3).

## Evidence on Hand

- `docs/FEEDBACK.md`: a reading of the r/gachagaming release thread (26 comments from 15 accounts),
  with verbatim quotes. Readers called the app useful without being asked, one bookmarked it, and no
  one disputed a date. The one design criticism was formed from the promo screenshot alone.
- The promo screenshot is outdated. FEEDBACK.md calls for a reshoot from a wide window, in timeline
  view.
- There are no usage metrics, testimonials beyond that thread, press mentions or user counts. Do not
  invent any.
- Pinned fixtures (`fixtures/<game>/`) and live snapshots (`snapshots/`) hold real event data for
  every supported game.

## Product Principles

1. **Deadline order is the product.** Every sort and grouping falls back to soonest end first.
   Truncating a list hides rows but never reorders them, and "next to expire" always means the
   earliest end date.
2. **Breadth, never at the expense of a true date.** More games is the main growth lever, but a
   wrong end date is worse than a missing event. Unknown ends stay unknown, a stale source is
   disclosed, and a page that is out of date but still parses is treated as a failure.
3. **Showing is not telling.** What the reader can look at is their choice. The headline deadlines
   and the dailies are instructions, so they never point at work that is already done or ignored.
4. **The reader's answers are theirs.** Their view, game order, region and choice of games are asked
   for once and remembered. A game added later arrives switched off, and nothing the reader set is
   overridden by a heuristic.
5. **Nothing is held back silently.** If something is hidden, stale or out of date, the reader is told
   in words, including whose games the notice covers.

## Accessibility & Inclusion

**No formal standard has been chosen yet.** The following rules are already in force and must be
kept:

- Game hues and the urgency colours clear 4.5:1 contrast against the background in both themes.
- No interaction is drag-only. Reordering has arrow buttons, so it works on touch, by keyboard and
  with a screen reader.
- Native `<details>` and `<button>` elements are used, so keyboard and screen-reader access needs no
  second implementation.
- Focus outlines are visible on `summary` elements.
- A list row is a single tap target.
- The interface is in English only. Dates and countdowns are formatted with `Intl`.
