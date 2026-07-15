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
  suggestRegressionsForPaths,
} from "../../lib/regression-change-routing.mjs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

assert.equal(packageJson.scripts["test:regressions"], "node scripts/run-regressions.mjs");
assert.equal(packageJson.scripts["test:regressions:changed"], "node scripts/run-changed-regressions.mjs");
assert.equal(packageJson.scripts["test:regressions:list"], "node scripts/run-regressions.mjs --list");
for (const [area, command] of Object.entries(AREA_COMMANDS)) {
  assert.equal(
    packageJson.scripts[`test:regressions:${area}`],
    `node scripts/run-regressions.mjs --area ${area}`,
    `${command} should select the ${area} area from the discovered registry`,
  );
}

assert.deepEqual(
  suggestRegressionsForPaths(["src/modules/tasks/tasks.service.js"]).commands,
  ["npm run test:regressions:tasks"],
);
assert.deepEqual(
  suggestRegressionsForPaths(["src/modules/files/files.routes.js", "public/js/files.js"]).commands,
  ["npm run test:regressions:files"],
);
assert.deepEqual(
  suggestRegressionsForPaths(["public/js/workbench.js", "docs/workbench.md"]).commands,
  ["npm run test:regressions:workbench"],
);
assert.deepEqual(
  suggestRegressionsForPaths(["public/js/shared/view-builder.js"]).commands,
  ["npm run test:regressions:framework", "npm run test:regressions:views"],
  "shared view primitives should conservatively select both framework and views",
);
assert.deepEqual(
  suggestRegressionsForPaths(["src/db/migrations/070_example.sql", "src/repositories/permissions.repo.js"]).commands,
  ["npm run test:regressions:database", "npm run test:regressions:permissions"],
);
assert.deepEqual(
  suggestRegressionsForPaths(["CHANGELOG.md", "package.json", "src/routes/app-info.routes.js"]).commands,
  ["npm run test:regressions:release"],
);
assert.deepEqual(
  suggestRegressionsForPaths([".github/workflows/promotion.yml", "scripts/release/deploy-via-ssh.mjs"]).commands,
  ["npm run test:regressions:release"],
);
assert.deepEqual(
  suggestRegressionsForPaths(["unmapped/example.txt"]).commands,
  ["npm run test:regressions"],
  "unmapped changes should fall back to the whole regression runner rather than guessing narrowly",
);
assert.equal(packageJson.scripts.check, "npm run typecheck && npm run test:unit && node scripts/run-regressions.mjs && eslint . --cache --cache-strategy content --cache-location .eslintcache");
assert.equal(suggestRegressionsForPaths([]).releaseGate, "npm run check");
assert.deepEqual(suggestRegressionsForPaths([]).commands, [], "an empty change set should not suggest a passing fallback run");

console.log("Narrow regression commands and changed-area routing passed.");
