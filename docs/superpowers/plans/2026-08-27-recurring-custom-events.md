# Recurring Custom Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a reader mark one of their own events as repeating, and have every occurrence behave like an ordinary event everywhere in the app.

**Architecture:** One rule persists in `localStorage`; occurrences are derived on read by pure functions in `src/shared/recurrence.ts`. Each occurrence is projected into the existing `DisplayEvent` shape with its own derived id, so sort, focus, lanes, filters, progress, ignores and the daily checklist all work with no narrowing at any call site. `GachaEvent`, the ingest pipeline, the API contract and the review gate are untouched.

**Tech Stack:** TypeScript, Bun (`bun test`), Zod 3, React 19. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-27-recurring-events-design.md` — read it first; every decision below is argued there.

## Global Constraints

- **Run tests with `bun test`; typecheck with `bun run typecheck`.** Both must pass before every commit.
- **Never change `src/shared/schema.ts`.** `GachaEvent`, `GameId`, `eventId` and `slugify` stay exactly as they are. This feature adds nothing to the feed.
- **Never change an existing localStorage key or the `dayKey` format.** `KEYS` in `src/client/state/storage.ts` gains nothing and loses nothing.
- **`CustomEvent.repeat` must use `.default(null)`, never a bare `.nullable()`.** A stored record written before this field existed has no `repeat` key at all, and `readValid` *drops* records that fail to parse. A bare `.nullable()` rejects a missing key and would silently delete every reader's custom events on first launch.
- **Occurrence ids are `myevent:<token>#<YYYY-MM-DD>`** — rule token, `#`, occurrence start day in the reader's local timezone.
- **Custom events are local-wall-clock throughout.** `readerInstant` builds instants from the reader's local time and `fields()` reads them back with `getFullYear`/`getMonth`/`getDate`. All recurrence stepping uses local `Date` accessors for the same reason. Never use `getUTC*` for stepping.
- **Interval bounds: `1..365` integer.** Units: `"days" | "weeks" | "months"`.
- **Comment style:** this repo explains *why*, not *what*, in prose sentences. Match the surrounding files.
- Commit messages end with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **One shell command per Bash call.** Never chain `git add`/`git commit` onto an edit.

---

### Task 1: Calendar stepping

**Files:**
- Create: `src/shared/recurrence.ts`
- Test: `test/recurrence.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `RepeatUnit` (zod enum + type), `Repeat` (zod object + type), `MAX_OCCURRENCES: number`, `addUnits(ms: number, unit: RepeatUnit, n: number): number`, `comesRoundEarly(startsMs: number, endsMs: number | null, repeat: Repeat | null): boolean`.

- [ ] **Step 1: Write the failing test**

Create `test/recurrence.test.ts`. The `process.env.TZ` assignment **must be the first statement after the imports**, before any `Date` is constructed, or the DST test is meaningless.

```ts
import { describe, expect, test } from "bun:test";
import { addUnits, comesRoundEarly, Repeat } from "../src/shared/recurrence.ts";

// Pinned so the DST cases mean something. Copenhagen is UTC+1 in winter and
// UTC+2 in summer, so a step across 29 March 2026 crosses a real transition;
// on a UTC runner these tests would pass without ever exercising the case.
process.env.TZ = "Europe/Copenhagen";

