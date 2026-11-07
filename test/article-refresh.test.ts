import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refreshArticles } from "../scripts/refresh-articles.ts";
import { runRefresh, type RefreshOptions, type RobotsGate } from "../scripts/refresh-sources.ts";
import type { Adapter, ParseContext } from "../src/ingest/adapters/types.ts";
import { articleDue, articleFileName, ArticleStore, type ArticleMeta } from "../src/ingest/articleStore.ts";
import { SnapshotStore } from "../src/ingest/snapshots.ts";
import type { GachaEvent } from "../src/shared/schema.ts";

const NOW = new Date("2026-11-07T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const TITLE = "Hour_of_Ruin_(Event)";
const WITH_TIME = await Bun.file("fixtures/genshin/articles/hour-of-ruin-2026-11-07.html").text();
const NO_TIME = JSON.stringify({ parse: { text: "<p>A stub.</p>" } });
const MISSING = JSON.stringify({ error: { code: "missingtitle", info: "The page does not exist." } });

let root: string;
let articles: ArticleStore;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "event-clock-articles-"));
  articles = new ArticleStore(root);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const ALLOW_ALL: RobotsGate = { allows: async () => ({ allowed: true, reason: "ok" }) };

interface Call { url: string; userAgent: string | undefined }

function run(
  respond: () => Response | Promise<Response>,
  over: Partial<Parameters<typeof refreshArticles>[0]> = {},
) {
  const calls: Call[] = [];
  const naps: number[] = [];
  const logs: string[] = [];
  const done = refreshArticles({
    titles: [TITLE],
    store: articles,
    robots: ALLOW_ALL,
    fetchImpl: async (url, init) => {
      calls.push({ url, userAgent: (init?.headers as Record<string, string>)["User-Agent"] });
      return respond();
    },
    userAgent: "test-agent",
    now: () => NOW,
    sleep: async (ms) => void naps.push(ms),
    dryRun: false,
    timeoutMs: 1000,
    log: (l) => void logs.push(l),
    requestedHosts: new Set(),
    assumedRobots: new Set(),
    ...over,
  });
  return { done, calls, naps, logs };
}

const meta = (over: Partial<ArticleMeta>): ArticleMeta => ({
  title: TITLE,
  lastAttemptAt: ago(30 * 24 * HOUR),
  lastReadAt: ago(30 * 24 * HOUR),
  statesTime: true,
  ...over,
});
const at = NOW.getTime();

test("due: never read", () => {
  expect(articleDue(null, at)).toBe(true);
});

test("due: no time found, only after 6 hours", () => {
  const m = (h: number) => meta({ lastAttemptAt: ago(h * HOUR), lastReadAt: ago(h * HOUR), statesTime: false });
  expect(articleDue(m(5.9), at)).toBe(false);
  expect(articleDue(m(6), at)).toBe(true);
});

test("due: time found, only 7 days after the last read that worked", () => {
  const m = (d: number) => meta({ lastAttemptAt: ago(d * 24 * HOUR), lastReadAt: ago(d * 24 * HOUR) });
  expect(articleDue(m(6.9), at)).toBe(false);
  expect(articleDue(m(7), at)).toBe(true);
});

test("due: a failed attempt inside 6 hours is not due, even past 7 days", () => {
  expect(articleDue(meta({ lastAttemptAt: ago(1 * HOUR) }), at)).toBe(false);
  expect(articleDue(meta({ lastAttemptAt: ago(6 * HOUR) }), at)).toBe(true);
});

test("a percent-decoded title gets one stable file name that keeps titles apart", () => {
  const name = articleFileName("The_Forge_Realm's_Temper/2026-11-04");
  expect(name).toMatch(/^[A-Za-z0-9._-]+$/);
  expect(name).toBe(articleFileName("The_Forge_Realm's_Temper/2026-11-04"));
  expect(articleFileName("a/b")).not.toBe(articleFileName("a:b"));
});

test("a first read stores the article and its end", async () => {
  const { done } = run(() => new Response(WITH_TIME));
  expect((await done).changed).toBe(1);
  expect((await articles.readEnds()).get(TITLE)?.day).toBe("2026-12-15");
  expect(await articles.readMeta(TITLE)).toEqual({
    title: TITLE,
    lastAttemptAt: NOW.toISOString(),
    lastReadAt: NOW.toISOString(),
    statesTime: true,
  });
});

/** A stored article whose 7-day re-read is due now. */
async function dueArticle() {
  await articles.saveRead(TITLE, WITH_TIME, ago(8 * 24 * HOUR));
}

