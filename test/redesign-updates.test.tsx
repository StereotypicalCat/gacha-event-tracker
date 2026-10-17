import { expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import { UpdatesPanel } from "../src/client/components/redesign/UpdatesPanel.tsx";
import { migrateLegacy } from "../src/client/state/reader/migration.ts";
const at = "2026-10-16T12:00:00.000Z";
test("codes and source age have distinct compact update rows, with no panel when empty", () => {
  const s = migrateLegacy({}, ["genshin"], at, () => "account:test"),
    feed = {
      schemaVersion: 1 as const,
      generatedAt: at,
      events: [],
      sources: [],
    };
  const common = {
    state: s,
    feed,
    now: Date.parse(at),
    onSources: () => {},
    onAction: async () => ({ ok: true as const }),
  };
  expect(render(<UpdatesPanel {...common} />)).toBe("");
  const html = render(
    <UpdatesPanel
      {...common}
      codes={{
        schemaVersion: 1,
        sources: [],
        codes: [
          {
            id: "code",
            game: "genshin",
            code: "TEST",
            reward: null,
            expiresAt: null,
            firstObservedAt: at,
            sourceUrl: "https://example.com",
          },
        ],
      }}
    />,
  );
  expect(html).toContain("New redeem codes");
  expect(html).not.toContain("New since you last looked");
  expect(html).not.toContain("Older schedules");
});
test("the source-age notice can be hidden for one, three or seven days", async () => {
  const s = migrateLegacy({}, ["genshin"], at, () => "account:test");
  const feed = {
    schemaVersion: 1 as const,
    generatedAt: at,
    events: [],
    sources: [
      {
        sourceId: "genshin-events",
        game: "genshin" as const,
        url: "https://example.com",
        lastSuccessAt: null,
        lastConfirmedAt: null,
        contentChangedAt: null,
        eventCount: 0,
        parsedCount: null,
        statesNoEvents: false,
      },
    ],
  };
  const html = render(
    <UpdatesPanel
      state={s}
      feed={feed}
      now={Date.parse(at)}
      onSources={() => {}}
      onAction={async () => ({ ok: true as const })}
    />,
  );
  expect(html).toContain("Event data may be out of date");
  expect(html).toContain('aria-label="Hide this notice"');
  for (const label of [">1 day<", ">3 days<", ">7 days<"])
    expect(html).toContain(label);
});
