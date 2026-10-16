import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { adapterById } from "../../src/ingest/adapters/index.ts";
import { PARSERS } from "../../src/ingest/parsers/index.ts";
import {
  fandomTableParser,
  PASS_SOURCES,
} from "../../src/ingest/parsers/fandomTable.ts";

const FIXTURE = "fixtures/hsr/fandom-nameless-honor-2026-10-16.html";
const SOURCE_ID = "hsr-fandom-nameless-honor";

function ctx(now: string, sourceId = SOURCE_ID) {
  const a = adapterById(SOURCE_ID)!;
  return { now, sourceUrl: a.url, sourceId, game: a.game };
}

/** A minimal `action=parse` body holding one pass table. */
function body(rows: Array<[string, string, string]>, headings = "Name | Start | End") {
  const th = headings.split(" | ").map((h) => `<th>${h}</th>`).join("");
  const tr = rows
    .map(([n, s, e]) => `<tr><td>${n}</td><td>${s}</td><td>${e}</td></tr>`)
    .join("");
  return JSON.stringify({
    parse: { title: "T", text: `<table><tr>${th}</tr>${tr}</table>` },
  });
}

describe("fandomtable parser", () => {
  const html = Bun.file(FIXTURE).text();

  test("reads every row of the page's table (31, an independent count)", async () => {
    // Early enough that no row has ended: all 31 `<tr>` data rows must parse.
    const events = fandomTableParser.parse(await html, ctx("2020-01-01T00:00:00.000Z"));
    expect(events).toHaveLength(31);
    expect(new Set(events.map((e) => e.id)).size).toBe(31);
  });

  test("current and upcoming rows only: past rows are absent", async () => {
    const events = fandomTableParser.parse(await html, ctx("2026-10-16T00:00:00.000Z"));
    expect(events.map((e) => [e.title, e.startsAt, e.endsAt])).toEqual([
      ["Nameless Honor", "2026-09-28T00:00:00.000Z", "2026-11-09T00:00:00.000Z"],
    ]);
    // Earlier clock: the live row, the one that follows it, and 4.6 upcoming.
    const earlier = fandomTableParser.parse(await html, ctx("2026-08-14T00:00:00.000Z"));
    expect(earlier.map((e) => e.startsAt.slice(0, 10))).toEqual([
      "2026-07-15",
      "2026-08-26",
      "2026-09-28",
    ]);
  });

  test("a row stays on its last day: the placeholder midnight is not the end", async () => {
    const events = fandomTableParser.parse(await html, ctx("2026-11-09T05:00:00.000Z"));
    expect(events).toHaveLength(1);
  });

  test("day precision, never a clock the page did not state", async () => {
    for (const e of fandomTableParser.parse(await html, ctx("2020-01-01T00:00:00.000Z"))) {
      expect(e.startPrecision).toBe("day");
      expect(e.endPrecision).toBe("day");
      expect(e.type).toBe("other");
      expect(e.startsAt.endsWith("T00:00:00.000Z")).toBe(true);
    }
  });

  test("a row without a readable end is skipped, not given one", () => {
    const events = fandomTableParser.parse(
      body([
        ["A", "September 1, 2026", "TBA"],
        ["B", "September 1, 2026", ""],
        ["C", "September 1, 2026", "October 6"],
        ["D", "September 1, 2026", "October 12, 2026"],
      ]),
      ctx("2026-09-10T00:00:00.000Z"),
    );
    expect(events.map((e) => e.endsAt)).toEqual(["2026-10-12T00:00:00.000Z"]);
  });

  test("a source id with no title entry emits nothing", () => {
    const b = body([["A", "September 1, 2026", "October 12, 2026"]]);
    expect(fandomTableParser.parse(b, ctx("2026-09-10T00:00:00.000Z"))).toHaveLength(1);
    expect(fandomTableParser.parse(b, ctx("2026-09-10T00:00:00.000Z", "x-unknown"))).toEqual([]);
  });

  test("every PASS_SOURCES key is a registered source on this parser", () => {
    for (const id of Object.keys(PASS_SOURCES)) {
      expect(adapterById(id)?.parserId).toBe("fandomtable");
    }
  });

  test("non-API bodies are refused rather than read as empty", () => {
    expect(fandomTableParser.canParse("<html><table></table></html>")).toBe(false);
    expect(fandomTableParser.canParse('{"error":{"code":"missingtitle"}}')).toBe(false);
  });

  test("a table with a Duration column (a version table) is not this template", () => {
    expect(
      fandomTableParser.canParse(
        body([], "Name | Version | Start | End | Duration"),
      ),
    ).toBe(false);
    expect(fandomTableParser.canParse(body([], "Image | Name | Start | End | Version"))).toBe(true);
  });
});

describe("fandomtable canParse across every fixture", () => {
  const files = [...new Glob("fixtures/**/*.html").scanSync(".")].sort();

  test("there are fixtures to check", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  test("true on the two pass-history fixtures only", async () => {
    const accepted: string[] = [];
    for (const f of files) {
      if (fandomTableParser.canParse(await Bun.file(f).text())) accepted.push(f);
    }
    expect(accepted).toEqual([
      "fixtures/genshin/fandom-miliastra-pass-2026-10-16.html",
      FIXTURE,
    ]);
  });

  test("no other parser claims a pass-history fixture", async () => {
    for (const f of [
      FIXTURE,
      "fixtures/genshin/fandom-miliastra-pass-2026-10-16.html",
    ]) {
      const text = await Bun.file(f).text();
      const claimants = PARSERS.filter((p) => p.canParse(text)).map((p) => p.id);
      expect(claimants).toEqual(["fandomtable"]);
    }
  });
});
