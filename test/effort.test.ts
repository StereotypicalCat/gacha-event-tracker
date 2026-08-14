import { describe, expect, test } from "bun:test";
import {
  EFFORT,
  pressure,
  pressureReason,
  runwayMs,
  type Effort,
} from "../src/shared/effort.ts";
import { DAY, HOUR } from "../src/shared/time.ts";

describe("runwayMs", () => {
  test("scales with the bucket's working hours", () => {
    // At one play-hour a day, a 12-hour grind wants roughly twelve days.
    expect(runwayMs("quick")).toBeLessThan(runwayMs("short"));
    expect(runwayMs("short")).toBeLessThan(runwayMs("long"));
    expect(runwayMs("grind")).toBe(EFFORT.grind.hours * DAY);
  });
});

describe("pressure", () => {
  test("says nothing when the reader gave no estimate", () => {
    // A warning needs an estimate to rest on, and inventing one to justify the
    // warning would be fabricating the reader's own input.
    expect(pressure(undefined, 2 * HOUR)).toBe("fine");
  });

  test("says nothing when the end is unannounced", () => {
    expect(pressure("grind", null)).toBe("fine");
  });

  test("is fine when the runway fits", () => {
    expect(pressure("quick", 5 * DAY)).toBe("fine");
    expect(pressure("grind", 30 * DAY)).toBe("fine");
  });

  test("tightens as the deadline closes on a big job", () => {
    // A grind wants ~12 days; 6 left is tight, 2 is not realistic.
    expect(pressure("grind", 6 * DAY)).toBe("tight");
    expect(pressure("grind", 2 * DAY)).toBe("unlikely");
  });

  test("treats the same deadline differently by effort", () => {
    // This is the whole point of recording effort: two days is comfortable for
    // a quick event and hopeless for a grind.
    const twoDays = 2 * DAY;
    expect(pressure("quick", twoDays)).toBe("fine");
    expect(pressure("short", twoDays)).toBe("fine");
    expect(pressure("grind", twoDays)).toBe("unlikely");
  });

  test("an ended event is never merely tight", () => {
    expect(pressure("quick", 0)).toBe("unlikely");
    expect(pressure("quick", -HOUR)).toBe("unlikely");
  });
});

describe("pressureReason", () => {
  test("shows its working rather than just asserting", () => {
    const reason = pressureReason("grind", 48 * HOUR);
    expect(reason).toContain("12h of play");
    expect(reason).toContain("48h remain");
  });

  test("covers every bucket without throwing", () => {
    for (const e of Object.keys(EFFORT) as Effort[]) {
      expect(pressureReason(e, 6 * HOUR).length).toBeGreaterThan(20);
    }
  });
});
