# Examples to start from, and a pass over the add forms — design

Date: 2026-10-14. Status: approved in conversation (approach A, both design sections).

## Problem

A reader who already knows what they want — "a banner that ends on the 28th", "1300 points each
week" — cannot see which combination of fields in *Add an event* or *Add a task* produces it. The
owner's words: "in the add event/task, its confusing to figure out how to create something you want.
Having examples you can start from would be very useful."

Both forms also grew field by field (TODO.md), and read that way: enum values as copy, every note
and error stacked at the bottom, and Save disabled with no reason given.

## Outcome

- Each add form opens with a row of examples. One tap shapes the form for a common kind of entry;
  the reader fills in the name, dates and figures, then saves.
- Both forms read as a reader thinks: plain words, choices in view, a message beside the field it is
  about, and Save that says what it still needs.
- Nothing that is stored changes: no schema, store, id or export change.

## Non-negotiables

- **An example sets a shape, never a fact.** It may set kind, cadence, repeat mode, whether the end
  is known, the period unit, the measure kind and the unit word. It never sets a title (the title
  gets the example's text as a *placeholder* only), a date, a time, a target, or a game. The single
  exception is *Monthly shop buy-out*'s days-needed of 1, which is the shape "tick it off once", not
  a figure about any game.
- **Nothing is saved until the reader saves.** Save stays disabled until every date and figure the
  shape needs has been typed, so nothing an example wrote can be saved unread.
- **No date is guessed.** No "today", no "the 1st": games reset on different days, and a guessed
  date that looks deliberate is the failure this product exists to avoid.
- **"I don't know when it ends" stays first-class**, and every existing rule of the event form
  (preset windows, measured cycles, delays, `comesRoundEarly`, the stranded-ticks notice, `until`
  surviving a save) behaves exactly as before.

## Part 1 — examples

### Data

`src/shared/templates.ts`, pure data with no React and no clock:

```ts
export interface EventTemplate {
  id: string;                 // kebab-case, unique within the list
  label: string;              // the chip text
  placeholder: string;        // the title field's placeholder while this example is chosen
  hint: string;               // one line: what is left for the reader
  sets: { type: EventType; cadence: Cadence; repeatMode: RepeatMode; endKnown: boolean };
}

export interface TaskTemplate {
  id: string;
  label: string;
  placeholder: string;
  hint: string;
  sets: {
    unit: "week" | "month";
    kind: "days" | "amount";
    required?: string;        // as typed; "" empties the field
    amountUnit?: string;
  };
}

export const EVENT_TEMPLATES: readonly EventTemplate[];
export const TASK_TEMPLATES: readonly TaskTemplate[];
```

| Event example | type | cadence | repeatMode | endKnown | hint |
|---|---|---|---|---|---|
| Banner with a known end | banner | one-off | never | true | Fill in when it starts and when it ends. |
| Login event | login | one-off | never | true | Fill in when it starts and when it ends, or tick that you don't know. |
| Monthly shop reset | shop | monthly | never | true | Fill in a day it resets on. Each one runs until the next. |
| Recurring endgame cycle | challenge | custom | forever | true | Fill in one cycle's start and end; how often it comes back is worked out from them. |
| Maintenance | maintenance | one-off | never | true | Fill in when it starts and ends, with times. |

| Task example | unit | kind | required | amountUnit | hint |
|---|---|---|---|---|---|
| Weekly points target | week | amount | — | points | Fill in the target, and the day the week rolls over if it isn't Monday. |
| A few days each week | week | days | "" | — | Fill in how many days a week it needs. |
| Monthly shop buy-out | month | days | "1" | — | Fill in the day the month rolls over. |
| Monthly target | month | amount | — | — | Fill in the target and what it counts. |

Placeholders are generic ("Limited banner", "Login bonus", "Shop reset", "Endgame cycle",
"Maintenance", "Weekly points", "Weekly chore", "Monthly shop", "Monthly target"), never a real
event's name.

### Behaviour

- The row ("Start from an example") renders only on add: `EventForm` and `TaskForm` without
  `initial`. Editing never shows it.
- A tap applies `sets` and nothing else. Game, title, dates, times, note, target, weekday and month
  day keep whatever the reader typed. On the event form it also clears `ownCadence`, so a measured
  cycle is shown rather than a stale hand-stated one.
- The last example tapped is pressed (`aria-pressed="true"`); its `placeholder` replaces the title
  placeholder and its `hint` shows under the row. Editing a field afterwards does not unpress it —
  it is where the reader started, not a lock.
- Applying a shape is a pure function per form (`withEventTemplate`, `withTaskTemplate`) so it is
  provable without a click: the suite renders statically and cannot click.

## Part 2 — the pass

### EventForm

1. **Order:** Game → Name → How often → Starts → Ends → repeat details → Kind → Note.
2. **Words:**
   - How often (was *Cadence*): *Once · Every day · Every week · Every month · On its own cycle*.
   - Repeat: *Doesn't repeat · Comes back as it ends · Comes back after a wait*.
   - Kind: *Banner · Story · Rerun · Challenge / endgame · Login rewards · Shop · Maintenance ·
     Other*. Stored values are unchanged.
   - Name (was *What is it*).
3. **Pills, not selects, for How often and Repeat**, in the task form's pill style, wrapping at phone
   width. *Comes back after a wait* is a disabled pill while there is no end to measure from, exactly
   as the option is disabled today. Choosing *On its own cycle* while the repeat is *Doesn't repeat*
   moves it to *Comes back as it ends*, because a cycle that never comes back is a contradiction on
   screen; a stored custom-never record still reopens as it is.
4. **Messages beside their field:** the no-time note under Starts; *ends before it starts* and *isn't
   a real date* under Ends; the unknown-end note under its checkbox; *comes round before it ends*
   under the repeat details.

### Both forms

5. **Save says why it is disabled.** A muted line beside the buttons: "Still needed: a name and a
   start date." It comes from a pure `eventStillNeeded` / `taskStillNeeded`, and Save's disabled
   state is derived from the same function, so the line and the button cannot disagree. Errors
   (backwards dates, comes round early, an unstatable wait) stay where they are, beside their field,
   in critical.
   - Event needs, in order: a name; a start date; an end date (a dated window whose end is stated
     as known but is empty, or a wait with no end); a cycle length (comes back as it ends, not
     measured, no valid length); a wait (comes back after a wait, no valid length).
   - Task needs: a name; a day of the month (monthly, unreadable day); how many days (tick it off,
     not a whole number from 1 to 7 a week or 31 a month); the target (reach a number, unreadable),
     or a target of at least 1 / a smaller target (outside `AmountTarget`'s 1–1,000,000,000).
6. **One field and pill style.** Both forms use the name *Name* and DESIGN.md's input spec (8px
   corners, 8×12 padding, ground fill, hairline border, faint on focus). The pill and field classes
   live once in `src/client/components/formParts.tsx`, with the example row and the still-needed line.
7. **Phone width.** Checked in a browser at 360px and desktop: no horizontal scroll, and every
   control usable.

### Out of scope

The entry point (Settings → Your own), `GameForm`, and the commit-button padding mismatch with
DESIGN.md (app-wide; noted, not fixed here).

## Testing

- `test/templates.test.ts`: ids are unique; no template sets a title, date or target; every event
  template, given a name and dates, yields a valid draft through the same functions the form uses;
  every task template, given a name and a target or day count, yields a `taskDraftFrom` draft.
- `test/custom-ui.test.tsx`: the row renders on add and not on edit; pill copy and pressed states
  replace the `selected` option assertions; `eventStillNeeded` and `taskStillNeeded` cases; Save is
  disabled exactly when the list is non-empty or an error stands.
- Browser check (puppeteer, scratchpad only): tap each example, fill it, save, see the row; 360px
  width with no horizontal scroll.

## Docs

PRD F13 and F17 gain a sentence on the examples and the bar they are held to; DESIGN.md's chips
section names the example row; TODO.md item ticked; a changelog entry (reader-visible) in a
follow-up `chore(changelog)` commit.
