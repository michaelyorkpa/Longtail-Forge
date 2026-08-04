export const regressionMeta = Object.freeze({
  id: "release.regression-routing-commands",
  area: "release",
  tier: "release-gate",
  tags: ["commands", "release", "routing"],
  description: "Proves narrow package commands and conservative changed-file routing retain the full release gate.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AREA_COMMANDS,
  parseNameStatusDiff,
  suggestRegressionsForPaths,
} from "../../lib/regression-change-routing.mjs";
import { CANONICAL_REGRESSION_AREAS } from "../../lib/regression-metadata.mjs";

const manifest = JSON.parse(readFileSync("scripts/regression-coverage-manifest.json", "utf8"));

assert.deepEqual(Object.keys(AREA_COMMANDS).sort(), [...CANONICAL_REGRESSION_AREAS].sort(), "every canonical area must expose one package command");
for (const [area, _command] of Object.entries(AREA_COMMANDS)) {
    const representative = manifest.regressions.find((entry) => entry.area === area);
  assert.ok(representative, `${area} must remain populated in the discovered registry`);
  assert.equal(
    suggestRegressionsForPaths([representative.path]).areas.includes(area),
    true,
    `${representative.path} must route through its registered ${area} ownership`,
  );
}

const positiveRoutes = [
  ["Tasks", ["src/modules/tasks/tasks.service.js"], ["tasks"], false],
  ["Time Tracking", ["src/modules/time-tracking/time-entries.service.js"], ["time-tracking"], false],
  ["Lists", ["src/modules/lists/lists.service.js"], ["lists"], false],
  ["Files", ["src/modules/files/files.routes.js", "public/js/files.js"], ["files"], true],
  ["Search", ["src/core/search/indexer-registry.js"], ["search"], false],
  ["Notifications", ["src/services/notifications.service.js"], ["notifications"], false],
  ["Tags", ["src/services/tags.service.js"], ["tags"], false],
  ["Jobs", ["src/core/jobs/job-runner.js"], ["framework", "jobs"], true],
  ["Public API", ["src/modules/tasks/public-api.routes.js"], ["permissions", "public-api", "tasks"], true],
  ["Licensing docs", ["docs/licensing/software-license.md"], ["docs", "licensing"], false],
  ["Licensing gate", ["scripts/lib/licensing-gates.mjs"], ["licensing", "release"], true],
];
for (const [label, paths, expectedAreas, fullCheckRecommended] of positiveRoutes) {
  const suggestion = suggestRegressionsForPaths(paths);
  assert.deepEqual(suggestion.areas, expectedAreas, `${label} should select its complete owner set`);
  assert.equal(suggestion.fullCheckRecommended, fullCheckRecommended, `${label} escalation should remain intentional`);
}

const additiveRoutes = [
  ["Tags repository", ["src/repositories/tags.repo.js"], ["database", "tags"]],
  ["Lists documentation", ["docs/lists-module.md"], ["docs", "lists"]],
  ["shared Tags browser helper", ["public/js/shared/tags.js"], ["framework", "tags"]],
  ["workspace backup", ["docs/workspace-backup.md"], ["database", "docs", "permissions", "release"]],
];
for (const [label, paths, expectedAreas] of additiveRoutes) {
  assert.deepEqual(suggestRegressionsForPaths(paths).areas, expectedAreas, `${label} should retain every overlapping owner`);
}

for (const [filePath, expectedAreas] of [
  ["docs/session-notes.md", ["docs"]],
  ["docs/workspace-planning.md", ["docs"]],
  ["src/modules/tasks/session-summary.js", ["tasks"]],
]) {
  const suggestion = suggestRegressionsForPaths([filePath]);
  assert.deepEqual(suggestion.areas, expectedAreas, `${filePath} must not trigger a permission route by substring`);
  assert.equal(suggestion.areas.includes("permissions"), false);
}

const renamedPaths = parseNameStatusDiff("R100\0src/modules/tasks/old.js\0src/modules/notes/new.js\0").flatMap(({ paths }) => paths);
assert.deepEqual(suggestRegressionsForPaths(renamedPaths).areas, ["notes", "tasks"], "renames must route both old and new owners");
const deletedPaths = parseNameStatusDiff("D\0src/modules/lists/retired.js\0").flatMap(({ paths }) => paths);
assert.deepEqual(suggestRegressionsForPaths(deletedPaths).areas, ["lists"], "deletions must retain the deleted path owner");
assert.throws(() => parseNameStatusDiff("R100\0src/old.js\0"), /Incomplete git diff entry/);

const generatedContract = suggestRegressionsForPaths(["scripts/regression-coverage-manifest.json"]);
assert.deepEqual(generatedContract.areas, ["release"]);
assert.equal(generatedContract.fullCheckRecommended, true);

const bookkeeping = suggestRegressionsForPaths(["CHANGELOG.md", "ROADMAP.md"]);
assert.deepEqual(bookkeeping.areas, ["release"]);
assert.equal(bookkeeping.fullCheckRecommended, false);
const versionBookkeeping = suggestRegressionsForPaths(["package.json", "package-lock.json"], {
  versionBookkeepingPaths: ["package.json", "package-lock.json"],
});
assert.deepEqual(versionBookkeeping.areas, ["release"]);
assert.equal(versionBookkeeping.fullCheckRecommended, false);
assert.equal(suggestRegressionsForPaths(["package.json", "package-lock.json"]).fullCheckRecommended, true, "executable package edits must still escalate");
assert.equal(suggestRegressionsForPaths(["scripts/run-changed-regressions.mjs"]).fullCheckRecommended, true, "runner self-edits must escalate");
assert.equal(suggestRegressionsForPaths(["scripts/run-regressions-notes.mjs"]).fallback, true, "lookalike runner names must not enter the release allowlist");
assert.equal(suggestRegressionsForPaths(["unmapped/example.txt"]).fullCheckRecommended, true, "unknown paths should require full escalation");
assert.equal(suggestRegressionsForPaths([]).releaseGate, "npm run check");
assert.deepEqual(suggestRegressionsForPaths([]).commands, [], "an empty change set should not suggest a passing fallback run");

console.log("Narrow regression commands and changed-area routing passed.");
