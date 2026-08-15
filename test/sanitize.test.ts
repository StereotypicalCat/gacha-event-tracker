import { describe, expect, test } from "bun:test";
import { adapterById, ADAPTERS } from "../src/ingest/adapters/index.ts";
import { parserById } from "../src/ingest/parsers/index.ts";
import {
  LIMITS,
  sanitizeEvent,
  sanitizeEvents,
  sanitizeText,
  sanitizeUrl,
  type SanitizeNote,
} from "../src/ingest/sanitize.ts";
import { eventId, GachaEvent } from "../src/shared/schema.ts";

const NOW = "2026-08-14T00:00:00.000Z";

function event(overrides: Partial<GachaEvent> = {}): GachaEvent {
  return {
    id: "genshin:test-event:2026-08-12",
    game: "genshin",
    title: "Test Event",
    type: "other",
    summary: null,
    startsAt: "2026-08-12T00:00:00.000Z",
    startPrecision: "day",
    endsAt: "2026-08-24T00:00:00.000Z",
    endPrecision: "day",
    regionScoped: false,
    regionEnds: null,
    sourceUrl: "https://example.test/a",
    sourceId: "source-a",
    status: "published",
    confidence: 0.9,
    extractionMethod: "parser",
    version: 1,
    firstSeenAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/** Collects notes instead of printing them, so a test can assert on them. */
function collector() {
  const notes: SanitizeNote[] = [];
  return { notes, onNote: (n: SanitizeNote) => void notes.push(n) };
}

/**
 * Everything hostile this module claims to handle, in one list.
 *
 * Reused by the idempotency and the no-throw properties below: any case added
 * here is automatically held to both.
 */
const HOSTILE: Array<[label: string, input: string]> = [
  ["bare script", `<script>alert(1)</script>Windblume Festival`],
  ["style block", `<style>body{display:none}</style>Windblume`],
  ["nested tags", `<div><b>Wind<i>blume</i></b></div>`],
  ["malformed tag", `<<script>script>alert(1)</script>`],
  ["unclosed tag", `Windblume <img src=x onerror=alert(1)`],
  ["comment", `Wind<!-- <script>alert(1)</script> -->blume`],
  ["entity-encoded tag", `&lt;script&gt;alert(1)&lt;/script&gt;`],
  ["double-encoded tag", `&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;`],
  ["numeric entity tag", `&#60;script&#62;alert(1)&#60;/script&#62;`],
  ["hex entity tag", `&#x3C;script&#x3E;alert(1)&#x3C;/script&#x3E;`],
  ["fullwidth tag", `＜script＞alert(1)＜/script＞`],
  ["zero-width in entity", `&am\u200bp;lt;script&gt;`],
  ["deep entity nesting", `&#38;#38;#38;#38;#38;#38;#38;lt;script&gt;`],
  ["rtl override", `Login \u202eEvent\u202c`],
  ["bidi isolates", `\u2066Free\u2069\u2067Primogems\u2069`],
  ["control characters", `Wind\u0000blume\u0007 Fest\u001bival`],
  ["lone high surrogate", `Windblume \ud800`],
  ["lone low surrogate", `\udc00 Windblume`],
  ["out-of-range code point", `Windblume &#1114112; &#x110000;`],
  ["absurdly long", `A${"b".repeat(50_000)}`],
  ["whitespace storm", `\n\n  Wind\t\t blume  \u3000 Festival  \n`],
  ["empty", ``],
  ["only markup", `<div></div><!-- x -->`],
];

describe("sanitizeText — markup", () => {
  test("strips tags, keeping the text between them", () => {
    expect(sanitizeText(`<div><b>Wind</b>blume <i>Festival</i></div>`)).toBe(
      "Wind blume Festival",
    );
  });

  test("removes script and style content, not just the tags", () => {
    expect(sanitizeText(`<script>alert(1)</script>Windblume`)).toBe("Windblume");
    expect(sanitizeText(`<style>body{display:none}</style>Windblume`)).toBe(
      "Windblume",
    );
    expect(sanitizeText(`<iframe src="//evil.test"></iframe>Windblume`)).toBe(
      "Windblume",
    );
  });

  test("removes comments and their contents", () => {
    expect(sanitizeText(`Wind<!-- <script>alert(1)</script> -->blume`)).toBe(
      "Wind blume",
    );
  });

  test("leaves no tag-shaped substring, however malformed the input", () => {
    for (const [label, input] of HOSTILE) {
      expect(sanitizeText(input), label).not.toMatch(/<[^>]*>/);
    }
  });

  test("an unclosed tag does not swallow the rest of the string", () => {
    // The tag itself goes, but the words around it survive — a source that
    // forgets a `>` should cost us markup, not an event.
    expect(sanitizeText(`Windblume <b>Festival`)).toBe("Windblume Festival");
  });
});

describe("sanitizeText — entities", () => {
  test("decodes ordinary entities", () => {
    expect(sanitizeText(`Tea &amp; Cakes &ndash; Act&nbsp;II`)).toBe(
      "Tea & Cakes – Act II",
    );
  });

  test("an entity-encoded tag never becomes a live tag", () => {
    expect(sanitizeText(`&lt;script&gt;alert(1)&lt;/script&gt;`)).toBe("alert(1)");
  });

  test("double-encoding does not survive one decode into markup", () => {
    // The dangerous case: one decode yields `&lt;script>`, which a second
    // decoder anywhere downstream would turn into a tag. Decoding to a fixed
    // point and stripping each round means the output is inert for every later
    // reader too.
    const out = sanitizeText(`&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;`);
    expect(out).not.toContain("<");
    expect(out).not.toContain("&lt;");
    expect(sanitizeText(out)).toBe(out);
  });

  test("numeric, hex and fullwidth spellings of a tag are all neutralised", () => {
    for (const input of [
      `&#60;script&#62;alert(1)&#60;/script&#62;`,
      `&#x3C;script&#x3E;alert(1)&#x3C;/script&#x3E;`,
      `＜script＞alert(1)＜/script＞`,
    ]) {
      expect(sanitizeText(input)).not.toMatch(/<[^>]*>/);
    }
  });

  test("an out-of-range code point is left alone rather than throwing", () => {
    expect(() => sanitizeText(`&#1114112; &#x110000;`)).not.toThrow();
    expect(sanitizeText(`Windblume &#1114112;`)).toBe("Windblume &#1114112;");
  });
});

describe("sanitizeText — unicode", () => {
  test("normalises to NFKC", () => {
    // Compatibility forms are how a source spoofs a title that reads the same.
    expect(sanitizeText("Ｗｉｎｄｂｌｕｍｅ")).toBe("Windblume");
    expect(sanitizeText("éclair")).toBe("éclair");
  });

  test("strips control characters", () => {
    expect(sanitizeText("Wind\u0000blume\u0007 Fest\u001bival")).toBe(
      "Windblume Festival",
    );
  });

  test("strips zero-width characters", () => {
    expect(sanitizeText("Wind\u200bblume\u200c\u200d\ufeff")).toBe("Windblume");
  });

  test("strips bidi overrides that would spoof a title", () => {
    const spoofed = "Login \u202ednellA\u202c";
    const clean = sanitizeText(spoofed);
    expect(clean).not.toMatch(/[\u202a-\u202e\u2066-\u2069]/);
    expect(clean).toBe("Login dnellA");
  });

  test("drops unpaired surrogates but keeps real astral characters", () => {
    expect(sanitizeText("Windblume \ud800")).toBe("Windblume");
    expect(sanitizeText("\udc00 Windblume")).toBe("Windblume");
    expect(sanitizeText("Windblume 🎉")).toBe("Windblume 🎉");
  });

  test("collapses every flavour of whitespace to single spaces", () => {
    expect(sanitizeText("\n\n  Wind\t\t blume  \u3000 Festival  \n")).toBe(
      "Wind blume Festival",
    );
  });
});

describe("sanitizeText — length", () => {
  test("truncates to the cap rather than discarding the value", () => {
    const long = `Windblume ${"a".repeat(5_000)}`;
    const title = sanitizeText(long, { maxLength: LIMITS.title });
    expect(title.length).toBeLessThanOrEqual(LIMITS.title);
    expect(title.startsWith("Windblume")).toBe(true);
    expect(title.endsWith("...")).toBe(true);
  });

  test("cuts at a word boundary when there is one", () => {
    const words = "Windblume Festival Returns To Mondstadt In Full Bloom";
    expect(sanitizeText(words, { maxLength: 30 })).toBe("Windblume Festival Returns...");
  });

  test("cuts mid-word rather than losing most of a tight cap", () => {
    // With no space late enough to cut at, keeping the characters beats
    // throwing half the value away to land on a boundary.
    const words = "Windblume Festival Returns To Mondstadt In Full Bloom";
    expect(sanitizeText(words, { maxLength: 20 })).toBe("Windblume Festiva...");
  });

  test("a value at the cap is left exactly as it is", () => {
    const exact = "a".repeat(LIMITS.title);
    expect(sanitizeText(exact, { maxLength: LIMITS.title })).toBe(exact);
  });

  test("the caps match what the schema will accept", () => {
    // The schema is the single source of truth; LIMITS only mirrors it. If
    // someone widens or narrows `title`/`summary` there, this fails here.
    const ok = GachaEvent.safeParse(
      event({ title: "a".repeat(LIMITS.title), summary: "b".repeat(LIMITS.summary) }),
    );
    expect(ok.success).toBe(true);

    expect(GachaEvent.safeParse(event({ title: "a".repeat(LIMITS.title + 1) })).success).toBe(false);
    expect(GachaEvent.safeParse(event({ summary: "b".repeat(LIMITS.summary + 1) })).success).toBe(false);
  });
});

describe("sanitizeText — truncation", () => {
  // Prose, with spaces near the end: the shape that exposes the bug the
  // over-long entry in HOSTILE missed, because that one has no space in its
  // final 40% and so happened to re-cut to the identical string.
  const prose = "Windblume Festival returns to Mondstadt with games and rewards ".repeat(6);

  test("truncating twice changes nothing", () => {
    // NFKC decomposes U+2026 into three dots, so an ellipsis character appended
    // here would grow the string on the next pass and re-cut it at a different
    // word boundary — quietly rewriting a title every time it was re-ingested.
    const once = sanitizeText(prose, { maxLength: 190 });
    expect(sanitizeText(once, { maxLength: 190 })).toBe(once);
  });

  test("stays within the cap it was given", () => {
    for (const max of [12, 40, 190, LIMITS.title, LIMITS.summary]) {
      expect(sanitizeText(prose, { maxLength: max }).length).toBeLessThanOrEqual(max);
      // Astral characters truncate by code unit; the cap still holds.
      expect(sanitizeText("𝔊".repeat(400), { maxLength: max }).length).toBeLessThanOrEqual(max);
    }
  });

  test("marks the cut so a reader can see it is not the whole text", () => {
    expect(sanitizeText(prose, { maxLength: 190 })).toEndWith("...");
  });
});

describe("sanitizeText — totality", () => {
  test("is idempotent for every hostile input", () => {
    for (const [label, input] of HOSTILE) {
      const once = sanitizeText(input);
      expect(sanitizeText(once), label).toBe(once);
    }
  });

  test("never throws on junk", () => {
    for (const [label, input] of HOSTILE) {
      expect(() => sanitizeText(input), label).not.toThrow();
    }
    for (const junk of [null, undefined, 42, true, {}, [], Symbol("x")]) {
      expect(() => sanitizeText(junk)).not.toThrow();
    }
    expect(sanitizeText(null)).toBe("");
    expect(sanitizeText(undefined)).toBe("");
    expect(sanitizeText({})).toBe("");
  });
});

describe("sanitizeUrl", () => {
  test("keeps http and https", () => {
    expect(sanitizeUrl("https://game8.co/games/Genshin-Impact/archives/301601")).toBe(
      "https://game8.co/games/Genshin-Impact/archives/301601",
    );
    expect(sanitizeUrl("http://example.test/a")).toBe("http://example.test/a");
  });

  test("rejects javascript:, data: and every other scheme", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "java\tscript:alert(1)",
      "&#106;avascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "about:blank",
    ]) {
      expect(sanitizeUrl(bad), bad).toBeNull();
    }
  });

  test("rejects a URL carrying credentials", () => {
    expect(sanitizeUrl("https://user:pass@game8.co/x")).toBeNull();
  });

  test("rejects junk instead of throwing", () => {
    for (const junk of ["", "   ", "not a url", null, undefined, 42, {}]) {
      expect(() => sanitizeUrl(junk)).not.toThrow();
      expect(sanitizeUrl(junk)).toBeNull();
    }
  });

  test("resolves a relative href against the source page", () => {
    expect(sanitizeUrl("/wiki/Event", { base: "https://endfield.wiki.gg/wiki/Home" })).toBe(
      "https://endfield.wiki.gg/wiki/Event",
    );
  });

  test("a relative href cannot smuggle in another scheme via the base", () => {
    expect(
      sanitizeUrl("javascript:alert(1)", { base: "https://endfield.wiki.gg/wiki/Home" }),
    ).toBeNull();
  });
});

