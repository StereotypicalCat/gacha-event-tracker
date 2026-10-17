import { expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import { ChangelogPage } from "../src/client/components/redesign/ChangelogPage.tsx";
import { ENTRIES, NOTES } from "../src/shared/changelog.ts";

test("the changelog keeps every commit, its kind and the note's specs in the mockup layout", () => {
  const html = render(<ChangelogPage notes={NOTES} entries={ENTRIES} />);
  expect(html).toContain('class="rel"');
  for (const entry of ENTRIES) expect(html).toContain(`>${entry.ref}<`);
  for (const label of ["New", "Fixed", "Games &amp; sources"])
    expect(html).toContain(label);
  const withSpec = NOTES.find((n) => (n.specs ?? []).length > 0);
  if (withSpec)
    expect(html).toContain(`Spec: ${withSpec.specs![0]!.split("/").at(-1)}`);
  expect(html).toContain("Other changes");
});
