import { eventId, type GachaEvent } from "../shared/schema.ts";
import { decodeEntities } from "./html.ts";

/**
 * The trust boundary for scraped text.
 *
 * Every string on a `GachaEvent` starts life as bytes from a community wiki we
 * do not control. Between the parser and validation it passes through here, so
 * that what reaches the feed — and therefore React, `localStorage`, JSON on
 * disk and eventually SQLite — is plain, bounded, normalised text.
 *
 * Three principles, in priority order:
 *
 *  1. **Never invent or alter a date.** Nothing in this module reads, writes or
 *     reformats a timestamp. Dates are the product's whole promise; the
 *     sanitiser's job stops at prose and URLs.
 *  2. **Clean, do not drop.** A hostile title is truncated and stripped, not
 *     rejected — an event vanishing without a trace is the failure mode this
 *     codebase fears most (AGENTS.md § Silent drops). The one unrecoverable
 *     case is a title that sanitises to nothing, and that emits a note the
 *     caller is expected to surface.
 *  3. **Never throw on junk.** Malformed entities, lone surrogates, absurd code
 *     points and 5MB strings all have to come out the other side as a string.
 *
 * Dependency-free by design: no DOMPurify, no sanitize-html, no parse5.
 */

/**
 * Length caps, mirroring `title`/`summary` in `src/shared/schema.ts`.
 *
 * The schema stays the single source of truth — these exist so a hostile page
 * is truncated *before* validation instead of failing it, and
 * `test/sanitize.test.ts` asserts that a string of exactly this length is
 * accepted by `GachaEvent` and one character more is not, so the two cannot
 * drift apart unnoticed.
 */
export const LIMITS = {
  title: 200,
  summary: 500,
  /** Not a schema cap: a defensive ceiling so a junk href cannot be a novel. */
  url: 2048,
} as const;

/** How many decode/strip rounds before giving up and hard-scrubbing. */
const MAX_PASSES = 5;

/**
 * Characters that are invisible, that control how surrounding text is
 * *displayed*, or that are not legal text at all.
 *
 * The bidi overrides and isolates (U+202A–U+202E, U+2066–U+2069) matter most:
 * they let a source render "Login Event" as something else entirely, or hide a
 * suffix from a reader while it still lands in the title, the slug and the
 * user's saved state. Zero-width characters do the same job more crudely and
 * additionally let an attacker smuggle `&am<ZWSP>p;lt;` past a naive decoder.
 *
 * Note ZWJ (U+200D) goes too, which splits multi-part emoji into their
 * components. Our sources are English-language wikis; a mangled family emoji is
 * a fair price for no invisible characters anywhere in a title.
 */
const INVISIBLE =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\uFFF9-\uFFFB\uFFFE\uFFFF]/g;

/** Unicode tag characters (U+E0000–U+E007F) — invisible, as surrogate pairs. */
const TAG_CHARS = /\uDB40[\uDC00-\uDC7F]/g;

/** Half of a surrogate pair with no partner: not valid text, breaks JSON. */
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/g;

/** Elements whose *content* is code, not text, and must go with the tag. */
const CODE_BLOCKS =
  /<(script|style|template|noscript|iframe|object|embed|svg|math)\b[\s\S]*?(?:<\/\1\s*>|$)/gi;

const COMMENTS = /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<\?[\s\S]*?(?:\?>|$)/g;

const TAG = /<[^>]*>/g;

function stripInvisible(input: string): string {
  return input
    .replace(TAG_CHARS, "")
    .replace(INVISIBLE, "")
    .replace(LONE_SURROGATE, (m) => (m.length === 2 ? m[0] ?? "" : ""));
}

function stripTags(input: string): string {
  let out = input;
  for (let i = 0; i < MAX_PASSES; i += 1) {
    const next = out.replace(TAG, " ");
    if (next === out) return out;
    out = next;
  }
  return out;
}

/**
 * One round of neutralising.
 *
 * Order is deliberate. NFKC runs *first* because it turns look-alike forms into
 * their canonical ones (U+FF1C FULLWIDTH LESS-THAN becomes `<`), and a
 * normaliser running after the tag stripper would hand back live markup.
 * Invisible characters go next so they cannot break up an entity or a tag name.
 * Only then is anything decoded, and whatever the decode produced is stripped
 * in the same round.
 */
function pass(input: string): string {
  const normalised = stripInvisible(input.normalize("NFKC"));
  const withoutCode = normalised.replace(CODE_BLOCKS, " ").replace(COMMENTS, " ");
  return stripTags(decodeEntities(withoutCode));
}

