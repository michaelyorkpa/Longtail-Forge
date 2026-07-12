export const regressionMeta = Object.freeze({
  id: "release.playwright-dev-only-boundary",
  area: "release",
  tier: "release-gate",
  tags: ["closeout", "e2e", "release", "tooling"],
  description: "Proves Playwright stays dev/test-only: devDependencies placement, zero runtime imports, unchanged npm start, a browser-free npm run check, and a documented reproducible e2e harness.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { assertRoadmapCursorAtLeast } from "../../lib/roadmap-cursor.mjs";
import { readRuntimeSourceEntries } from "../../test-support/source-scan.mjs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const dependencies = packageJson.dependencies || {};
const devDependencies = packageJson.devDependencies || {};
const scripts = packageJson.scripts || {};

// Dependency placement: Playwright is dev tooling, never a runtime dependency.
assert.ok(devDependencies["@playwright/test"], "@playwright/test must be a devDependency");
assert.equal(dependencies["@playwright/test"], undefined, "@playwright/test must never ship as a runtime dependency");
assert.equal(
  Object.keys(dependencies).some((name) => /playwright/i.test(name)),
  false,
  "no Playwright package may appear in production dependencies",
);

// Boot path and gate separation: npm start stays a pure Node boot, and the
// fast static gate never requires browser binaries.
assert.equal(scripts.start, "node server.js", "npm start must remain node server.js with no Playwright involvement");
assert.doesNotMatch(String(scripts.check || ""), /playwright/i, "npm run check must never invoke Playwright");
assert.equal(scripts["test:e2e"], "playwright test", "test:e2e must run the Playwright suite once");
assert.equal(scripts["test:e2e:install"], "playwright install chromium", "test:e2e:install must install the browser binaries on demand");

// No runtime source may import or reference Playwright or the e2e harness.
// The rendered smoke drives the app from outside; the app never knows it exists.
const runtimeEntries = [
  { filePath: "server.js", source: readFileSync("server.js", "utf8") },
  ...readRuntimeSourceEntries({ sourceDir: "src" }),
  ...readRuntimeSourceEntries({ sourceDir: "public" }),
];
const PLAYWRIGHT_REFERENCE = /@playwright\/test|["']playwright["']|tests\/e2e/;
const runtimeViolations = runtimeEntries
  .filter((entry) => PLAYWRIGHT_REFERENCE.test(entry.source))
  .map((entry) => entry.filePath);
assert.deepEqual(
  runtimeViolations,
  [],
  `no src/, server.js, or public/ file may import Playwright or reach into tests/e2e:\n${runtimeViolations.join("\n")}`,
);

// The harness is reproducible from a clean checkout: config, support files,
// the four concern specs, the auth setup, and the documentation all exist.
const REQUIRED_HARNESS_FILES = [
  "playwright.config.js",
  "tests/e2e/support/e2e-env.mjs",
  "tests/e2e/support/start-e2e-server.mjs",
  "tests/e2e/support/surfaces.mjs",
  "tests/e2e/auth.setup.mjs",
  "tests/e2e/app-load.spec.mjs",
  "tests/e2e/overflow.spec.mjs",
  "tests/e2e/mobile-nav.spec.mjs",
  "tests/e2e/console.spec.mjs",
  "docs/e2e-testing.md",
];
for (const requiredPath of REQUIRED_HARNESS_FILES) {
  assert.ok(existsSync(requiredPath), `${requiredPath} must exist in clean clones`);
}

const playwrightConfig = readFileSync("playwright.config.js", "utf8");
assert.match(playwrightConfig, /testDir: "tests\/e2e"/, "the e2e suite must stay in the dedicated tests/e2e folder");
assert.match(playwrightConfig, /name: "desktop"/, "the named desktop viewport project must remain");
assert.match(playwrightConfig, /name: "mobile"/, "the named mobile viewport project must remain");

const e2eDocs = readFileSync("docs/e2e-testing.md", "utf8");
assert.match(e2eDocs, /test:e2e:install/, "e2e docs must cover browser installation");
assert.match(e2eDocs, /npm run test:e2e/, "e2e docs must cover running the suite");
assert.match(e2eDocs, /dev\/test-only/i, "e2e docs must state the dev/test-only boundary");
assert.match(e2eDocs, /allowlist/i, "e2e docs must document the console allowlist policy");

// Branch-closeout bookkeeping through the shared monotonic cursor floor.
assertRoadmapCursorAtLeast("0.33.9", "live roadmap should advance past the completed Playwright smoke foundation branch");
const roadmap = readFileSync("ROADMAP.md", "utf8");
assert.doesNotMatch(
  roadmap,
  /^## Version 0\.33\.8 - Playwright End-to-End Smoke Foundation/m,
  "live roadmap should not keep the completed Playwright foundation branch open",
);
assert.doesNotMatch(
  roadmap,
  /^### Version 0\.33\.8\.1 - Playwright dev-dependency install and config/m,
  "live roadmap should not keep the completed dev-dependency slice body",
);
assert.doesNotMatch(
  roadmap,
  /^### Version 0\.33\.8\.2 - Core smoke specs/m,
  "live roadmap should not keep the completed core smoke slice body",
);
assert.doesNotMatch(
  roadmap,
  /^### Version 0\.33\.8\.3 - Guardrails, docs, and closeout/m,
  "live roadmap should not keep the completed closeout slice body",
);

console.log("Playwright dev-only boundary guardrail passed: dev-dependency placement, zero runtime imports, unchanged npm start, browser-free check, documented harness.");
