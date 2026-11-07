/**
 * Keep Genshin event articles beside the snapshots (spec decisions 5, 6 and 12).
 *
 * Nothing here can fail a refresh or touch a source's failure streak: an article
 * only ever improves a row, and a row without one is exactly what it was. What a
 * failed read does to a time already held depends on what the wiki actually said.
 */
import { parseArticleEnd } from "../src/ingest/articleEnds.ts";
import { articleDue, type ArticleStore } from "../src/ingest/articleStore.ts";
import type { FetchLike } from "../src/ingest/robots.ts";
import type { RobotsGate } from "./refresh-sources.ts";

const HOST = "genshin-impact.fandom.com";
const DEFAULT_HOST_GAP_MS = 2_000;

export interface RefreshArticlesInput {
  titles: readonly string[];
  store: ArticleStore;
  robots: RobotsGate;
  fetchImpl: FetchLike;
  userAgent: string;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  dryRun: boolean;
  timeoutMs: number;
  log: (line: string) => void;
  /** Shared with the source loop, which has usually asked this host already. */
  requestedHosts: Set<string>;
  /**
   * Hosts fetched on a recorded robots permission, shared with the source loop.
   * The page may have been skipped this cycle while an article is still read, and
   * that warning must not become conditional (AGENTS.md § Scraping conduct).
   */
  assumedRobots: Set<string>;
}

export function articleUrl(title: string): string {
  return (
    `https://${HOST}/api.php?action=parse&page=${encodeURIComponent(title)}` +
    "&prop=text&section=0&formatversion=2&format=json"
  );
}

/**
 * A 200 is not yet an answer: a challenge page is a 200 too, and reading one as
 * "the article states no time" would throw away a good time on a passing blip.
 */
function answerOf(body: string): "article" | "gone" | "unusable" {
  try {
    const parsed = JSON.parse(body) as {
      parse?: { text?: unknown };
      error?: { code?: unknown };
    } | null;
    if (typeof parsed?.parse?.text === "string") return "article";
    if (parsed?.error?.code === "missingtitle") return "gone";
  } catch {
    // Not JSON, so not the API's answer.
  }
  return "unusable";
}

export async function refreshArticles(
  input: RefreshArticlesInput,
): Promise<{ changed: number; warnings: string[] }> {
  const { store, log } = input;
  const titles = [...new Set(input.titles)];
  const nowIso = input.now().toISOString();
  const nowMs = input.now().getTime();
  const warnings: string[] = [];
  let changed = 0;

  for (const title of titles) {
    const label = `article ${title}`;
    if (!articleDue(await store.readMeta(title), nowMs)) continue;
    if (input.dryRun) {
      log(`  ${label}: would read`);
      continue;
    }

    const url = articleUrl(title);
    const failed = async (why: string) => {
      await store.recordAttempt(title, nowIso);
      warnings.push(`${label}: ${why}; keeping what is stored`);
    };

    const decision = await input.robots.allows(url);
    if (!decision.allowed) {
      await failed(decision.reason);
      continue;
    }
    if (decision.assumedOnForbidden === true) input.assumedRobots.add(HOST);
    if (input.requestedHosts.has(HOST)) {
      await input.sleep(decision.crawlDelayMs ?? DEFAULT_HOST_GAP_MS);
    }
    input.requestedHosts.add(HOST);

    let status: number;
    let body: string;
    try {
      const response = await input.fetchImpl(url, {
        headers: { "User-Agent": input.userAgent, Accept: "application/json" },
        signal: AbortSignal.timeout(input.timeoutMs),
        redirect: "follow",
      });
      status = response.status;
      body = status === 200 ? await response.text() : "";
    } catch (error) {
      await failed(`unreachable: ${String(error)}`);
      continue;
    }

    // Only the API's own `missingtitle` means gone. It says so with a 200, so a
    // bare 404 is an edge or an outage, and must not cost every row its time.
    const answer = status === 200 ? answerOf(body) : "unusable";
    if (answer === "gone") {
      if (await store.markGone(title, nowIso)) changed += 1;
      warnings.push(`${label}: the wiki says it does not exist`);
    } else if (answer === "unusable") {
      await failed(status === 200 ? "the answer was not the API's" : `HTTP ${status}`);
    } else {
      if (await store.saveRead(title, body, nowIso)) changed += 1;
      // A stub is ordinary and a warning per stub per cycle would bury real ones.
      if (parseArticleEnd(body) === null) log(`  ${label}: states no time yet`);
    }
  }

  // No titles means the table failed to parse, not that every event ended.
  if (titles.length > 0 && !input.dryRun) {
    const listed = new Set(titles);
    for (const title of await store.listed()) {
      if (!listed.has(title) && (await store.remove(title))) changed += 1;
    }
  }

  return { changed, warnings };
}
