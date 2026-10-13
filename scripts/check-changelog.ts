/**
 * Checks every changelog ref exists in this repository's history, and that a
 * note's range runs forwards. Run by hand, or by the agent writing entries:
 *
 *   bun run scripts/check-changelog.ts
 *
 * Not a test, because CI checks out shallowly and the history is not there,
 * and the image build runs the suite without docs/ — so spec paths are checked
 * here too.
 */
import { existsSync } from "node:fs";
import { ENTRIES, NOTES } from "../src/shared/changelog.ts";

const exists = (ref: string) =>
  Bun.spawnSync(["git", "cat-file", "-e", `${ref}^{commit}`]).exitCode === 0;
const before = (a: string, b: string) =>
  Bun.spawnSync(["git", "merge-base", "--is-ancestor", a, b]).exitCode === 0;

const problems: string[] = [];
for (const e of ENTRIES) if (!exists(e.ref)) problems.push(`entry ${e.id}: no commit ${e.ref}`);
for (const n of NOTES) {
  for (const ref of [n.from, n.to]) if (!exists(ref)) problems.push(`note ${n.id}: no commit ${ref}`);
  for (const path of n.specs ?? []) {
    if (!existsSync(path)) problems.push(`note ${n.id}: no spec at ${path}`);
  }
  if (exists(n.from) && exists(n.to) && !before(n.from, n.to)) {
    problems.push(`note ${n.id}: ${n.from} does not come before ${n.to}`);
  }
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`changelog: ${ENTRIES.length} entries and ${NOTES.length} notes, every ref found.`);
