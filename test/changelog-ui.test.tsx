import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ChangelogSheet } from "../src/client/components/ChangelogSheet.tsx";
import { WhatsNew } from "../src/client/components/WhatsNew.tsx";
import { Colophon } from "../src/client/components/Colophon.tsx";
import type { Entry, Note } from "../src/shared/changelog.ts";

const e = (id: string, kind: Entry["kind"] = "feature", note?: string): Entry => ({
  id, date: "2026-10-13", kind, title: `Title ${id}`, ref: "abcdef1", ...(note ? { note } : {}),
});

describe("What's new", () => {
  const noop = () => {};

  test("lists unseen entries with their kind, at most five", () => {
    const html = renderToStaticMarkup(
      <WhatsNew entries={["a", "b", "c", "d", "e", "f", "g"].map((x) => e(x))} onDismiss={noop} onSeeAll={noop} />,
    );
    expect(html).toContain("What&#x27;s new");
    expect(html).toContain("Title e");
    expect(html).not.toContain("Title f");
    expect(html).toContain("See all (2 more)");
    expect(html).toContain("Got it");
    expect(html).toContain("New");
  });

  test("renders nothing with nothing unseen", () => {
    expect(renderToStaticMarkup(<WhatsNew entries={[]} onDismiss={noop} onSeeAll={noop} />)).toBe("");
  });
});

describe("the changelog sheet", () => {
  const note: Note = {
    id: "goals", date: "2026-10-13", title: "Check-in goals", summary: ["Para one.", "Para two."],
    from: "1deb0cb", to: "064cea2", specs: ["docs/superpowers/specs/2026-10-03-check-in-goals-design.md"],
  };

  test("a note shows its summary, its commit range and its specs, with its entries under it", () => {
    const html = renderToStaticMarkup(
      <ChangelogSheet notes={[note]} entries={[e("x", "fix", "goals"), e("loose", "games")]} onClose={() => {}} />,
    );
    expect(html).toContain("Check-in goals");
    expect(html).toContain("Para two.");
    expect(html).toContain("/compare/1deb0cb...064cea2");
    expect(html).toContain("/blob/main/docs/superpowers/specs/2026-10-03-check-in-goals-design.md");
    expect(html).toContain("Title x");
    expect(html).toContain("/commit/abcdef1");
    // An entry with no note is still listed.
    expect(html).toContain("Title loose");
    expect(html).toContain("Games &amp; sources");
  });
});

describe("the footer link", () => {
  test("opens the changelog when the app can show it", () => {
    const html = renderToStaticMarkup(<Colophon sources={[]} now={0} onChangelog={() => {}} />);
    expect(html).toContain("Changelog");
  });
});