describe("sanitizeEvent", () => {
  test("leaves a clean event completely alone", () => {
    const clean = event({
      id: eventId("genshin", "Windblume Festival", "2026-08-12T00:00:00.000Z"),
      title: "Windblume Festival",
      summary: "A festival in Mondstadt.",
    });
    const { event: out, notes } = sanitizeEvent(clean);
    expect(out).toEqual(clean);
    expect(notes).toEqual([]);
  });

  test("never touches timestamps, precision or confidence", () => {
    const dirty = event({ title: "<b>Windblume</b>", summary: "<i>Blurb</i>" });
    const { event: out } = sanitizeEvent(dirty);
    expect(out?.startsAt).toBe(dirty.startsAt);
    expect(out?.endsAt).toBe(dirty.endsAt);
    expect(out?.startPrecision).toBe(dirty.startPrecision);
    expect(out?.endPrecision).toBe(dirty.endPrecision);
    expect(out?.confidence).toBe(dirty.confidence);
    expect(out?.regionEnds).toBe(dirty.regionEnds);
  });

  test("cleans a spoofed title and keeps the id agreeing with it", () => {
    const startsAt = "2026-08-12T00:00:00.000Z";
    const rawTitle = "Login \u202eEvent\u202c";
    const dirty = event({
      id: eventId("genshin", rawTitle, startsAt),
      title: rawTitle,
      startsAt,
    });

    // The override is what made this render as something other than its
    // characters; removing it leaves the honest text, and the id follows.
    const { event: out, notes } = sanitizeEvent(dirty, { sourceId: "source-a" });
    expect(out?.title).toBe("Login Event");
    expect(out?.id).toBe(eventId("genshin", "Login Event", startsAt));
    expect(notes.every((n) => n.level === "repaired")).toBe(true);

    // No id note here, and that is the point: `slugify` already drops
    // characters like these, so cleaning the title moved nothing a user has
    // saved state under.
    expect(notes.map((n) => n.field)).toEqual(["title"]);
  });

  test("recomputes the id when cleaning genuinely changes the slug", () => {
    const startsAt = "2026-08-12T00:00:00.000Z";
    const rawTitle = "<b>Windblume</b> Festival";
    const dirty = event({
      id: eventId("genshin", rawTitle, startsAt),
      title: rawTitle,
      startsAt,
    });

    const { event: out, notes } = sanitizeEvent(dirty);
    expect(out?.title).toBe("Windblume Festival");
    expect(out?.id).toBe("genshin:windblume-festival:2026-08-12");
    expect(notes.some((n) => n.field === "id")).toBe(true);
  });

  test("leaves an id alone when it was not minted from the title", () => {
    // Reconciliation keeps an existing id when a wiki renames an event
    // (docs/INGESTION.md § Stage 5). Sanitising must not undo that.
    const dirty = event({ id: "genshin:kept-across-a-rename:2026-08-12", title: "<b>New Name</b>" });
    const { event: out } = sanitizeEvent(dirty);
    expect(out?.title).toBe("New Name");
    expect(out?.id).toBe("genshin:kept-across-a-rename:2026-08-12");
  });

  test("truncates a hostile title instead of losing the event", () => {
    const dirty = event({ title: `Windblume ${"a".repeat(10_000)}` });
    const { event: out } = sanitizeEvent(dirty);
    expect(out).not.toBeNull();
    expect((out?.title ?? "").length).toBeLessThanOrEqual(LIMITS.title);
    expect(GachaEvent.safeParse(out).success).toBe(true);
  });

  test("an empty summary becomes null rather than an empty string", () => {
    const { event: out } = sanitizeEvent(event({ summary: "<span> </span>" }));
    expect(out?.summary).toBeNull();
  });

  test("falls back to the source's own URL when the scraped one is hostile", () => {
    const dirty = event({ sourceUrl: "javascript:alert(1)" });
    const { event: out, notes } = sanitizeEvent(dirty, {
      fallbackUrl: "https://game8.co/games/Genshin-Impact/archives/301601",
      sourceId: "genshin-game8-events",
    });
    expect(out?.sourceUrl).toBe("https://game8.co/games/Genshin-Impact/archives/301601");
    expect(notes.some((n) => n.field === "sourceUrl" && n.level === "repaired")).toBe(true);
  });

  test("drops an event only when nothing is left to publish, and says so", () => {
    const gone = event({ title: "<script>alert(1)</script>" });
    const { event: out, notes } = sanitizeEvent(gone, { sourceId: "source-a" });
    expect(out).toBeNull();
    expect(notes).toHaveLength(1);
    expect(notes[0]?.level).toBe("dropped");
    expect(notes[0]?.field).toBe("title");
    expect(notes[0]?.sourceId).toBe("source-a");
  });

  test("drops an event with no usable URL and no fallback, and says so", () => {
    const { event: out, notes } = sanitizeEvent(event({ sourceUrl: "javascript:alert(1)" }));
    expect(out).toBeNull();
    expect(notes.some((n) => n.level === "dropped" && n.field === "sourceUrl")).toBe(true);
  });

  test("output always satisfies the schema", () => {
    for (const [label, input] of HOSTILE) {
      const { event: out } = sanitizeEvent(
        event({ title: input, summary: input, sourceUrl: input }),
        { fallbackUrl: "https://example.test/a" },
      );
      if (out === null) continue;
      expect(GachaEvent.safeParse(out).success, label).toBe(true);
    }
  });
});

