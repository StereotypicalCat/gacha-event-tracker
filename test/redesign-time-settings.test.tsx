import { expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import {
  zoneGroups,
  zoneName,
} from "../src/client/components/redesign/TimezoneSelect.tsx";
import { TimeSettings } from "../src/client/components/redesign/TimeSettings.tsx";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";

test("zones read as cities, grouped by region", () => {
  expect(zoneName("Europe/Copenhagen")).toBe("Copenhagen");
  expect(zoneName("America/Argentina/Buenos_Aires")).toBe(
    "Buenos Aires, Argentina",
  );
  const groups = zoneGroups([
    "Europe/Paris",
    "UTC",
    "Asia/Tokyo",
    "Europe/Berlin",
  ]);
  expect(groups.map((g) => g.group)).toEqual(["Europe", "Asia", "Other"]);
  expect(groups[0]!.zones.map((z) => z.name)).toEqual(["Berlin", "Paris"]);
});

test("Region & time has one timezone list, no search box, and a reset row per server", () => {
  const at = "2026-10-16T12:00:00.000Z";
  const s = migrateLegacy(
    {},
    ["genshin", "hsr"],
    at,
    (() => {
      let n = 0;
      return () => `account:a${++n}`;
    })(),
  );
  const html = render(
    <TimeSettings
      state={s}
      now={Date.parse(at)}
      onAction={async () => ({ ok: true })}
    />,
  );
  expect(html).not.toContain('type="search"');
  expect(html).toContain('<optgroup label="Europe">');
  expect(html).toContain("Currently displaying");
  expect(html.match(/class="reset-row"/g)?.length).toBe(2);
  expect(html).toContain("Reset timing for your games");
});
