export const regressionMeta = Object.freeze({
  id: "release.playwright-dev-only-boundary",
  area: "release",
  tier: "release-gate",
  tags: ["closeout", "e2e", "release", "tooling"],
  description: "Pins the reviewed Playwright 1.62.1 browser baseline and proves Playwright and axe stay dev/test-only with zero runtime imports, unchanged startup/check commands, and a documented reproducible e2e/a11y harness.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

const developmentWorkflow = readFileSync(".github/workflows/development-pr.yml", "utf8");
assert.match(
  developmentWorkflow,
  /^\s+name: Browser smoke and accessibility$/m,
  "the required development pull-request Browser check name must remain stable",
);

// Every protected workflow installs the browser through the one bounded entry
// point whose retry ordering tests/unit/install-playwright-browser.test.mjs
// proves. The 0.33.33.29 inline loop retried into the package lock a cancelled
// attempt still held, and lived in three copies no test could reach.
for (const workflowPath of [
  ".github/workflows/development-pr.yml",
  ".github/workflows/nightly.yml",
  ".github/workflows/promotion.yml",
]) {
  const workflow = readFileSync(workflowPath, "utf8");
  assert.equal(
    workflow.includes("run: node scripts/release/install-playwright-browser.mjs"),
    true,
    `${workflowPath} must install the browser through the single bounded entry point`,
  );
  assert.equal(
    workflow.includes("playwright install --with-deps chromium"),
    false,
    `${workflowPath} must not reintroduce an inline install no test can reach`,
  );
  // Worst case is 3 attempts x 240s plus 2 retries waiting on 2 locks x 60s,
  // or 960s. The 0.33.33.29 ceilings assumed retries were instant, which was
  // the defect, so they could not contain a retry that actually waits.
  const beforeInstall = workflow.slice(0, workflow.indexOf("name: Install the Playwright browser"));
  const jobBounds = [...beforeInstall.matchAll(/^ {4}timeout-minutes: (\d+)\r?$/gm)];
  assert.ok(jobBounds.length > 0, `${workflowPath} must bound the job that installs the browser`);
  assert.equal(jobBounds[jobBounds.length - 1][1], "20", `${workflowPath} must bound the browser job above the install budget plus its checks`);
  const installStep = workflow.slice(workflow.indexOf("name: Install the Playwright browser"));
  assert.match(installStep.slice(0, 200), /timeout-minutes: 18/, `${workflowPath} must bound the install step above its 16-minute worst case`);
}
const installEntryPoint = readFileSync("scripts/release/install-playwright-browser.mjs", "utf8");
assert.match(installEntryPoint, /SIGKILL/, "a timed-out attempt must be hard-killed, not only signalled");
// The wait must be on the package-manager process. Waiting on the lock files
// with flock(1) was a proven no-op: it uses flock(2) while apt uses fcntl
// record locks, so it returned instantly and the retry raced the cancelled
// attempt anyway.
assert.equal(installEntryPoint.includes("pgrep -x apt-get"), true, "the retry must wait for the package-manager process, not a lock file");
assert.equal(installEntryPoint.includes(String.fromCharCode(34) + "flock" + String.fromCharCode(34)), false, "flock does not conflict with apt fcntl locks and must not be used as the wait command");
assert.equal(installEntryPoint.includes("DPkg::Lock::Timeout"), true, "apt must be configured to wait for a contended lock rather than fail fast");

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
