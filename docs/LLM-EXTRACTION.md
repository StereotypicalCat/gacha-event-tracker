# LLM Extraction

Stage 3 of the pipeline, for sources whose markup is too unstable to parse deterministically. Read
`docs/INGESTION.md` first for where this sits.

## Rules

1. **The model runs at ingestion time only.** No request path calls Anthropic. A page load must
   never trigger inference.
2. **Deterministic parsers win.** If a source has a JSON API or a stable table, it gets a parser,
   not a prompt.
3. **The model's job is transcription, not judgment.** It converts prose and tables into structured
   dates. It does not decide what is important, does not infer missing dates, and does not resolve
   contradictions — it reports them.
4. **Confidence is computed from evidence in `reconcile`, not asserted by the model.** The output
   schema has no confidence field. A model claiming 0.95 confidence has predicted a token, not
   measured anything.

## Model and parameters

| Setting | Value | Why |
|---|---|---|
| `model` | `claude-opus-5` | Exact, complete ID — never append a date suffix |
| `max_tokens` | `16000` | Non-streaming; keeps the request under SDK HTTP timeouts |
| `output_config.effort` | `"medium"` | Transcription, not reasoning. Sweep low/medium/high against fixtures before settling |
| `output_config.format` | `zodOutputFormat(ExtractionResult)` | Schema-conformant output, validated by the SDK |
| `thinking` | *omit* | On by default on `claude-opus-5`; the default is correct here |
| `temperature` / `top_p` / `top_k` | **never set** | Removed on `claude-opus-5` — sending any of them returns 400 |

`thinking: {type: "enabled", budget_tokens: N}` is also removed and returns 400. If you want less
thinking, lower `effort`.

Note that `max_tokens` caps thinking *and* output together. If extraction on a large page returns
`stop_reason: "max_tokens"`, raise it rather than trimming the schema.

## The output schema

The model returns a list of candidate events plus explicit uncertainty. Note what is **absent**:
no confidence score, no "importance" ranking, no summary of the page.

```ts
// src/ingest/extract.ts
import { z } from "zod";

const ExtractedEvent = z.object({
  title: z.string().describe("The event name exactly as written in the source, not paraphrased."),
  type: z.enum(["banner","story","rerun","challenge","login","shop","maintenance","other"]),
  summary: z.string().nullable()
    .describe("One sentence from the source describing the event. Null if the source gives none."),

  startsAt: z.string().nullable()
    .describe("ISO 8601 UTC. Null only if the source truly does not state a start."),
  startPrecision: z.enum(["exact","day","unknown"])
    .describe("'exact' if a time of day is stated; 'day' if only a date; 'unknown' if neither."),

  endsAt: z.string().nullable()
    .describe("ISO 8601 UTC. Null when the source says TBD, 'until further notice', or gives no end."),
  endPrecision: z.enum(["exact","day","unknown"]),

  regionScoped: z.boolean()
    .describe("True if the end follows each server region's daily reset rather than one global instant."),

  sourceTimezone: z.string().nullable()
    .describe("The timezone the source stated, e.g. 'UTC+8', 'server local'. Null if unstated."),
  evidence: z.string()
    .describe("The verbatim span from the input that gave you the dates. Must appear in the input."),
});

const ExtractionResult = z.object({
  events: z.array(ExtractedEvent),
  ambiguities: z.array(z.object({
    title: z.string(),
    issue: z.string().describe("What is unclear or contradictory in the source."),
  })).describe("Events you could not confidently transcribe. These are held for human review."),
});
```

`evidence` is the load-bearing field. It is checked in `validate`: if the quoted span does not
appear in the input text, the event is quarantined as `sanity_failed`. That check is what turns a
fabricated date into a caught error instead of a shipped one.

## The system prompt

Kept in `src/ingest/prompts/extract-events.v1.md`, versioned in the filename, and logged as
`prompt_version` in `extraction_log` so a regression can be traced to a specific revision.

