export const regressionMeta = Object.freeze({
  id: "release.playwright-dev-only-boundary",
  area: "release",
  tier: "release-gate",
  tags: ["closeout", "e2e", "release", "tooling"],
  description: "Pins the reviewed Playwright 1.62.1 browser baseline and proves Playwright and axe stay dev/test-only with zero runtime imports, unchanged startup/check commands, and a documented reproducible e2e/a11y harness.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { assertRoadmapCursorAtLeast } from "../../lib/roadmap-cursor.mjs";
import { readRuntimeSourceEntries } from "../../test-support/source-scan.mjs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const packageLock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const rootLock = packageLock.packages[""];
const playwrightTestLock = packageLock.packages["node_modules/@playwright/test"];
const playwrightLock = packageLock.packages["node_modules/playwright"];
const playwrightCoreLock = packageLock.packages["node_modules/playwright-core"];
const dependencies = packageJson.dependencies || {};
const devDependencies = packageJson.devDependencies || {};
const scripts = packageJson.scripts || {};

// Dependency placement: Playwright and axe are dev tooling, never runtime
// dependencies.
assert.equal(devDependencies["@playwright/test"], "^1.62.1", "@playwright/test must use the reviewed 1.62.1 development baseline");
assert.equal(dependencies["@playwright/test"], undefined, "@playwright/test must never ship as a runtime dependency");
assert.equal(rootLock.devDependencies["@playwright/test"], "^1.62.1", "the lockfile root should match the Playwright package contract");
assert.equal(playwrightTestLock.version, "1.62.1", "@playwright/test should resolve to the reviewed 1.62.1 baseline");
assert.equal(playwrightTestLock.dev, true, "@playwright/test must remain development-only in the resolved graph");
assert.equal(playwrightTestLock.dependencies.playwright, "1.62.1", "@playwright/test should depend on the matching Playwright runtime");
assert.equal(playwrightTestLock.engines.node, ">=20", "Playwright's Node floor must remain compatible with the repository's Node 24 line");
assert.equal(playwrightLock.version, "1.62.1", "playwright should resolve to the reviewed 1.62.1 baseline");
assert.equal(playwrightLock.dev, true, "playwright must remain development-only in the resolved graph");
assert.equal(playwrightLock.dependencies["playwright-core"], "1.62.1", "playwright should depend on the matching core runtime");
assert.equal(playwrightCoreLock.version, "1.62.1", "playwright-core should resolve to the reviewed 1.62.1 baseline");
assert.equal(playwrightCoreLock.dev, true, "playwright-core must remain development-only in the resolved graph");
assert.deepEqual(
  Object.keys(packageLock.packages).filter((name) => /(?:experimental-ct|playwright-ct)/i.test(name)),
  [],
  "the component-testing package family must not enter the resolved graph",
);
assert.equal(
  Object.keys(dependencies).some((name) => /playwright/i.test(name)),
  false,
  "no Playwright package may appear in production dependencies",
);
assert.ok(devDependencies["@axe-core/playwright"], "@axe-core/playwright must be a devDependency");
assert.equal(dependencies["@axe-core/playwright"], undefined, "@axe-core/playwright must never ship as a runtime dependency");
assert.equal(
  Object.keys(dependencies).some((name) => /axe-core/i.test(name)),
  false,
  "no axe package may appear in production dependencies",
);

// Boot path and gate separation: npm start stays a pure Node boot, and the
// fast static gate never requires browser binaries.
assert.doesNotMatch(String(scripts.check || ""), /playwright|axe/i, "npm run check must never invoke Playwright or axe");

// No runtime source may import or reference Playwright or the e2e harness.
// The rendered smoke drives the app from outside; the app never knows it exists.
const runtimeEntries = [
  { filePath: "server.js", source: readFileSync("server.js", "utf8") },
  ...readRuntimeSourceEntries({ sourceDir: "src" }),
  ...readRuntimeSourceEntries({ sourceDir: "public" }),
];
const PLAYWRIGHT_REFERENCE = /@playwright\/test|["']playwright["']|@axe-core|["']axe-core["']|tests\/e2e/;
const runtimeViolations = runtimeEntries
  .filter((entry) => PLAYWRIGHT_REFERENCE.test(entry.source))
  .map((entry) => entry.filePath);
assert.deepEqual(
  runtimeViolations,
  [],
  `no src/, server.js, or public/ file may import Playwright or axe, or reach into tests/e2e:\n${runtimeViolations.join("\n")}`,
);

// The harness is reproducible from a clean checkout: config, support files,
// the concern specs, the accessibility specs, the auth setup, and the
// documentation all exist.
const REQUIRED_HARNESS_FILES = [
  "playwright.config.js",
  "scripts/run-playwright-e2e.mjs",
  "tests/e2e/support/e2e-env.mjs",
  "tests/e2e/support/start-e2e-server.mjs",
  "tests/e2e/support/surfaces.mjs",
  "tests/e2e/support/axe.mjs",
  "tests/e2e/auth.setup.mjs",
  "tests/e2e/app-load.spec.mjs",
  "tests/e2e/login.spec.mjs",
  "tests/e2e/user-settings-appearance.spec.mjs",
  "tests/e2e/settings-universal-actions.spec.mjs",
  "tests/e2e/settings-admin-navigation.spec.mjs",
  "tests/e2e/overflow.spec.mjs",
  "tests/e2e/mobile-nav.spec.mjs",
  "tests/e2e/console.spec.mjs",
  "tests/e2e/modal.spec.mjs",
  "tests/e2e/a11y.spec.mjs",
  "tests/e2e/a11y-keyboard.spec.mjs",
  "docs/e2e-testing.md",
];
for (const requiredPath of REQUIRED_HARNESS_FILES) {
  assert.ok(existsSync(requiredPath), `${requiredPath} must exist in clean clones`);
}

const playwrightConfig = readFileSync("playwright.config.js", "utf8");
assert.match(playwrightConfig, /testDir: "tests\/e2e"/, "the e2e suite must stay in the dedicated tests/e2e folder");
assert.match(playwrightConfig, /name: "desktop"/, "the named desktop viewport project must remain");
assert.match(playwrightConfig, /name: "mobile"/, "the named mobile viewport project must remain");
assert.match(playwrightConfig, /dependencies: \["setup"\]/, "viewport projects must retain the authenticated setup dependency");
assert.match(playwrightConfig, /storageState: E2E_STORAGE_STATE_PATH/, "viewport projects must retain the saved authenticated state");
assert.match(playwrightConfig, /grepInvert: \/@mobile\//, "the desktop project must exclude explicitly mobile-only tests before setup");
assert.match(playwrightConfig, /grepInvert: \/@desktop\//, "the mobile project must exclude explicitly desktop-only tests before setup");
assert.match(playwrightConfig, /retries: isCI \? 1 : 0/, "CI must retry browser failures once while local runs remain single-attempt");
assert.match(playwrightConfig, /workers: 2/, "browser execution must stay at the measured shared-server-safe two-worker bound");
assert.match(playwrightConfig, /trace: isCI \? "on-first-retry" : "retain-on-failure"/, "CI retries and local failures must retain actionable traces");
assert.match(playwrightConfig, /screenshot: "only-on-failure"/, "browser failures must retain screenshots");
assert.doesNotMatch(playwrightConfig, /webServer:/, "the config must not delegate Windows process-tree teardown to Playwright's shell wrapper");

assert.equal(scripts["test:e2e"], "node scripts/run-playwright-e2e.mjs", "the canonical browser command must own managed-server cleanup");
assert.equal(scripts["test:e2e:ui"], "node scripts/run-playwright-e2e.mjs --ui", "UI mode must use the same managed-server owner");
assert.equal(
  scripts["test:a11y"],
  "node scripts/run-playwright-e2e.mjs tests/e2e/a11y.spec.mjs tests/e2e/a11y-keyboard.spec.mjs",
  "the accessibility subset must use the same managed-server owner",
);
const playwrightRunner = readFileSync("scripts/run-playwright-e2e.mjs", "utf8");
assert.match(playwrightRunner, /spawn\(process\.execPath/, "the managed server and Playwright CLI must launch without a shell wrapper");
assert.match(playwrightRunner, /await stopManagedServer\(managedServer\)/, "the managed runner must always await server cleanup");
assert.match(playwrightRunner, /child\.kill\("SIGKILL"\)/, "managed cleanup must have a bounded forced fallback");

const e2eSpecSource = readdirSync("tests/e2e", { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".spec.mjs"))
  .map((entry) => readFileSync(`tests/e2e/${entry.name}`, "utf8"))
  .join("\n");
assert.doesNotMatch(
  e2eSpecSource,
  /test\.skip\s*\(/,
  "project selection must happen through explicit tags instead of in-body test.skip calls",
);
assert.equal((e2eSpecSource.match(/tag: "@mobile"/g) || []).length, 9, "all nine mobile-only tests must be tagged explicitly");
assert.equal((e2eSpecSource.match(/tag: "@desktop"/g) || []).length, 11, "all eleven desktop-only tests must be tagged explicitly");

const developmentWorkflow = readFileSync(".github/workflows/development-pr.yml", "utf8");
assert.match(
  developmentWorkflow,
  /^\s+name: Browser smoke and accessibility$/m,
  "the required development pull-request Browser check name must remain stable",
);

const e2eDocs = readFileSync("docs/e2e-testing.md", "utf8");
assert.match(e2eDocs, /test:e2e:install/, "e2e docs must cover browser installation");
assert.match(e2eDocs, /npm run test:e2e/, "e2e docs must cover running the suite");
assert.match(e2eDocs, /dev\/test-only/i, "e2e docs must state the dev/test-only boundary");
assert.match(e2eDocs, /allowlist/i, "e2e docs must document the console allowlist policy");
assert.match(e2eDocs, /@mobile/, "e2e docs must explain explicit mobile-only selection");
assert.match(e2eDocs, /@desktop/, "e2e docs must explain explicit desktop-only selection");

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
