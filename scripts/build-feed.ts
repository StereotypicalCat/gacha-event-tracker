/**
 * Build the static event feed from checked-in fixtures.
 *
 * Offline: this reads fixtures, never the network. It exists so the client can
 * be developed and demoed against real parsed data before the server and
 * database land, and it emits exactly the shape `GET /api/events.json` will.
 *
 *   bun run build:feed
 */
import { ADAPTERS } from "../src/ingest/adapters/index.ts";
import { mergeEvents } from "../src/ingest/merge.ts";
import { EventFeed, SCHEMA_VERSION, type SourceHealth } from "../src/shared/feed.ts";
import type { GachaEvent, GameId } from "../src/shared/schema.ts";

const OUT = "public/data/events.v1.json";

/** Newest fixture per adapter. */
async function latestFixture(adapterId: string, game: GameId) {
  const glob = new Bun.Glob(`fixtures/${game}/*.html`);
  const files = [...glob.scanSync(".")].sort();
  const file = files.at(-1);
  if (file === undefined) {
    throw new Error(`no fixture found for ${adapterId} (fixtures/${game}/*.html)`);
  }
  return { file, html: await Bun.file(file).text() };
}

const now = new Date().toISOString();
const byGame = new Map<GameId, GachaEvent[][]>();
const sources: SourceHealth[] = [];

for (const adapter of ADAPTERS) {
  const { file, html } = await latestFixture(adapter.id, adapter.game);
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
    // Fixture capture date stands in for a real fetch timestamp until the
    // scheduler exists. The UI's staleness badge reads this, so it must not
    // claim to be fresher than the data actually is.
    lastSuccessAt: fixtureDate(file),
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
