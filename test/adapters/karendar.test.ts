import { describe, expect, test } from "bun:test";
import { adapterById } from "../../src/ingest/adapters/index.ts";
import { karendarParser } from "../../src/ingest/parsers/karendar.ts";

const FIXTURE = "fixtures/pgr/karendar-events-2026-09-12.html";
const NOW = "2026-09-12T00:00:00.000Z";

const pgr = adapterById("pgr-karendar-events");
if (pgr === undefined) throw new Error("no adapter 'pgr-karendar-events'");

function parse(html: string) {
  return pgr!.parse(html, {
    now: NOW,
    sourceUrl: pgr!.url,
    sourceId: pgr!.id,
    game: pgr!.game,
  });
}

describe("Karendar parser (Punishing: Gray Raven)", () => {
  test("structural detector recognises Karendar pages and rejects others", () => {
    expect(
      karendarParser.canParse(
        '<main><section id="ongoing"></section><section id="upcoming"></section><footer>Karendar</footer></main>',
      ),
    ).toBe(true);
    expect(karendarParser.canParse("<html><body>Different site</body></html>")).toBe(
      false,
    );
    expect(
      karendarParser.canParse(
        '<main><section id="ongoing"></section><footer>Karendar</footer></main>',
      ),
    ).toBe(false);
  });

  test("publishes exact UTC timestamps with exact precision", async () => {
    const html = await Bun.file(FIXTURE).text();
    const events = parse(html);

    // War Zone (weekly recurring combat)
    const warZone = events.find((e) => e.title === "War Zone");
    expect(warZone).toBeDefined();
    expect(warZone?.startsAt).toBe("2026-09-07T07:00:00.000Z");
    expect(warZone?.endsAt).toBe("2026-09-13T18:00:00.000Z");
    expect(warZone?.startPrecision).toBe("exact");
    expect(warZone?.endPrecision).toBe("exact");
    expect(warZone?.regionScoped).toBe(false);
    expect(warZone?.regionEnds).toBeNull();
  });

  test("handles indefinite and permanent ends as endsAt null with precision unknown", async () => {
    const html = await Bun.file(FIXTURE).text();
    const events = parse(html);

    // Main Story: Steering By Light (Permanent)
    const story = events.find(
      (e) => e.title === "Main Story: Steering By Light",
    );
    expect(story).toBeDefined();
    expect(story?.startsAt).toBe("2026-08-20T05:00:00.000Z");
    expect(story?.endsAt).toBeNull();
    expect(story?.endPrecision).toBe("unknown");

    // Upcoming banner with unannounced end date
    const adelyde = events.find((e) =>
      e.title.includes("Adelyde: Anabasis"),
    );
    expect(adelyde).toBeDefined();
    expect(adelyde?.startsAt).toBe("2026-09-24T05:00:00.000Z");
    expect(adelyde?.endsAt).toBeNull();
    expect(adelyde?.endPrecision).toBe("unknown");
  });

  test("skips archive (ended), tbc (unknown start), and codes sections", async () => {
    const html = await Bun.file(FIXTURE).text();
    const events = parse(html);

    // In archive:
    expect(
      events.some((e) => e.title.includes("Version Maintenance – Steering By Light")),
    ).toBe(false);
    expect(
      events.some((e) => e.title.includes("One Heart, One Hertz Concert")),
    ).toBe(false);

    // In TBC:
    expect(events.some((e) => e.title === "Circuit Calculus")).toBe(false);
    expect(events.some((e) => e.title === "Wreck-It Huhu")).toBe(false);

    // In codes:
    expect(events.some((e) => e.title.includes("PUNISHING0924"))).toBe(false);
  });

  test("spot-checks specific events matching live page content", async () => {
    const html = await Bun.file(FIXTURE).text();
    const events = parse(html);

    // 1. Karenina: Effulgence character debut banner
    const karenina = events.find((e) => e.title === "Karenina: Effulgence");
    expect(karenina).toBeDefined();
    expect(karenina?.type).toBe("banner");
    expect(karenina?.startsAt).toBe("2026-08-20T05:00:00.000Z");
    expect(karenina?.endsAt).toBe("2026-09-23T23:00:00.000Z");

    // 2. Patch End Maintenance
    const maint = events.find(
      (e) => e.title === "Patch End Maintenance",
    );
    expect(maint).toBeDefined();
    expect(maint?.type).toBe("maintenance");
    expect(maint?.startsAt).toBe("2026-09-23T23:00:00.000Z");
    expect(maint?.endsAt).toBe("2026-09-24T05:00:00.000Z");

    // 3. Collab banner: PGR x Date A Live V
    const collab = events.find((e) =>
      e.title.includes("PGR × Date A Live V – Kurumi Tokisaki"),
    );
    expect(collab).toBeDefined();
    expect(collab?.type).toBe("banner");
    expect(collab?.startsAt).toBe("2026-09-29T05:00:00.000Z");
    expect(collab?.endsAt).toBeNull();
    expect(collab?.endPrecision).toBe("unknown");

    // 4. Overclock Simulation
    const overclock = events.find((e) => e.title === "Overclock Simulation");
    expect(overclock).toBeDefined();
    expect(overclock?.type).toBe("challenge");
    expect(overclock?.startsAt).toBe("2026-09-29T10:00:00.000Z");
    expect(overclock?.endsAt).toBe("2026-11-04T05:00:00.000Z");
  });
});
