import { expect, test } from "bun:test";
import {
  retainBackups,
  type BackupSnapshot,
} from "../src/client/state/reader/backups.ts";
const now = Date.parse("2026-10-16T12:00:00Z"),
  day = 86400000;
test("400 days fold to seven daily, four weekly and six monthly real snapshots", () => {
  const values: BackupSnapshot[] = Array.from({ length: 400 }, (_, i) => ({
    id: String(i),
    at: new Date(now - i * day).toISOString(),
    payload: { day: i },
  }));
  const kept = retainBackups(values, now);
  expect(kept).toHaveLength(17);
  expect(kept.slice(0, 7).map((v) => v.id)).toEqual([
    "0",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
  ]);
  expect(new Set(kept.map((v) => v.id)).size).toBe(17);
});
test("latest per bucket wins, future and ancient snapshots are excluded", () => {
  const values = [
    { id: "old", at: "2026-10-16T01:00:00Z", payload: {} },
    { id: "new", at: "2026-10-16T10:00:00Z", payload: {} },
    { id: "future", at: "2027-01-01T00:00:00Z", payload: {} },
    { id: "ancient", at: "2024-01-01T00:00:00Z", payload: {} },
  ];
  expect(retainBackups(values, now).map((v) => v.id)).toEqual(["new"]);
});
