import { expect, test } from "bun:test";
import { formatInZone } from "../src/client/state/displayTime.ts";
test("named timezones use their daylight-saving rules and invalid zones fall back", () => {
  const winter = formatInZone(
    "2026-01-01T12:00:00Z",
    true,
    "Europe/Copenhagen",
  );
  const summer = formatInZone(
    "2026-07-01T12:00:00Z",
    true,
    "Europe/Copenhagen",
  );
  expect(winter).toContain("13:00");
  expect(summer).toContain("14:00");
  expect(() =>
    formatInZone("2026-07-01T12:00:00Z", true, "invalid"),
  ).not.toThrow();
});
import { readerInstant } from "../src/client/state/useCustom.ts";
test("custom event entry resolves a chosen zone and rejects nonexistent daylight-saving times", () => {
  expect(
    readerInstant("2026-07-01", "12:00", "start", "Europe/Copenhagen"),
  ).toBe("2026-07-01T10:00:00.000Z");
  expect(
    readerInstant("2026-03-29", "02:30", "start", "Europe/Copenhagen"),
  ).toBeNull();
  expect(
    readerInstant("2026-02-30", "12:00", "start", "Europe/Copenhagen"),
  ).toBeNull();
});
