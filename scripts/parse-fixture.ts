/**
 * Run an adapter against a checked-in fixture and print the events it yields.
 *
 * Offline and free — this never touches the network. Use it to eyeball an
 * adapter's output before writing the .expected.json, and to regenerate that
 * file after an intentional change.
 *
 *   bun run parse <adapter-id> <fixture-path> [--now ISO] [--json]
 */
import { adapterById, ADAPTERS } from "../src/ingest/adapters/index.ts";
import { GachaEvent } from "../src/shared/schema.ts";

const [adapterId, fixturePath] = Bun.argv.slice(2);
const nowFlag = Bun.argv.indexOf("--now");
const now =
  nowFlag !== -1 ? (Bun.argv[nowFlag + 1] ?? "") : "2026-08-14T00:00:00.000Z";
const asJson = Bun.argv.includes("--json");

if (!adapterId || !fixturePath) {
  console.error("usage: bun run parse <adapter-id> <fixture-path> [--now ISO] [--json]");
  console.error(`adapters: ${ADAPTERS.map((a) => a.id).join(", ")}`);
  process.exit(1);
}

const adapter = adapterById(adapterId);
if (!adapter) {
  console.error(`unknown adapter '${adapterId}'`);
  console.error(`adapters: ${ADAPTERS.map((a) => a.id).join(", ")}`);
  process.exit(1);
}

const html = await Bun.file(fixturePath).text();
const events = adapter.parse(html, {
  now,
  sourceUrl: adapter.url,
  sourceId: adapter.id,
  game: adapter.game,
});

// Validate here too — the script should fail loudly on a schema violation
// rather than print something the pipeline would later reject.
for (const e of events) GachaEvent.parse(e);

if (asJson) {
  console.log(JSON.stringify(events, null, 2));
} else {
  console.log(`${adapter.id}: ${events.length} events\n`);
  for (const e of events) {
    const end = e.endsAt ? e.endsAt.slice(0, 10) : "  (unknown)";
    console.log(
      `  ${e.startsAt.slice(0, 10)} → ${end}  [${e.type.padEnd(11)}] ${e.title}`,
    );
  }
}
