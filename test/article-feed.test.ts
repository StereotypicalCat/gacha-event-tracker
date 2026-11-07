import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ArticleStore } from "../src/ingest/articleStore.ts";
import { EventFeed } from "../src/shared/feed.ts";
import { SnapshotStore } from "../src/ingest/snapshots.ts";

const NOW = "2026-11-07T00:00:00.000Z";
const dir = "fixtures/genshin/articles";
let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "event-clock-feed-"));
  await new SnapshotStore(root).save("genshin-fandom-events", {
    url: "https://genshin-impact.fandom.com/api.php?action=parse&page=Event",
    body: await Bun.file(`${dir}/event-table-2026-11-06.html`).text(),
    etag: null,
    lastModified: null,
    at: "2026-11-06T17:27:59.858Z",
    eventCount: 15,
  });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function buildFeed() {
  const out = join(root, "feed.json");
  const proc = Bun.spawn(["bun", "run", "scripts/build-feed.ts"], {
    env: { ...process.env, SNAPSHOT_DIR: root, EVENT_FEED_OUT: out, EVENT_FEED_NOW: NOW },
    stdout: "pipe",
    stderr: "pipe",
  });
  const stderr = await new Response(proc.stderr).text();
  const log = await new Response(proc.stdout).text();
  expect(`${await proc.exited} ${stderr}`).toBe("0 ");
  return { feed: EventFeed.parse(await Bun.file(out).json()), log };
}

const hourOfRuin = "genshin:hour-of-ruin:2026-11-04";

test("the feed carries the end the article states, on an unchanged id", async () => {
  await new ArticleStore(root).saveRead(
    "Hour_of_Ruin_(Event)",
    await Bun.file(`${dir}/hour-of-ruin-2026-11-07.html`).text(),
    NOW,
  );
  const { feed } = await buildFeed();
  const row = feed.events.find((e) => e.id === hourOfRuin)!;
  expect(row.endPrecision).toBe("exact");
  expect(row.regionScoped).toBe(true);
  expect(row.regionEnds?.europe).toBe("2026-12-15T13:59:00.000Z");
  expect(row.startsAt).toBe("2026-11-04T00:00:00.000Z");
});

test("no articles directory builds the same day-precision row as today", async () => {
  const { feed } = await buildFeed();
  const row = feed.events.find((e) => e.id === hourOfRuin)!;
  expect(row.endPrecision).toBe("day");
  expect(row.endsAt).toBe("2026-12-15T00:00:00.000Z");
  expect(row.regionEnds).toBeNull();
});

test("an article that disagrees on the date is named in the build log", async () => {
  const body = (await Bun.file(`${dir}/hour-of-ruin-2026-11-07.html`).text()).replace(
    "December 15, 2026 14:59",
    "December 20, 2026 14:59",
  );
  await new ArticleStore(root).saveRead("Hour_of_Ruin_(Event)", body, NOW);
  const { feed, log } = await buildFeed();
  expect(feed.events.find((e) => e.id === hourOfRuin)?.endPrecision).toBe("day");
  expect(log).toContain("article:");
  expect(log).toContain("Hour of Ruin");
});
