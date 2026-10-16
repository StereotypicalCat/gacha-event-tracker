import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { adapterById } from "../../src/ingest/adapters/index.ts";
import { PARSERS } from "../../src/ingest/parsers/index.ts";
import { fandomTableParser } from "../../src/ingest/parsers/fandomTable.ts";
import {
  fandomVersionParser,
  VERSION_PASSES,
} from "../../src/ingest/parsers/versionTable.ts";

const FIXTURE = "fixtures/nikki/fandom-mira-journey-2026-10-16.html";
const SOURCE_ID = "nikki-fandom-mira-journey";

function ctx(now: string, sourceId = SOURCE_ID) {
  const a = adapterById(SOURCE_ID)!;
  return { now, sourceUrl: a.url, sourceId, game: a.game };
}

/** A minimal `action=parse` body holding one version table. */
function body(rows: Array<[string, string, string, string]>, headings = HEAD) {
  const th = headings.split(" | ").map((h) => `<th>${h}</th>`).join("");
  const tr = rows
    .map(([n, v, s, e]) => `<tr><td>${n}</td><td>${v}</td><td>${s}</td><td>${e}</td><td>x Days</td></tr>`)
    .join("");
  return JSON.stringify({ parse: { title: "T", text: `<table><tr>${th}</tr>${tr}</table>` } });
}
const HEAD = "Version Name | Version Number | Release Date | End Date | Duration";

describe("fandomversion parser", () => {
  const html = Bun.file(FIXTURE).text();

  test("the page has 25 version rows and 1 not yet ended (independent count)", async () => {
    const page = await html;
    // Counted off the raw markup, not through the parser: `Duration` cells
    // are `<n> Days` and exist once per data row.
    const rows = (page.match(/\d+ Days/g) ?? []).length;
    expect(rows).toBe(25);
    // A clock before the first row: every row parses.
    const all = fandomVersionParser.parse(page, ctx("2020-01-01T00:00:00.000Z"));
    expect(all).toHaveLength(25);
    expect(new Set(all.map((e) => e.id)).size).toBe(25);
    // Only 2.10 (to October 29) has not ended on 2026-10-16.
    const now = fandomVersionParser.parse(page, ctx("2026-10-16T00:00:00.000Z"));
    expect(now.map((e) => [e.title, e.startsAt, e.endsAt])).toEqual([
      ["Mira Journey", "2026-09-23T00:00:00.000Z", "2026-10-29T00:00:00.000Z"],
    ]);
  });

  test("the summary names the version and the in-game confirmation", async () => {
    const [e] = fandomVersionParser.parse(await html, ctx("2026-10-16T00:00:00.000Z"));
    expect(e?.summary).toBe(
      "Follows version 2.10 (The Feather of Justice). That the pass ends with the version was confirmed in game, 2026-10-16.",
    );
    expect(e?.startPrecision).toBe("day");
    expect(e?.endPrecision).toBe("day");
    expect(e?.type).toBe("other");
  });

  test("after 2026-10-29 the 2.10 row is gone", async () => {
    expect(fandomVersionParser.parse(await html, ctx("2026-10-30T00:00:00.000Z"))).toEqual([]);
  });

  test("the row stays on its last day", async () => {
    expect(
      fandomVersionParser.parse(await html, ctx("2026-10-29T05:00:00.000Z")),
    ).toHaveLength(1);
  });

  test("a row without a readable end is skipped, not given one", () => {
    const events = fandomVersionParser.parse(
      body([
        ["A", "3.0", "September 1, 2026", "TBA"],
        ["B", "3.1", "September 1, 2026", ""],
        ["C", "3.2", "September 1, 2026", "October 12, 2026"],
      ]),
      ctx("2026-09-10T00:00:00.000Z"),
    );
    expect(events.map((e) => e.endsAt)).toEqual(["2026-10-12T00:00:00.000Z"]);
  });

  test("a source id with no entry emits nothing", () => {
    const b = body([["A", "3.0", "September 1, 2026", "October 12, 2026"]]);
    expect(fandomVersionParser.parse(b, ctx("2026-09-10T00:00:00.000Z"))).toHaveLength(1);
    expect(fandomVersionParser.parse(b, ctx("2026-09-10T00:00:00.000Z", "x-unknown"))).toEqual([]);
  });

  test("every entry carries its evidence and is a registered source on this parser", () => {
    for (const [id, pass] of Object.entries(VERSION_PASSES)) {
      expect(adapterById(id)?.parserId).toBe("fandomversion");
      expect(pass.evidence.reading.length).toBeGreaterThan(0);
      expect(pass.evidence.on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test("the two Fandom table readers do not claim each other's tables", () => {
    const version = body([], HEAD);
    const history = body([], "Image | Name | Start | End | Version");
    expect(fandomVersionParser.canParse(version)).toBe(true);
    expect(fandomTableParser.canParse(version)).toBe(false);
    expect(fandomVersionParser.canParse(history)).toBe(false);
    expect(fandomTableParser.canParse(history)).toBe(true);
    // A table with Duration but without version headings is neither.
    const other = body([], "Name | Start | End | Duration");
    expect(fandomVersionParser.canParse(other)).toBe(false);
    expect(fandomTableParser.canParse(other)).toBe(false);
  });
});

describe("fandomversion canParse across every fixture", () => {
  const files = [...new Glob("fixtures/**/*.html").scanSync(".")].sort();

  test("true on the Mira Journey fixture only", async () => {
    const accepted: string[] = [];
    for (const f of files) {
      if (fandomVersionParser.canParse(await Bun.file(f).text())) accepted.push(f);
    }
    expect(accepted).toEqual([FIXTURE]);
  });

  test("no other parser claims the Version page, and fandomtable stays off it", async () => {
    const text = await Bun.file(FIXTURE).text();
    expect(PARSERS.filter((p) => p.canParse(text)).map((p) => p.id)).toEqual(["fandomversion"]);
  });
});
