# Exact end times for Genshin and Miliastra — design

Date: 2026-11-07. Status: **built** 2026-11-07; plan at `../plans/2026-11-07-exact-end-times.md`. Detail of the shipped behaviour is in `docs/INGESTION.md` § Article ends.

## Why

The owner trusts a countdown right up to the last hour before something closes.
Fandom's `Event` table prints dates only, so `clockFor` reads each end as that
game-day's reset. That is right for most events and hours wrong for the rest. It is
this product's named worst failure: a confidently wrong end date (PRD § Quality bar
for dates). The evidence is in `../../2026-11-01-genshin-event-audit.md` § Follow-up.

Every live row's article, read 2026-11-07, against what the app shows on Europe:

| Article's end | Rows | App today |
|---|---|---|
| 03:59 server time | 9: To Temper Cycle 6, Sacred Spirit Chronicle, Chronicle of Polyphony, Grand Defense, Stygian Onslaught, Stress Block, Frames of Fierce Splendor, Ley Line Overflow, Starlight Voyage | Correct |
| 05:59 GMT+8 | Raiment Collection, Forge Realm's Temper | 5h late on the article's reading |
| 14:59 server time | Encounter: Interlude, Hour of Ruin, Where Kristall Roots Run Deep | 11h early |
| 17:59 server time | Test Run | 14h early |

In-game readings by the owner agree with the articles on Sacred Spirit Chronicle,
Chronicle of Polyphony, Raiment Collection and Test Run. Encounter has indirect
support: `Wonderland Treasures - Polyphonic Harmony` read 38d 13h 47m, landing on
the same 14:59. **One disagrees:** the Cat's Tail timer for Forge Realm's Temper read
38d 22h at about 00:30 UTC on 2026-11-07, implying 15 Dec about 22:30–23:30 UTC. The
article implies 14 Dec 21:59 UTC. See § Accepted exception.

The miss is not a pattern a rule can fix: the same printed date can mean any of three
times, so each event's own stated time has to be read.

## Goals

- A live Genshin or Miliastra row shows the end its Fandom article states, to the minute.
- Reading the wiki stays polite: small requests, not repeated for what is already known.
- With no usable article time, a row behaves exactly as it does today.

## Non-goals

- Other games. Each has its own article layout; measure one when it is shown wrong.
- Start times. **`startsAt` must not change: it is half of the event ID.**
- The undated selector row, Wonderland Treasures, banners, and lane labels on Game8
  rows (audit open items 2–4).
- New interface. Countdowns and printed end times become more accurate; nothing is added.

## Anti-goals: a failure even if it works

- An event ID changes, or a reader's marks are orphaned.
- A time is invented or inferred, including from an owner's rounded in-game reading.
- A row disappears from the feed while its stated end is still ahead.
- A refresh's failure on an article blocks or fails the page sources.
- The build touches the network.

## Constraints

No LLM, no new runtime dependency, no HTML parsing library. Deterministic parsing only,
per AGENTS.md § Three constraints and § Scraping conduct.

## Decisions

Approved with this document unless marked as the agent's call.

1. **Scope:** Genshin and Miliastra only (owner, 2026-11-07). Both come from
   `genshin-fandom-events`, so this one source's rows are what gets read.
2. **Read an article when a row first appears, and keep what it said**, rather than
   re-reading every article each refresh (owner, 2026-11-07, as a stated guess not
   corrected).
3. **No usable time falls back to today's behaviour** (owner, same).
4. **Forge Realm's Temper is accepted as an exception,** not special-cased (owner,
   2026-11-07, see below).
5. **Article reads:** `api.php?action=parse&page=<title>&prop=text&section=0&formatversion=2&format=json`.
   Agent's call. `section=0` holds the infobox: 8 KB rather than about 18 KB, verified
   on `Hour_of_Ruin_(Event)`. Same host, same `/api.php?action=` path the robots note
   on `genshin-fandom-events` already clears, same runner User-Agent, robots gate and
   per-host spacing.
6. **When to read.** Agent's call. Only rows the current table lists and that have not
   ended. An article is due when it has never been read; when the last read found no
   time, once the 6-hour floor has passed; or when the last read found a time at least
   7 days ago, because wiki editors correct these and a kept wrong time would be
   permanent. `--force` does not apply to articles.
7. **Storage: `snapshots/articles/genshin-fandom/<article-slug>.html` plus `.meta.json`,**
   committed with the other snapshots. Agent's call. Raw bytes as served, written like
   every other snapshot, so re-parsing never re-fetches and a changed time is a
   reviewable diff. Rows no longer listed have their files deleted by the refresh.
