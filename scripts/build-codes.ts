import { mkdir, rename } from "node:fs/promises";
import { CODE_SOURCES } from "../src/ingest/codes/registry.ts";
import { applyCodeChecks, buildCodesFeed } from "../src/ingest/codes/build.ts";
import { CODE_CHECKS } from "../src/shared/codeChecks.ts";
import { CodesFeedSchema, type CodesFeed } from "../src/shared/codes.ts";
import { SnapshotStore, freshnessAt } from "../src/ingest/snapshots.ts";
import type { SourceHealth } from "../src/shared/feed.ts";
export async function buildCodes() {
  const root = process.env.SNAPSHOT_DIR ?? "snapshots",
    out = process.env.PUBLIC_DIR ?? "public",
    store = new SnapshotStore(root);
  const firstPath = `${root}/codes-first-seen.json`;
  let first: Record<string, string> = {};
  try {
    first = await Bun.file(firstPath).json();
  } catch {
    /* First offline build uses the fixture's capture date. */
  }
  const previous: CodesFeed = { schemaVersion: 1, codes: [], sources: [] };
  const codes: CodesFeed["codes"] = [];
  const sources: SourceHealth[] = [];
  for (const source of CODE_SOURCES) {
    const snapshot = await store.read(source.id),
      // Until the refresh stores a snapshot, each source builds from its own
      // pinned page, dated by that capture.
      at = snapshot
        ? freshnessAt(snapshot)
        : ((await Bun.file(`${source.fixture}.meta.json`).json())
            .contentChangedAt as string),
      html =
        snapshot?.html ?? (await Bun.file(`${source.fixture}.html`).text());
    const parsed = source.parse(html, {
      now: new Date().toISOString(),
      sourceId: source.id,
      sourceUrl: source.url,
      game: source.game,
    });
    const built = buildCodesFeed(previous, parsed, at);
    for (const code of built.codes) {
      code.firstObservedAt = first[code.id] ?? code.firstObservedAt;
      first[code.id] = code.firstObservedAt;
      codes.push(code);
    }
    sources.push({
      sourceId: source.id,
      game: source.game,
      url: source.url,
      lastSuccessAt: at,
      lastConfirmedAt: snapshot?.meta.lastConfirmedAt ?? null,
      contentChangedAt: snapshot?.meta.contentChangedAt ?? at,
      eventCount: parsed.length,
      parsedCount: parsed.length,
      statesNoEvents:
        parsed.length === 0 && "statesNoEvents" in source
          ? source.statesNoEvents(html)
          : false,
    });
  }
  const checked = applyCodeChecks(codes, CODE_CHECKS);
  for (const c of checked.unmatched)
    console.log(
      `build-codes: check ${c.game} ${c.code} (${c.checked}) matches no code; prune it`,
    );
  const feed = CodesFeedSchema.parse({
    schemaVersion: 1,
    codes: checked.codes,
    sources,
  });
  await mkdir(`${out}/data`, { recursive: true });
  await Bun.write(`${out}/data/codes.v1.json`, JSON.stringify(feed));
  await mkdir(root, { recursive: true });
  await Bun.write(firstPath + ".tmp", JSON.stringify(first, null, 2) + "\n");
  await rename(firstPath + ".tmp", firstPath);
  console.log(`build-codes: ${codes.length} current codes`);
}
if (import.meta.main) await buildCodes();