async function expectKept(result: { changed: number; warnings: string[] }) {
  expect(result.changed).toBe(0);
  expect(result.warnings.length).toBe(1);
  expect(await articles.readBody(TITLE)).toBe(WITH_TIME);
  expect((await articles.readEnds()).has(TITLE)).toBe(true);
  const m = await articles.readMeta(TITLE);
  expect(m?.lastReadAt).toBe(ago(8 * 24 * HOUR));
  expect(m?.lastAttemptAt).toBe(NOW.toISOString());
}

test.each([500, 403, 202, 404])("HTTP %i keeps the body and the time, and warns", async (status) => {
  await dueArticle();
  await expectKept(await run(() => new Response("nope", { status })).done);
});

test("a network error keeps the body and the time, and warns", async () => {
  await dueArticle();
  await expectKept(await run(() => { throw new Error("reset"); }).done);
});

test("a body that fails mid-read keeps the body and the time, and warns", async () => {
  await dueArticle();
  await expectKept(await run(() => ({
    status: 200,
    arrayBuffer: () => Promise.reject(new Error("truncated")),
    text: () => Promise.reject(new Error("truncated")),
  }) as unknown as Response).done);
});

test("a 200 that is not the API's answer keeps the body and the time, and warns", async () => {
  await dueArticle();
  await expectKept(await run(() => new Response("<html>Just a moment…</html>")).done);
});

test("a 200 API error other than a missing page keeps the body and the time", async () => {
  await dueArticle();
  await expectKept(await run(() => new Response(JSON.stringify({ error: { code: "ratelimited" } }))).done);
});

test("robots refusal makes no request, keeps the body, and warns", async () => {
  await dueArticle();
  const robots: RobotsGate = { allows: async () => ({ allowed: false, reason: "disallowed" }) };
  const { done, calls } = run(() => new Response(WITH_TIME), { robots });
  await expectKept(await done);
  expect(calls.length).toBe(0);
});

test("a missingtitle API error removes the stored article and warns", async () => {
  await dueArticle();
  const result = await run(() => new Response(MISSING)).done;
  expect(result.changed).toBe(1);
  expect(result.warnings.length).toBe(1);
  expect(await articles.readBody(TITLE)).toBeNull();
  expect((await articles.readEnds()).has(TITLE)).toBe(false);
});

test("a removed article still honours the 6-hour floor", async () => {
  await dueArticle();
  await run(() => new Response(MISSING)).done;
  const { done, calls } = run(() => new Response(WITH_TIME));
  await done;
  expect(calls.length).toBe(0);
});

test("a 200 with no usable End overwrites the body, sets statesTime false, and logs without warning", async () => {
  await dueArticle();
  const { done, logs } = run(() => new Response(NO_TIME));
  const result = await done;
  expect(result.changed).toBe(1);
  expect(result.warnings).toEqual([]);
  expect(logs.join("\n")).toContain(TITLE);
  expect(await articles.readBody(TITLE)).toBe(NO_TIME);
  expect((await articles.readMeta(TITLE))?.statesTime).toBe(false);
  expect((await articles.readEnds()).has(TITLE)).toBe(false);
});

test("an unchanged re-read moves lastReadAt but changes no bytes", async () => {
  await dueArticle();
  const result = await run(() => new Response(WITH_TIME)).done;
  expect(result.changed).toBe(0);
  expect((await articles.readMeta(TITLE))?.lastReadAt).toBe(NOW.toISOString());
});

test("an article not yet due makes no request", async () => {
  await articles.saveRead(TITLE, WITH_TIME, ago(24 * HOUR));
  const { done, calls } = run(() => new Response(WITH_TIME));
  await done;
  expect(calls.length).toBe(0);
});

test("the requested URL carries the decoded title, section=0, and the runner User-Agent", async () => {
  const title = "The_Forge_Realm's_Temper/2026-11-04";
  const { done, calls } = run(() => new Response(WITH_TIME), { titles: [title] });
  await done;
  const url = new URL(calls[0]!.url);
  expect(url.host).toBe("genshin-impact.fandom.com");
  expect(url.pathname).toBe("/api.php");
  expect(url.searchParams.get("page")).toBe(title);
  expect(url.searchParams.get("action")).toBe("parse");
  expect(url.searchParams.get("prop")).toBe("text");
  expect(url.searchParams.get("section")).toBe("0");
  expect(calls[0]!.userAgent).toBe("test-agent");
});

test("the same title twice is one request", async () => {
  const { done, calls } = run(() => new Response(WITH_TIME), { titles: [TITLE, TITLE] });
  await done;
  expect(calls.length).toBe(1);
});

