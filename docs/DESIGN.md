---
name: Event Clock
description: Live and upcoming gacha events, sorted by what expires next.
colors:
  ground: "#12141c"
  surface: "#1b1e2a"
  raised: "#232739"
  hairline: "#2c3145"
  ink: "#e9ebf3"
  ink-strong: "#ffffff"
  muted: "#888fa6"
  faint: "#5a6178"
  scrim: "rgb(18 20 28 / 0.8)"
  glow: "#1a1e2c"
  calm: "#55607f"
  near: "#5b8def"
  soon: "#e8b33c"
  critical: "#ff4d6a"
  ground-light: "#edf0f7"
  surface-light: "#ffffff"
  raised-light: "#dfe4f0"
  hairline-light: "#c9d1e2"
  ink-light: "#151824"
  ink-strong-light: "#000000"
  muted-light: "#535b73"
  faint-light: "#767e94"
  scrim-light: "rgb(26 31 48 / 0.42)"
  glow-light: "#ffffff"
  calm-light: "#8a92a8"
  near-light: "#2b62c6"
  soon-light: "#8a6008"
  critical-light: "#c81e3c"
typography:
  numeral:
    fontFamily: "Chakra Petch, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.75rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.025em"
    fontFeature: "\"tnum\" 1"
  display:
    fontFamily: "Chakra Petch, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  wordmark:
    fontFamily: "Chakra Petch, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 700
    letterSpacing: "0.02em"
  reading:
    fontFamily: "Chakra Petch, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    fontFeature: "\"tnum\" 1"
  title:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 500
    lineHeight: 1.375
  body:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.625
  summary:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.375
  control:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
  label:
    fontFamily: "Chakra Petch, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    letterSpacing: "0.14em"
  tag:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 500
rounded:
  tick: "1px"
  tag: "3px"
  bar: "5px"
  tab: "6px"
  control: "8px"
  card: "12px"
  sheet: "16px"
  pill: "9999px"
spacing:
  hair: "2px"
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  gutter: "16px"
  section: "20px"
components:
  button-commit:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-commit-hover:
    backgroundColor: "{colors.ink-strong}"
  button-quiet:
    textColor: "{colors.muted}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
  button-quiet-hover:
    textColor: "{colors.ink}"
  tab:
    textColor: "{colors.faint}"
    typography: "{typography.control}"
    rounded: "{rounded.tab}"
    padding: "6px 10px"
  tab-selected:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
  input:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  hue-chip:
    textColor: "{colors.muted}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  tag:
    backgroundColor: "{colors.hairline}"
    textColor: "{colors.muted}"
    typography: "{typography.tag}"
    rounded: "{rounded.tag}"
    padding: "1px 6px"
  event-row:
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    padding: "14px 16px"
  row-check:
    textColor: "{colors.faint}"
    rounded: "{rounded.tab}"
    size: "28px"
  timeline-bar:
    textColor: "{colors.ink}"
    rounded: "{rounded.bar}"
    height: "36px"
    padding: "0 12px"
  now-chip:
    backgroundColor: "{colors.critical}"
    textColor: "{colors.ground}"
    rounded: "{rounded.tag}"
    padding: "1px 4px"
  sheet:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.sheet}"
    padding: "20px"
  toast:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "12px 16px"
---

# Design System: Event Clock

## Overview

**Creative North Star: "The Lit Instrument Panel"**

