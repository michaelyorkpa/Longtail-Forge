export const regressionMeta = Object.freeze({
  id: "docs.ownership-routing",
  area: "docs",
  tier: "release-gate",
  tags: ["docs", "release", "routing"],
  description: "Proves changed source areas suggest owning documentation while the closeout gate remains explicit and warning-only.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  formatDocsSuggestion,
  suggestDocsForPaths,
  validateDocsOwnershipIndex,
} from "../../lib/docs-change-routing.mjs";

const rawIndex = JSON.parse(readFileSync("docs/docs-ownership.json", "utf8"));
const index = validateDocsOwnershipIndex(rawIndex);
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const guide = readFileSync("docs/docs-ownership.md", "utf8");
const readme = readFileSync("README.md", "utf8");

assert.deepEqual(
  index.areas.map((area) => area.id),
  [
    "workbench",
    "dashboard",
    "tasks",
    "notes",
    "lists",
    "files",
    "search",
    "notifications",
    "tags",
    "time-tracking",
    "permissions",
    "database",
    "module-contracts",
    "view-building",
    "public-api",
    "licensing",
    "e2e-testing",
    "accessibility",
    "release-process",
  ],
  "the ownership index should cover every roadmap-listed documentation area",
);
for (const area of index.areas) {
  for (const docPath of area.docs) {
    assert.equal(existsSync(docPath), true, `${area.id} should reference existing documentation ${docPath}`);
  }
}

const tasks = suggestDocsForPaths(["src/modules/tasks/tasks.service.js"], { index: rawIndex });
assert.deepEqual(tasks.matchedAreas.map((area) => area.id), ["tasks"]);
assert.ok(tasks.docs.includes("docs/tasks-module.md"));
assert.equal(tasks.warnings.length, 1, "a mapped source change without owning docs should warn");

const tasksWithDocs = suggestDocsForPaths([
  "src/modules/tasks/tasks.service.js",
  "docs/tasks-module.md",
], { index: rawIndex, note: "Docs updated: docs/tasks-module.md." });
assert.deepEqual(tasksWithDocs.changedOwningDocs, ["docs/tasks-module.md"]);
assert.deepEqual(tasksWithDocs.warnings, []);

const workbench = suggestDocsForPaths(["public/js/workbench.js"], { index: rawIndex });
assert.deepEqual(workbench.matchedAreas.map((area) => area.id), ["workbench"]);
assert.deepEqual(workbench.docs, ["docs/ui-layout-guide.md", "docs/workflow-context-contract.md"]);

const database = suggestDocsForPaths(["src/db/migrations/071_example.sql"], { index: rawIndex });
assert.deepEqual(database.matchedAreas.map((area) => area.id), ["database"]);
assert.ok(database.docs.includes("docs/database.md"));

const licensing = suggestDocsForPaths(["docs/licensing/software-license.md"], { index: rawIndex });
assert.deepEqual(licensing.matchedAreas.map((area) => area.id), ["licensing"]);
assert.deepEqual(licensing.docs, ["docs/licensing.md", "docs/licensing/README.md"]);
assert.deepEqual(licensing.warnings, [], "a documentation-only licensing change should suggest its indexes without a source warning");

const e2e = suggestDocsForPaths(["tests/e2e/console.spec.mjs", "playwright.config.js"], { index: rawIndex });
assert.deepEqual(e2e.matchedAreas.map((area) => area.id), ["e2e-testing"]);
assert.ok(e2e.docs.includes("docs/e2e-testing.md"), "e2e harness changes should route to the e2e testing doc");

const a11y = suggestDocsForPaths(["tests/e2e/a11y.spec.mjs", "tests/e2e/support/axe.mjs"], { index: rawIndex });
assert.deepEqual(a11y.matchedAreas.map((area) => area.id), ["e2e-testing", "accessibility"]);
assert.ok(a11y.docs.includes("docs/accessibility.md"), "accessibility spec changes should route to the accessibility doc");
assert.ok(a11y.docs.includes("docs/e2e-testing.md"), "accessibility specs stay part of the e2e harness routing");

const acknowledged = suggestDocsForPaths(["src/modules/tasks/tasks.service.js"], {
  index: rawIndex,
  note: "No docs change needed: internal refactor preserved the documented Tasks contract.",
});
assert.deepEqual(acknowledged.warnings, [], "an explicit no-doc-change note should acknowledge the warning-only gate");
assert.equal(acknowledged.missingDocsAreas.length, 1, "acknowledgement should not hide the underlying review result");

const unmapped = suggestDocsForPaths(["unmapped/example.txt"], { index: rawIndex });
assert.deepEqual(unmapped.matchedAreas, []);
assert.deepEqual(unmapped.docs, []);
assert.deepEqual(unmapped.warnings, []);

assert.match(formatDocsSuggestion(tasks, { check: true }), /Warnings \(warning-only\):[\s\S]*Documentation gate mode: warning-only/);
assert.equal(packageJson.scripts["docs:suggest"], "node scripts/suggest-docs-for-changes.mjs");
assert.equal(packageJson.scripts["docs:check"], "node scripts/suggest-docs-for-changes.mjs --check");
assert.match(guide, /No docs change needed: <short reason>/);
assert.match(readme, /docs\/docs-ownership\.md/);

console.log("Documentation ownership routing and warning-only gate passed.");