test("per-host spacing applies when the host was already asked this cycle", async () => {
  const { done, naps } = run(() => new Response(WITH_TIME), {
    titles: ["A", "B"],
    requestedHosts: new Set(["genshin-impact.fandom.com"]),
  });
  await done;
  expect(naps).toEqual([2000, 2000]);
});

test("a dry run requests and writes nothing", async () => {
  await articles.saveRead("Old", NO_TIME, ago(24 * HOUR));
  const { done, calls, logs } = run(() => new Response(WITH_TIME), { dryRun: true });
  expect((await done).changed).toBe(0);
  expect(calls.length).toBe(0);
  expect(await articles.readBody(TITLE)).toBeNull();
  expect(await articles.readBody("Old")).toBe(NO_TIME);
  expect(logs.join("\n")).toContain(TITLE);
});

test("a stored article no longer listed is removed", async () => {
  await articles.saveRead("Old", WITH_TIME, ago(24 * HOUR));
  const result = await run(() => new Response(WITH_TIME)).done;
  expect(await articles.listed()).toEqual([TITLE]);
  expect(result.changed).toBe(2);
});

test("no listed titles removes nothing", async () => {
  await articles.saveRead("Old", WITH_TIME, ago(24 * HOUR));
  expect((await run(() => new Response(WITH_TIME), { titles: [] }).done).changed).toBe(0);
  expect(await articles.listed()).toEqual(["Old"]);
});

test("no directory reads as no ends", async () => {
  expect((await articles.readEnds()).size).toBe(0);
  expect(await articles.listed()).toEqual([]);
});

// Through the runner. The stand-in parser reads `<row>url</row>` as listed rows.
const FANDOM_ID = "genshin-fandom-events";
function fandomAdapter(): Adapter {
  return {
    id: FANDOM_ID,
    game: "genshin",
    url: "https://genshin-impact.fandom.com/api.php?action=parse&page=Event",
    parserId: "fandom",
    minIntervalMs: 6 * HOUR,
    priority: 0,
    parse(html: string, _ctx: ParseContext): GachaEvent[] {
      return [...html.matchAll(/<row>(.*?)<\/row>/g)].map((m) => ({ sourceUrl: m[1] }) as GachaEvent);
    },
  };
}
const ROW = `https://genshin-impact.fandom.com/wiki/${TITLE}`;

function runner(page: string, respondArticle: () => Response, over: Partial<RefreshOptions> = {}) {
  const urls: string[] = [];
  const rebuilds = { count: 0 };
  const store = new SnapshotStore(root);
  const opts: RefreshOptions = {
    adapters: [fandomAdapter()],
    store,
    robots: ALLOW_ALL,
    fetchImpl: async (url) => {
      urls.push(url);
      return url.includes("page=Event") ? new Response(page) : respondArticle();
    },
    userAgent: "test-agent",
    now: () => NOW,
    sleep: async () => {},
    dryRun: false,
    only: null,
    force: false,
    timeoutMs: 1000,
    log: () => {},
    rebuildFeed: async () => {
      rebuilds.count += 1;
    },
    articleSourceId: FANDOM_ID,
    ...over,
  };
  return { opts, urls, rebuilds, store };
}

test("article reads run only with articleSourceId set; existing callers are unaffected", async () => {
  const { opts, urls } = runner(`<row>${ROW}</row>`, () => new Response(WITH_TIME));
  const { articleSourceId: _omit, ...without } = opts;
  await runRefresh(without);
  expect(urls.length).toBe(1);
});

test("a listed row's article is read and stored", async () => {
  const { opts, urls } = runner(`<row>${ROW}</row>`, () => new Response(WITH_TIME));
  const summary = await runRefresh(opts);
  expect(urls.length).toBe(2);
  expect(summary.articlesChanged).toBe(1);
  expect((await articles.readEnds()).has(TITLE)).toBe(true);
});

test("a row with no article link makes no article request", async () => {
  const { opts, urls } = runner(`<row>${fandomAdapter().url}</row>`, () => new Response(WITH_TIME));
  await runRefresh(opts);
  expect(urls.length).toBe(1);
});

test("articles are read when --only names another source not at all", async () => {
  const other: Adapter = { ...fandomAdapter(), id: "other", url: "https://example.test/x" };
  const { opts, urls } = runner(`<row>${ROW}</row>`, () => new Response(WITH_TIME), {
    adapters: [fandomAdapter(), other],
    only: "other",
  });
  await runRefresh(opts);
  expect(urls.some((u) => u.includes("Hour_of_Ruin"))).toBe(false);
});