Event Clock is a cockpit at night. The ground is a deep blue-black, never a neutral void, lit faintly from
above so the page reads as a panel with a light source. Against that calm, only two things are
allowed to glow: **whose game this is** (the game's hue) and **how long is left** (the heat ramp).
Everything else (chrome, borders, labels, controls) stays muted until a hand reaches for it. The
reader should be able to tell at a glance which events need them, because those are the only things
that are lit.

The character is **calm, precise and honest**. Calm, because the surfaces are quiet, the type is
small and exact, and motion is quick and then still. Precise, because every number uses tabular
figures, every countdown resolves on the game's own clock, and labels read like instrument
legends. Honest, because uncertainty has its own look and is never drawn as a full reading. An
unannounced end is a hatched meter or a frayed bar, a bar that started before the view shows a
faded edge, and an event that has not started has a dashed edge. "We don't know" never looks like
"plenty of time".

Density sits at checklist level, not dashboard level. Rows are full-bleed with a 16px gutter and
hairline rules between them, with no cards around each event. The one place the panel raises its
voice is the headline deadline. There the event title is set in display type, the countdown in a
44px numeral, and an urgency-coloured wash warms the whole section as the deadline closes in.

**Key Characteristics:**
- Deep blue-black ground (dark is the default theme), with a light theme that swaps in different
  values rather than inverting the dark ones.
- Two colour axes that never cross: game hue for identity, the heat ramp for urgency.
- Two typefaces: Chakra Petch for anything that is a reading (numbers, labels, the wordmark),
  Public Sans for anything that is language.
- Flat, tonal surfaces. The only light comes from meaning.
- The segmented depletion meter as the signature element.
- Quiet controls that answer within 110–160ms of being touched.

## Colors

A cool, near-monochrome slate panel whose only saturated colours are game hues (who) and the heat
ramp (how urgent).

### Primary: the heat ramp
The ramp gets more salient at every step (dim → blue → amber → red), and the steps are cut on
absolute time remaining, not on how far through its run an event is. A 90-day event with three hours
left is exactly as urgent as a 3-day event with three hours left.

- **calm**: 7 days or more left. Deliberately dim, almost the colour of a resting control.
- **near**: under 7 days. Also the system's one functional accent: focus rings and the "CLOCK" half
  of the wordmark.
- **soon**: under 3 days.
- **critical**: under 24 hours. Also the "now" rule and chip on the timeline, and the "running
  out of time" tag.

Heat colours also tint state tags: a 15–18% wash of the step with text in the same step (`soon`
for "tight" and for dailies still to do, `critical` for "running out of time", `near` for "done
today"). The step is chosen by meaning, never by decoration.

### Secondary: game hues (data, not tokens)
Each game has one hue, stored in `src/shared/games.ts`. A reader's own games carry a hue the reader
picked. Hues are **identity**: Wuthering Waves is the green one in every view and in both themes.
Because they are data, no stylesheet can re-strike them per theme. Instead, `readableHue`
(`src/client/state/theme.ts`) adjusts each one on its way to the screen. On light it darkens a hue
along the same hue until it clears 4.5:1. On dark it leaves a hue untouched if it already clears
4.5:1 and lifts the lightness of those that don't (Fate/Grand Order's navy is one). Hues appear as:
a 3px row rail, a chip's border, text and 14% wash, a timeline bar's 22% wash (11% for events that
haven't started) and its 3px left edge, the game name under the headline, and a dot in the "Then"
list.

### Neutral
- **ground**: the page itself; in dark, a deep blue-black. Also the fill of text inputs.
- **glow**: the top of the body's radial gradient (120% × 70% at 50% −10%). It is the light source
  that turns the ground into a lit panel.
- **surface**: sheets, dialogs and the base that timeline bars are tinted from.
- **raised**: the selected tab, toasts, and the hover and press tint of a row (mixed at 62% / 82%).
- **hairline**: every border and rule, spent meter ticks, and plain tags.
- **ink**: primary text, and the fill of the one solid commit button.
- **ink-strong**: the far end of ink. The commit button and the headline title move to it on hover.
  It is a token and not `white`, because on light "brighter" means darker.
- **muted**: secondary text, summaries, unpressed chips, quiet buttons.
- **faint**: eyebrows, metadata, unselected tabs, idle checkboxes.
- **scrim**: the veil behind a modal, which carries its own alpha because the two themes need very
  different amounts.

### The light theme
Light is a set of new token values under `:root[data-theme="light"]`. Every `-light` key in the
frontmatter replaces its dark counterpart. The ground is daylight paper with the same cool blue cast
as the dark ground, not white. Cards go *up* to white, and `raised` becomes a shade rather than a
lift, because on paper you mark a surface as interactive by tinting it. Every step of the heat ramp
is darkened to clear 4.5:1 as small text on the light ground (dark `soon` is 1.9:1 there).

### Named Rules
**The Two Axes Rule.** Hue answers *whose event*; heat answers *how long*. Never colour an urgency
element with a game hue, or a game element with a heat colour. Keeping them apart is what lets one
glance answer both questions.

**The Two Answers Rule.** Every UI colour is a token with a dark value and a light value. A
component names `ink`, `hairline` or `soon` and never a literal. `bg-white`, a hex value or a
hard-coded scrim looks right in one theme and wrong in the other, and nothing will warn you which.

**The Moves-Only-Where-It-Failed Rule.** The dark theme changes only where a colour failed
contrast. A hue that already reads is left exactly as it shipped.

## Typography

**Display Font:** Chakra Petch (500/600/700), with a fallback of ui-sans-serif and system-ui
**Body Font:** Public Sans (400/500/600, and 400 italic), with the same fallback
Both are loaded from Google Fonts with `display=swap`.

**Character:** Chakra Petch is the instrument face. Its squared-off, slightly technical forms are
HUD lettering of the kind these games use, and it is reserved for things the reader *reads off*:
countdowns, counts, eyebrow legends and the wordmark. Public Sans is the plain civic sans used for
everything read as language, such as event titles, summaries, settings and prose.

### Hierarchy
- **Numeral** (Chakra Petch 700, 2.75rem, line-height 1, tight tracking, tabular): the headline
  countdown, and nothing else. It is the largest thing on the page.
- **Display** (Chakra Petch 600, 1.75rem, 1.15, tight tracking): the title of the event that
  expires next.
- **Wordmark** (Chakra Petch 700, 0.9375rem → 1.125rem past `lg`, +0.02em): `EVENT` in ink and
  `CLOCK` in `near`.
- **Reading** (Chakra Petch 600, 0.875rem, tabular): the countdown on each row, and the "Then"
  list at 0.75rem.
- **Title** (Public Sans 500, 0.9375rem, 1.375): row titles, wrapping to at most two lines.
- **Body** (Public Sans 400, 0.875rem, 1.625): prose, empty states and notices, held to
  `max-w-sm` or `max-w-md`.
- **Summary** (Public Sans 400, 0.8125rem, 1.375, muted): an event's one-line description, clamped
  to two lines.
- **Control** (Public Sans 500, 0.75rem): tabs, chips, quiet buttons.
- **Label / Eyebrow** (Chakra Petch 600, 0.6875rem, 0.14em tracking, uppercase, faint): the utility
  voice for section legends ("Next to expire", "Focus", "Then") and the game name over each row.
- **Tag** (Public Sans 500, 0.625rem; 0.5625rem for the smallest): type, status and provenance
  badges.

### Named Rules
**The Two Voices Rule.** If a reader reads it *off* the panel (a number, a legend, a count), it is
Chakra Petch. If they read it as language, it is Public Sans. Never set a paragraph in Chakra Petch.

**The Tabular Rule.** Anything that ticks or lines up in a column uses tabular figures (`.tnum`).
A countdown that reflows every second is a broken instrument.

## Layout

The page is a single centred shell with hairline side borders from `sm` up. It is `max-w-2xl` on a
phone and small screens, then widens to `5xl` / `6xl` / `7xl` at `lg` / `xl` / `2xl`. The page gutter
is 16px (`px-4`) everywhere, and sections are separated by hairline rules rather than gaps or cards.

**Below `lg`** the page is one column in the order of instruction first: the focus bar, the headline
deadline, today's dailies, then the lists.

**Past `lg`** it splits into a pinned rail (20rem; 22rem past `xl`) and a scrolling main column.
What the page *tells* the reader to do (the next deadlines, tonight's dailies, and the focus bar on
top) pins to the rail and scrolls independently. What it *shows* them (the lists) scrolls beside it.
The rail's border belongs to the rail's own panel, not a full-height divider.

The **timeline** is a board, not a stretch of page. It is its own pane, scrolls in both directions,
pins the date axis to the top and pins every name (lane and event) to the left. Bars are 36px tall,
and day width steps through a zoom ladder up to 108px a day.

Spacing follows Tailwind's 4px grid, with small steps doing most of the work. Gaps are mostly 6, 8
and 12px. Rows use 14px of vertical padding. Section rhythm comes from 8–20px top margins (`mt-2` to
`mt-5`).

### Named Rules
**The Tells-Left, Shows-Right Rule.** Instructions pin, information scrolls. On a wide screen the
headline deadline must never be pushed below the fold by a full-width control row.

**The Rule-Not-Card Rule.** Lists are full-bleed rows divided by hairlines. Use a bordered, rounded
container only for something that is genuinely a separate object (a form, a daily checklist, a
sheet, a toast), never as a wrapper around each event.

## Elevation & Depth

The system is flat. Depth comes from tonal steps (ground → surface → raised) and hairlines, never
from lifting things off the page. Light, where there is any, is **emitted by meaning**:

- **The body glow:** the radial gradient that lights the panel from above.
- **Heat wash:** a blurred radial gradient of the urgency colour at 16% opacity, behind the
  headline. The section warms up as the deadline approaches.
- **Live meter ticks:** a 6px glow in the tick's own urgency colour
  (`box-shadow: 0 0 6px -1px var(--tick)`), which brightens under the cursor.
- **Row rail on hover:** a 10px glow in the game's hue.
- **Chip ring on hover:** a 1px ring of the game's hue at 45%.

### Shadow Vocabulary
- **Floating notice** (Tailwind `shadow-lg`): toasts and the update notice only. These are the
  only objects that float above the page, because they are the only ones that are temporary.

### Named Rules
**The Emitted-Light Rule.** Nothing glows unless the glow carries information about urgency or
identity. A decorative glow, gradient or drop shadow on a static surface breaks the panel.

## Shapes

Corners are small and precise, and they get rounder as an object gets bigger and more separate from
the page:

- 1px on meter ticks.
- 3px on tags and the "now" chip.
- 5px on timeline bars.
- 6px on tabs and row checkboxes.
- 8px on buttons and inputs.
- 12px on cards, forms, toasts and first-run options.
- 16px on sheets (top corners only on a phone, where the sheet rises from the bottom edge).
- Fully round on game chips and status dots.

Borders are always 1px hairline, except for meaningful edges. A row rail is 3px, rounded and in the
game's hue. A timeline bar has a 3px left edge, solid when the event has started and dashed when it
hasn't. The "not started" boundary and clump rules are 1px dashed in faint ink.

Masks carry uncertainty. A bar whose end is unannounced fades out from 60% of its width. A bar that
started before the board's window fades in over its first 14%.

## Components

### Buttons
*Quiet until touched.* Buttons are hairline-bordered at rest and answer fast when touched.
- **Shape:** gently rounded (8px); first-run's primary button uses 12px.
- **Commit:** the only solid button on a screen. Solid ink with ground text, 10px × 16px, and it
  moves to ink-strong on hover. "Mark done" and first-run's "Continue" are commit buttons. Its
  disabled state is `raised` with faint text, or 40% opacity inside forms.
- **Quiet:** transparent with a hairline border and muted text, 6px × 12px at control size.
  Text goes to ink on hover, or to critical when the action destroys something (delete).
- **Focus:** a 2px `near` outline at 2px offset, on every interactive element without exception.
  `summary` gets the same rule explicitly, because the shared selector doesn't reach it.

### Tabs (the view switch)
A segmented pair (Checklist / Timeline) inside a hairline-bordered 8px tray with 2px padding. The
selected tab fills with `raised` and turns ink; unselected tabs are faint and go muted on hover.

### Chips (game focus and dailies)
- **Style:** a pill. Its border, text and a 14% wash are mixed from the game's hue when pressed.
  When not pressed it is muted text on a transparent background. Each chip carries a small tabular
  count at 70% opacity.
- **State:** `aria-pressed` carries the state. On hover a chip lifts 1px and gains a 1px hue ring,
  and an unpressed chip's label goes to ink. On press it scales to 0.96. A chip with nothing waiting
  sits at 50% opacity: still reachable, but not competing for attention.

### Event row (signature)
The unit of the checklist. It is one full-bleed target that opens the event and does nothing else.
- From left to right: a 3px **rail** in the game's hue (55% opacity, 82% height, which grows to
  full height with a glow on hover); then an eyebrow with the game name and tags; then the title,
  with its **reading** (the countdown in the urgency colour) on the right; then a one-line summary;
  then the depletion meter.
- **Hover:** the background tints to `raised` at 62% and the summary goes to ink. The meter's live
  ticks brighten, and the open chevron leans 2px toward where the row is about to take you. Pressing
  deepens the tint to 82% within 40ms.
- **Completed:** 40% opacity and a struck-through title. It stays visible but steps back.
- **Unknown end:** the reading drops to faint and the meter is hatched.
- All hover styles sit behind `@media (hover: hover)`, so a tap never leaves a row stuck in its
  hover state.

### Depletion meter (signature)
A strip of discrete ticks 10px tall with 2px gaps, lifted from the in-game stamina meters these
games all use. Ticks drain from the right, so what is left sits at the left edge and stacked rows
line up into a readable ramp. Remaining ticks carry the urgency colour and its glow; spent ticks
recede to hairline. **An unannounced end is hatched, never full.** Ticks fill in with a staggered
scale-in animation (320ms, at most a 14ms delay per tick) unless reduced motion is requested.

### Headline deadline
"Next to expire" in eyebrow type, then the event title in display type, then the game name in its
hue, then the 44px numeral countdown with the exact end beside it, then the meter, and behind it all
the heat wash. A "Then" list follows: a hue dot, a muted title and a small tabular reading.

### Timeline bar
A 36px bar with 5px corners. Its fill is the game's hue mixed into `surface` at 22% (11% if the event
hasn't started). It has a 3px hue left edge (dashed if not started), ink text, and a sticky name that
can never leave its own bar. In the merged "Ending soonest" view, a bar also shows the game's short
name in an eyebrow in its hue, which is dropped first when space runs out. Completed bars sit at 35%
opacity. **Now** is a 1px critical rule with a small critical chip on the axis.

### Inputs
A ground-filled field with a hairline border, 8px corners, 8px × 12px padding and body-size ink
text. On focus the border moves to faint. The field gets no glow, because a form is not a reading.

### Sheets and notices
- **Detail sheet:** `surface` fill with a hairline border and 16px corners. It rises from the bottom
  on a phone, is centred at `max-w-lg` from `sm` up, and sits over the scrim.
- **Toast / update notice:** `raised` fill, hairline border, 12px corners and the only shadow in the
  system. Each offers one action.

### Daily burst
A small spray of 3px sparks that fires once, when the last daily of the day is ticked. It is purely
decorative and ignores pointer input. With reduced motion requested it does not render at all,
rather than being toned down.

## Do's and Don'ts

### Do:
- **Do** name colours by token (`ink`, `hairline`, `soon`) and add a light-theme value whenever you
  add a token.
- **Do** pass every game hue through `readableHue` for the active theme before it reaches the
  screen.
- **Do** use tabular figures (`.tnum`) on every countdown, count and date that sits in a column.
- **Do** draw uncertainty as uncertainty: a hatched meter, a frayed bar end, a faded clipped start,
  a dashed not-yet-started edge, and the words "end date unknown".
- **Do** keep hover and press feedback fast and eased out (110–160ms in, 40–60ms on press), behind
  `@media (hover: hover)`, and remove the transforms under `prefers-reduced-motion: reduce`.
- **Do** show the 2px `near` focus outline on every interactive element, `summary` included.
- **Do** keep the board's controls out of the list rows: status, effort and notes live in the
  detail sheet.

### Don't:
- **Don't** use literal colours (`bg-white`, hex values in a component, a hard-coded scrim). They
  break one of the two themes silently.
- **Don't** colour an urgency element with a game hue, or a game element with a heat step.
- **Don't** replace the segmented meter with a smooth progress bar, or draw an unknown end as a full
  one.
- **Don't** add glows, gradients or drop shadows to static surfaces. Light has to mean something.
- **Don't** wrap individual events in cards. Rows are full-bleed and divided by hairlines.
- **Don't** set prose in Chakra Petch, or numbers that tick in a proportional face.
- **Don't** default the theme from `prefers-color-scheme`. Dark is the default until the reader
  chooses.
- **Don't** put a second control inside a row, or a drag target on the focus bar or the dailies
  strip.
