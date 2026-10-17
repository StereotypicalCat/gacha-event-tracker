import { expect, test } from "bun:test";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";
import {
  buildReaderExport,
  parseReaderExport,
} from "../src/client/state/reader/export.ts";
const at = "2026-10-16T12:00:00.000Z";
test("full reader export round-trips unknown fields without including backup history", () => {
  const reader = {
    ...migrateLegacy({}, ["genshin"], at, () => "account:one"),
    future: { keep: true },
  };
  const value = buildReaderExport(
    reader,
    {
      "gacha-tracker:v1:tasks": '{"unreadable":true}',
      "gacha-tracker:v2:backups": "do-not-recurse",
    },
    at,
  );
  expect(parseReaderExport(value)).toEqual(reader);
  expect(JSON.stringify(value)).not.toContain("do-not-recurse");
});
test("unknown versions and invalid known fields cannot be restored", () => {
  const value = buildReaderExport(
    migrateLegacy({}, [], at, () => "account:one"),
    {},
    at,
  );
  expect(parseReaderExport({ ...value, version: 999 })).toBeNull();
  expect(
    parseReaderExport({ ...value, reader: { version: 2, accounts: [] } }),
  ).toBeNull();
});
test("existing version-one exports remain convertible", () => {
  const reader = parseReaderExport({
    format: "gacha-tracker-export",
    version: 1,
    exportedAt: at,
    prefs: { region: "asia" },
    progress: { "genshin:a:2026-01-01": { status: "done", at } },
    daily: {},
    ignored: {},
    customGames: {},
    customEvents: {},
  });
  expect(reader?.version).toBe(2);
  expect(Object.values(reader!.accounts)[0]?.region).toBe("asia");
});