test("an empty source snapshot removes nothing and does not throw", async () => {
  await articles.saveRead("Old", WITH_TIME, ago(24 * HOUR));
  const { opts, store } = runner("<html></html>", () => new Response(WITH_TIME));
  await store.save(FANDOM_ID, {
    url: opts.adapters[0]!.url, body: "<html></html>", etag: null, lastModified: null, at: ago(24 * HOUR), eventCount: 0,
  });
  const summary = await runRefresh({ ...opts, fetchImpl: async () => new Response("", { status: 304 }) });
  expect(summary.hardFailure).toBeNull();
  expect(await articles.listed()).toEqual(["Old"]);
});

test("article failures leave broken, hardFailure and the source's streak untouched", async () => {
  const { opts, store } = runner(`<row>${ROW}</row>`, () => new Response("no", { status: 500 }));
  const summary = await runRefresh(opts);
  expect(summary.hardFailure).toBeNull();
  expect(summary.broken).toEqual([]);
  expect(summary.warnings.some((w) => w.includes(TITLE))).toBe(true);
  expect((await store.readState(FANDOM_ID)).consecutiveFailures).toBe(0);
});

test("a parser that throws on the snapshot is one warning, not a failed run", async () => {
  const adapter: Adapter = {
    ...fandomAdapter(),
    parse: (html) => {
      if (html.includes("<boom>")) throw new Error("template");
      return [{ sourceUrl: ROW } as GachaEvent];
    },
  };
  const { opts, store } = runner("<row>x</row>", () => new Response(WITH_TIME), { adapters: [adapter] });
  await store.save(FANDOM_ID, {
    url: adapter.url, body: "<boom>", etag: null, lastModified: null, at: ago(24 * HOUR), eventCount: 1,
  });
  const skipFetch = { ...opts, fetchImpl: async () => new Response("", { status: 304 }) };
  const summary = await runRefresh(skipFetch);
  expect(summary.hardFailure).toBeNull();
  expect(summary.warnings.some((w) => w.includes("article"))).toBe(true);
});

test("a changed article triggers the rebuild even when no source page changed", async () => {
  const page = `<row>${ROW}</row>`;
  const { opts, rebuilds, store } = runner(page, () => new Response(WITH_TIME));
  await store.save(FANDOM_ID, {
    url: opts.adapters[0]!.url, body: page, etag: null, lastModified: null, at: ago(24 * HOUR), eventCount: 1,
  });
  const summary = await runRefresh(opts);
  expect(summary.changed).toBe(0);
  expect(summary.articlesChanged).toBe(1);
  expect(rebuilds.count).toBe(1);
});

test("a row kept alive by its stated end stays listed, so its article is not removed", async () => {
  // On a row's last day the parser only emits it because of the stored end. Read
  // the table without those ends and the article looks unlisted and gets deleted,
  // and the row vanishes from the feed hours early.
  await articles.saveRead(TITLE, WITH_TIME, ago(24 * HOUR));
  const adapter: Adapter = {
    ...fandomAdapter(),
    parse: (_html, ctx) => (ctx.articleEnds?.has(TITLE) ? [{ sourceUrl: ROW } as GachaEvent] : []),
  };
  const { opts } = runner("<html></html>", () => new Response(WITH_TIME), { adapters: [adapter] });
  await opts.store.save(FANDOM_ID, {
    url: adapter.url, body: "<row>", etag: null, lastModified: null, at: ago(24 * HOUR), eventCount: 1,
  });
  await articles.saveRead("Old", WITH_TIME, ago(24 * HOUR));
  await runRefresh({ ...opts, fetchImpl: async () => new Response("", { status: 304 }) });
  expect(await articles.listed()).toEqual([TITLE]);
});

test("an article read on an assumed robots permission names the host, even when the page was skipped", async () => {
  // AGENTS.md § Scraping conduct: that warning must not become conditional.
  const page = `<row>${ROW}</row>`;
  const robots: RobotsGate = {
    allows: async () => ({ allowed: true, reason: "assumed", assumedOnForbidden: true }),
  };
  const { opts, store } = runner(page, () => new Response(WITH_TIME), { robots });
  await store.save(FANDOM_ID, {
    url: opts.adapters[0]!.url, body: page, etag: null, lastModified: null, at: NOW.toISOString(), eventCount: 1,
  });
  await store.recordCheck(FANDOM_ID, { at: NOW.toISOString(), status: 200, ok: true });
  const summary = await runRefresh(opts);
  expect(summary.outcomes[0]?.result).toBe("skipped_interval");
  expect(summary.articlesChanged).toBe(1);
  expect(summary.assumedRobots).toEqual(["genshin-impact.fandom.com"]);
});
