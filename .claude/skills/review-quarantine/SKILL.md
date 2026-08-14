---
name: review-quarantine
description: Work through the quarantined-event queue — triage held events by reason, verify dates against sources, and approve, correct, or reject each. Use when the quarantine queue has grown, when /api/health shows held events, or when an expected event is missing from the calendar.
---

# Reviewing the quarantine queue

> **Not built yet.** The quarantine table, the `/review` route and the ingest scheduler are specified
> in `docs/INGESTION.md` but do not exist in the tree. Today the closest equivalent is the conflict
> list `bun run build:feed` prints when two sources disagree. Use this skill once the pipeline lands;
> until then, treat it as the spec for what that review flow should do.

Held events are candidates the pipeline declined to publish. Working the queue is both a data task
(get these events onto the calendar) and a diagnostic one (**a growing queue means something
upstream broke**).

Read `docs/INGESTION.md` § The review gate first.

The review UI is at `http://127.0.0.1:$ADMIN_PORT/review`, on the admin listener only. If it is not
reachable, the server is not running or `ADMIN_PORT` differs — it is not a permissions problem, and
there is no auth to get past.

## Triage by reason first

Do not work the queue in date order. Group by `reason` — the four causes need different responses,
and two of them are pipeline bugs rather than review work.

| Reason | What it means | Do this |
|---|---|---|
| `date_conflict` | A published end date moved by >24h | **Highest priority.** Users may already have planned around the old date |
| `sanity_failed` | Broke a hard validator rule | Usually an extraction or parser bug — check the pattern before approving anything |
| `low_confidence` | Scored below `CONFIDENCE_THRESHOLD` | Routine. Verify against the source and approve |
| `novel_shape` | Something the schema does not model | A design question, not a review decision — escalate |

**Before reviewing individual items, look for a pattern.** Fifteen `sanity_failed` events from one
source is not fifteen review decisions; it is one broken adapter. Fixing the adapter and re-running
is the correct action, and approving them one by one hides the breakage. Say so rather than grinding
through the queue.

## Reviewing one event

For each held event the UI shows the parsed fields, the reason and detail, and the source link. Work
in this order:

1. **Open the source.** Confirm the dates against the live page.
3. **Check the timezone.** Most gacha sources publish in UTC+8. Confirm the conversion. A silently
   wrong timezone is the most common real error here, and it is 8 hours of wrongness that looks
   plausible.
3. **Check `regionScoped`.** Is this a global banner end or a per-region reset? Getting this wrong
   makes the countdown wrong for two thirds of users.
4. **Check for a guessed end date.** If the source says TBD or gives no end and the candidate has a
   concrete `endsAt`, that is a parser bug. Correct it to `null` with `endPrecision: "unknown"`
   before approving, and open the adapter.

For `date_conflict` specifically: the UI shows the published event beside the candidate. Determine
which is right by going to the source. If the source genuinely changed, approve the correction. If
the candidate is a misparse, reject it — the published event stands.

## Decisions

- **Approve** — publishes with `extraction_method: 'manual'`, `confidence: 1.0`.
- **Approve with edits** — correct a field first; the corrected value is what publishes. Use this
  freely; a nearly-right event with one bad field is worth fixing rather than rejecting.
- **Reject** — not published. The same candidate will be held again on the next run if the source
  has not changed, which is intended: a rejection is not a permanent suppression.

When uncertain, reject. An event missing from the calendar sends someone to a wiki; a wrong end date
makes them miss content. That asymmetry is the product rule (`docs/PRD.md` § Quality bar) and it is
what breaks the tie.

## Close the loop

The queue is a signal. After working it, report what caused it:

- Repeated `sanity_failed` from one source → the adapter needs repair. Use the **adapter-author**
  agent.
- Many `low_confidence` items that all turn out correct → the threshold may be too high, or the
  source needs a second corroborating source. Do not just lower `CONFIDENCE_THRESHOLD` to make the
  queue shorter; that trades a visible queue for invisible wrong dates.
- `novel_shape` → escalate as a data-model question with the specific example.

Report how many you approved, corrected, and rejected, and what you think caused the batch. A review
session that empties the queue without explaining why it filled has done half the job.
