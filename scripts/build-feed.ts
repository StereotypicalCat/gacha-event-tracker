/**
 * Build the static event feed from cached snapshots, falling back to fixtures.
 *
 * Offline: this reads files on disk, never the network. Fetching is
 * `scripts/refresh-sources.ts`'s job; this stage only parses what that left in
 * the snapshot cache. On a clean checkout — and in the container build — no
 * snapshot exists and the checked-in fixture is used instead, so the build
 * stays reproducible and a wiki being down never breaks it.
 *
 *   bun run build:feed
 */
import { ADAPTERS } from "../src/ingest/adapters/index.ts";
import { mergeEvents } from "../src/ingest/merge.ts";
import { SnapshotStore, freshnessAt } from "../src/ingest/snapshots.ts";
import { EventFeed, SCHEMA_VERSION, type SourceHealth } from "../src/shared/feed.ts";
import type { GachaEvent, GameId } from "../src/shared/schema.ts";

const OUT = "public/data/events.v1.json";
const snapshots = new SnapshotStore(process.env["SNAPSHOT_DIR"] ?? "snapshots");

/**
 * Newest fixture for one *source*, not one game.
 *
 * A game can have several sources, and fixtures are named `<site>-events-<date>`
 * against adapter ids of `<game>-<site>-events`. Globbing by game alone hands
 * one site's page to another site's parser.
 */
async function latestFixture(adapterId: string, game: GameId) {
  const site = adapterId.replace(`${game}-`, "").replace(/-events$/, "");
  const pattern = `fixtures/${game}/${site}-*.html`;
  const files = [...new Bun.Glob(pattern).scanSync(".")].sort();
  const file = files.at(-1);
  if (file === undefined) {
    throw new Error(`no fixture found for ${adapterId} (${pattern})`);
  }
  return { file, html: await Bun.file(file).text() };
}

/**
 * The document to parse for one source: the live snapshot when the refresh
 * runner has cached one, otherwise the newest checked-in fixture.
 *
 * `at` is what the UI's staleness badge reads, so it must never claim to be
 * fresher than the bytes actually are — a fixture reports its capture date.
 */
async function documentFor(adapterId: string, game: GameId) {
  const cached = await snapshots.read(adapterId);
  if (cached !== null) {
    return {
      file: snapshots.bodyPath(adapterId),
      html: cached.html,
      at: freshnessAt(cached),
    };
  }
  const { file, html } = await latestFixture(adapterId, game);
  return { file, html, at: fixtureDate(file) };
}

const now = new Date().toISOString();
const byGame = new Map<GameId, GachaEvent[][]>();
const sources: SourceHealth[] = [];

for (const adapter of ADAPTERS) {
  const { file, html, at } = await documentFor(adapter.id, adapter.game);
  const events = adapter.parse(html, {
    now,
    sourceUrl: adapter.url,
    sourceId: adapter.id,
    game: adapter.game,
  });

  const groups = byGame.get(adapter.game) ?? [];
  groups.push(events);
  byGame.set(adapter.game, groups);

  sources.push({
    sourceId: adapter.id,
    game: adapter.game,
    url: adapter.url,
    // When the bytes were last confirmed live; a fixture's capture date when
    // this source has never been refreshed.
    lastSuccessAt: at,
    eventCount: events.length,
  });

  console.log(`  ${adapter.id.padEnd(24)} ${String(events.length).padStart(3)} events  ← ${file}`);
}

const events: GachaEvent[] = [];
let conflictCount = 0;
for (const [, groups] of byGame) {
  const merged = mergeEvents(groups);
  events.push(...merged.events);
  conflictCount += merged.conflicts.length;
  for (const c of merged.conflicts) {
    console.warn(
      `  ! conflict: "${c.kept.title}" ${c.field} differs by ${c.deltaHours}h between sources`,
    );
  }
}

events.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id));

const feed = EventFeed.parse({
  schemaVersion: SCHEMA_VERSION,
  generatedAt: now,
  events,
  sources,
});

await Bun.write(OUT, `${JSON.stringify(feed, null, 2)}\n`);
console.log(
  `\n${OUT}: ${events.length} events across ${byGame.size} games, ${conflictCount} conflicts`,
);

/** "game8-events-2026-08-14.html" → ISO timestamp. */
function fixtureDate(path: string): string | null {
  const m = /(\d{4}-\d{2}-\d{2})\.html$/.exec(path);
  return m?.[1] ? `${m[1]}T00:00:00.000Z` : null;
}