/**
 * Reduce text to a fixed point of `pass`.
 *
 * Running to a fixed point is what makes the whole module idempotent, and it is
 * also the answer to double-encoding: `&amp;lt;script&gt;` decodes to
 * `&lt;script>` on the first round and to a tag on the second, which the second
 * round then strips. Stopping after one decode would leave a string that a
 * later `sanitizeText` — or any other decoder downstream — turns into markup.
 */
function toFixedPoint(input: string): string {
  let out = input;
  for (let i = 0; i < MAX_PASSES; i += 1) {
    const next = pass(out);
    if (next === out) return out;
    out = next;
  }
  // Pathological input that keeps re-encoding itself — `&#38;#38;#38;…` nested
  // deeper than the round limit. Removing every `<`, `>` and `&` both kills any
  // tag shape and guarantees the result is a fixed point (nothing left to
  // decode), which is what keeps `sanitizeText` idempotent even here.
  return out.replace(/[<>&]/g, " ");
}

/** Collapse every run of whitespace — including NBSP and U+2028 — to one space. */
function collapse(input: string): string {
  return input
    .replace(/[\s\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]+/g, " ")
    .trim();
}

/**
 * Cut to `max` characters at a word boundary, marking the cut with an ellipsis.
 *
 * Truncating beats rejecting: a real event with a bloated description is still
 * a real event, and the user would rather see it than not. The result is always
 * `<= max`, so a second pass never truncates again.
 */
function truncate(input: string, max: number): string {
  if (input.length <= max) return input;

  let cut = input.slice(0, max - ELLIPSIS.length);
  // Never end on half a surrogate pair.
  if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);

  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > max * 0.6) cut = cut.slice(0, lastSpace);

  return `${cut.replace(/[\s,;:.–—-]+$/, "")}${ELLIPSIS}`;
}

/**
 * Three dots, not U+2026.
 *
 * NFKC decomposes the ellipsis character into these three anyway, so a "…"
 * appended here would grow by two characters on the next pass and re-cut the
 * string at a different word boundary — breaking the idempotency this module
 * promises. Writing what normalisation would produce keeps the second pass a
 * no-op.
 */
const ELLIPSIS = "...";

export interface SanitizeTextOptions {
  /** Hard cap; the result is never longer. Defaults to the summary cap. */
  maxLength?: number;
}

/**
 * Clean one string extracted from a source.
 *
 * Total: any input, including `null`, a number or a 5MB blob of markup, yields
 * a string. Idempotent: `sanitizeText(sanitizeText(x)) === sanitizeText(x)`.
 */
export function sanitizeText(
  input: unknown,
  options: SanitizeTextOptions = {},
): string {
  // Anything that is not a primitive is not text a source stated; "" is the
  // honest reading of it, and stringifying an object would invent content.
  const raw =
    typeof input === "string"
      ? input
      : typeof input === "number" || typeof input === "boolean"
        ? String(input)
        : "";
  const max = options.maxLength ?? LIMITS.summary;
  return truncate(collapse(toFixedPoint(raw)), max);
}

export interface SanitizeUrlOptions {
  /** Resolves a relative href, exactly as `new URL(href, base)` would. */
  base?: string;
}

/**
 * Return `input` as an absolute http(s) URL, or null if it is not one.
 *
 * `sourceUrl` is rendered as an attribution link, so a `javascript:` or `data:`
 * URL that reached the client would be a live XSS vector in an app that
 * otherwise never handles untrusted URLs. Anything that is not plainly http(s)
 * — including a URL carrying credentials, which is only ever a phishing shape —
 * is refused, and the caller falls back to the source's registered URL.
 */
export function sanitizeUrl(
  input: unknown,
  options: SanitizeUrlOptions = {},
): string | null {
  const raw = sanitizeText(input, { maxLength: LIMITS.url });
  if (raw.length === 0) return null;

  let url: URL;
  try {
    url = options.base === undefined ? new URL(raw) : new URL(raw, options.base);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username !== "" || url.password !== "") return null;
  return url.toString();
}

export type NoteLevel = "repaired" | "dropped";

export interface SanitizeNote {
  level: NoteLevel;
  sourceId: string;
  field: "title" | "summary" | "sourceUrl" | "id";
  /** Human-readable, already truncated — safe to print to a log. */
  message: string;
}

export interface SanitizeEventOptions {
  /**
   * The source's registered URL. Known good (it came from `SOURCES`, not from
   * the page), so it is the fallback when an event's own `sourceUrl` is junk —
   * attribution to the right page beats discarding the event.
   */
  fallbackUrl?: string;
  /** Reported on every note, so a log line names the source that produced it. */
  sourceId?: string;
}

