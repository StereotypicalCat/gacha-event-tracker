import { expect, test } from "bun:test";
import {
  backupTier,
  retainBackups,
} from "../src/client/state/reader/backups.ts";

const now = Date.parse("2026-10-17T12:00:00.000Z");
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();

test("a snapshot's tier matches the window that retains it", () => {
  expect(backupTier(daysAgo(0), now)).toBe("daily");
  expect(backupTier(daysAgo(6), now)).toBe("daily");
  expect(backupTier(daysAgo(8), now)).toBe("weekly");
  expect(backupTier(daysAgo(33), now)).toBe("weekly");
  expect(backupTier(daysAgo(40), now)).toBe("monthly");
  // Everything retained falls in one of the three.
  const kept = retainBackups(
    Array.from({ length: 200 }, (_, i) => ({
      id: String(i),
      at: daysAgo(i),
      payload: {},
    })),
    now,
  );
  const tiers = kept.map((s) => backupTier(s.at, now));
  expect(tiers.filter((t) => t === "daily").length).toBe(7);
  expect(tiers.filter((t) => t === "weekly").length).toBe(4);
  expect(tiers.filter((t) => t === "monthly").length).toBe(6);
});
