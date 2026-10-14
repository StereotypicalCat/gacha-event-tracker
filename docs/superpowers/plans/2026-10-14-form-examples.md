# Examples to start from, and a pass over the add forms — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give *Add an event* and *Add a task* a row of examples that shape the form, and make both
forms read as a reader thinks.

**Architecture:** Examples are pure data in `src/shared/templates.ts`. Each form applies one through a
pure function on its state, so the suite (static render, no clicks) can prove what a tap does. The
event form's derived state moves into one exported pure function, `eventFormState`, so validity, the
draft and the "still needed" line all come from one place. Shared field/pill classes, the example row
and the "still needed" sentence live in `src/client/components/formParts.tsx`.

**Tech Stack:** Bun, React 19 (static render in tests via `react-dom/server`), Tailwind, zod.

**Spec:** `docs/superpowers/specs/2026-10-14-form-examples-design.md`

## Global Constraints

- An example sets a shape, never a fact: never a title (placeholder only), date, time, target or game. Only exception: *Monthly shop buy-out* sets `required: "1"`.
- Nothing is saved until the reader saves; Save stays disabled until every date and figure the shape needs is typed.
- No date is guessed — no "today", no "the 1st".
- "I don't know when it ends" stays first-class; preset windows, measured cycles, delays, `comesRoundEarly`, the stranded notice and `until` survival behave exactly as before.
- No schema, store, id or export change.
- The examples row renders only on add (no `initial`), never on edit.
- Copy: How often → *Once · Every day · Every week · Every month · On its own cycle*; Repeat → *Doesn't repeat · Comes back as it ends · Comes back after a wait*; Kind → *Banner · Story · Rerun · Challenge / endgame · Login rewards · Shop · Maintenance · Other*; the name field is *Name* in both forms.
- Commits wait for the owner's go-ahead (AGENTS.md); work stays uncommitted until asked.

## Review Focus

1. A reader types a title and dates, then taps an example — the title and dates must survive (Task 1/2/3 tests on `withEventTemplate` / `withTaskTemplate`).
2. Switching from *Recurring endgame cycle* to *Banner with a known end* must leave no repeat on the draft (Task 3 test).
3. *A few days each week* leaves the day count empty: Save disabled and the line says "how many days" (Task 2 test).
4. Choosing *On its own cycle* from *Doesn't repeat* must land on *Comes back as it ends*; a stored custom-never record must still reopen as never (Task 3 test).
5. At 360px the example row and the pills wrap without horizontal scroll (Task 4 browser check).

---

### Task 1: The examples, as data

**Files:**
- Create: `src/shared/templates.ts`
- Test: `test/templates.test.ts`

**Interfaces:**
- Produces: `EventTemplate`, `TaskTemplate`, `EVENT_TEMPLATES`, `TASK_TEMPLATES` (shapes in the spec).

- [ ] **Step 1: Write the failing test** — ids unique per list; `sets` keys limited to the shape keys;
  no `sets` carries a title/date/target; only `monthly-shop` sets `required`, to `"1"` (and
  `few-days` to `""`); placeholders non-empty and none equals a real event name in the list (smoke).