It must stay **above 512 tokens** — that is the minimum cacheable prefix on `claude-opus-5`. Below
it, prompt caching silently stops working with no error. After any prompt edit, check
`usage.cache_read_input_tokens` is non-zero on the second call.

```markdown
You extract scheduled in-game events from gacha game source pages into structured data.

Your output is consumed by a calendar that players rely on to avoid missing limited-time content.
A wrong end date is worse than a missing event: a missing event sends someone to a wiki, a wrong
one makes them miss content permanently. Transcribe what the source says; never supply what it
omits.

## What counts as an event

Anything with a start and a bounded or open-ended run: character and weapon banners, story
chapters, side events, login campaigns, limited shops, combat cycles, announced maintenance.

Not events: permanent features, general game descriptions, patch version numbers on their own,
speculation or leaks, community posts, and anything phrased as expected, rumored, or datamined.

## Dates

- Emit UTC ISO 8601 with an explicit `Z`.
- When the source states a timezone (commonly UTC+8 for Chinese-developed titles), convert to UTC
  and record what it stated in `sourceTimezone`.
- When only a date is given, set the timestamp to 00:00:00Z and `precision: "day"`. Do not guess a
  time of day.
- When the source says the end is TBD, "until further notice", "with the next version update", or
  gives no end at all: `endsAt: null` and `endPrecision: "unknown"`. This is a correct, expected
  answer. Do not compute a plausible date from a typical patch length.
- `regionScoped` is true when the end is tied to each server's daily reset, false when the source
  gives one simultaneous global instant. Character banners are usually global; story and login
  events are usually region-scoped. Use what the source says over this heuristic when it says
  anything.

## Evidence

For every event, `evidence` must be a verbatim span copied from the input that contains the dates
you reported. It is checked against the input automatically. If you cannot quote a span, the event
belongs in `ambiguities` instead.

## Ambiguities

Put an entry in `ambiguities` — not in `events` — when the source contradicts itself, gives dates
you cannot reconcile, or describes something that may not be a scheduled event. A human reviews
these. Reporting uncertainty is a successful outcome, not a failure; guessing to avoid it is the
one thing that breaks this system.

## Scope

Report every qualifying event on the page and nothing else. Do not rank them, do not summarize the
page, do not comment on your process, and do not add fields the schema does not have. If the page
contains no events, return empty arrays.
```

### Why the prompt reads the way it does

`claude-opus-5` follows instructions literally and verifies its own work without being told, so the
prompt states scope and boundaries plainly instead of adding emphasis or self-check scaffolding.
Specifically: **do not add "double-check your answer" or "verify before responding"** here. On this
model that produces over-verification with no accuracy gain. If extraction quality drops, change the
schema descriptions or `effort` — not the volume of the prompt.

## Request shape

```ts
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const client = new Anthropic();  // reads ANTHROPIC_API_KEY from env

const response = await client.messages.parse({
  model: "claude-opus-5",
  max_tokens: 16000,
  system: [
    {
      type: "text",
      text: EXTRACTION_SYSTEM_PROMPT,          // stable across every source — cached
      cache_control: { type: "ephemeral", ttl: "1h" },
    },
  ],
  output_config: {
    effort: "medium",
    format: zodOutputFormat(ExtractionResult),
  },
  messages: [
    {
      role: "user",
      content: [
        `Game: ${adapter.game}`,
        `Source: ${adapter.url}`,
        `Today (UTC): ${ctx.now}`,
        adapter.extractionHints ?? "",
        "",
        "--- SOURCE TEXT ---",
        cleanedText,
      ].join("\n"),
    },
  ],
});

// parsed_output is null if the model refused or hit max_tokens — check before use.
const result = response.parsed_output;
```

**Ordering matters for caching.** The system prompt is byte-identical across every source, so it
sits first and stays cached. Everything volatile — game, URL, `now`, the page text — goes in the
user turn, after the cache breakpoint. Interpolating `ctx.now` into the system prompt would
invalidate the cache on every single call; it is in the user turn for exactly that reason.

## Batch mode

