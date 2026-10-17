import { expect, test } from "bun:test";
import {
  createAccount,
  changeAccountRegion,
  retireAccount,
} from "../src/client/state/reader/accounts.ts";
const at = "2026-10-16T12:00:00.000Z";
test("additional accounts start events-only with fresh placements", () => {
  const a = createAccount("genshin", "asia", at, "account:second");
  expect(a.intent).toEqual({
    events: true,
    dailies: false,
    weeklyMonthly: false,
    cycles: false,
  });
  expect(a.routines).toEqual({});
});
test("changing a server preserves account identity and historical clock", () => {
  const a = createAccount("genshin", "europe", at, "account:one");
  const b = changeAccountRegion(
    a,
    "asia",
    "2026-10-17T12:00:00.000Z",
    "clock2",
  );
  expect(b.id).toBe(a.id);
  expect(b.clocks).toHaveLength(2);
  expect(b.clocks[0]?.region).toBe("europe");
  expect(retireAccount(b, at).clocks).toEqual(b.clocks);
});
