# Recurring events: the reader's own, and a plan for sourced ones

**Date:** 2026-08-27
**Status:** proposed

Read `AGENTS.md` first. Every rule cited below is already written down there or in `docs/`, and the
citations are load-bearing rather than decorative.

## Why

This app measures windows closing. It has exactly one vocabulary for something that repeats —
`src/shared/daily.ts` — and that vocabulary only counts in days: `dayKey`, `nextResetMs`,
`dailyDays`, `streakOf`. It is good at the thing it does. It cannot express a fortnight.

That gap is not hypothetical, and it is already costing us data we have parsed and thrown away:

> `scheduleBosses` is the only exactly-dated material on the page (Abyss and Memorial Arena
> openings, three a week) and is deliberately unread: a recurring rotation with no end is not a
> deadline, and `endsAt: null` on each would render them live-with-unknown-end forever.
>
> — `docs/SOURCES.md` § arustats.com, line 740

The reasoning there is sound *for an undated rotation*. It stops being sound the moment something
carries a **rule**, because a rule supplies the boundary the rotation was missing: content that
repeats every fourteen days ends, at the latest, when its next occurrence opens. That is not a date
invented to fill a form — it is entailed by the interval.

So the missing primitive is a repeat rule, and the cheapest honest place to prove it is the surface
where the reader supplies the rule themselves (PRD F13). No fetching, no parser, no review gate, no
`GachaEvent` change — and at the end of it, a tested recurrence model that the ingest side can adopt
when Phase B below is started.

Three things a reader cannot record today, all of them the same shape:

| What | Why it fails now |
|---|---|
| Weekly missions, resets Monday | One-off event or nothing. Ticking it re-types it every week |
| Spiral Abyss, 1st and 16th | Two events a month, entered by hand, forever |
| Battle pass, every version | A 42-day window that has to be re-entered every 42 days |

## Decisions taken

| Question | Answer |
|---|---|
| What does the reader express? | One concrete window, plus how it repeats |
| Repeat units | Every N days, N weeks, or N months. `N` is 1–365 |
| Does the rule ever stop? | Optionally. `until` is nullable and defaults to never |
| Must an occurrence state its end? | **No.** With no stated end it runs until the next occurrence opens |
| How many occurrences are visible? | Lists: the running-or-next one, plus the one after. Timeline: every one inside the board window |
| Are occurrences stored? | Never. One rule persists; occurrences are derived on read |
| Occurrence ID | `myevent:<token>#<YYYY-MM-DD>` — the rule's token, the occurrence's start day |
| Where do completion marks attach? | Per occurrence. `marks`, `ignored`, `progress` and `daily` are unchanged |
| Rescheduling a rule orphans its marks | Accepted, and warned about before saving. Nothing is rewritten |
| Does `GachaEvent` change? | No. Nothing in the ingest pipeline, the API contract or the review gate moves |

## The two ends, which are not the same end

The design turns on a distinction that is easy to lose:

- **the rule's end** — `until`, the instant repetition stops. Nullable. A rule may repeat forever.
- **the occurrence's end** — when *this* window closes. Also nullable, and this is the interesting
  one.

An occurrence with no stated end is **not** the `endsAt: null` case `docs/SOURCES.md` refuses. That
case is unbounded because nothing bounds it. Here the interval bounds it: the window runs from its
anchor to the instant the next occurrence opens, and that instant is derived from a number the
reader typed. `endsAt: null` / `endPrecision: "unknown"` is what gets **stored** — nothing is
fabricated in the store, and the existing `CustomEvent` refine pairing the two is untouched. The
boundary is resolved at projection time, inheriting the precision of the anchor start.

