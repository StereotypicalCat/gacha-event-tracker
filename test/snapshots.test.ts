import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { statSync } from "node:fs";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  charsetFromContentType,
  decodeBody,
  freshnessAt,
  hashBody,
  sniffMetaCharset,
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

function save(
  body: Uint8Array | string,
  at: string,
  extra: Partial<{
    etag: string | null;
    lastModified: string | null;
    eventCount: number | null;
    charset: string;
  }> = {},
) {
  return store.save("genshin-game8-events", {
    url: "https://game8.co/games/Genshin-Impact/archives/301601",
    body,
    ...(extra.charset === undefined ? {} : { charset: extra.charset }),
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

  test("identical bytes are not a change", async () => {
    await save("<html>one</html>", T0, { etag: '"v1"', eventCount: 9 });
    const again = await save("<html>one</html>", T1, {
      etag: '"v1"',
      eventCount: 9,
    });

    expect(again.changed).toBe(false);
    // contentChangedAt still points at the fetch that produced these bytes,
    // which is what keeps an unchanged cycle out of the commit log.
    expect(again.meta.contentChangedAt).toBe(T0);
  });

  test("identical bytes and identical validators rewrite nothing at all", async () => {
    await save("<html>one</html>", T0, { etag: '"v1"', eventCount: 9 });
    const before = await Bun.file(store.metaPath("genshin-game8-events")).text();
    await save("<html>one</html>", T1, { etag: '"v1"', eventCount: 9 });
    expect(await Bun.file(store.metaPath("genshin-game8-events")).text()).toBe(
      before,
    );
  });

  test("a rotated ETag is stored even though the bytes did not change", async () => {
    // Servers rotate validators on identical bytes. Keeping the old one meant
    // sending a stale If-None-Match forever, so the wiki would serve the whole
    // page every cycle — the exact cost conditional requests exist to avoid.
    await save("<html>one</html>", T0, { etag: '"v1"', eventCount: 9 });
    const again = await save("<html>one</html>", T1, {
      etag: '"v2"',
      lastModified: "Sat, 15 Aug 2026 12:00:00 GMT",
      eventCount: 9,
    });

    expect(again.changed).toBe(false);
    expect(again.meta.contentChangedAt).toBe(T0);
    expect(again.meta.etag).toBe('"v2"');

    const persisted = await store.readMeta("genshin-game8-events");
    expect(persisted?.etag).toBe('"v2"');
    expect(persisted?.contentChangedAt).toBe(T0);
    expect(store.conditionalHeaders(persisted)).toEqual({
      "If-None-Match": '"v2"',
      "If-Modified-Since": "Sat, 15 Aug 2026 12:00:00 GMT",
    });
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

describe("charset", () => {
  // "イベント" as Shift_JIS, and "Café" as Latin-1: both are mojibake if the
  // bytes are read as UTF-8.
  const SJIS = new Uint8Array([0x83, 0x43, 0x83, 0x78, 0x83, 0x93, 0x83, 0x67]);
  const LATIN1 = new Uint8Array([0x43, 0x61, 0x66, 0xe9]);

  test("reads the charset out of a Content-Type header", () => {
    expect(charsetFromContentType('text/html; charset="Shift_JIS"')).toBe(
      "shift_jis",
    );
    expect(charsetFromContentType("text/html;charset=iso-8859-1")).toBe(
      "iso-8859-1",
    );
    expect(charsetFromContentType("text/html")).toBeNull();
    expect(charsetFromContentType(null)).toBeNull();
  });

  test("falls back to the meta charset in the document head", () => {
    const html = new TextEncoder().encode(
      '<!DOCTYPE html><html><head><meta charset="shift_jis"><title>x</title></head>',
    );
    expect(sniffMetaCharset(html)).toBe("shift_jis");
    expect(
      sniffMetaCharset(
        new TextEncoder().encode(
          '<meta http-equiv="Content-Type" content="text/html; charset=EUC-JP">',
        ),
      ),
    ).toBe("euc-jp");
    expect(sniffMetaCharset(new TextEncoder().encode("<html><body>"))).toBeNull();
  });

  test("decodes with the declared charset, not with UTF-8", () => {
    expect(decodeBody(SJIS, "text/html; charset=shift_jis").text).toBe(
      "イベント",
    );
    expect(decodeBody(LATIN1, "text/html; charset=iso-8859-1").text).toBe("Café");
    expect(decodeBody(new TextEncoder().encode("ok"), null).text).toBe("ok");
  });

  test("an encoding label we do not know falls back to UTF-8 rather than throwing", () => {
    const decoded = decodeBody(
      new TextEncoder().encode("ok"),
      "text/html; charset=x-nonesuch",
    );
    expect(decoded.text).toBe("ok");
    expect(decoded.charset).toBe("utf-8");
  });

  test("stores the served bytes verbatim and reads them back as text", async () => {
    const { meta } = await save(SJIS, T0, { charset: "shift_jis", eventCount: 2 });

    // The bytes on disk are the bytes the server sent; the hash and the size
    // describe those bytes, so a later re-decode is still possible.
    const onDisk = new Uint8Array(
      await Bun.file(store.bodyPath("genshin-game8-events")).arrayBuffer(),
    );
    expect([...onDisk]).toEqual([...SJIS]);
    expect(meta.bytes).toBe(SJIS.byteLength);
    expect(meta.contentHash).toBe(hashBody(SJIS));

    const snapshot = await store.read("genshin-game8-events");
    expect(snapshot?.html).toBe("イベント");
    expect(snapshot?.html).not.toContain("�");
  });

  test("metadata written before charsets were recorded reads as UTF-8", async () => {
    await save("<html>é</html>", T0);
    const meta = await store.readMeta("genshin-game8-events");
    const { charset: _dropped, ...legacy } = meta as SnapshotMeta;
    await writeFile(
      store.metaPath("genshin-game8-events"),
      `${JSON.stringify(legacy, null, 2)}\n`,
    );
    expect((await store.read("genshin-game8-events"))?.html).toBe("<html>é</html>");
  });
});

describe("writes land whole or not at all", () => {
  test("leaves no temp files behind", async () => {
    await save("<html>one</html>", T0);
    await store.recordCheck("genshin-game8-events", {
      at: T0,
      status: 200,
      ok: true,
    });
    const names = await readdir(root);
    expect(names.sort()).toEqual([
      "genshin-game8-events.html",
      "genshin-game8-events.meta.json",
      "genshin-game8-events.state.json",
    ]);
  });

  test("a temp file left by a crashed run is not mistaken for a snapshot", async () => {
    await writeFile(
      join(root, "genshin-game8-events.meta.json.tmp-abc"),
      "{ half",
    );
    expect(await store.list()).toEqual([]);
    await save("<html>one</html>", T0);
    expect(await store.list()).toEqual(["genshin-game8-events"]);
  });

  test("replaces each file rather than overwriting it in place", async () => {
    // Written in place, a snapshot exists in a truncated state for as long as
    // the write takes, and a crash there leaves it that way. Renaming a
    // complete temp file over it cannot: the replacement is one atomic step,
    // which shows up as a new inode.
    await save("<html>one</html>", T0, { etag: '"v1"' });
    const before = {
      body: statSync(store.bodyPath("genshin-game8-events")).ino,
      meta: statSync(store.metaPath("genshin-game8-events")).ino,
    };

    await save("<html>two</html>", T1, { etag: '"v2"' });
    expect(statSync(store.bodyPath("genshin-game8-events")).ino).not.toBe(
      before.body,
    );
    expect(statSync(store.metaPath("genshin-game8-events")).ino).not.toBe(
      before.meta,
    );

    // Including the metadata-only rewrite that a rotated validator triggers.
    const metaIno = statSync(store.metaPath("genshin-game8-events")).ino;
    await save("<html>two</html>", T1, { etag: '"v3"' });
    expect(statSync(store.metaPath("genshin-game8-events")).ino).not.toBe(
      metaIno,
    );

    // And the state file, which is written on every single cycle.
    await store.recordCheck("genshin-game8-events", {
      at: T0,
      status: 200,
      ok: true,
    });
    const stateIno = statSync(store.statePath("genshin-game8-events")).ino;
    await store.recordCheck("genshin-game8-events", {
      at: T1,
      status: 200,
      ok: true,
    });
    expect(statSync(store.statePath("genshin-game8-events")).ino).not.toBe(
      stateIno,
    );
  });

  test("a reader never sees a half-written body", async () => {
    const first = `<html>${"a".repeat(1_000_000)}</html>`;
    const second = `<html>${"b".repeat(1_000_000)}</html>`;
    await save(first, T0);

    let stop = false;
    const seen = new Set<string>();
    const reader = (async () => {
      while (!stop) {
        const text = await Bun.file(store.bodyPath("genshin-game8-events")).text();
        seen.add(`${text.length}:${text.slice(-8)}`);
        await Bun.sleep(0);
      }
    })();

    await save(second, T1);
    stop = true;
    await reader;

    for (const observed of seen) {
      expect([
        `${first.length}:${first.slice(-8)}`,
        `${second.length}:${second.slice(-8)}`,
      ]).toContain(observed);
    }
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
