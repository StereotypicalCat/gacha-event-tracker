import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  freshnessAt,
  hashBody,
  SnapshotStore,
  type SnapshotMeta,
} from "../src/ingest/snapshots.ts";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const T0 = "2026-08-15T00:00:00.000Z";
const T1 = "2026-08-15T12:00:00.000Z";

let root: string;
let store: SnapshotStore;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "event-clock-snapshots-"));
  store = new SnapshotStore(root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function save(html: string, at: string, extra: Partial<{ etag: string | null; lastModified: string | null; eventCount: number | null }> = {}) {
  return store.save("genshin-game8-events", {
    url: "https://game8.co/games/Genshin-Impact/archives/301601",
    html,
    etag: extra.etag ?? null,
    lastModified: extra.lastModified ?? null,
    at,
    eventCount: extra.eventCount ?? null,
  });
}

describe("SnapshotStore", () => {
  test("an unfetched source reads as nothing, not as an error", async () => {
    expect(await store.read("genshin-game8-events")).toBeNull();
    expect(await store.readMeta("genshin-game8-events")).toBeNull();
    expect(await store.list()).toEqual([]);
  });

  test("stores the body verbatim and its metadata", async () => {
    const { changed, meta } = await save("<html>one</html>", T0, {
      etag: 'W/"abc"',
      lastModified: "Fri, 14 Aug 2026 09:00:00 GMT",
      eventCount: 9,
    });

    expect(changed).toBe(true);
    expect(meta.contentHash).toBe(hashBody("<html>one</html>"));
    expect(meta.eventCount).toBe(9);

    const snapshot = await store.read("genshin-game8-events");
    expect(snapshot?.html).toBe("<html>one</html>");
    expect(snapshot?.meta.etag).toBe('W/"abc"');
    expect(await store.list()).toEqual(["genshin-game8-events"]);
  });

  test("identical bytes are not a change and do not rewrite metadata", async () => {
    await save("<html>one</html>", T0, { etag: '"v1"', eventCount: 9 });
    const again = await save("<html>one</html>", T1, {
      etag: '"v2"',
      eventCount: 9,
    });

    expect(again.changed).toBe(false);
    // contentChangedAt still points at the fetch that produced these bytes,
    // which is what keeps an unchanged cycle out of the commit log.
    expect(again.meta.contentChangedAt).toBe(T0);
    expect(again.meta.etag).toBe('"v1"');
  });

  test("different bytes are a change", async () => {
    await save("<html>one</html>", T0, { eventCount: 9 });
    const next = await save("<html>two</html>", T1, { eventCount: 10 });

    expect(next.changed).toBe(true);
    expect(next.meta.contentChangedAt).toBe(T1);
    expect((await store.read("genshin-game8-events"))?.html).toBe(
      "<html>two</html>",
    );
  });

  test("re-saves when the metadata survived but the body did not", async () => {
    await save("<html>one</html>", T0);
    await rm(store.bodyPath("genshin-game8-events"));
    expect(await store.read("genshin-game8-events")).toBeNull();
    expect((await save("<html>one</html>", T1)).changed).toBe(true);
  });

  test("unreadable metadata is treated as no cache rather than crashing", async () => {
    await save("<html>one</html>", T0);
    await writeFile(store.metaPath("genshin-game8-events"), "{ truncated");
    expect(await store.readMeta("genshin-game8-events")).toBeNull();
  });
});

describe("conditional requests", () => {
  test("emits both validators when both are known", async () => {
    const { meta } = await save("<html>one</html>", T0, {
      etag: 'W/"abc"',
      lastModified: "Fri, 14 Aug 2026 09:00:00 GMT",
    });
    expect(store.conditionalHeaders(meta)).toEqual({
      "If-None-Match": 'W/"abc"',
      "If-Modified-Since": "Fri, 14 Aug 2026 09:00:00 GMT",
    });
  });

  test("emits only what the server gave us", async () => {
    const { meta } = await save("<html>one</html>", T0, { etag: 'W/"abc"' });
    expect(store.conditionalHeaders(meta)).toEqual({ "If-None-Match": 'W/"abc"' });
  });

  test("a source never fetched sends no validators", () => {
    expect(store.conditionalHeaders(null)).toEqual({});
  });
});

describe("the six-hour floor", () => {
  const at = (iso: string) => Date.parse(iso);

  test("a source never checked is due", async () => {
    const state = await store.readState("genshin-game8-events");
    expect(store.isDue(state, at(T0), SIX_HOURS_MS)).toBe(true);
  });

  test("holds off until six hours have passed", async () => {
    await store.recordCheck("genshin-game8-events", {
      at: T0,
      status: 200,
      ok: true,
    });
    const state = await store.readState("genshin-game8-events");

    expect(store.isDue(state, at(T0) + SIX_HOURS_MS - 1, SIX_HOURS_MS)).toBe(
      false,
    );
    expect(store.isDue(state, at(T0) + SIX_HOURS_MS, SIX_HOURS_MS)).toBe(true);
    expect(store.dueAt(state, SIX_HOURS_MS)).toBe(at(T0) + SIX_HOURS_MS);
  });

  test("a failed attempt still counts as an attempt", async () => {
    await store.recordCheck("genshin-game8-events", {
      at: T0,
      status: 503,
      ok: false,
    });
    const state = await store.readState("genshin-game8-events");
    expect(state.consecutiveFailures).toBe(1);
    expect(state.lastConfirmedAt).toBeNull();
    expect(store.isDue(state, at(T0) + 60_000, SIX_HOURS_MS)).toBe(false);
  });

  test("a success clears the failure streak", async () => {
    await store.recordCheck("x", { at: T0, status: 503, ok: false });
    await store.recordCheck("x", { at: T1, status: 304, ok: true });
    const state = await store.readState("x");
    expect(state.consecutiveFailures).toBe(0);
    expect(state.lastConfirmedAt).toBe(T1);
  });

  test("check bookkeeping lives outside the committed metadata", async () => {
    await save("<html>one</html>", T0);
    const before = await Bun.file(store.metaPath("genshin-game8-events")).text();
    await store.recordCheck("genshin-game8-events", {
      at: T1,
      status: 304,
      ok: true,
    });
    const after = await Bun.file(store.metaPath("genshin-game8-events")).text();
    expect(after).toBe(before);
  });
});

describe("freshnessAt", () => {
  const meta: SnapshotMeta = {
    sourceId: "x",
    url: "https://x.test",
    contentHash: "abc",
    bytes: 3,
    etag: null,
    lastModified: null,
    contentChangedAt: T0,
    eventCount: 1,
  };

  test("reports the last confirmation when there is one", () => {
    expect(
      freshnessAt({
        meta,
        state: {
          sourceId: "x",
          lastCheckedAt: T1,
          lastConfirmedAt: T1,
          lastStatus: 304,
          consecutiveFailures: 0,
        },
        html: "",
      }),
    ).toBe(T1);
  });

  test("never claims to be fresher than the bytes", () => {
    expect(
      freshnessAt({
        meta,
        state: {
          sourceId: "x",
          lastCheckedAt: null,
          lastConfirmedAt: null,
          lastStatus: null,
          consecutiveFailures: 0,
        },
        html: "",
      }),
    ).toBe(T0);
  });
});
