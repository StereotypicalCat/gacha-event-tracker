import { expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import {
  AppNavigation,
  mainViewPatch,
} from "../src/client/components/redesign/AppNavigation.tsx";
import { SettingsLayout } from "../src/client/components/redesign/SettingsLayout.tsx";
import { ChangelogPage } from "../src/client/components/redesign/ChangelogPage.tsx";

test("utility pages do not replace the reader's preferred main view", () => {
  expect(mainViewPatch("settings")).toEqual({});
  expect(mainViewPatch("archive")).toEqual({});
  expect(mainViewPatch("timeline")).toEqual({ view: "timeline" });
  const html = render(<AppNavigation page="settings" onPage={() => {}} />);
  for (const label of [
    "Checklist",
    "Timeline",
    "Routines",
    "Archive",
    "Settings",
  ])
    expect(html).toContain(label);
  expect(html).toContain('aria-current="page"');
});
test("settings has named navigation and one content region", () => {
  const html = render(
    <SettingsLayout page="appearance" onPage={() => {}}>
      <p>Appearance controls</p>
    </SettingsLayout>,
  );
  expect(html).toContain('aria-label="Settings pages"');
  expect(html).toContain("Appearance controls");
  expect(html).toContain("Changelog");
});
test("changelog page has release content without a scrim or modal", () => {
  const html = render(
    <ChangelogPage
      notes={[]}
      entries={[
        {
          id: "test",
          date: "2026-10-16",
          title: "A real entry",
          kind: "feature",
          ref: "abcdef1",
        },
      ]}
    />,
  );
  expect(html).toContain("A real entry");
  expect(html).not.toContain('role="dialog"');
  expect(html).not.toContain("Close changelog");
});
import { NextUp } from "../src/client/components/NextUp.tsx";
import { clockFor } from "../src/shared/time.ts";
import { sampleEvent } from "./helpers/reader.ts";
test("headline identifies the server when accounts share an event title", () => {
  const html = render(
    <NextUp
      rows={[
        {
          event: sampleEvent,
          clock: clockFor(
            sampleEvent,
            "asia",
            Date.parse("2026-10-16T12:00:00Z"),
          ),
          accountId: "account:asia",
          region: "asia",
        },
      ]}
      focused={null}
      onOpen={() => {}}
    />,
  );
  expect(html).toContain("Asia");
});