`EXTRACTION_MODE=batch` is the default for scheduled runs: 50% cheaper, results typically within an
hour, which is irrelevant against a 6-hour cadence. The synchronous path above is for
`refresh --now` and for local development.

```ts
const batch = await client.messages.batches.create({
  requests: sourcesToExtract.map((s) => ({
    custom_id: s.runId,                    // key results by this — order is not guaranteed
    params: { /* same body as above */ },
  })),
});

// Poll batches.retrieve(batch.id) until processing_status === "ended",
// then stream batches.results(batch.id) and key each result by custom_id.
```

Results arrive in **any order**. Key by `custom_id`, never by array position. The batch job's
poll loop lives in `scheduler.ts` and persists `batch.id` so a process restart resumes rather than
resubmitting.

## Handling non-success responses

Check `stop_reason` before touching `parsed_output`:

| `stop_reason` | Meaning | Action |
|---|---|---|
| `end_turn` | Normal | Proceed |
| `max_tokens` | Output truncated; `parsed_output` unusable | Raise `max_tokens`, or split the page by section. Fail the run — never publish a partial list |
| `refusal` | Safety classifier declined | Log `stop_details.category` to `extraction_log.refusal_category`, fail the run, alert. Vanishingly unlikely for game wiki content — if it fires, the input is probably not what you think it is |

`stop_details` can be `null` even on a refusal, so branch on `stop_reason` and treat `stop_details`
as informational.

**Do not write a JSON-repair or regex-extraction fallback.** Structured outputs guarantee schema
conformance; if parsing fails, the response was truncated or refused, and both cases are handled
above. A repair path would silently paper over truncation and publish half a calendar.

## Cost

At `claude-opus-5` rates — $5/MTok input, $25/MTok output.

One extraction of a cleaned wiki page:

```
input   ~5,000 tok  × $5/MTok   = $0.025
output  ~1,500 tok  × $25/MTok  = $0.0375
                                  ───────
                          sync    $0.063
                          batch   $0.031   (50% off)
```

Six sources, four runs a day:

| Scenario | Extractions/day | Cost/day | Cost/month |
|---|---|---|---|
| Realistic — ~20% of runs see changed content | ~5 | $0.16 | **~$4.70** |
| Worst case — every source changes every run | 24 | $0.74 | ~$22 |
| No content-hash skip, no batch | 24 | $1.51 | ~$45 |

The gap between rows one and three is the whole argument for the skip check and batch mode. Track
actuals by summing `extraction_log` token columns — do not rely on these estimates once there is
real data.

Prompt caching contributes modestly (the ~1k-token system prompt at 0.1× on reads) but is free to
keep. Its real value is that it makes the prompt cheap to grow if extraction quality needs more
instruction.

## Evaluating a prompt change

`extraction_log` stores `input_hash` for every call, and `snapshots` stores the cleaned text keyed
by the same hash. So a prompt revision is evaluated by replaying past inputs — no re-fetching, no
new scraping load:

1. Pull the last N distinct `input_hash` values with known-correct expected output.
2. Run the new prompt against each cleaned snapshot.
3. Diff against `fixtures/*/*.expected.json`.
4. Compare on three axes: dates correct, events missed, events hallucinated. **Hallucinated events
   and wrong dates are disqualifying; a missed event is a regression to weigh.** That asymmetry is
   the product rule from `docs/PRD.md` restated as an eval criterion.

Bump the prompt filename version and record it as `prompt_version` so the log distinguishes
"extraction got worse" from "the source changed".

## Things not to do

- Do not ask the model to output a confidence score. Confidence is computed in `reconcile`.
- Do not ask the model to resolve a contradiction between two sources. Route it to quarantine.
- Do not send raw HTML. Always clean first — it is a 3× cost difference and it improves accuracy.
- Do not add a second model call to "verify" the first. That is a scaffolding pattern this model
  does not need, and it doubles cost for no measured gain. The evidence-span check and the
  validator rules are the verification layer.
- Do not lower `max_tokens` to save money. Output tokens scale with the number of events found;
  truncation costs a whole run.
