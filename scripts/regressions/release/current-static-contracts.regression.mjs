export const regressionMeta = Object.freeze({
  id: "release.current-static-contracts",
  area: "release",
  tier: "release-gate",
  tags: ["commands", "compose", "deployment", "release", "security", "tooling"],
  description: "Proves current release command, Compose deployment, maintenance-curtain, and retired-path contracts through one table-driven source owner.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { REGRESSION_ENTRIES } from "../../regression-suite.mjs";
import { createProjectTextReader, escapeRegExp, sourceContainsInOrder } from "../../test-support/source-scan.mjs";

const { readJson, readText } = createProjectTextReader();
const packageJson = JSON.parse(readText("package.json"));
const scripts = packageJson.scripts;
const consolidation = readJson("scripts/current-static-contract-consolidation.json");
const coveragePolicy = readJson("scripts/regression-coverage-exceptions.json");

assert.equal(consolidation.schemaVersion, 1);
assert.equal(consolidation.version, "0.33.33.8");
assert.deepEqual(consolidation.before, { discoveredScripts: 458, releaseDocsStaticScripts: 36, movedAssertions: 60 });
assert.deepEqual(consolidation.after, { discoveredScripts: 456, releaseDocsStaticScripts: 34 });
assert.equal(consolidation.movements.reduce((total, movement) => total + movement.assertionCount, 0), 60);
assert.equal(consolidation.trueDuplicates.reduce((total, duplicate) => total + duplicate.assertionCount, 0), 45);
assert.equal(new Set(consolidation.trueDuplicates.map((duplicate) => duplicate.path)).size, consolidation.trueDuplicates.length);
assert.equal(REGRESSION_ENTRIES.length, consolidation.after.discoveredScripts);
assert.equal(
  REGRESSION_ENTRIES.filter((entry) => entry.runMode === "static" && ["docs", "release"].includes(entry.area)).length,
  consolidation.after.releaseDocsStaticScripts,
);

const activeIds = new Set(REGRESSION_ENTRIES.map((entry) => entry.id));
const activePaths = new Set(REGRESSION_ENTRIES.map((entry) => entry.path));
const retirements = new Map(coveragePolicy.retiredScripts.map((entry) => [entry.script, entry]));
for (const movement of consolidation.movements) {
  assert.equal(activePaths.has(movement.path), false, `${movement.path} must leave active discovery`);
  assert.equal(activeIds.has(movement.retainedOwner), true, `${movement.retainedOwner} must own the moved assertions`);
  const retirement = retirements.get(movement.path);
  assert.equal(retirement?.retiredInVersion, consolidation.version);
  assert.equal(retirement?.retirementType, "assertions-moved");
  assert.equal(retirement?.assertionInventory?.sourceAssertionCount, movement.assertionCount);
  assert.ok(retirement?.retainedCoverageOwners.includes(movement.retainedOwner));
}
for (const duplicate of consolidation.trueDuplicates) {
  assert.equal(activeIds.has(duplicate.retainedOwner), true, `${duplicate.retainedOwner} must retain current proof`);
}

const archivedEvidencePattern = /(?:readFileSync|readFile|readText|readMarkdown)\s*\(\s*["'](?:ROADMAP-ARCHIVE|CHANGELOG)\.md["']|(?:archive|roadmapArchive|changelog)\s*:\s*["'](?:ROADMAP-ARCHIVE|CHANGELOG)\.md["']/;
assert.match('readFileSync("CHANGELOG.md", "utf8")', archivedEvidencePattern, "the archived-evidence audit must reject a synthetic stale owner");
for (const entry of REGRESSION_ENTRIES.filter((candidate) => candidate.tier === "release-gate" && candidate.path !== "scripts/regressions/release/current-static-contracts.regression.mjs")) {
  assert.doesNotMatch(readText(entry.path), archivedEvidencePattern, `${entry.id} must prove current contracts without archived roadmap or changelog evidence`);
}

const sourceContracts = [
  {
    path: "eslint.config.js",
    matches: [
      "src/**/*.js", "server.js", "worker.js", "scripts/**/*.mjs", "tests/**/*.mjs",
      "vitest.config.mjs", "playwright.config.js", "eslint.config.js", "public/**/*.js",
    ].map((value) => new RegExp(escapeRegExp(value))),
  },
  {
    path: "vitest.config.mjs",
    matches: [/tests\/\*\*\/\*\.test\.mjs/],
  },
  {
    path: "scripts/release/longtail-forge-compose-deploy-host.example",
    matches: [
      /MAINTENANCE_STATE_ROOT="\$\{LTF_MAINTENANCE_STATE_ROOT:-\/var\/lib\/longtail-forge-maintenance\}"/,
      /DEPLOYMENT_MARKER="\$MAINTENANCE_STATE_ROOT\/deployment\/maintenance\.on"/,
      /assert_marker/, /clear_marker/, /backup_with_state/, /restore_with_state/,
      /verify_container_posture/, /verify_runtime/, /LONGTAIL_RELEASE_BRANCH=main/,
      /only protected main release metadata is accepted/, /image reference must be digest-addressed/,
      /pre-upgrade-\$OPERATION_ID\.ltfbackup\.tgz/, /pre-rollback-\$OPERATION_ID\.ltfbackup\.tgz/,
      /native better-sqlite3 proof is missing/, /registry SBOM attestation is missing/,
      /registry provenance attestation is missing/, /deployment\/maintenance\.on/,
      /resolved Compose application posture is not the reviewed non-root read-only loopback contract/,
      /automated deployment requires the recorded known-good Compose baseline/,
      /candidate and verified recovery did not complete; deployment marker and protected evidence remain/,
      /rollback and current-state recovery failed; deployment marker and all protected evidence remain/,
    ],
    excludes: [/systemctl|longtail-forge\.service|\/opt\/longtail-forge\/current/, /trap .*clear_marker|trap .* EXIT/],
  },
  {
    path: "docs/longtail-forge-compose-deploy-helper.env.example",
    matches: [
      /LTF_MAINTENANCE_STATE_ROOT=\/var\/lib\/longtail-forge-maintenance/,
      /never changes the operator marker/,
      /root:root[\s\S]*ownership and mode 0600/,
      /LTF_BACKUP_ROOT=\/var\/backups\/longtail-forge\/compose/,
    ],
    excludes: [/LONGTAIL_SECURE_NOTES_MASTER_KEY|PASSWORD=|TOKEN=/],
  },
  {
    path: "docs/preview-deployment.md",
    matches: [
      /deployment-owned maintenance marker/i,
      /failed restore, startup, identity, or workflow check stays curtained/i,
      /Retired production paths/,
      /Direct Node\/systemd production operation has no release gate/,
    ],
    excludes: [/Transition-only bare-metal installation|Existing-host initial cutover/],
  },
  {
    path: "docs/internet-deployment.md",
    matches: [/Keep both public and private proxies running/i],
  },
  {
    path: "scripts/container-deployment-smoke.mjs",
    matches: [/verifyMaintenanceCurtain/, /restoreBackup\(previous\.image, recoveryVolume\)/, /verifyDatabaseIntegrity/],
  },
  {
    path: ".github/workflows/promotion.yml",
    excludes: [/bare-metal-recovery|bare-metal:smoke|BARE_METAL_RESULT/],
  },
  {
    path: ".github/workflows/nightly.yml",
    excludes: [/Deploy demo development|ssh-root-owned-host-helper|LTF_DEPLOY_INBOX|LTF_DEPLOY_HELPER|--mode deploy/],
  },
  {
    path: ".github/workflows/manual-release.yml",
    matches: [/longtail-forge-compose-deploy-host\.example/],
    excludes: [/compose-cutover|longtail-forge-deploy-host/],
  },
  {
    path: "scripts/release/deploy-via-ssh.mjs",
    matches: [
      /--mode must be compose-deploy or compose-rollback/, /validatePublishedReleaseMetadata/,
      /LTF_COMPOSE_DEPLOY_INBOX/, /LTF_COMPOSE_DEPLOY_HELPER/, /--expected-image-digest/,
      /BatchMode=yes/, /UserKnownHostsFile=/,
    ],
    excludes: [/LTF_DEPLOY_INBOX|LTF_DEPLOY_HELPER|--artifact|--revision/],
  },
  {
    path: ".gitattributes",
    matches: [/^scripts\/release\/longtail-forge-compose-deploy-host\.example text eol=lf$/m],
    excludes: [/longtail-forge-(?:deploy|compose-cutover)-host\.example/],
  },
];

for (const contract of sourceContracts) {
  const source = readText(contract.path);
  for (const pattern of contract.matches || []) assert.match(source, pattern, `${contract.path} must retain ${pattern}`);
  for (const pattern of contract.excludes || []) assert.doesNotMatch(source, pattern, `${contract.path} must exclude ${pattern}`);
}

const narrowVitestOwners = {
  "test:contracts": [
    "tests/contracts/files-contracts.test.mjs",
    "tests/contracts/normalizers-timezones.test.mjs",
    "tests/contracts/tasks-contracts.test.mjs",
    "tests/contracts/time-tracking-contracts.test.mjs",
  ],
  "test:files": ["tests/contracts/files-contracts.test.mjs"],
  "test:tasks": ["tests/contracts/tasks-contracts.test.mjs"],
  "test:time-tracking": [
    "tests/contracts/time-tracking-contracts.test.mjs",
    "tests/time-tracking/time-tracking-billing.test.mjs",
  ],
};
for (const [scriptName, owners] of Object.entries(narrowVitestOwners)) {
  assert.equal(scripts[scriptName], `vitest run ${owners.join(" ")}`, `${scriptName} must name its owned Vitest coverage exactly`);
  assert.doesNotMatch(scripts[scriptName], /--passWithNoTests/, `${scriptName} must fail when owned coverage disappears`);
  for (const owner of owners) assert.ok(statSync(owner).isFile(), `${scriptName} owner ${owner} must exist`);
}

const check = `${String(scripts["check:fast"] || "")} ${String(scripts.check || "")}`;
assert.equal(sourceContainsInOrder(check, [
  "npm run typecheck", "npm run test:unit", "npm run lint", "npm run test:regressions",
]), true, "fast checks must precede the stateful regression suite");
assert.match(check, /&&/, "check stages must remain fail-fast");

for (const testFile of [
  "tests/contracts/files-contracts.test.mjs",
  "tests/contracts/tasks-contracts.test.mjs",
  "tests/unit/asset-version.test.mjs",
  "tests/unit/bounded-pagination.test.mjs",
  "tests/unit/client-project-options.test.mjs",
  "tests/unit/focus-mode-resolution.test.mjs",
  "tests/unit/resume-producer-payload.test.mjs",
  "tests/unit/sqlite-health-formatter.test.mjs",
  "tests/unit/work-candidate-ranking.test.mjs",
]) assert.ok(statSync(testFile).isFile(), `${testFile} must remain in the fast unit suite`);

assert.equal(existsSync("scripts/check-js.mjs"), false, "the duplicate syntax subprocess must stay retired");
const legacySnapshot = JSON.parse(readText("scripts/regression-legacy-snapshot.json"));
assert.ok(!legacySnapshot.scripts.some(({ path }) => path === "scripts/check-js.mjs"));
assert.ok(packageJson.devDependencies.typescript);
assert.ok(packageJson.devDependencies.vitest);
assert.ok(packageJson.dependencies.zod);
assert.equal(packageJson.dependencies.typescript, undefined);
assert.equal(packageJson.dependencies.vitest, undefined);
assert.equal(scripts["bare-metal:smoke"], undefined);

const composeHelper = readText("scripts/release/longtail-forge-compose-deploy-host.example");
const deployStart = composeHelper.lastIndexOf("\nassert_marker\n", composeHelper.indexOf('if test "$MODE" = "deploy"'));
const deployEnd = composeHelper.indexOf('test -f "$CURRENT_STATE" || fail "rollback requires a recorded current release"');
assert.equal(sourceContainsInOrder(composeHelper.slice(deployStart, deployEnd), [
  "assert_marker", "backup_with_state", 'compose "$RELEASE_ENV" up -d', 'verify_runtime "$METADATA"', "clear_marker",
]), true, "deploy must remain curtained through backup, startup, and identity proof");
assert.equal(sourceContainsInOrder(composeHelper.slice(composeHelper.indexOf('test -f "$PREVIOUS_STATE"')), [
  "backup_with_state", "restore_with_state", 'verify_runtime "$METADATA"', "clear_marker",
]), true, "rollback must remain curtained through backup, restore, and identity proof");

for (const retiredPath of [
  "scripts/bare-metal-deployment-smoke.mjs",
  "scripts/release/longtail-forge-deploy-host.example",
  "scripts/release/longtail-forge-compose-cutover-host.example",
  "docs/longtail-forge-deploy-helper.env.example",
  "docs/longtail-forge-compose-cutover-helper.env.example",
  "docs/longtail-forge.service.example",
]) assert.equal(existsSync(retiredPath), false, `${retiredPath} must stay retired`);

console.log("Current release static contracts passed.");