One consequence worth stating: a rule with no stated end produces **contiguous** occurrences, back
to back with no gap. That is exactly the shape a reset-to-reset chore wants ("weekly missions,
resets Monday"), and it falls out of the same model rather than needing a second kind.

## 1. `src/shared/recurrence.ts` — new, pure, no React

```ts
export const RepeatUnit = z.enum(["days", "weeks", "months"]);

export const Repeat = z.object({
  unit: RepeatUnit,
  /** How many units between one occurrence opening and the next. */
  interval: z.number().int().min(1).max(365),
  /** When repetition stops. Null means it does not. */
  until: z.string().datetime().nullable(),
});
```

Anchored to the event's own `startsAt`; occurrence *n* opens at anchor + n·interval. The window's
duration (`endsAt − startsAt`) is held constant and slid forward, when a duration is stated at all.

**Month stepping clamps, never rolls over.** 31 January + 1 month is 28 February, not 3 March.
`readerInstant` already guards `Date.parse`'s silent rollover for exactly this reason, and the same
rule applies here: a date that quietly moves is the one thing this codebase does not ship.

**Duration ≤ interval span**, checked only when an end is stated. A 14-day window repeating every 7
days overlaps itself, which makes "what ends soonest" ambiguous and puts two live occurrences of one
rule in the list at once. Rejected at the form, and by a `.refine` on the schema so an imported file
cannot carry one in. With no stated end there is no duration to overlap and the check does not apply.

```ts
/**
 * Every occurrence opening inside [fromMs, toMs], oldest first.
 *
 * Clock-injected and capped, like everything in daily.ts: a 1-day interval over
 * a year of board window is 365 rows, and a corrupt interval must not be able to
 * allocate without bound. MAX_OCCURRENCES mirrors that module's MAX_DAYS.
 */
export function occurrencesOf(
  event: CustomEvent,
  fromMs: number,
  toMs: number,
  cap?: number,
): Occurrence[];
```

An `Occurrence` carries a resolved `startsAt`, a resolved `endsAt` (stated duration, or the next
opening), the precision each was resolved at, and the derived id from § 2.

## 2. Occurrence IDs

`myevent:<token>#<YYYY-MM-DD>` — the token identifies the rule, the suffix the occurrence's own
start day, in the reader's timezone as they typed it.

Three properties, all deliberate:

- **The first segment is still `myevent`.** `isCustomEventId` is a `startsWith` check, so lane
  logic, `RESERVED_ID_SEGMENTS` and the "their own date is never attributed to a source" guarantee
  all hold with no change.
- **`#` is outside `[a-z0-9]`, so `CustomEventId` rejects an occurrence id.** An occurrence
  therefore cannot be written back into `customEvents`, and cannot survive an import if one ever
  appears in a file. That is a guardrail rather than an accident, and § 6 pins it with a test.
- **Marks, ignores, progress and daily ticks need no change at all.** All four are
  `Record<string, …>` keyed by an opaque event id (`useMarkSet`, `useProgress`, `useDailyLog`). Each
  occurrence gets its own completion, its own ignore, and — where the event reads as daily — its own
  checklist and its own streak.

**Renaming a rule does not move its ids.** The token is random for precisely this reason, already
documented on `mintCustomEventId`: "it does not move when they rename their own event, so editing a
typo in a title never costs them the marks attached to it."

**Rescheduling a rule does move them, and that orphans its marks.** Moving the anchor start, or
changing the interval, gives every subsequent occurrence a different suffix. The old marks stay in
`localStorage` under keys nothing points at any more, so a cycle the reader ticked reads as never
done.

This is accepted rather than migrated, because it is the stance the codebase already takes for this
class of change. `removeEvent` leaves marks behind on purpose — "Reaching into three other stores on
a single tap is how a misclick costs someone a streak, and an orphaned mark costs them nothing" —
and `useMarkSet.merge` never removes, because "nothing else holds a copy of these, so a silent
deletion would be unrecoverable". A migration that re-keyed marks by ordinal would be exactly the
cross-store reach both of those comments decline, performed on an edit the reader may well be
part-way through experimenting with.

What changes instead is that it stops being silent: the edit form counts the marks that will be
stranded and says so before the reader saves, the way `removeGame` reports `blockedBy` rather than
cascading.

## 3. `CustomEvent` gains one optional field

```ts
repeat: Repeat.nullable().default(null),   // absent on every event that exists today
```

`.default(null)` and not merely `.nullable()`, because a stored record written before this field
existed has no `repeat` key at all, and a bare `.nullable()` rejects a *missing* key rather than
supplying one. Defaulted, every record already in a reader's `localStorage` parses unchanged —
`readValid` drops what does not parse, and a required field here would silently delete every custom
event on the device on first launch. `docs/DATA-MODEL.md` § Event IDs are localStorage keys is the
same warning in the same place.

`asDisplayEvent` is unchanged for a non-repeating event. A repeating one goes through
`occurrencesOf` first and each occurrence is projected individually, so a `DisplayEvent` reaching a
view never knows it came from a rule — which is what keeps sort, focus, lanes, filters, progress and
the clock working with no narrowing at any call site.

## 4. Expansion, and the circularity that has to be broken first

Two call sites, deliberately different:

- **`useCustom.rows`** — for each rule, the occurrence that is running *or*, if the rule is
  between cycles, the next one to open; plus the one after that. Always two, never fewer while the
  rule is still repeating, so a gap between cycles reads as "opens Tuesday" rather than as nothing.
  This is what
  joins `state.feed.events` in `App.tsx:198`, so the lists that answer "what ends soonest" gain
  exactly two rows per rule however often it repeats.
- **`useCustom.occurrencesIn(min, max)`** — every occurrence in a range, for the timeline, where
  repetition is the reading rather than clutter.

**`boardWindow` must not see the expanded rows.** It derives the board's range *from the rows given
to it* (`Timeline.tsx:515`): `max: Math.max(...ends, now) + 2 * DAY`. Feeding it occurrences that
were generated to fill the board window is circular — each pass widens the window, which generates
more occurrences, which widens it again. A rule with no `until` never terminates.

So the order is fixed and worth a test of its own:

1. compute `boardWindow` from the base rows — feed events, plus current + next per rule;
2. expand each rule across that settled `[min, max]`, capped;
3. draw.

A rule can then fill the board but can never enlarge it. The reader zooming out sees more
occurrences of a rule they already had on screen; they never see the board grow because a rule
exists.

## 5. UI

**`EventForm`** gains one block under the existing date fields:

```
Repeats  ▸ never | every [N] [days ▾ weeks ▾ months ▾]
Until    ▸ [ ] stops repeating on [date]
```

`never` is the default and preserves today's form exactly. The "I don't know when it ends" checkbox
stays available with a repeat set, and gains a line explaining what it now means — *"each one runs
until the next opens"* — because that is a real and non-obvious answer rather than a degraded one.

**`EventDetail`** gains one line: *"every 2 weeks · next opens 15 Sep"*, and for an unstated end,
*"runs until the next one opens"* beside the countdown rather than the existing "no end date
announced", which would be false here.

**The reschedule warning** from § 2: when editing a rule whose schedule changed and whose
occurrences hold marks, the save button is preceded by *"changing the schedule will strand 3 ticks"*.
It informs; it does not block. The reader's data is theirs to reorganise.

No new screen, no new flow, no second kind of thing in any list.

## 6. Tests

TDD, pure functions first, clocks injected — `test/` already holds this shape for `daily.ts`.

- month-end clamping (31 Jan → 28 Feb, and in a leap year → 29 Feb)
- a DST crossing does not shift an occurrence's wall-clock start
- stated duration ≤ interval accepted; overlapping rejected
- no stated end ⇒ occurrences are contiguous, each ending exactly as the next opens
- `until` terminates the series; `null` does not
- the horizon cap holds for a 1-day interval over a year of board window
- **ids are stable under rename and move under reschedule** — both directions asserted
- **`CustomEventId` rejects an occurrence id**, so one can never round-trip into storage
- a `CustomEvent` with no `repeat` field parses unchanged (the migration guarantee in § 3)
- `boardWindow` computed from base rows is unchanged by expanding a `until: null` rule into it

## 7. Docs, as part of the change

- `docs/DATA-MODEL.md` — the derived occurrence key shape, and what a reschedule costs
- `docs/PRD.md` — F13 extended to cover a rule, with the two-ends distinction stated
- `docs/SOURCES.md` line 740 — record that the stated blocker is now addressable, and why

---

# The forward plan: recurring events from sources

Nothing below is part of the work above, and none of it should be written into `docs/INGESTION.md`
or `docs/SOURCES.md` until the phase it describes is actually started. It is recorded here so the
order is deliberate rather than rediscovered.

The model above is the prerequisite for all of it: `Repeat` lives in `src/shared/` from day one, so
adopting it on the ingest side is a schema addition rather than a second implementation.

## Phase A — a curated cycle table

A per-game table of known rotations, in the shape `games.ts` already uses for `dailyTasks`, but
carrying dates and therefore held to a higher bar than a hint string is.

Illustrating the shape only — the anchors and intervals below are what Phase A has to *establish*
from sources, not values this spec asserts:

```
game     rotation          interval   anchor                  cited page
genshin  Spiral Abyss      <n> days   <date> <hh:mm> server   <url>
hsr      Memory of Chaos   <n> days   <date> <hh:mm> server   <url>
```

**Every entry cites a source URL and lands as `extractionMethod: "manual"` with a real `sourceUrl`.**
That is existing vocabulary, not a new exemption: the review gate already understands a
human-asserted event, and PRD § Quality bar's "every event links to its source so a skeptical user
can verify in one click" is met literally rather than waived. A table entry that cannot cite a page
does not get added.

What this buys: the biggest games covered immediately, with no fetching and no parser, because their
cycles are stable and publicly documented.

What it costs, and must be written down when it ships: **it goes stale silently.** A game changing
cadence breaks the table with nothing to detect it. Mitigations to decide at the time — a
`verifiedAt` per entry that the colophon surfaces once it is old, or a test that fails when an entry
has not been re-checked in N months. The former is more honest; the latter is more likely to work.

## Phase B — parsers emit `Repeat`

`GachaEvent` gains the same nullable `repeat` field, and parsers that can state a rule do.

**Start with arustats `scheduleBosses`.** It is already fetched, already parsed, and currently
discarded at `parsers/arustats.ts` — the cheapest possible first proof, and it directly retires the
note at `docs/SOURCES.md:740`.

Open questions to settle before starting, not now:

- Does the review gate treat a *rule* differently from a date? A wrong interval is wrong forever,
  where a wrong date is wrong once — that argues for a lower confidence ceiling on a parsed rule,
  or for routing every new rule through quarantine regardless of score.
- How does `mergeEvents` reconcile two sources stating different intervals for one rotation? The
  existing confidence preference is probably right, but it has never had to compare rules.
- A source that revises a rule mid-series moves occurrence ids and orphans marks, the same hazard
  as § 2 but without a reader present to be warned. This one needs an answer before Phase B ships.

## Phase C — battle passes and weekly task lists

Deliberately last. Both are recurrences whose *content* changes each cycle even though the window
does not, and this app is explicitly "not a wiki" (`docs/PRD.md` § What this app is not) — it says
that something exists and when it ends, not what is in it. So the window is in scope and the reward
list is not, and that boundary should be agreed before any of it is built rather than discovered
half-way through a parser.

## Out of scope throughout

Notifications of any kind, including a browser-local reminder when a cycle opens. `docs/PRD.md`
§ What this app is not still holds, and a repeating event is exactly the feature that makes
reminders tempting.
