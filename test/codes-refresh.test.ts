import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { runRefresh } from "../scripts/refresh-sources.ts";
import { SnapshotStore } from "../src/ingest/snapshots.ts";
import { CODE_SOURCES } from "../src/ingest/codes/registry.ts";
import { sampleEvent } from "./helpers/reader.ts";
test("event and code sources share host spacing and snapshot gates", async () => {
  const root = await mkdtemp("/tmp/codes-refresh-");
  try {
    const html = await Bun.file(
      "fixtures/genshin/game8-codes-2026-10-16.html",
    ).text();
    const slept: number[] = [];
    const code = CODE_SOURCES[0]!;
    const summary = await runRefresh({
      adapters: [
        { ...code, id: "event-test", parse: () => [sampleEvent] },
        code,
      ],
      store: new SnapshotStore(root),
      robots: {
        allows: async () => ({ allowed: true, reason: "test permission" }),
      },
      fetchImpl: async () => new Response(html, { status: 200 }),
      userAgent: "event-clock-test",
      now: () => new Date("2026-10-16T12:00:00Z"),
      sleep: async (n) => {
        slept.push(n);
      },
      dryRun: false,
      only: null,
      force: false,
      timeoutMs: 20000,
      log: () => {},
      rebuildFeed: null,
    });
    expect(summary.changed).toBe(2);
    expect(slept).toEqual([2000]);
    expect(summary.outcomes[1]?.eventCount).toBe(10);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("the CLI recognises the code source during a request-free dry run", () => {
  const p = Bun.spawnSync(
    [
      "bun",
      "run",
      "scripts/refresh-sources.ts",
      "--dry-run",
      "--only",
      "genshin-game8-codes",
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  expect(p.exitCode).toBe(0);
  expect(new TextDecoder().decode(p.stdout)).toContain("genshin-game8-codes");
});