export interface SanitizeEventResult {
  /** Null only when the event could not be repaired into a publishable shape. */
  event: GachaEvent | null;
  notes: SanitizeNote[];
}

/**
 * Clean every source-derived string on one event.
 *
 * Timestamps, precisions, confidence, region data and `sourceId` are passed
 * through untouched: the first three are numbers and dates this module has no
 * business rewriting, and the last comes from our own registry rather than from
 * the page.
 *
 * The `id` is only recomputed when sanitising actually changed the title *and*
 * the incoming id was minted the standard way (`eventId(game, title, startsAt)`).
 * That keeps two guarantees at once: an id never disagrees with the title it
 * encodes, and — because sanitising a clean title is a no-op — no id in the
 * current feed moves. Ids are localStorage keys; a gratuitous change there
 * orphans completion marks with no server-side recovery.
 */
export function sanitizeEvent(
  event: GachaEvent,
  options: SanitizeEventOptions = {},
): SanitizeEventResult {
  const sourceId = options.sourceId ?? sanitizeText(event.sourceId, { maxLength: 120 });
  const notes: SanitizeNote[] = [];
  const note = (level: NoteLevel, field: SanitizeNote["field"], message: string) => {
    notes.push({ level, sourceId, field, message });
  };

  const rawTitle = typeof event.title === "string" ? event.title : "";
  const title = sanitizeText(rawTitle, { maxLength: LIMITS.title });
  if (title.length === 0) {
    note(
      "dropped",
      "title",
      `title sanitised to nothing (raw: ${JSON.stringify(rawTitle.slice(0, 80))})`,
    );
    return { event: null, notes };
  }
  if (title !== rawTitle) {
    note("repaired", "title", `${JSON.stringify(rawTitle.slice(0, 80))} → ${JSON.stringify(title)}`);
  }

  let summary: string | null = null;
  if (typeof event.summary === "string") {
    const cleaned = sanitizeText(event.summary, { maxLength: LIMITS.summary });
    summary = cleaned.length === 0 ? null : cleaned;
    if (cleaned !== event.summary) {
      note("repaired", "summary", `summary cleaned (${event.summary.length} → ${cleaned.length} chars)`);
    }
  }

  const base = options.fallbackUrl;
  const sourceUrl =
    sanitizeUrl(event.sourceUrl, base === undefined ? {} : { base }) ??
    sanitizeUrl(base);
  if (sourceUrl === null) {
    note(
      "dropped",
      "sourceUrl",
      `no usable http(s) source URL (raw: ${JSON.stringify(String(event.sourceUrl).slice(0, 120))})`,
    );
    return { event: null, notes };
  }
  if (sourceUrl !== event.sourceUrl) {
    note("repaired", "sourceUrl", `${JSON.stringify(String(event.sourceUrl).slice(0, 120))} → ${JSON.stringify(sourceUrl)}`);
  }

  let id = event.id;
  if (title !== rawTitle && id === eventId(event.game, rawTitle, event.startsAt)) {
    id = eventId(event.game, title, event.startsAt);
    if (id !== event.id) {
      note("repaired", "id", `${event.id} → ${id} (title was sanitised)`);
    }
  }

  return { event: { ...event, id, title, summary, sourceUrl }, notes };
}

export interface SanitizeEventsResult {
  events: GachaEvent[];
  notes: SanitizeNote[];
}

export interface SanitizeEventsOptions extends SanitizeEventOptions {
  /**
   * Where notes go. Defaults to `console.warn`, on purpose: a dropped event
   * must never be silent, and defaulting to a no-op would make silence the
   * behaviour a future caller gets for free.
   */
  onNote?: (note: SanitizeNote) => void;
}

/** Sanitise a parser's whole output. Order is preserved; drops are reported. */
export function sanitizeEvents(
  events: readonly GachaEvent[],
  options: SanitizeEventsOptions = {},
): SanitizeEventsResult {
  const onNote = options.onNote ?? defaultReporter;
  const kept: GachaEvent[] = [];
  const notes: SanitizeNote[] = [];

  for (const event of events) {
    const result = sanitizeEvent(event, options);
    for (const n of result.notes) {
      notes.push(n);
      onNote(n);
    }
    if (result.event !== null) kept.push(result.event);
  }

  return { events: kept, notes };
}

function defaultReporter(note: SanitizeNote): void {
  const prefix = note.level === "dropped" ? "! dropped" : "  repaired";
  console.warn(`${prefix} ${note.sourceId} ${note.field}: ${note.message}`);
}