- [ ] **Step 2:** `bun test test/templates.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** `src/shared/templates.ts` with the two tables from the spec verbatim.
- [ ] **Step 4:** `bun test test/templates.test.ts` → PASS.

### Task 2: Task form — shared parts, examples, still-needed

**Files:**
- Create: `src/client/components/formParts.tsx` — `field`, `pill(on)`, `labelClass`, `stillNeededLine(needs: string[]): string | null`, `ExampleRow`.
- Modify: `src/client/components/TaskForm.tsx`
- Test: `test/custom-ui.test.tsx`, `test/templates.test.ts`

**Interfaces:**
- Consumes: `TASK_TEMPLATES`, `TaskTemplate`.
- Produces:
  - `stillNeededLine(["a name","a start date"]) === "Still needed: a name and a start date."`; three → `"a, b and c"`; `[]` → `null`.
  - `ExampleRow<T extends {id:string;label:string;hint:string}>({ examples: readonly T[]; chosen: string | null; onChoose: (t: T) => void })` — renders "Start from an example", one pill per example with `aria-pressed`, and the chosen one's hint.
  - `withTaskTemplate(f: TaskFields, t: TaskTemplate): TaskFields` — `{...f, unit, kind, required?, amountUnit?}` only.
  - `taskStillNeeded(f: TaskFields): string[]` — in order "a name", "a day of the month", "how many days", "the target".

- [ ] **Step 1: Failing tests:**
  - `stillNeededLine` cases above.
  - `withTaskTemplate` keeps `game`, `title`, `target`, `weekday`, `monthDay`; sets `unit`/`kind`; *A few days each week* empties `required`.
  - `taskStillNeeded`: blank title → "a name"; `kind:"days", required:""` → "how many days"; `unit:"week", required:"9"` → "how many days"; amount with `target:""` → "the target"; complete → `[]`.
  - Every task template, applied to `{title:"x", target:"100", required kept or "2"}` fields, gives `taskStillNeeded === []` and a non-null `taskDraftFrom`.
  - Render: add form contains "Start from an example" and each label; edit form (`initial`) does not; label "Name" present.
- [ ] **Step 2:** `bun test test/custom-ui.test.tsx test/templates.test.ts` → FAIL.
- [ ] **Step 3: Implement** — formParts.tsx; TaskForm imports `field`/`pill`, labels "Name", inputs `px-3 py-2`, `chosen` state, `ExampleRow` only when `initial === undefined`, title placeholder from the chosen template, Save `disabled={draft === null || needs.length > 0}`, the still-needed line beside the buttons in `text-faint`.
- [ ] **Step 4:** same command → PASS; `bun run typecheck` clean.

### Task 3: Event form — order, words, pills, messages, examples

**Files:**
- Modify: `src/client/components/CustomForms.tsx`
- Test: `test/custom-ui.test.tsx`, `test/templates.test.ts`

**Interfaces:**
- Consumes: `EVENT_TEMPLATES`, `ExampleRow`, `pill`, `stillNeededLine`.
- Produces:
  - `EventShape = { type: EventType; cadence: Cadence; repeatMode: RepeatMode; endKnown: boolean; ownCadence: boolean }`, held as one `useState`.
  - `withEventTemplate(shape: EventShape, t: EventTemplate): EventShape` → `{...shape, ...t.sets, ownCadence: false}`.
  - `withCadence(shape: EventShape, cadence: Cadence): EventShape` — choosing `custom` while `repeatMode === "never"` moves to `"forever"`.
  - `eventStillNeeded(s: { title; startDate; datedWindow; endKnown; endDate; delayNeedsEnd; needsCycle }): string[]` — "a name", "a start date", "an end date", "a cycle length".
  - `eventFormState(values: EventFormValues, existingUntil: string | null)` — returns `{ startsAt, endsAt, endMs, preset, datedWindow, measured, measuring, delayNeedsEnd, repeat, backwards, endMissing, earlyReturn, needs, valid, draft }`, the block that is inline today, moved verbatim, plus `needs`. `valid = needs.length === 0 && !backwards && !endMissing && !earlyReturn && !repeatIncomplete`.

- [ ] **Step 1: Failing tests:**
  - `withEventTemplate` keeps nothing it shouldn't touch (shape only) and clears `ownCadence`.
  - `withCadence(never-shape, "custom").repeatMode === "forever"`; a stored custom-never event reopens with *Doesn't repeat* pressed.
  - Endgame → Banner: `eventFormState` with the banner shape and dates has `repeat === null`.
  - Each event template, with title "x", start `2026-10-01`, end `2026-10-15`, is `valid` with a draft; a fresh banner with no dates lists "a name", "a start date", "an end date".
  - Copy: update existing assertions (`Cadence` → `How often`; answers list; `value="daily" selected=""` → `/aria-pressed="true"[^>]*>Every day</`; `with a delay` → `Comes back after a wait`).
  - Add form shows the example row; edit form does not.
- [ ] **Step 2:** `bun test test/custom-ui.test.tsx test/templates.test.ts` → FAIL.
- [ ] **Step 3: Implement** in the spec's order with messages beside their fields.
- [ ] **Step 4:** same → PASS; full `bun test` and `bun run typecheck` green.

### Task 4: Browser check and docs

- [ ] Build (`bun run build:css && bun run build:js && bun run build:static`), serve on a fresh port, puppeteer (scratchpad) at 360px and 1280px: open Settings → Your own → Add an event, tap each example, check no horizontal scroll, fill the banner and save, see the row; same for Add a task.
- [ ] PRD F13 and F17: a sentence each on examples and their bar. DESIGN.md chips: the example row. TODO.md: tick the item.
- [ ] Final `bun test`, `bun run typecheck`.
- [ ] Final whole-change review (fresh reviewer); then report. Changelog entry follows the feature commit when the owner asks to commit.
