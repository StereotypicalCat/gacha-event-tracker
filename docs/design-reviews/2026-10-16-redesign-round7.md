# Routine redesign: one airier design

**Later owner decision:** retain two interfaces after all: Round 7 and Round 6 **B**, selected
in Settings. The earlier single-interface direction below records the mockup review, not the
final implementation decision. Replace “Older schedules” with “Event data may be out of date”.
See the [production redesign specification](../superpowers/specs/2026-10-16-ui-redesign-design.md).

Review prototype, not shipped behaviour. Open
[the unified mockup](../../design/mockups/round7/converged.html), also copied to
`~/gacha-mockups/round7/converged.html` through the shared index.

## The owner's correction

Round 6's three alternatives were rejected. The owner asked for:

- Older-data notices in the same structure as New since you last looked, appearing only when
  games have older data.
- The current production game's focus-pill structure, placed at the top of the left rail as in B.
- A more airy, easy-to-read design informed by the original
  `~/gacha-mockups/c-one-due-list.html`.

The initial idea of a Simple mode or a spacing toggle was then explicitly reconsidered: the owner
does not want two distinct UIs. Carry the spirit of C into one unified interface instead.

## What this mockup does

**A shared updates area.** New code notices and Older schedules use two compact rows in one
component above the Checklist's event list and above Timeline. The older row lists affected games
and links to Details & reasons; no full-width health banner or rail status panel remains. It is
absent when the selected games have current sources. If there are no new codes either, the whole
updates area disappears. Source reasons remain available in Data & sources and event detail; the
full feed timestamp stays in the footer on every load. Scope is the games the reader has switched
on, rather than only the temporary focus. Repetitive older-data labels on individual list rows are
removed because the updates row already names those games.

**The existing focus behaviour.** `src/client/components/GameFocus.tsx` is the reference: All and
game pills, game hues, outstanding counts, and Next progressing through games and then back to All.
Tapping the focused pill returns to All. Pills wrap in their own panel at the top of the Checklist
rail; they are absent for a single-game setup. Timeline uses the same pills above its lanes. Focus
never changes which games are followed.

**One visual world.** The original C informs separated panels, quieter rules, softened surfaces,
more room around controls and a warmer reading rhythm. Bricolage Grotesque and Figtree replace the
compressed timetable typography consistently across the prototype, including settings and forms.
The rail and event list have a real gutter; focus, deadline, dailies and routines have separated
surfaces. Light mode uses warm paper and dark mode a softer charcoal. No Simple/Detailed mode or
global spacing toggle is added. Standard/Compact remain two row densities of this same appearance.
Rows with no description remain shorter; comfortable layout is not a fixed tall event height.

Direct daily ticks, routine disclosure choices, independent pins, custom palettes, per-game colours
and reset overrides, source links and thanks, Changelog in Settings, Archive statistics and history,
backup history/recovery, timezone and both onboarding flows remain available. The daily-panel layout
shortcut is removed from the Checklist rail to reduce controls there; its Routines and Appearance
settings continue to edit the same preference.

## Validation

Chrome journeys at 1440px and 390px passed with no JavaScript errors and no page-level horizontal
overflow in the checked views. They cover conditional/scope-aware notices, empty updates, focus
toggle/advance, spacing, routine expansion, reset override/revert, source credit links, custom
scheme controls, light-theme game-colour contrast on ground and panel, Changelog location, backup
history, Archive stats, Timeline, completion/fade/Undo and onboarding. Contrast adjustment now
considers both panel and page grounds, while retaining saved base game colours.

Screenshots were inspected for Checklist in both appearances, Routines, Data & sources, Archive
and Timeline. The first verification script used a nonexistent review-bar Settings shortcut; it
was corrected to use the actual Settings tab. No product change was needed for that script error.

The mechanical design check flags differences from the **shipped** DESIGN.md in palette, type
size, radius and inherited archive treatments. Those remain review findings, not broad suppressions.
The intentional Bricolage font exception is scoped to this one prototype file, with rationale in
`.impeccable/config.json`. The production visual reference is not rewritten before implementation.

## Boundaries

The namespace is `event-clock:mockup:round7:v1`. Earlier mockups and production progress remain
unchanged. Historical records, codes and source health are illustrative; clocks are fixed and
automatic reset defaults simplified. No source requests or production parser/storage changes run
here. This is a disposable visual review artifact; the redesign still needs a reviewed production
specification and migration plan.