/** Local wall-clock components, which is what a reader typed and reads back. */
function wall(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function at(local: string): number {
  return new Date(local).getTime();
}

describe("addUnits", () => {
  test("days and weeks step the calendar, not 24-hour blocks", () => {
    expect(wall(addUnits(at("2026-08-20T09:00:00"), "days", 1))).toBe("2026-08-21 09:00");
    expect(wall(addUnits(at("2026-08-20T09:00:00"), "weeks", 2))).toBe("2026-09-03 09:00");
  });

  test("a DST transition does not shift the wall-clock time", () => {
    // 29 March 2026 is the spring-forward. A reader whose weekly reset is at
    // 09:00 means 09:00 on both sides of it; stepping in fixed milliseconds
    // would land 08:00 or 10:00 and quietly move their whole series.
    expect(wall(addUnits(at("2026-03-28T09:00:00"), "days", 1))).toBe("2026-03-29 09:00");
    expect(wall(addUnits(at("2026-03-25T09:00:00"), "weeks", 1))).toBe("2026-04-01 09:00");
    // And the autumn fall-back, in the other direction.
    expect(wall(addUnits(at("2026-10-24T09:00:00"), "days", 1))).toBe("2026-10-25 09:00");
  });

  test("months clamp to the last valid day rather than rolling over", () => {
    // Date.parse and setMonth both roll 31 February forward into March. A date
    // that silently moves is the one thing this codebase does not ship —
    // readerInstant guards the same hazard on the way in.
    expect(wall(addUnits(at("2026-01-31T09:00:00"), "months", 1))).toBe("2026-02-28 09:00");
    expect(wall(addUnits(at("2028-01-31T09:00:00"), "months", 1))).toBe("2028-02-29 09:00");
    expect(wall(addUnits(at("2026-03-31T09:00:00"), "months", 1))).toBe("2026-04-30 09:00");
  });

  test("clamping does not accumulate — the anchor day is restored", () => {
    // Stepping one month at a time from 31 January must reach 31 March, not 28
    // March: each step is measured from the anchor, so a February clamp is not
    // allowed to shorten every later occurrence.
    const anchor = at("2026-01-31T09:00:00");
    expect(wall(addUnits(anchor, "months", 2))).toBe("2026-03-31 09:00");
  });

  test("a zero step is the identity", () => {
    const anchor = at("2026-08-20T09:00:00");
    expect(addUnits(anchor, "months", 0)).toBe(anchor);
  });
});

describe("comesRoundEarly", () => {
  // One predicate, exported, because two callers ask this question — the
  // CustomEvent refine and the form that has to explain the refusal. Two
  // copies would drift, and the form would start refusing saves the schema
  // accepts or waving through ones it rejects.
  test("a window closing before the next opening is fine", () => {
    const start = at("2026-09-01T09:00:00");
    const end = at("2026-09-08T09:00:00");
    expect(comesRoundEarly(start, end, { unit: "weeks", interval: 2, until: null })).toBe(false);
  });

  test("closing exactly as the next opens is fine — they do not overlap", () => {
    const start = at("2026-09-01T09:00:00");
    const end = at("2026-09-08T09:00:00");
    expect(comesRoundEarly(start, end, { unit: "weeks", interval: 1, until: null })).toBe(false);
  });

  test("a window still open when the next one starts is not", () => {
    const start = at("2026-09-01T09:00:00");
    const end = at("2026-09-15T09:00:00");
    expect(comesRoundEarly(start, end, { unit: "weeks", interval: 1, until: null })).toBe(true);
  });

  test("no rule, or no stated end, has nothing to overlap", () => {
    const start = at("2026-09-01T09:00:00");
    expect(comesRoundEarly(start, at("2026-10-01T09:00:00"), null)).toBe(false);
    expect(comesRoundEarly(start, null, { unit: "weeks", interval: 1, until: null })).toBe(false);
  });
});

describe("Repeat", () => {
  test("accepts a well-formed rule", () => {
    const parsed = Repeat.parse({ unit: "weeks", interval: 2, until: null });
    expect(parsed.interval).toBe(2);
  });

  test("rejects an interval outside 1..365", () => {
    expect(Repeat.safeParse({ unit: "days", interval: 0, until: null }).success).toBe(false);
    expect(Repeat.safeParse({ unit: "days", interval: 366, until: null }).success).toBe(false);
    expect(Repeat.safeParse({ unit: "days", interval: 1.5, until: null }).success).toBe(false);
  });

  test("rejects an unknown unit", () => {
    expect(Repeat.safeParse({ unit: "fortnights", interval: 1, until: null }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/recurrence.test.ts`
Expected: FAIL — `Cannot find module '../src/shared/recurrence.ts'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/shared/recurrence.ts`:

```ts
import { z } from "zod";

/**
 * Events that come round again (PRD F13).
 *
 * The rest of this app measures a window closing, and `daily.ts` measures one
 * repeating every day. Nothing measured a fortnight. This is that rung: a rule
 * the reader states, from which concrete occurrences are derived on read and
 * never stored.
 *
 * Everything here is pure and takes its clock as an argument, for the same
 * reason the parsers and `daily.ts` do: a function that reads `Date.now()`
 * cannot be tested against a fixed instant.
 */

export const RepeatUnit = z.enum(["days", "weeks", "months"]);
export type RepeatUnit = z.infer<typeof RepeatUnit>;

export const Repeat = z.object({
  unit: RepeatUnit,
  /** Units between one occurrence opening and the next. */
  interval: z.number().int().min(1).max(365),
  /**
   * When repetition stops. Null means it does not.
   *
   * Distinct from an occurrence's own end, which is a different question with a
   * different answer — see the spec's § The two ends.
   */
  until: z.string().datetime().nullable(),
});
export type Repeat = z.infer<typeof Repeat>;

/**
 * The most occurrences any one rule may produce for one call.
 *
 * Mirrors `daily.ts`'s `MAX_DAYS` and exists for the same reason: a corrupt
 * interval must not be able to make the client allocate without bound.
 */
export const MAX_OCCURRENCES = 200;

/**
 * Step an instant by whole calendar units, preserving the local wall clock.
 *
 * **Local, not UTC, and calendar units rather than milliseconds.** A reader's
 * own event is local throughout — `readerInstant` builds the instant from their
 * wall time and `fields()` reads it back with local accessors — so a weekly
 * reset they set for 09:00 has to stay at 09:00 across a DST transition. Adding
 * `7 * DAY` milliseconds would move it to 08:00 or 10:00 and drag every later
 * occurrence with it.
 *
 * Months clamp to the last valid day: 31 January plus a month is 28 February,
 * not 3 March. `setMonth` rolls over by default, which is the same silent date
 * shift `readerInstant` already refuses on the way in.
 */
export function addUnits(ms: number, unit: RepeatUnit, n: number): number {
  const d = new Date(ms);

  if (unit === "days") {
    d.setDate(d.getDate() + n);
    return d.getTime();
  }
  if (unit === "weeks") {
    d.setDate(d.getDate() + n * 7);
    return d.getTime();
  }

  // Pinned to the 1st before moving the month, because setting the month first
  // is what performs the rollover we are trying to avoid: 31 January with the
  // month advanced is 31 February, which resolves to 3 March before we ever get
  // a chance to clamp it.
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d.getTime();
}

/**
 * Whether a window is still open when its next occurrence starts.
 *
 * Two live occurrences of one rule leave "what ends soonest" without an
 * answer, so this is refused — by the `CustomEvent` schema, so an imported
 * file cannot carry one in, and by the form, so the reader is told rather than
 * having a save silently rejected. Exported precisely because both ask it: two
 * copies would drift, and a form that disagrees with its schema either refuses
 * saves that would succeed or promises ones that will not.
 *
 * Closing exactly as the next opens is fine — that is contiguous, not
 * overlapping, and it is the shape a reset-to-reset chore has.
 *
 * No rule, or no stated end, has nothing to overlap: an unstated end runs to
 * the next opening by definition.
 */
export function comesRoundEarly(
  startsMs: number,
  endsMs: number | null,
  repeat: Repeat | null,
): boolean {
  if (repeat === null || endsMs === null) return false;
  return endsMs > addUnits(startsMs, repeat.unit, repeat.interval);
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `bun test test/recurrence.test.ts`
Expected: PASS, 12 tests.

Run: `bun run typecheck`
Expected: no output, exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/shared/recurrence.ts test/recurrence.test.ts
```

```bash
git commit -m "$(cat <<'MSG'
Step a calendar by days, weeks or months

The app can express a window closing and a day repeating; daily.ts counts
in days and stops there. This is the arithmetic under the rung between
them.

Local wall-clock rather than milliseconds, because a reader's own event is
local throughout — a weekly reset set for 09:00 stays at 09:00 across a DST
transition, where adding 7*DAY would move it an hour and drag every later
occurrence with it. Months clamp to the last valid day rather than letting
setMonth roll 31 February into 3 March, which is the same silent shift
readerInstant already refuses on the way in.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: Occurrence ids

**Files:**
- Modify: `src/shared/recurrence.ts` (append)
- Test: `test/recurrence.test.ts` (append)

**Interfaces:**
- Consumes: nothing from Task 1 at runtime; same module.
- Produces: `OCCURRENCE_SEP: "#"`, `occurrenceId(ruleId: string, startsAtMs: number): string`, `ruleIdOf(id: string): string`, `isOccurrenceId(id: string): boolean`, `movesOccurrences(before, after): boolean` where both arguments are `{ startsAt: string; repeat: Repeat | null }`.

- [ ] **Step 1: Write the failing test**

Append to `test/recurrence.test.ts`, and add `isOccurrenceId, occurrenceId, ruleIdOf` to the import from `recurrence.ts` plus a new import line `import { CustomEventId, isCustomEventId } from "../src/shared/custom.ts";`.

```ts
describe("occurrence ids", () => {
  const RULE = "myevent:k3f9qa2m01";

  test("suffixes the rule id with the occurrence's own local start day", () => {
    const id = occurrenceId(RULE, new Date("2026-09-01T09:00:00").getTime());
    expect(id).toBe("myevent:k3f9qa2m01#2026-09-01");
  });

  test("the day is the reader's local day, not UTC's", () => {
    // 23:30 local on 1 September is 21:30Z — a UTC reading would label this
    // occurrence with the right day here, but the reverse case would not, and
    // the reader typed a local date. Assert the local reading directly.
    const id = occurrenceId(RULE, new Date("2026-09-01T23:30:00").getTime());
    expect(id).toBe("myevent:k3f9qa2m01#2026-09-01");
  });

  test("the rule id is recoverable, and a plain id is its own rule", () => {
    expect(ruleIdOf("myevent:k3f9qa2m01#2026-09-01")).toBe(RULE);
    expect(ruleIdOf(RULE)).toBe(RULE);
    // A feed id is colon-separated and carries no separator, so it survives.
    expect(ruleIdOf("genshin:some-event:2026-09-01")).toBe("genshin:some-event:2026-09-01");
  });

  test("an occurrence is recognisable as one", () => {
    expect(isOccurrenceId("myevent:k3f9qa2m01#2026-09-01")).toBe(true);
    expect(isOccurrenceId(RULE)).toBe(false);
  });

  test("an occurrence id still reads as the reader's own", () => {
    // isCustomEventId is a startsWith check on the first segment, so lane
    // logic, RESERVED_ID_SEGMENTS and "never attributed to a source" all hold.
    expect(isCustomEventId("myevent:k3f9qa2m01#2026-09-01")).toBe(true);
  });

  test("renaming a rule cannot move its occurrence ids", () => {
    // The title is not an input here, and that is the guarantee: the token is
    // random precisely so fixing a typo never costs the marks attached to it,
    // exactly as mintCustomEventId describes.
    const start = new Date("2026-09-01T09:00:00").getTime();
    expect(occurrenceId(RULE, start)).toBe(occurrenceId(RULE, start));
  });

  test("CustomEventId REJECTS an occurrence id", () => {
    // The guardrail, asserted rather than assumed. '#' is outside [a-z0-9], so
    // an occurrence cannot be written back into the customEvents store and
    // cannot survive an import if one ever appears in a file. validRecords
    // drops what fails this schema, which is exactly the behaviour we want.
    expect(CustomEventId.safeParse(RULE).success).toBe(true);
    expect(CustomEventId.safeParse("myevent:k3f9qa2m01#2026-09-01").success).toBe(false);
  });
});

describe("movesOccurrences", () => {
  const rule = (startsAt: string, interval: number) => ({
    startsAt,
    repeat: { unit: "weeks" as const, interval, until: null },
  });

  test("a changed anchor or interval re-keys every occurrence", () => {
    const a = rule("2026-09-01T07:00:00.000Z", 2);
    expect(movesOccurrences(a, rule("2026-09-02T07:00:00.000Z", 2))).toBe(true);
    expect(movesOccurrences(a, rule("2026-09-01T07:00:00.000Z", 3))).toBe(true);
  });

  test("changing only `until` does not", () => {
    // It truncates the series; it does not move what is already in it, so no
    // mark is stranded and the reader should not be warned that one is.
    const a = rule("2026-09-01T07:00:00.000Z", 2);
    const b = {
      startsAt: "2026-09-01T07:00:00.000Z",
      repeat: { unit: "weeks" as const, interval: 2, until: "2027-01-01T00:00:00.000Z" },
    };
    expect(movesOccurrences(a, b)).toBe(false);
  });

  test("adding or dropping a rule entirely counts as a move", () => {
    const plain = { startsAt: "2026-09-01T07:00:00.000Z", repeat: null };
    expect(movesOccurrences(plain, rule("2026-09-01T07:00:00.000Z", 2))).toBe(true);
    expect(movesOccurrences(rule("2026-09-01T07:00:00.000Z", 2), plain)).toBe(true);
  });

  test("an untouched schedule moves nothing", () => {
    const a = rule("2026-09-01T07:00:00.000Z", 2);
    expect(movesOccurrences(a, rule("2026-09-01T07:00:00.000Z", 2))).toBe(false);
  });
});

```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/recurrence.test.ts`
Expected: FAIL — `occurrenceId is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/shared/recurrence.ts`:

```ts
/**
 * What separates a rule from one of its occurrences.
 *
 * Deliberately outside `[a-z0-9]`, and therefore outside `CustomEventId`. An
 * occurrence id is derived on read and must never be storable: the store holds
 * rules, and a suffixed id round-tripping into it would put a frozen copy of
 * today's schedule beside the rule that generates it. `validRecords` drops what
 * fails the schema, so the guardrail is the regex rather than a code path
 * anybody has to remember. `test/recurrence.test.ts` pins it.
 */
export const OCCURRENCE_SEP = "#";

/**
 * A stable id for one occurrence of a rule.
 *
 * The rule's token identifies *which* recurring thing, and the local start day
 * identifies *which time round*. Both halves matter: marks, ignores, progress
 * and daily ticks all key off this string, so an occurrence carries its own
 * completion and its own streak rather than sharing the rule's.
 *
 * The day is read with local accessors because the reader typed a local date
 * and `fields()` shows them a local date back. A UTC reading would label some
 * occurrences with the previous day for every reader west of UTC.
 *
 * **Renaming a rule does not move these** — the token is random, exactly as
 * `mintCustomEventId` describes. **Rescheduling one does**, and that strands
 * the marks under the old ids. That is accepted and warned about rather than
 * migrated; see the spec's § 2 and `removeEvent`'s reasoning for the same
 * trade.
 */
export function occurrenceId(ruleId: string, startsAtMs: number): string {
  const d = new Date(startsAtMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `${ruleId}${OCCURRENCE_SEP}${day}`;
}

/**
 * The rule behind an id, or the id itself when it is not an occurrence.
 *
 * Total on purpose. Callers hold an id off a row and have no reason to know
 * which kind it is — the detail sheet looking up the record to edit is the
 * motivating case, and a feed id passing through unchanged is what keeps it
 * from needing a branch.
 */
export function ruleIdOf(id: string): string {
  const at = id.indexOf(OCCURRENCE_SEP);
  return at === -1 ? id : id.slice(0, at);
}

/** Whether this id names one occurrence of a rule rather than an event. */
export function isOccurrenceId(id: string): boolean {
  return id.includes(OCCURRENCE_SEP);
}

/**
 * Whether a schedule edit would re-key the occurrences it generates.
 *
 * The anchor and the interval are both halves of every occurrence id, so
 * changing either strands the marks stored under the old ones. `until` is not:
 * it truncates the series without moving anything already in it, so a reader
 * who only sets an end date should not be warned about ticks that are in no
 * danger.
 *
 * Nothing here rewrites a mark. This is what the form asks in order to *say*
 * what an edit costs — see the spec's § 2 for why it is told rather than
 * migrated.
 */
export function movesOccurrences(
  before: { startsAt: string; repeat: Repeat | null },
  after: { startsAt: string; repeat: Repeat | null },
): boolean {
  if (before.startsAt !== after.startsAt) return true;
  return (
    before.repeat?.unit !== after.repeat?.unit ||
    before.repeat?.interval !== after.repeat?.interval
  );
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `bun test test/recurrence.test.ts`
Expected: PASS, 23 tests.

Run: `bun run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/shared/recurrence.ts test/recurrence.test.ts
```

```bash
git commit -m "$(cat <<'MSG'
Derive an id per occurrence, unstorable by construction

myevent:<token>#<YYYY-MM-DD>. The token says which recurring thing, the
local day says which time round, and marks, ignores, progress and daily
ticks all key off the whole string — so an occurrence carries its own
completion and its own streak rather than sharing the rule's.

'#' is outside [a-z0-9] and therefore outside CustomEventId, so an
occurrence cannot be written back into the store or survive an import.
That is the guardrail rather than a code path anybody has to remember, and
a test pins it in both directions.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 3: `CustomEvent` carries a rule

**Files:**
- Modify: `src/shared/custom.ts`
- Test: `test/custom.test.ts` (append)

**Interfaces:**
- Consumes: `Repeat`, `comesRoundEarly` from Task 1.
- Produces: `CustomEvent.repeat: Repeat | null` (defaulted), and the overlap refine.

- [ ] **Step 1: Write the failing test**

Append to `test/custom.test.ts`. Add to its existing `recurrence.ts` needs a new import line: `import { Repeat } from "../src/shared/recurrence.ts";`

```ts
describe("a custom event may carry a repeat rule", () => {
  test("a record stored before this field existed still parses", () => {
    // THE migration guarantee. readValid drops records that fail this schema,
    // and the survivors are what the next write persists — so a required or
    // bare-nullable field here would silently delete every custom event on
    // every device that has one, with no server-side copy to restore from.
    const legacy = {
      id: "myevent:k3f9qa2m01",
      game: "mygame:limbus-company",
      title: "Walpurgisnacht",
      type: "banner",
      summary: null,
      startsAt: "2026-08-20T00:00:00.000Z",
      startPrecision: "day",
      endsAt: "2026-09-03T00:00:00.000Z",
      endPrecision: "day",
      at: AT,
      updatedAt: AT,
      // no `repeat` key at all — this is the shape already in localStorage
    };
    const parsed = CustomEvent.safeParse(legacy);
    expect(parsed.success).toBe(true);
    expect(parsed.data!.repeat).toBe(null);
  });

  test("accepts a rule whose window closes before it comes round again", () => {
    const event = ownEvent({
      startsAt: "2026-09-01T00:00:00.000Z",
      endsAt: "2026-09-08T00:00:00.000Z",
      repeat: Repeat.parse({ unit: "weeks", interval: 2, until: null }),
    });
    expect(event.repeat?.interval).toBe(2);
  });

  test("rejects a rule that comes round before it ends", () => {
    // A 14-day window repeating every 7 days puts two live occurrences of one
    // rule in the same list, which makes "what ends soonest" ambiguous. Refused
    // at the schema so an imported file cannot carry one in either.
    const overlapping = CustomEvent.safeParse({
      id: "myevent:k3f9qa2m01",
      game: "mygame:limbus-company",
      title: "Walpurgisnacht",
      type: "banner",
      summary: null,
      startsAt: "2026-09-01T00:00:00.000Z",
      startPrecision: "day",
      endsAt: "2026-09-15T00:00:00.000Z",
      endPrecision: "day",
      repeat: { unit: "weeks", interval: 1, until: null },
      at: AT,
      updatedAt: AT,
    });
    expect(overlapping.success).toBe(false);
  });

  test("no stated end means there is no overlap to check", () => {
    // The window runs to the next opening by definition, so it cannot overlap.
    const parsed = CustomEvent.safeParse({
      id: "myevent:k3f9qa2m01",
      game: "mygame:limbus-company",
      title: "Weekly missions",
      type: "other",
      summary: null,
      startsAt: "2026-09-01T00:00:00.000Z",
      startPrecision: "day",
      endsAt: null,
      endPrecision: "unknown",
      repeat: { unit: "weeks", interval: 1, until: null },
      at: AT,
      updatedAt: AT,
    });
    expect(parsed.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/custom.test.ts`
Expected: FAIL — the legacy record parses but `parsed.data!.repeat` is `undefined`, and the overlapping record is accepted.

- [ ] **Step 3: Write minimal implementation**

In `src/shared/custom.ts`, add to the imports:

```ts
import { comesRoundEarly, Repeat } from "./recurrence.ts";
```

Add the field to the `CustomEvent` object literal, immediately after `endPrecision`:

```ts
    /**
     * How this comes round again, or null when it does not.
     *
     * **`.default(null)`, never a bare `.nullable()`.** A record written before
     * this field existed has no `repeat` key at all, and a bare `.nullable()`
     * rejects a *missing* key rather than supplying one. `useCustom` reads
     * through `validRecords`, which drops what fails this schema, and the
     * survivors are what the next write persists — so the stricter form would
     * erase every reader's custom events on first launch, silently, with no
     * server-side copy. The same hazard `game: z.string()` above is guarding.
     */
    repeat: Repeat.nullable().default(null),
```

Add this refine to the chain, after the existing `endsAt > startsAt` one:

```ts
  // A window that has not closed by the time it comes round again puts two
  // live occurrences of one rule in the same list, and "what ends soonest" no
  // longer has an answer. Checked only when an end is stated: with none, the
  // window runs to the next opening by definition and cannot overlap.
  .refine(
    (e) =>
      !comesRoundEarly(
        Date.parse(e.startsAt),
        e.endsAt === null ? null : Date.parse(e.endsAt),
        e.repeat,
      ),
    {
      message: "a repeat cannot come round before it ends",
      path: ["repeat"],
    },
  );
```

- [ ] **Step 4: Run the whole suite and typecheck**

Run: `bun test`
Expected: PASS. The full suite matters here, not just one file — `custom.test.ts`, `views.test.tsx` and `custom-ui.test.tsx` all build `CustomEvent`s.

Run: `bun run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/shared/custom.ts test/custom.test.ts
```

```bash
git commit -m "$(cat <<'MSG'
Let a reader's event carry a repeat rule

.default(null) rather than a bare .nullable(), and the distinction is the
whole commit: a record written before this field existed has no `repeat`
key, a bare .nullable() rejects a missing key, and useCustom reads through
validRecords — which drops what fails and persists only the survivors. The
stricter form would have erased every reader's custom events on first
launch with no server-side copy.

Also refuses a window that comes round before it closes, since two live
occurrences of one rule leave "what ends soonest" without an answer. Only
when an end is stated; with none the window runs to the next opening and
cannot overlap.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 4: Deriving occurrences

**Files:**
- Modify: `src/shared/recurrence.ts` (append)
- Test: `test/recurrence.test.ts` (append)

**Interfaces:**
- Consumes: `addUnits`, `occurrenceId`, `MAX_OCCURRENCES` from Tasks 1–2.
- Produces:
  - `interface RepeatingEvent { id: string; startsAt: string; startPrecision: Precision; endsAt: string | null; endPrecision: Precision; repeat: Repeat | null }`
  - `interface Occurrence { id: string; index: number; startsAt: string; startPrecision: Precision; endsAt: string; endPrecision: Precision }`
  - `occurrencesOf(event: RepeatingEvent, fromMs: number, toMs: number, cap?: number): Occurrence[]`
  - `nextOccurrences(event: RepeatingEvent, nowMs: number, count: number): Occurrence[]`

**Note on the import direction:** `recurrence.ts` defines `RepeatingEvent` structurally and must **not** import `CustomEvent` from `custom.ts` — `custom.ts` already imports from here, and the reverse would be circular. `Precision` comes from `schema.ts`, which imports nothing from either.

- [ ] **Step 1: Write the failing test**

Append to `test/recurrence.test.ts`, adding `nextOccurrences, occurrencesOf, type RepeatingEvent` to the `recurrence.ts` import.

```ts
describe("occurrencesOf", () => {
  function rule(over: Partial<RepeatingEvent> = {}): RepeatingEvent {
    return {
      id: "myevent:k3f9qa2m01",
      startsAt: new Date("2026-09-01T09:00:00").toISOString(),
      startPrecision: "exact",
      endsAt: new Date("2026-09-08T09:00:00").toISOString(),
      endPrecision: "exact",
      repeat: { unit: "weeks", interval: 2, until: null },
      ...over,
    };
  }

  const day = (local: string) => new Date(local).getTime();

  test("a non-repeating event yields nothing", () => {
    // Callers keep the existing single-event path; this function is only ever
    // about rules, which keeps the blast radius off events that already exist.
    expect(occurrencesOf(rule({ repeat: null }), day("2026-01-01T00:00:00"), day("2027-01-01T00:00:00"))).toEqual([]);
  });

  test("slides the stated window forward by the interval", () => {
    const got = occurrencesOf(rule(), day("2026-09-01T00:00:00"), day("2026-10-01T00:00:00"));
    expect(got.map((o) => o.id)).toEqual([
      "myevent:k3f9qa2m01#2026-09-01",
      "myevent:k3f9qa2m01#2026-09-15",
      "myevent:k3f9qa2m01#2026-09-29",
    ]);
    // The duration is held constant, not recomputed.
    expect(new Date(got[1]!.endsAt).getTime() - new Date(got[1]!.startsAt).getTime())
      .toBe(7 * 24 * 60 * 60 * 1000);
  });

  test("with no stated end, each occurrence runs until the next opens", () => {
    // The point of the whole design: a rule supplies the boundary the rotation
    // was missing, so `endsAt: null` here is not the unbounded case
    // docs/SOURCES.md refuses. Occurrences are contiguous, with no gap.
    const got = occurrencesOf(
      rule({ endsAt: null, endPrecision: "unknown", repeat: { unit: "weeks", interval: 1, until: null } }),
      day("2026-09-01T00:00:00"),
      day("2026-09-23T00:00:00"),
    );
    expect(got).toHaveLength(4);
    expect(got[0]!.endsAt).toBe(got[1]!.startsAt);
    expect(got[1]!.endsAt).toBe(got[2]!.startsAt);
    // Derived from the reader's own anchor, so it inherits that precision
    // rather than claiming to be exact when their start was only a day.
    expect(got[0]!.endPrecision).toBe("exact");
  });

  test("a derived end inherits the anchor's start precision", () => {
    const got = occurrencesOf(
      rule({ startPrecision: "day", endsAt: null, endPrecision: "unknown" }),
      day("2026-09-01T00:00:00"),
      day("2026-09-20T00:00:00"),
    );
    expect(got[0]!.endPrecision).toBe("day");
  });

  test("until stops the series, and the last window still closes on schedule", () => {
    const got = occurrencesOf(
      rule({
        endsAt: null,
        endPrecision: "unknown",
        repeat: { unit: "weeks", interval: 1, until: new Date("2026-09-16T00:00:00").toISOString() },
      }),
      day("2026-09-01T00:00:00"),
      day("2026-12-01T00:00:00"),
    );
    // Opens 1, 8, 15 Sep. The 22nd is past `until`, so it never opens — but the
    // 15th's window still runs its full week rather than being truncated.
    expect(got.map((o) => o.id)).toEqual([
      "myevent:k3f9qa2m01#2026-09-01",
      "myevent:k3f9qa2m01#2026-09-08",
      "myevent:k3f9qa2m01#2026-09-15",
    ]);
    expect(got[2]!.endsAt).toBe(new Date("2026-09-22T09:00:00").toISOString());
  });

  test("an occurrence overlapping the window at either edge is included", () => {
    // A bar half off the left of the board is still on the board.
    const got = occurrencesOf(rule(), day("2026-09-03T00:00:00"), day("2026-09-04T00:00:00"));
    expect(got.map((o) => o.id)).toEqual(["myevent:k3f9qa2m01#2026-09-01"]);
  });

  test("monthly rules clamp and do not accumulate", () => {
    const got = occurrencesOf(
      rule({
        startsAt: new Date("2026-01-31T09:00:00").toISOString(),
        endsAt: null,
        endPrecision: "unknown",
        repeat: { unit: "months", interval: 1, until: null },
      }),
      day("2026-01-01T00:00:00"),
      day("2026-04-15T00:00:00"),
    );
    expect(got.map((o) => o.id)).toEqual([
      "myevent:k3f9qa2m01#2026-01-31",
      "myevent:k3f9qa2m01#2026-02-28",
      "myevent:k3f9qa2m01#2026-03-31",
    ]);
  });

  test("the cap bounds what one call can allocate", () => {
    const got = occurrencesOf(
      rule({ endsAt: null, endPrecision: "unknown", repeat: { unit: "days", interval: 1, until: null } }),
      day("2026-01-01T00:00:00"),
      day("2030-01-01T00:00:00"),
      10,
    );
    expect(got).toHaveLength(10);
  });

  test("an ancient anchor still reaches a window years later", () => {
    const got = occurrencesOf(
      rule({
        startsAt: new Date("2020-09-01T09:00:00").toISOString(),
        endsAt: null,
        endPrecision: "unknown",
        repeat: { unit: "days", interval: 1, until: null },
      }),
      day("2026-09-01T00:00:00"),
      day("2026-09-04T00:00:00"),
    );
    expect(got.map((o) => o.id)).toEqual([
      "myevent:k3f9qa2m01#2026-09-01",
      "myevent:k3f9qa2m01#2026-09-02",
      "myevent:k3f9qa2m01#2026-09-03",
    ]);
  });
});

describe("nextOccurrences", () => {
  function rule(over: Partial<RepeatingEvent> = {}): RepeatingEvent {
    return {
      id: "myevent:k3f9qa2m01",
      startsAt: new Date("2026-09-01T09:00:00").toISOString(),
      startPrecision: "exact",
      endsAt: new Date("2026-09-08T09:00:00").toISOString(),
      endPrecision: "exact",
      repeat: { unit: "weeks", interval: 2, until: null },
      ...over,
    };
  }

  test("returns the running occurrence and the one after it", () => {
    const now = new Date("2026-09-03T12:00:00").getTime();
    const got = nextOccurrences(rule(), now, 2);
    expect(got.map((o) => o.id)).toEqual([
      "myevent:k3f9qa2m01#2026-09-01",
      "myevent:k3f9qa2m01#2026-09-15",
    ]);
  });

  test("between cycles it returns the next to open, plus the one after", () => {
    // A rule with a gap has nothing running on 10 September. "Opens Saturday"
    // is the honest answer; showing nothing would read as the rule being over.
    const now = new Date("2026-09-10T12:00:00").getTime();
    const got = nextOccurrences(rule(), now, 2);
    expect(got.map((o) => o.id)).toEqual([
      "myevent:k3f9qa2m01#2026-09-15",
      "myevent:k3f9qa2m01#2026-09-29",
    ]);
  });

  test("a series past its until yields nothing", () => {
    const got = nextOccurrences(
      rule({ repeat: { unit: "weeks", interval: 2, until: new Date("2026-09-02T00:00:00").toISOString() } }),
      new Date("2027-01-01T00:00:00").getTime(),
      2,
    );
    expect(got).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/recurrence.test.ts`
Expected: FAIL — `occurrencesOf is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/shared/recurrence.ts`. Add `import type { Precision } from "./schema.ts";` to the imports.

```ts
/**
 * The fields a rule is expanded from — everything else is irrelevant.
 *
 * Structural rather than `CustomEvent` on purpose, and not only for the usual
 * reason: `custom.ts` imports this module, so importing it back would be
 * circular. It also means the ingest side can adopt this without a second
 * implementation when `GachaEvent` grows the same field (see the spec's
 * Phase B).
 */
export interface RepeatingEvent {
  id: string;
  startsAt: string;
  startPrecision: Precision;
  endsAt: string | null;
  endPrecision: Precision;
  repeat: Repeat | null;
}

/** One time round. Both boundaries are resolved; neither is ever null. */
export interface Occurrence {
  id: string;
  /** How many times round this is, counting the anchor as 0. */
  index: number;
  startsAt: string;
  startPrecision: Precision;
  endsAt: string;
  endPrecision: Precision;
}

/**
 * How far the walk will seek before giving up looking for the window.
 *
 * Occurrences are walked from the anchor rather than jumped to arithmetically,
 * because month stepping clamps and so has no closed form to jump with. Fifty
 * years of a daily rule is a fraction of a millisecond and the result is
 * memoised, so the simple walk is worth more than the arithmetic would save.
 */
const MAX_SEEK = 20_000;

/**
 * Every occurrence overlapping `[fromMs, toMs]`, oldest first.
 *
 * A non-repeating event yields nothing: callers keep their existing
 * single-event path, so nothing about an event that already exists changes.
 *
 * **An occurrence with no stated end runs until the next one opens.** That is
 * the boundary a bare rotation was missing — `docs/SOURCES.md` § arustats
 * declines to publish one precisely because nothing bounded it — and it is
 * derived from the interval the reader typed rather than invented for them. The
 * store still holds `endsAt: null`; only this projection resolves it.
 */
export function occurrencesOf(
  event: RepeatingEvent,
  fromMs: number,
  toMs: number,
  cap: number = MAX_OCCURRENCES,
): Occurrence[] {
  const repeat = event.repeat;
  if (repeat === null) return [];

  const anchor = Date.parse(event.startsAt);
  if (Number.isNaN(anchor)) return [];

  // Held constant and slid forward, rather than recomputed per occurrence: the
  // reader stated one window's length, not a rule for deriving lengths.
  const stated = event.endsAt === null ? null : Date.parse(event.endsAt) - anchor;
  const untilMs = repeat.until === null ? Infinity : Date.parse(repeat.until);

  const out: Occurrence[] = [];
  for (let n = 0; n < MAX_SEEK && out.length < cap; n += 1) {
    const startsMs = addUnits(anchor, repeat.unit, n * repeat.interval);
    if (startsMs > untilMs || startsMs > toMs) break;

    // Always defined, even for the last occurrence of a terminating series: the
    // window still closes on schedule, it simply is not followed by another.
    const nextOpening = addUnits(startsMs, repeat.unit, repeat.interval);
    const endsMs = stated === null ? nextOpening : startsMs + stated;

    // Overlapping the window at either edge counts — a bar half off the left of
    // the board is still on the board.
    if (endsMs >= fromMs) {
      out.push({
        id: occurrenceId(event.id, startsMs),
        index: n,
        startsAt: new Date(startsMs).toISOString(),
        startPrecision: event.startPrecision,
        endsAt: new Date(endsMs).toISOString(),
        // A derived end is exactly as well known as the anchor it was derived
        // from; a stated one keeps the precision the reader stated it to.
        endPrecision: stated === null ? event.startPrecision : event.endPrecision,
      });
    }
  }
  return out;
}

/**
 * The next `count` occurrences that have not finished, oldest first.
 *
 * "Not finished" rather than "running", so a rule between cycles answers
 * "opens Saturday" instead of answering nothing — a gap in a rotation is not
 * the rotation being over, and the lists would otherwise lose the rule for the
 * whole of its off week.
 */
export function nextOccurrences(
  event: RepeatingEvent,
  nowMs: number,
  count: number,
): Occurrence[] {
  if (event.repeat === null || count <= 0) return [];
  // Bounded rather than open-ended: `count` occurrences can never span more
  // than `count` intervals past now, whatever the unit.
  const horizon = addUnits(
    nowMs,
    event.repeat.unit,
    event.repeat.interval * (count + 1),
  );
  return occurrencesOf(event, nowMs, horizon, count);
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `bun test test/recurrence.test.ts`
Expected: PASS, 35 tests.

Run: `bun run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/shared/recurrence.ts test/recurrence.test.ts
```

```bash
git commit -m "$(cat <<'MSG'
Derive the occurrences a rule stands for

An occurrence with no stated end runs until the next one opens. That is the
boundary a bare rotation was missing — docs/SOURCES.md declines to publish
arustats' Abyss openings precisely because nothing bounded them — and here
it is entailed by the interval the reader typed rather than invented for
them. The store still holds endsAt: null; only this projection resolves it.

nextOccurrences returns what has not finished rather than what is running,
so a rule between cycles answers "opens Saturday" instead of vanishing for
its whole off week.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 5: Projecting an occurrence into a row

**Files:**
- Modify: `src/shared/custom.ts` (append)
- Test: `test/custom.test.ts` (append)

**Interfaces:**
- Consumes: `Occurrence` from Task 4, `DisplayEvent`/`asDisplayEvent` already in `custom.ts`.
- Produces: `asOccurrenceEvent(rule: CustomEvent, occurrence: Occurrence): DisplayEvent`.

- [ ] **Step 1: Write the failing test**

Append to `test/custom.test.ts`, adding `asOccurrenceEvent` to the `custom.ts` import and `nextOccurrences` to the `recurrence.ts` import.

```ts
describe("asOccurrenceEvent", () => {
  const repeating = () =>
    ownEvent({
      startsAt: new Date("2026-09-01T09:00:00").toISOString(),
      startPrecision: "exact",
      endsAt: new Date("2026-09-08T09:00:00").toISOString(),
      endPrecision: "exact",
      repeat: { unit: "weeks", interval: 2, until: null },
    });

  test("carries the occurrence's id and dates, and the rule's everything else", () => {
    const rule = repeating();
    const occ = nextOccurrences(rule, new Date("2026-09-15T12:00:00").getTime(), 1)[0]!;
    const row = asOccurrenceEvent(rule, occ);

    expect(row.id).toBe("myevent:k3f9qa2m01#2026-09-15");
    expect(row.startsAt).toBe(occ.startsAt);
    expect(row.endsAt).toBe(occ.endsAt);
    expect(row.title).toBe(rule.title);
    expect(row.game).toBe(rule.game);
    expect(row.type).toBe(rule.type);
  });

  test("is still the reader's own, and still claims no source", () => {
    const rule = repeating();
    const occ = nextOccurrences(rule, new Date("2026-09-01T12:00:00").getTime(), 1)[0]!;
    const row = asOccurrenceEvent(rule, occ);

    expect(row.sourceUrl).toBe(null);
    expect(row.sourceId).toBe("you");
    expect(row.extractionMethod).toBe("manual");
    expect(isCustomEventId(row.id)).toBe(true);
  });

  test("renaming a rule does not move its occurrence ids", () => {
    // The token is random precisely so fixing a typo never costs the marks
    // attached to an occurrence. Exercised here rather than against
    // occurrenceId, which never takes a title and so could not fail it: this
    // path passes the whole rule, so a rename is a real input to the result.
    const rule = repeating();
    const renamed = { ...rule, title: "Abyss, actually" };
    const now = new Date("2026-09-15T12:00:00").getTime();
    const before = asOccurrenceEvent(rule, nextOccurrences(rule, now, 1)[0]!);
    const after = asOccurrenceEvent(renamed, nextOccurrences(renamed, now, 1)[0]!);

    expect(after.id).toBe(before.id);
    expect(after.title).toBe("Abyss, actually");
  });

  test("a derived end is a real end, so the clock counts down to it", () => {
    // The rule stores endsAt: null; the occurrence resolves it. A row reaching
    // a view must never carry the unresolved form, or it renders as
    // live-with-unknown-end forever — the exact failure this design exists to
    // avoid.
    const rule = ownEvent({
      startsAt: new Date("2026-09-01T09:00:00").toISOString(),
      startPrecision: "exact",
      endsAt: null,
      endPrecision: "unknown",
      repeat: { unit: "weeks", interval: 1, until: null },
    });
    const occ = nextOccurrences(rule, new Date("2026-09-02T12:00:00").getTime(), 1)[0]!;
    const row = asOccurrenceEvent(rule, occ);

    expect(row.endsAt).not.toBe(null);
    expect(row.endPrecision).not.toBe("unknown");
    const clock = clockFor(row, "europe", new Date("2026-09-02T12:00:00").getTime());
    expect(clock.msRemaining).not.toBe(null);
    expect(clock.live).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/custom.test.ts`
Expected: FAIL — `asOccurrenceEvent is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/shared/custom.ts`, and add `Occurrence` to the type import from `./recurrence.ts`:

```ts
/**
 * Project one occurrence of a rule into the shape the views read.
 *
 * Everything that identifies the *thing* comes from the rule; everything that
 * identifies *which time round* comes from the occurrence. Nothing downstream
 * is told which it is looking at, which is what lets sort, focus, lanes,
 * filters, progress, ignores and the daily checklist work with no narrowing at
 * any call site.
 *
 * The end is always resolved here, never `null`. A rule with no stated end
 * stores `null` and means "until the next one opens"; a row that reached a view
 * still carrying the unresolved form would render as live-with-unknown-end
 * forever, which is the failure this whole design exists to avoid.
 */
export function asOccurrenceEvent(
  rule: CustomEvent,
  occurrence: Occurrence,
): DisplayEvent {
  return {
    ...asDisplayEvent(rule),
    id: occurrence.id,
    startsAt: occurrence.startsAt,
    startPrecision: occurrence.startPrecision,
    endsAt: occurrence.endsAt,
    endPrecision: occurrence.endPrecision,
  };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `bun test`
Expected: PASS.

Run: `bun run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/shared/custom.ts test/custom.test.ts
```

```bash
git commit -m "$(cat <<'MSG'
Project an occurrence into the shape every view reads

The rule supplies what the thing is; the occurrence supplies which time
round. Nothing downstream is told which it is looking at, which is what
lets sort, focus, lanes, filters, progress, ignores and the daily
checklist work with no narrowing at any call site.

The end is always resolved here and never null. A row still carrying the
unresolved form would render live-with-unknown-end forever, which is the
failure the whole design exists to avoid.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 6: `useCustom` expands rules

**Files:**
- Modify: `src/client/state/useCustom.ts`
- Modify: `src/client/App.tsx:111` (the `useCustom()` call)
- Test: `test/custom.test.ts` (append)

**Interfaces:**
- Consumes: `nextOccurrences`, `occurrencesOf` from Task 4; `asOccurrenceEvent` from Task 5.
- Produces:
  - `EventDraft` gains `repeat: Repeat | null`
  - `useCustom(nowMs: number)` — signature change, one caller
  - `useCustom().occurrencesIn(minMs: number, maxMs: number): DisplayEvent[]`
  - `rowsFor(events: CustomEvents, nowMs: number): DisplayEvent[]` — exported pure helper, so the expansion is testable without React

- [ ] **Step 1: Write the failing test**

Append to `test/custom.test.ts`, adding `rowsFor, occurrencesInFor` to the `useCustom.ts` import.

```ts
describe("expanding rules into rows", () => {
  const NOW = new Date("2026-09-03T12:00:00").getTime();

  const plain = ownEvent({ id: "myevent:plain00001" });
  const repeating = ownEvent({
    id: "myevent:k3f9qa2m01",
    startsAt: new Date("2026-09-01T09:00:00").toISOString(),
    startPrecision: "exact",
    endsAt: new Date("2026-09-08T09:00:00").toISOString(),
    endPrecision: "exact",
    repeat: { unit: "weeks", interval: 2, until: null },
  });
  const store = { [plain.id]: plain, [repeating.id]: repeating };

  test("a non-repeating event still yields exactly one row, unchanged", () => {
    const rows = rowsFor({ [plain.id]: plain }, NOW);
    expect(rows.map((r) => r.id)).toEqual(["myevent:plain00001"]);
  });

  test("a rule yields two rows however often it repeats", () => {
    // The lists answer "what ends soonest". Thirteen rows for one weekly rule
    // is the clutter F1 exists to avoid.
    const rows = rowsFor(store, NOW);
    expect(rows.filter((r) => r.id.startsWith("myevent:k3f9qa2m01")).map((r) => r.id)).toEqual([
      "myevent:k3f9qa2m01#2026-09-01",
      "myevent:k3f9qa2m01#2026-09-15",
    ]);
  });

  test("each occurrence is a separate key, so marks do not bleed between them", () => {
    const rows = rowsFor(store, NOW);
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("occurrencesIn covers a whole range, not just the next two", () => {
    const rows = occurrencesInFor(
      store,
      new Date("2026-09-01T00:00:00").getTime(),
      new Date("2026-11-01T00:00:00").getTime(),
    );
    expect(rows.filter((r) => r.id.startsWith("myevent:k3f9qa2m01"))).toHaveLength(5);
  });

  test("occurrencesIn ignores non-repeating events", () => {
    // They are already in `rows`; returning them here would double every one of
    // the reader's plain events on the board.
    const rows = occurrencesInFor(
      { [plain.id]: plain },
      new Date("2026-01-01T00:00:00").getTime(),
      new Date("2027-01-01T00:00:00").getTime(),
    );
    expect(rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/custom.test.ts`
Expected: FAIL — `rowsFor is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/client/state/useCustom.ts`:

Add to imports:

```ts
import { asOccurrenceEvent } from "../../shared/custom.ts";
import { nextOccurrences, occurrencesOf, type Repeat } from "../../shared/recurrence.ts";
```

Add `repeat` to `EventDraft`, after `endHasTime`:

```ts
  /** How it comes round again, or null when it does not. */
  repeat: Repeat | null;
```

Add these two exported helpers above `useCustom`:

```ts
/**
 * How many occurrences of a rule the lists carry.
 *
 * Two: the one that has not finished, and the one after it. A rule repeating
 * weekly would otherwise put thirteen rows into the lists that exist to answer
 * "what ends soonest", which is the clutter PRD F1 is built to avoid. The
 * timeline is the surface where repetition is the reading, and it asks for the
 * whole range instead — see `occurrencesInFor`.
 */
const LIST_OCCURRENCES = 2;

/**
 * The reader's events as rows, rules expanded.
 *
 * Pure and exported so the expansion is testable without mounting anything —
 * the same reason `gameOrder.ts` and `daily.ts` keep their logic outside React.
 */
export function rowsFor(events: CustomEvents, nowMs: number): DisplayEvent[] {
  const out: DisplayEvent[] = [];
  for (const event of Object.values(events)) {
    if (event.repeat === null) {
      out.push(asDisplayEvent(event));
      continue;
    }
    for (const occurrence of nextOccurrences(event, nowMs, LIST_OCCURRENCES)) {
      out.push(asOccurrenceEvent(event, occurrence));
    }
  }
  return out;
}

/**
 * Every occurrence of every rule inside a range.
 *
 * Only rules. A non-repeating event is already in `rowsFor`, and returning it
 * here as well would draw each of the reader's plain events twice on the board.
 */
export function occurrencesInFor(
  events: CustomEvents,
  minMs: number,
  maxMs: number,
): DisplayEvent[] {
  const out: DisplayEvent[] = [];
  for (const event of Object.values(events)) {
    if (event.repeat === null) continue;
    for (const occurrence of occurrencesOf(event, minMs, maxMs)) {
      out.push(asOccurrenceEvent(event, occurrence));
    }
  }
  return out;
}
```

Change the hook signature and the `rows` memo. Replace `export function useCustom() {` with:

```ts
/**
 * `nowMs` is passed in rather than read here, for the reason everything else in
 * this codebase takes its clock as an argument — and because the rows have to
 * change as time passes: the occurrence a rule is showing rolls to the next one
 * when the current one finishes.
 */
export function useCustom(nowMs: number) {
```

Replace the `rows` memo with:

```ts
  /**
   * The reader's events, in the shape every view reads, rules expanded.
   *
   * Bucketed to the minute rather than recomputed per tick: expanding every
   * rule each second would be wasted work, and no countdown is wrong by less
   * than a minute's delay in rolling to the next occurrence.
   */
  const minute = Math.floor(nowMs / 60_000);
  const rows = useMemo<DisplayEvent[]>(
    () => rowsFor(events, minute * 60_000),
    [events, minute],
  );

  /** Every occurrence of every rule inside a range — the timeline's question. */
  const occurrencesIn = useCallback(
    (minMs: number, maxMs: number) => occurrencesInFor(events, minMs, maxMs),
    [events],
  );
```

Add `occurrencesIn` to the returned object, after `lanes`.

Add `repeat` to the `CustomEvent.parse({...})` calls in both `addEvent` and `editEvent`, after `endPrecision`:

```ts
      repeat: draft.repeat,
```

In `src/client/App.tsx`, change line 111 from `const custom = useCustom();` to:

```ts
  const custom = useCustom(now);
```

- [ ] **Step 4: Run tests and typecheck**

Run: `bun test`
Expected: PASS. `custom-ui.test.tsx` may need `repeat: null` added to any `EventDraft` literal it builds — add it if the typecheck flags it.

Run: `bun run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/client/state/useCustom.ts src/client/App.tsx test/custom.test.ts
```

```bash
git commit -m "$(cat <<'MSG'
Expand a rule into rows, two at a time

The lists exist to answer "what ends soonest", so a rule contributes the
occurrence that has not finished and the one after it — no more, however
often it repeats. A weekly rule would otherwise put thirteen rows into the
list F1 is built to keep short.

occurrencesIn answers the timeline's different question and covers a whole
range. It skips non-repeating events deliberately: those are already in
rows, and returning them twice would double every plain event on the board.

useCustom takes the clock as an argument now, because the rows have to
change as time passes — the occurrence on screen rolls to the next one when
the current finishes.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 7: The timeline draws the rhythm

**Files:**
- Modify: `src/client/components/Timeline.tsx:155-175`
- Modify: `src/client/App.tsx` (the `inScope` memo, and the `<Timeline>` call around line 568)
- Test: `test/views.test.tsx` (append) — it already imports `boardWindow` on line 5

**Interfaces:**
- Consumes: `RowEvent` (already used by `Timeline`), `custom.occurrencesIn` from Task 6.
- Produces: `Timeline` gains an optional prop `expand?: (minMs: number, maxMs: number) => RowEvent[]`.

**The constraint this task exists to hold:** `boardWindow` derives the board's range *from the rows given to it* (`max: Math.max(...ends, now) + 2 * DAY`). Feeding it occurrences that were generated to fill the board window is circular — each pass widens the window, which generates more occurrences, which widens it again, and a rule with `until: null` never terminates. **`starts` and `ends` must be computed from `plotted` only, before `expand` is called.**

- [ ] **Step 1: Write the failing test**

Append to `test/views.test.tsx` (import `boardWindow` from `../src/client/components/Timeline.tsx` if it is not already imported):

```ts
describe("boardWindow is not widened by expansion", () => {
  test("a rule's occurrences cannot enlarge the board that generated them", () => {
    // The circularity guard. boardWindow takes max from the ends it is given,
    // so if expanded occurrences were fed back into it, each pass would widen
    // the window, generate more occurrences and widen it again — a rule with
    // until: null would never terminate. The fix is ordering: settle the window
    // from the base rows, THEN expand into it. This test pins the ordering by
    // asserting the window is a function of the base rows alone.
    const now = Date.parse("2026-09-03T12:00:00.000Z");
    const starts = [Date.parse("2026-09-01T00:00:00.000Z")];
    const ends = [Date.parse("2026-09-08T00:00:00.000Z")];

    const base = boardWindow(starts, ends, now);

    // A year of weekly occurrences, as `expand` would return them.
    const expandedEnds = Array.from({ length: 52 }, (_, i) =>
      Date.parse("2026-09-08T00:00:00.000Z") + i * 7 * 24 * 60 * 60 * 1000,
    );
    const ifItLeaked = boardWindow(starts, [...ends, ...expandedEnds], now);

    expect(base.max).toBeLessThan(ifItLeaked.max);
    // Which is exactly why Timeline must compute starts/ends from `plotted`
    // before calling expand — asserted structurally in the component below.
  });
});
```

- [ ] **Step 2: Run test to verify it passes already**

Run: `bun test test/views.test.tsx`
Expected: PASS. This test characterises `boardWindow`'s existing behaviour — it documents *why* the ordering in Step 3 is mandatory rather than driving new code. The behavioural test is Step 3's.

- [ ] **Step 3: Write the implementation**

In `src/client/components/Timeline.tsx`, add to the props type (after `showUpcoming`):

```ts
  /**
   * More rows to draw, once the board's range is known.
   *
   * Called with the settled window rather than returning everything up front,
   * because a repeating rule has no natural end — it fills whatever it is
   * given. **It must be called after `boardWindow`, never before:** the window
   * takes its `max` from the ends it is handed, so feeding expanded
   * occurrences back into it would widen the window, generate more
   * occurrences, and widen it again, and a rule with no `until` would never
   * terminate.
   */
  expand?: ((minMs: number, maxMs: number) => RowEvent[]) | undefined;
```

Add `expand` to the destructured parameters.

Replace lines 165-167 (the `ends`/`starts`/`boardWindow` block) with:

```ts
  // From `plotted` alone, and settled before `expand` is called. See the prop's
  // note: this is the ordering that keeps a repeating rule from growing the
  // board it is being drawn onto.
  const ends = plotted.map((r) => r.clock.endsMs ?? r.clock.startsMs + 14 * DAY);
  const starts = plotted.map((r) => r.clock.startsMs);
  const { min, max } = boardWindow(starts, ends, now);

  // Rules fill the settled window. Deduplicated because the first two
  // occurrences of every rule are already in `plotted` — they are what the
  // lists carry — and drawn on top of each other they would read as a bolder
  // bar rather than as a duplicate.
  const seen = new Set(plotted.map((r) => r.event.id));
  const extra = (expand?.(min, max) ?? []).filter(
    (r) => !seen.has(r.event.id) && (showUpcoming || !r.clock.upcoming),
  );
  // Re-sorted only when there is something to merge, so a reader with no
  // repeating events sees byte-identical behaviour. `endingSoonestFirst` is the
  // order `splitAt` relies on — live before upcoming — and appending unsorted
  // rows would break the split point it looks for.
  const drawn = extra.length === 0 ? plotted : [...plotted, ...extra].sort(endingSoonestFirst);
```

Then change the `timelineLanes(plotted, ...)` call on line ~225 to `timelineLanes(drawn, ...)`.

**Leave the `if (rows.length === 0)` guard on line ~217 exactly as it is.** It guards the *input* — "the reader has nothing at all" — and returns the empty state before any of this runs. Extras are always occurrences of rules that are themselves in `rows`, so there is no case where `rows` is empty and `extra` is not.

Add `endingSoonestFirst` to the import from `../../shared/time.ts` if it is not already there.

- [ ] **Step 4: Pass `expand` from `App.tsx`**

Expanded occurrences must obey exactly the filters the base rows obey, or the board will draw a game the reader has hidden, an occurrence they ignored, or one they have already finished. Rather than restating those four filters, extract the existing predicate so there is one copy.

In `App.tsx`, replace the body of the `inScope` memo (around line 271) with a reusable predicate, keeping every filter and every dependency exactly as it is:

```ts
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
        .filter((r) => prefs.showIgnored || !isIgnored(r.event.id))
        .filter((r) => prefs.showCompleted || !isDone(r.event.id)),
    [prefs.hiddenGames, prefs.showCompleted, prefs.showIgnored, prog.progress, ignored.marks],
  );

  const inScope = useMemo(() => inScopeOf(allRows), [allRows, inScopeOf]);
```

Then pass `expand` to `<Timeline>`:

```tsx
            expand={useCallback(
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
            )}
```

A hook cannot be called inside JSX — hoist that `useCallback` to sit beside the other memos and pass the resulting binding as `expand={expandOccurrences}`.

- [ ] **Step 5: Run tests and typecheck**

Run: `bun test`
Expected: PASS.

Run: `bun run typecheck`
Expected: exit 0.

Then check it by hand: `bun run dev`, add an event repeating weekly, and confirm the board draws a row of bars marching right while the lists show only two.

- [ ] **Step 6: Commit**

```bash
git add src/client/components/Timeline.tsx src/client/App.tsx test/views.test.tsx
```

```bash
git commit -m "$(cat <<'MSG'
Let the timeline draw a rule's whole rhythm

The lists carry two occurrences because they answer "what ends soonest";
the board exists to show rhythm, so it draws every occurrence in view.

expand is called with the settled window rather than returning rows up
front, and the ordering is the point: boardWindow takes its max from the
ends it is handed, so feeding expanded occurrences back into it would widen
the window, generate more, and widen it again — a rule with no until would
never terminate. Compute the range from the base rows, then expand into it.

Merged rows are re-sorted only when there is something to merge, so a
reader with no repeating events sees identical behaviour.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 8: The detail sheet finds the rule behind an occurrence

**Files:**
- Modify: `src/shared/custom.ts` (append)
- Modify: `src/client/App.tsx` (the `own={...}` prop, around line 670)
- Test: `test/custom.test.ts` (append)

**Interfaces:**
- Consumes: `ruleIdOf` from Task 2.
- Produces: `recordFor(events: CustomEvents, rowId: string): CustomEvent | undefined`.

**The bug this fixes:** `App.tsx` builds the detail sheet's `own` prop with `custom.events[openRow.event.id]`. For an occurrence row that id is `myevent:tok#2026-09-01`, which is not a key in the store, so `own` is `undefined` and the **edit and delete buttons silently disappear** on every recurring row. `own.onSave(event.id, draft)` would likewise reach `editEvent` with an occurrence id, where `prev[id]` is `undefined` and the edit is a no-op that reports nothing.

- [ ] **Step 1: Write the failing test**

Append to `test/custom.test.ts`, adding `recordFor` to the `custom.ts` import.

```ts
describe("recordFor", () => {
  const rule = ownEvent({
    id: "myevent:k3f9qa2m01",
    startsAt: new Date("2026-09-01T09:00:00").toISOString(),
    startPrecision: "exact",
    endsAt: new Date("2026-09-08T09:00:00").toISOString(),
    endPrecision: "exact",
    repeat: { unit: "weeks", interval: 2, until: null },
  });
  const store = { [rule.id]: rule };

  test("an occurrence row finds the rule behind it", () => {
    // Marks key off the occurrence — that is what gives each time round its own
    // completion — but the record to edit is the rule. Without this the detail
    // sheet looks up a key that does not exist and edit and delete vanish.
    expect(recordFor(store, "myevent:k3f9qa2m01#2026-09-15")?.id).toBe("myevent:k3f9qa2m01");
  });

  test("a plain event finds itself", () => {
    const plain = ownEvent({ id: "myevent:plain00001", repeat: null });
    expect(recordFor({ [plain.id]: plain }, "myevent:plain00001")?.id).toBe("myevent:plain00001");
  });

  test("a feed event belongs to nobody here", () => {
    expect(recordFor(store, "genshin:some-event:2026-09-01")).toBeUndefined();
  });

  test("an occurrence of a rule the reader has since deleted finds nothing", () => {
    expect(recordFor({}, "myevent:k3f9qa2m01#2026-09-15")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/custom.test.ts`
Expected: FAIL — `recordFor is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/shared/custom.ts`, adding `ruleIdOf` to the import from `./recurrence.ts`:

```ts
/**
 * The stored record a row belongs to, whichever kind of id it carries.
 *
 * A row may be one occurrence of a rule, whose id carries a `#` suffix and is
 * deliberately not a key in the store. Marks, ignores and ticks key off that
 * suffixed id — each time round has its own completion — but there is only ever
 * one record to edit, and it is the rule.
 *
 * Total, and safe for a feed id: `ruleIdOf` returns anything without a
 * separator unchanged, and a feed id is simply not in this store.
 */
export function recordFor(
  events: CustomEvents,
  rowId: string,
): CustomEvent | undefined {
  return events[ruleIdOf(rowId)];
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `bun test test/custom.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire it into `App.tsx`**

Read the existing `own={...}` block first and preserve every field it passes. Replace the record lookup and the two callbacks' ids:

```tsx
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
            };
          })()}
```

Import `recordFor` from `../shared/custom.ts` in `App.tsx` (it likely already imports from that module — add to the existing import rather than a second one).

- [ ] **Step 6: Run the full suite and typecheck**

Run: `bun test`
Expected: PASS.

Run: `bun run typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/shared/custom.ts src/client/App.tsx test/custom.test.ts
```

```bash
git commit -m "$(cat <<'MSG'
Resolve an occurrence back to the rule behind it

The detail sheet looked its record up by the row's id. For an occurrence
that id carries a #date suffix and is not a key in the store, so `own` came
back undefined and the edit and delete buttons vanished on every recurring
row — and a save would have reached editEvent with an id it could not find
and quietly done nothing.

The suffix is deliberate: marks key off the occurrence so each time round
carries its own completion. There is still only one record to edit.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 9: The form lets a reader state a rule

**Files:**
- Modify: `src/client/components/CustomForms.tsx`
- Test: `test/custom-ui.test.tsx` (append)

**Interfaces:**
- Consumes: `EventDraft.repeat` from Task 6, `RepeatUnit` and `comesRoundEarly` from Task 1.
- Produces: no new exports.

**Testing note — read this before writing a test.** `test/custom-ui.test.tsx` renders with `renderToStaticMarkup` from `react-dom/server` and asserts on the markup string. **There is no `@testing-library/react` in this project and no `fireEvent`.** Do not add one for this task. Anything that needs a click or a change event is therefore not reachable from here: state the logic as a pure exported function, test that directly, and let the static render cover what the reader sees on first paint. `comesRoundEarly` (Task 1) already exists for exactly this reason.

- [ ] **Step 1: Write the failing test**

Append to `test/custom-ui.test.tsx`. Reuse the file's existing `GAMES` constant and `CustomEvent.parse` style.

```tsx
describe("stating a repeat", () => {
  const repeating = (over: Record<string, unknown> = {}) =>
    CustomEvent.parse({
      id: "myevent:k3f9qa2m01",
      game: "mygame:limbus-company",
      title: "Abyss",
      type: "challenge",
      summary: null,
      startsAt: "2026-09-01T00:00:00.000Z",
      startPrecision: "day",
      endsAt: "2026-09-08T00:00:00.000Z",
      endPrecision: "day",
      repeat: { unit: "weeks", interval: 2, until: null },
      at: AT,
      updatedAt: AT,
      ...over,
    });

  test("a fresh form offers a repeat, set to never", () => {
    const html = renderToStaticMarkup(
      <EventForm lanes={["mygame:limbus-company"]} customGames={GAMES} onSave={() => {}} onCancel={() => {}} />,
    );
    expect(html).toContain("Repeats");
    // The interval field is hidden until there is something to count, so the
    // form a reader already knows is unchanged until they reach for this.
    expect(html).not.toContain("Every");
  });

  test("editing a rule shows the rule it already has", () => {
    const html = renderToStaticMarkup(
      <EventForm
        lanes={["mygame:limbus-company"]}
        customGames={GAMES}
        initial={repeating()}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(html).toContain("Every");
    expect(html).toContain('value="2"');
  });

  test("an unknown end with a rule stops claiming there is no countdown", () => {
    // "It'll show with no countdown and no daily checklist" is true of an
    // unbounded event and false once an interval bounds it. Leaving it there
    // would talk a reader out of the simplest way to record a weekly reset.
    const html = renderToStaticMarkup(
      <EventForm
        lanes={["mygame:limbus-company"]}
        customGames={GAMES}
        initial={repeating({ endsAt: null, endPrecision: "unknown" })}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(html).toContain("until the next one opens");
    expect(html).not.toContain("no countdown");
  });

  test("an unknown end with no rule keeps the original note", () => {
    const html = renderToStaticMarkup(
      <EventForm
        lanes={["mygame:limbus-company"]}
        customGames={GAMES}
        initial={repeating({ endsAt: null, endPrecision: "unknown", repeat: null })}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(html).toContain("no countdown");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/custom-ui.test.tsx`
Expected: FAIL — the markup contains no "Repeats".

- [ ] **Step 3: Write the implementation**

In `src/client/components/CustomForms.tsx`, add to the imports:

```ts
import { comesRoundEarly, RepeatUnit } from "../../shared/recurrence.ts";
```

Add state, after the `endTime` state:

```ts
  // "never" rather than a null unit, so the select has one vocabulary and the
  // default reads as an answer the reader gave rather than a field they left.
  const [repeatUnit, setRepeatUnit] = useState<RepeatUnit | "never">(
    initial?.repeat?.unit ?? "never",
  );
  const [repeatInterval, setRepeatInterval] = useState(
    String(initial?.repeat?.interval ?? 1),
  );
```

Add the derived rule and its validation, next to the existing `backwards`/`endMissing` derivations:

```ts
  const interval = Number(repeatInterval);
  const intervalValid =
    Number.isInteger(interval) && interval >= 1 && interval <= 365;
  const repeat =
    repeatUnit === "never" || !intervalValid
      ? null
      : { unit: repeatUnit, interval, until: null };

  // The same predicate the schema refines on, so the form cannot start
  // refusing saves the schema would accept or promising ones it will reject.
  const earlyReturn =
    startsAt !== null &&
    comesRoundEarly(
      Date.parse(startsAt),
      endsAt === null ? null : Date.parse(endsAt),
      repeat,
    );
```

Add `!earlyReturn && (repeatUnit === "never" || intervalValid)` to the `valid` expression, and `repeat` to the `onSave({...})` payload.

Add the control block, immediately after the end-date block and before the "Note (optional)" label:

```tsx
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className={labelClass()}>
          Repeats
          <select
            value={repeatUnit}
            onChange={(e) => setRepeatUnit(e.target.value as RepeatUnit | "never")}
            className={inputClass()}
          >
            <option value="never">never</option>
            {RepeatUnit.options.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        {repeatUnit !== "never" && (
          <label className={labelClass()}>
            Every
            <input
              type="number"
              min={1}
              max={365}
              value={repeatInterval}
              onChange={(e) => setRepeatInterval(e.target.value)}
              className={inputClass()}
            />
          </label>
        )}
      </div>

      {earlyReturn && (
        <p className="mt-2 text-xs text-critical">
          That comes round before it ends.
        </p>
      )}
```

Replace the existing `{!endKnown && (...)}` note with the pair:

```tsx
      {!endKnown && repeatUnit === "never" && (
        <p className="mt-2 text-xs leading-relaxed text-faint">
          It'll show with no countdown and no daily checklist, the same as an
          event whose source hasn't announced an end.
        </p>
      )}
      {!endKnown && repeatUnit !== "never" && (
        /* Not a degraded answer here — the interval bounds it. */
        <p className="mt-2 text-xs leading-relaxed text-faint">
          Each one runs until the next one opens, so it still counts down.
        </p>
      )}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `bun test`
Expected: PASS.

Run: `bun run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/client/components/CustomForms.tsx test/custom-ui.test.tsx
```

```bash
git commit -m "$(cat <<'MSG'
Let the form state a repeat

Defaults to never, so the form a reader already knows is unchanged until
they reach for this.

The unknown-end note had to change with it. "It'll show with no countdown
and no daily checklist" is true of an unbounded event and false once an
interval bounds it — and leaving it there would talk a reader out of the
simplest way to record a weekly reset. With a rule set it says each one
runs until the next one opens.

Refusal reuses comesRoundEarly rather than restating it, so the form cannot
drift from the schema it has to agree with.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 10: The sheet says how often, and warns before stranding marks

**Files:**
- Modify: `src/client/components/CustomForms.tsx`
- Modify: `src/client/components/EventDetail.tsx`
- Modify: `src/client/App.tsx`
- Test: `test/custom-ui.test.tsx` (append)

**Interfaces:**
- Consumes: `movesOccurrences` from Task 2, `nextOccurrences` from Task 4, `recordFor` from Task 8.
- Produces: `strandedNotice(count: number): string | null` (exported from `CustomForms.tsx`); `EventForm` gains `strandedBy?: ((draft: EventDraft) => number) | undefined`; `EventDetail`'s `own` gains `strandedBy`.

**Testing note.** The warning only appears *after* the reader changes the schedule, which needs an interaction this project's static-render harness cannot produce. So the two halves are tested separately and honestly: `movesOccurrences` (Task 2) covers **when** it fires, and `strandedNotice` covers **what it says**. Step 6 is a manual check of the two meeting.

- [ ] **Step 1: Write the failing test**

Append to `test/custom-ui.test.tsx`, importing `strandedNotice` and `cadenceLabel` from `CustomForms.tsx`:

```tsx
describe("what a reschedule costs", () => {
  test("says nothing when nothing would be stranded", () => {
    expect(strandedNotice(0)).toBe(null);
  });

  test("counts, and agrees with itself about plurals", () => {
    expect(strandedNotice(1)).toContain("1 tick");
    expect(strandedNotice(1)).not.toContain("ticks");
    expect(strandedNotice(3)).toContain("3 ticks");
  });

  test("says what happens, not what is forbidden", () => {
    // It informs; it never blocks. Their data is theirs to reorganise, and a
    // form that refused the edit would be a worse answer than one that says
    // what it costs — removeGame refuses because a cascade is unrecoverable,
    // and an orphaned mark is not.
    expect(strandedNotice(3)!.toLowerCase()).toContain("strand");
  });
});

describe("the sheet says how often", () => {
  test("a repeating event shows its cadence", () => {
    const rule = CustomEvent.parse({
      id: "myevent:k3f9qa2m01",
      game: "mygame:limbus-company",
      title: "Abyss",
      type: "challenge",
      summary: null,
      startsAt: "2026-09-01T00:00:00.000Z",
      startPrecision: "day",
      endsAt: "2026-09-08T00:00:00.000Z",
      endPrecision: "day",
      repeat: { unit: "weeks", interval: 2, until: null },
      at: AT,
      updatedAt: AT,
    });
    expect(cadenceLabel(rule.repeat)).toBe("every 2 weeks");
  });

  test("an interval of one drops the number and the plural", () => {
    expect(cadenceLabel({ unit: "weeks", interval: 1, until: null })).toBe("every week");
    expect(cadenceLabel({ unit: "months", interval: 1, until: null })).toBe("every month");
  });

  test("a non-repeating event has no cadence to show", () => {
    expect(cadenceLabel(null)).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/custom-ui.test.tsx`
Expected: FAIL — `strandedNotice is not a function`.

- [ ] **Step 3: Write the two label helpers**

In `src/client/components/CustomForms.tsx`, export both. `cadenceLabel` lives here rather than in `EventDetail.tsx` so the form and the sheet cannot describe the same rule two different ways:

```ts
/**
 * What a schedule change costs, or null when it costs nothing.
 *
 * Occurrence ids carry their own start day, so moving the anchor or the
 * interval re-keys every occurrence and the marks stored under the old ids stop
 * being reachable. Nothing is rewritten — `removeEvent` makes the same trade,
 * and `useMarkSet.merge` never removes because nothing else holds a copy — but
 * the reader is told the count first, the way `removeGame` reports `blockedBy`
 * instead of cascading.
 *
 * Informs; never blocks.
 */
export function strandedNotice(count: number): string | null {
  if (count <= 0) return null;
  return `Changing the schedule will strand ${count} tick${
    count === 1 ? "" : "s"
  } you've already recorded.`;
}

/** How often a rule comes round, in the words the form offered. */
export function cadenceLabel(repeat: Repeat | null): string | null {
  if (repeat === null) return null;
  if (repeat.interval === 1) return `every ${repeat.unit.replace(/s$/, "")}`;
  return `every ${repeat.interval} ${repeat.unit}`;
}
```

Add `import type { Repeat } from "../../shared/recurrence.ts";`

- [ ] **Step 4: Wire the warning into `EventForm`**

Add the prop:

```ts
  /**
   * How many stored marks this draft's schedule would leave behind.
   *
   * Supplied by the caller because only it can see the mark stores. Absent —
   * on the add form, where there is nothing to strand — the notice never
   * renders.
   */
  strandedBy?: ((draft: EventDraft) => number) | undefined;
```

Derive it beside the other validations, and render it directly above the submit row:

```ts
  const draft: EventDraft | null =
    startsAt === null
      ? null
      : {
          game, title, type,
          summary: summary === "" ? null : summary,
          startsAt, startHasTime: startTime !== "",
          endsAt, endHasTime: endTime !== "",
          repeat,
        };
  // Only a schedule change re-keys anything. Renaming does not — the token is
  // random precisely so fixing a typo never costs the marks attached to it.
  const stranded =
    initial !== undefined && draft !== null && strandedBy !== undefined &&
    movesOccurrences(initial, draft)
      ? strandedBy(draft)
      : 0;
  const notice = strandedNotice(stranded);
```

```tsx
      {notice !== null && (
        <p className="mt-2 text-xs leading-relaxed text-muted">{notice}</p>
      )}
```

Add `movesOccurrences` to the `recurrence.ts` import. Use `draft` in the submit handler rather than rebuilding the object.

- [ ] **Step 5: Wire the sheet and the count**

In `EventDetail.tsx`, add `strandedBy` to the `own` prop type, pass it through to `EventForm`, and render the cadence beside the existing window caption:

```tsx
        {cadenceLabel(own?.record.repeat ?? null) !== null && (
          <p className="text-xs text-faint">{cadenceLabel(own!.record.repeat)}</p>
        )}
```

In `App.tsx`, add `strandedBy` to the `own` object built in Task 8:

```ts
              strandedBy: () => {
                // What the reader has actually recorded against the occurrences
                // this rule generates today, and would no longer reach once the
                // ids move. Twelve is a season of a fortnightly rule — enough to
                // make the number meaningful without walking a decade of a
                // daily one.
                if (record.repeat === null) return 0;
                return nextOccurrences(record, now, 12).filter(
                  (o) =>
                    prog.progress[o.id] !== undefined ||
                    (daily.logs[o.id]?.days.length ?? 0) > 0,
                ).length;
              },
```

Import `nextOccurrences` from `../shared/recurrence.ts`. `daily.logs[id]` is `{ days: string[]; at: string } | undefined` — see `useDailyLog.ts:42`.

- [ ] **Step 6: Run tests, typecheck, then check it by hand**

Run: `bun test`
Expected: PASS.

Run: `bun run typecheck`
Expected: exit 0.

Then, because no automated test in this project can produce the interaction: run `bun run dev`, add an event repeating every 2 weeks, tick a day on its checklist, reopen it, change the interval to 3, and confirm the notice appears and names 1 tick. Change only the title instead and confirm no notice appears.

- [ ] **Step 7: Commit**

```bash
git add src/client/components/CustomForms.tsx src/client/components/EventDetail.tsx src/client/App.tsx test/custom-ui.test.tsx
```

```bash
git commit -m "$(cat <<'MSG'
Say how often, and say what a reschedule costs

Occurrence ids carry their own start day, so moving the anchor or the
interval re-keys every occurrence and the marks under the old ids stop
being reachable. Nothing is rewritten — removeEvent makes the same trade,
and useMarkSet never removes because nothing else holds a copy — but the
reader is told the count first, the way removeGame reports blockedBy
instead of cascading.

Informs, never blocks. Renaming still costs nothing: the token is random
precisely so fixing a typo never moves an id, and movesOccurrences is what
keeps the warning off a rename and off a bare change of `until`.

cadenceLabel sits beside the form's own vocabulary so the sheet cannot
describe a rule differently from the control that set it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 11: The docs catch up

**Files:**
- Modify: `docs/DATA-MODEL.md`
- Modify: `docs/PRD.md` (F13)
- Modify: `docs/SOURCES.md` (the arustats note, around line 740)

**Interfaces:** none.

**Why this is a task and not a footnote:** `AGENTS.md` § Read the docs before changing the thing they describe — "The docs are part of the change. A change that makes a sentence in `docs/` false is not finished." Three sentences are now false.

- [ ] **Step 1: Find every sentence this feature falsified**

Run: `grep -n "endsAt: null\|repeating\|myevent\|localStorage key" docs/DATA-MODEL.md docs/PRD.md`
Read each hit and note which are now incomplete or wrong.

- [ ] **Step 2: Update `docs/DATA-MODEL.md`**

In the section covering custom event ids, add:

```markdown
### Occurrence ids

A reader's event may carry a repeat rule. The rule is what is stored; its
occurrences are derived on read and never written.

    myevent:<token>              the rule, as stored
    myevent:<token>#YYYY-MM-DD   one occurrence, derived

The suffix is the occurrence's own start day, read in the reader's local
timezone — the same reading `readerInstant` wrote it with and `fields()` shows
back. `#` is outside `[a-z0-9]` and therefore outside `CustomEventId`, so an
occurrence id cannot be written into `customEvents` and cannot survive an
import; `validRecords` drops it. That is the guardrail, and
`test/recurrence.test.ts` pins it in both directions.

Marks, ignores, progress and daily ticks key off the whole string, so each
occurrence carries its own completion and its own streak.

**Rescheduling a rule strands its marks.** Moving the anchor start or the
interval re-keys every occurrence; the marks under the old ids stay in
localStorage and stop being reachable. This is not migrated, for the reason
`removeEvent` does not cascade and `useMarkSet.merge` never removes — nothing
else holds a copy, so a silent rewrite is unrecoverable. The edit form counts
what will be stranded and says so first. Renaming a rule costs nothing: the
token is random.
```

- [ ] **Step 3: Update `docs/PRD.md` F13**

Append to F13:

```markdown
A reader's event may also state how it comes round again — every N days, weeks
or months, optionally stopping on a date. The rule is stored; its occurrences
are derived, and each one is an ordinary event everywhere in the app: its own
countdown, its own completion, its own daily checklist.

**An occurrence need not state its end.** With none, it runs until the next one
opens. That is not the app inventing a date to fill a form — it is entailed by
the interval the reader typed, and it is what separates a rule from the
unbounded rotation § Quality bar refuses to publish. It also means a plain
"resets every Monday" needs no end date at all.

The lists carry two occurrences of any rule — the one that has not finished and
the one after it — because they answer "what ends soonest". The timeline draws
every occurrence in view, because it answers "what is the rhythm".
```

- [ ] **Step 4: Update the arustats note in `docs/SOURCES.md`**

After the existing `scheduleBosses` paragraph (around line 740), add:

```markdown
**As of 2026-08-27 the blocker above is addressable.** `src/shared/recurrence.ts`
gives an event a repeat rule, and a rule supplies the boundary the rotation was
missing: an occurrence with no stated end runs until the next one opens, so
`endsAt: null` no longer means live-with-unknown-end forever. Reading
`scheduleBosses` is now a parser change rather than a design question, and it is
Phase B's first target in
`docs/superpowers/specs/2026-08-27-recurring-events-design.md`. Nothing has been
changed on the ingest side yet — `GachaEvent` does not carry a rule, and this
note is what stops the next person re-deriving the reason it does not.
```

- [ ] **Step 5: Run the full suite, then commit**

Run: `bun test`
Expected: PASS.

```bash
git add docs/DATA-MODEL.md docs/PRD.md docs/SOURCES.md
```

```bash
git commit -m "$(cat <<'MSG'
Record what recurrence changed, and what it unblocked

Three sentences were false once a rule could bound an occurrence. DATA-MODEL
gains the derived occurrence key and what a reschedule costs; F13 gains the
rule and the reason an occurrence need not state its end.

SOURCES' arustats note stays, with the answer beside it: the reason
scheduleBosses is unread was a design gap, that gap is closed, and reading
it is now a parser change. Nothing on the ingest side has moved — this note
is what stops the next person re-deriving why.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```