8. **Read the End value of the infobox only:** the cell with `data-source="time_end"`.
   Not the "Ends in" lines, the body prose, or the image names. The value has one of two
   usable shapes:

   | Printed | Stored | Precision |
   |---|---|---|
   | `December 15, 2026 14:59 (Server Time)` | `regionScoped: true`, `regionEnds` for each region at that server's clock: Asia UTC+8, Europe UTC+1, America UTC−5 | exact |
   | `December 16, 2026 05:59 GMT+8` | one instant in `endsAt`, `regionScoped: false` | exact |

   Anything else, including a date with no time or another zone, is no usable time.
   Stored times are as printed, 14:59 and not 15:00.
9. **The article must agree on the date.** Its printed calendar date must equal the
   date the table printed. If not, the time is ignored, the row keeps the table's date,
   and the build logs a warning. A stale or wrongly linked article must not move an
   event by days. This also keeps a wiki-side disagreement from silently shifting a row.
   Agent's call: on a merged survivor the survivor's own end date must match as well. If
   Game8 and Fandom disagree on the date, the row stays as merged, at day precision, with
   a warning: `mergeEvents` flags such a disagreement for a person rather than resolving
   it, and an article must not settle it unseen. No live row is in this state today.
10. **Apply after merge, in the feed build.** `mergeEvents` keeps the higher-confidence
    copy, so Game8's day-precision row wins for Grand Defense, Stress Block, Frames and
    Ley Line, and it would discard an end set on the Fandom copy. So the exact end is
    applied to the merged survivor, matched by event ID or `mergedIds`. The merge's end
    comparison keeps seeing table dates, so no new conflicts appear. Applying it changes
    only `endsAt`, `endPrecision`, `regionScoped` and `regionEnds`; never `id`,
    `startsAt`, `sourceUrl`, `sourceId` or `classification`. The application is a pure
    function a test can reach, as `parseGame` keeps fetching out of parsing.
11. **Currency must follow the stated end.** `fandom.ts` retires a row on
    `latestBoundaryMs` of the table's date. For Hour of Ruin that is 09:00Z while the
    stated end is 19:59Z in the Americas, which would delete a live row for 11 hours on
    its last day (an anti-goal). A row with a usable article time is retired on the
    latest of those stated instants instead. How the parser receives this is left to the
    builder; the parser stays offline and pure.
12. **Article failures are warnings, and what happens to a kept time depends on what the
    wiki said.** Agent's call. None of these contributes to `genshin-fandom-events'`
    failure streak, health or broken-source count.

    | Result of a read | Stored article | Row shows |
    |---|---|---|
    | Network error, any non-200 including 404, refused, or robots-blocked: the wiki told us nothing about the article | Kept untouched | The last good time, if any. Due again after the 6-hour floor |
    | The API's `missingtitle`, sent with a 200: the article is gone or renamed. Changed from "404" in final review: a bare 404 is an edge or outage, and one would wipe every row's time | Deleted | Fallback |
    | `200` whose End value is absent or unusable: the article no longer states a time | Overwritten | Fallback. Due again under the no-time rule |

    `.meta.json` records the last attempt separately from the last successful read, so the
    7-day rule counts from a read that worked.

## Accepted exception

Forge Realm's Temper would go from about 20h early to about 25h early against the
Cat's Tail reading. It may be that the timer covers something beyond the event, or that
the article is wrong; neither is established. Both errors are on the safe side, so the
reader leaves the event done before it closes. It is one reading, so no special case.
Recheck when the next `The Forge Realm's Temper` run starts. Record the reading in the
audit doc in the same change.

Raiment Collection is the only confirmed-late row today, and it is corrected by this.

## Left to the builder

- Where the due-check and fetch sit in `scripts/refresh-sources.ts`, and the budget of
  reads per run if one is needed. A new version adds about 15.
- Which form the region offsets take; reuse what `daily.ts`/`time.ts` already hold.
- What `endsAt` holds on a region-scoped row. Follow the existing wiki.gg precedent
  and check `EventDetail.tsx`'s read of it.
- Whether a stale `firstSeenAt` or a bumped `version` applies; no change is the default.

## Verification

- Fixtures in `fixtures/genshin/` for one article of each shape, one stub with no time,
  and one with a different date. Captured once, then tests stay offline.
- Tests: both shapes; rejected shapes; date disagreement, with the table and with a
  merged survivor; each row of decision 12's table; application to a merged Game8
  survivor via `mergedIds`; IDs and `startsAt` unchanged; a row still live on its last
  day past the table's boundary; an article failure leaving source health untouched; the
  due rule.
- `schema-guardian` reviews the change, since it writes `regionEnds` for this source.
- After a real refresh: on Europe, the table above reproduces at Test Run 17:59,
  Hour of Ruin 14:59, Raiment 05:59 GMT+8 and passes at 03:59, in a real browser.
- `bun test`, `bun run typecheck`, and the docs changed with it: `AGENTS.md` § Domain
  rules and § Fandom, `docs/INGESTION.md`, PRD § Quality bar, `snapshots/README.md`.
- A reader sees this, so it gets a changelog entry per AGENTS.md.