describe("sanitizeEvents", () => {
  test("keeps order and reports every note", () => {
    const { notes, onNote } = collector();
    const { events } = sanitizeEvents(
      [
        event({ id: "genshin:a:2026-08-12", title: "Alpha" }),
        event({ id: "genshin:b:2026-08-12", title: "<b>Beta</b>" }),
        event({ id: "genshin:c:2026-08-12", title: "Gamma" }),
      ],
      { onNote, sourceId: "source-a" },
    );

    expect(events.map((e) => e.title)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.field).toBe("title");
  });

  test("a dropped event never disappears silently", () => {
    const { notes, onNote } = collector();
    const { events } = sanitizeEvents(
      [event({ title: "Alpha" }), event({ title: "<!-- nothing -->" })],
      { onNote },
    );

    expect(events).toHaveLength(1);
    expect(notes.filter((n) => n.level === "dropped")).toHaveLength(1);
  });

  test("siblings survive a dropped event", () => {
    const { onNote } = collector();
    const { events } = sanitizeEvents(
      [event({ title: "<script>x</script>" }), event({ title: "Beta" })],
      { onNote },
    );
    expect(events.map((e) => e.title)).toEqual(["Beta"]);
  });
});

describe("the adapter seam", () => {
  /**
   * A minimal page in Game8's shape, carrying everything a hostile source could
   * put in a title. The point is not the parser — it is that `adapter.parse`
   * cannot return unsanitised events, whichever parser produced them.
   */
  const HOSTILE_PAGE = `
    <h2 class="a-header--2">Current Events</h2>
    <h3 class="a-header--3">Windblume \u202eFestival\u202c\u200b &amp; Friends</h3>
    <table class="a-table">
      <tr><th>Event Start</th><td>August 12, 2026</td></tr>
      <tr><th>Event End</th><td>August 24, 2026</td></tr>
    </table>
    <p class="a-paragraph">A blurb with &lt;script&gt;alert(1)&lt;/script&gt; in it.</p>
  `;

  test("events coming out of an adapter are already sanitised", () => {
    const adapter = adapterById("genshin-game8-events");
    if (adapter === undefined) throw new Error("no adapter");

    const events = adapter.parse(HOSTILE_PAGE, {
      now: NOW,
      sourceUrl: adapter.url,
      sourceId: adapter.id,
      game: adapter.game,
    });

    expect(events).toHaveLength(1);
    const parsed = events[0];
    expect(parsed?.title).toBe("Windblume Festival & Friends");
    expect(parsed?.title).not.toMatch(/[\u200b-\u200f\u202a-\u202e]/);
    expect(parsed?.summary ?? "").not.toMatch(/<[^>]*>/);
    expect(parsed?.sourceUrl).toBe(adapter.url);
    // Dates are the one thing sanitising must never touch.
    expect(parsed?.startsAt).toBe("2026-08-12T00:00:00.000Z");
    expect(parsed?.endsAt).toBe("2026-08-24T00:00:00.000Z");
    // The id agrees with the title the user actually sees.
    expect(parsed?.id).toBe(
      eventId("genshin", parsed?.title ?? "", parsed?.startsAt ?? ""),
    );
    expect(GachaEvent.safeParse(parsed).success).toBe(true);
  });

  /**
   * The guard that matters most.
   *
   * Event ids are localStorage keys, so sanitising must be a *no-op* on the
   * pages we actually parse — if it ever starts repairing a real title, the id
   * derived from that title can move and every completion mark saved under the
   * old one is orphaned with no server-side recovery. Running the parsers
   * directly (before the adapter seam cleans anything) and asserting zero notes
   * is what makes that visible the moment it changes.
   */
  test("real fixtures need no repair at all", async () => {
    for (const adapter of ADAPTERS) {
      const parser = parserById(adapter.parserId);
      if (parser === undefined) throw new Error(`no parser ${adapter.parserId}`);

      const pattern = `fixtures/${adapter.game}/${adapter.parserId}-*.html`;
      const file = [...new Bun.Glob(pattern).scanSync(".")].sort().at(-1);
      if (file === undefined) throw new Error(`no fixture for ${adapter.id}`);

      const html = await Bun.file(file).text();
      const raw = parser.parse(html, {
        now: NOW,
        sourceUrl: adapter.url,
        sourceId: adapter.id,
        game: adapter.game,
      });

      const { notes, events } = sanitizeEvents(raw, {
        sourceId: adapter.id,
        fallbackUrl: adapter.url,
        onNote: () => {},
      });

      expect(notes.map((n) => `${n.field}: ${n.message}`), adapter.id).toEqual([]);
      expect(events.map((e) => e.id), adapter.id).toEqual(raw.map((e) => e.id));
    }
  });
});
