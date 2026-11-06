# Catch up section on the Routines page

Approved by the owner in chat on 2026-11-06. Marked **(agent's call)** where the owner approved a
proposal rather than asking for it, or where the detail was settled after approval.

## Why

Trying to catch up on Endfield's dailies, the owner found:

- Catch up had drifted away from the Checklist's *Today's dailies* and *Routines* panels, so it was
  hard to find. It sat at the bottom of the Routines page.
- Opening *Catch up & recorded history* produced seven more dropdowns with the same title, one per
  tracked game, none naming its game.
- Inside, items were not structured: paragraphs, and slugs in place of titles.

Success: from the Checklist, one click lands on the section; the game is named; the thing to catch
up on is recognisable by its title; a day is recognisable by its weekday and date.

## Non-goals

- No change to stored data, to `localStorage` keys, or to what a tick writes. The `day` action is
  unchanged.
- No side panel. The owner rejected the drawer: the section stays on the Routines page and the
  button moves the reader to it.
- No entering past numbers. Amounts stay read-only here, as they are today.
- No nagging (`docs/PRODUCT.md`): counts are plain, with no heat colours.

## The design

### Where it lives

A section titled **Catch up** on the Routines page, below the routine bands, always open. It replaces
the `<details>` and the per-account `<details>` inside it.

### Getting there

A **Catch up** button in the *Today's dailies* heading and the Checklist's *Routines* heading opens
the Routines page scrolled to the section, with focus on its heading. A **Catch up** button in the
Routines page's top bar scrolls to it. Arriving at Routines any other way does not scroll.

### One game at a time

One chip per account, in Game order, using the focus bar's chip style and the game's colour. The
label is the game's short name plus the server suffix when a game has several accounts, so two
servers stay distinguishable. A chip shows a count when it has one. Only the chosen account's list
shows.

The chosen account starts as the first in Game order with a count, else the first. It is per-visit
state, never stored (`AGENTS.md`, per-visit state is not a preference). It does not move when ticks
take a count to zero: the list must not jump out from under the reader. **(agent's call)**

### A row

- The real title and its type: Dailies, Weeklies, Monthlies, Cycles, or Event.
- **Days:** a 14-day strip, oldest first, showing weekday and date, ticked filled in the game's
  colour, unticked outlined, today ringed. A tap toggles exactly as before.
- **Numbers:** recent values, newest first, as `Week of 2 Nov — 8 of 10 points`, four shown and the
  rest behind a disclosure. A number with nothing logged says so. **(agent's call)** Today it offers
  a day strip, whose ticks nothing reads.
- **A routine that resets with a version or banner** has no earlier period to catch up on
  (spec 2026-10-22): no strip, values only.

PRD F17's three rules still hold: never a day later than today; an event's strip starts when the
event did; the window bounds what is shown, not what is stored. So ticks older than the strip stay
reachable behind *N earlier days* on that row. **(agent's call)**

### What is listed

The section's main list is what the Routines page itself calls followed: `routineRows` with
`placement.followed`, minus battle passes. A pass is tracked by status against its event, not by
days, so a strip for it wrote ticks nothing read. **(agent's call)**

### Older records

A collapsed **Older records** disclosure at the bottom of the game's list, holding only items with
something logged: **(agent's call)**

- *Ended or no longer followed:* logs on the current reset timing with no live followed row. Recorded
  days only, since offering new days could claim days after an event ended. A recorded day unticked here stays offered for the rest of
  the visit, so a mis-tap can be undone.
- *Before reset timing changed:* one group per earlier reset timing, with its region, reset and date
  line, and days as they are offered today.

### Titles

Resolved in order: `dailies:<game>` to the game's daily task name (the name *Today's dailies* uses);
a live row with that id or placement id; the game's built-in routines; the reader's tasks; any known
event (`contentEvents`). A `feed-cycle:` id falls back to *Battle pass*; anything else to *Removed
item*. A raw ID is never shown. **(agent's call)**

The slugs had one main cause: a followed battle pass is placed under `feed-cycle:<game>:<family>`,
which is not an ID any lookup knew.

### The count

Shown on chips and rows, and counting only what is expected every day: rows with a daily cadence,
measured in days, with no check-in goal. Counted days are strip days before today that are unticked,
from the first day the reader has ticked that item. **(agent's call)** Nothing records when a reader
started following something, and fourteen unticked days on a routine followed yesterday would be
false. A row never ticked counts nothing. Today is excluded, because today is not behind.

## Left to the builder

Class names, module boundaries, exact spacing. Colours are tokens plus the game hue, as everywhere
else, and the section is checked in both themes, at phone width, and on a plain HTTP hostname.
