export const regressionMeta = Object.freeze({
  id: "framework.full-strict-governance",
  area: "framework",
  tier: "release-gate",
  tags: ["contracts", "framework", "release", "typecheck"],
  description: "Proves every first-party JavaScript file belongs to one full-strict program and exact debt can only shrink behind the generated compiler ledger.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs";
import {
  PROGRAMS,
  collectSourcePolicy,
  firstPartyJavaScriptFiles,
  isFirstPartyDirectoryName,
  validateShrinkOnly,
} from "../../typecheck-governance.mjs";
import { compareDottedVersions } from "../../lib/roadmap-cursor.mjs";

/** @typedef {{ code: number, count: number }} DiagnosticCount */
/** @typedef {{ config: string, environment: string, files: string[], errorCount: number, diagnostics: Record<string, DiagnosticCount[]> }} ProgramState */
/** @typedef {{ schemaVersion: number, checkpoint: string, programs: Record<string, ProgramState>, totals: { files: number, errors: number, explicitAny: number }, explicitAnyByFile: Record<string, number>, expectedErrorDirectives: string[], declarationProbe: { config: string, firstPartyFiles: number, errors: number } }} GovernanceLedger */
/** @typedef {{ compilerOptions: Record<string, unknown>, include: string[], exclude: string[] }} TypeScriptConfig */

/** @type {GovernanceLedger} */
const ledger = JSON.parse(fs.readFileSync("scripts/typecheck-debt-ledger.json", "utf8"));
/** @type {TypeScriptConfig} */
const serverConfig = JSON.parse(fs.readFileSync("tsconfig.json", "utf8"));
/** @type {TypeScriptConfig} */
const browserConfig = JSON.parse(fs.readFileSync("tsconfig.public.json", "utf8"));
/** @type {TypeScriptConfig} */
const scriptsConfig = JSON.parse(fs.readFileSync("tsconfig.scripts.json", "utf8"));
/** @type {TypeScriptConfig} */
const declarationConfig = JSON.parse(fs.readFileSync("tsconfig.declarations.json", "utf8"));
const governanceSource = fs.readFileSync("scripts/typecheck-governance.mjs", "utf8");
const liveFiles = firstPartyJavaScriptFiles();
const declarationFiles = fs.readdirSync("src/types").filter((name) => name.endsWith(".d.ts")).map((name) => `src/types/${name}`).sort();
const sourcePolicy = collectSourcePolicy([...liveFiles, ...declarationFiles].sort());
const ledgerFiles = Object.values(ledger.programs).flatMap((program) => program.files).sort();
const firstPartyTypeSource = declarationFiles.map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
const firstPartySource = liveFiles.map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
const jobContractsSource = fs.readFileSync("src/types/job-contracts.d.ts", "utf8");
const frameworkContractsSource = fs.readFileSync("src/types/framework-contracts.d.ts", "utf8");
const frameworkJobsSeam = frameworkContractsSource.split("// Jobs seam")[1].split("export type NormalizeInferredEmptyArray")[0];
const usersModuleSource = fs.readFileSync("src/modules/users/module.js", "utf8");
const developerExampleRouteSource = fs.readFileSync("src/modules/developer-example/routes.js", "utf8");
const developerExamplePublicApiRouteSource = fs.readFileSync("src/modules/developer-example/public-api.routes.js", "utf8");

assert.equal(ledger.schemaVersion, 1);
assert.ok(
  compareDottedVersions(ledger.checkpoint, "0.33.33.25.9") >= 0,
  `ledger checkpoint stamp ${ledger.checkpoint} must stay at or beyond 0.33.33.25.9, the checkpoint that made the stamp write-derived; exact stamp pins are prohibited`,
);
assert.deepEqual(PROGRAMS.map((program) => program.id), ["server-tests", "browser", "scripts"]);
assert.deepEqual(Object.keys(ledger.programs), ["server-tests", "browser", "scripts"]);
assert.deepEqual(ledgerFiles, liveFiles);
assert.equal(new Set(ledgerFiles).size, liveFiles.length);
assert.equal(ledger.totals.files, liveFiles.length);
assert.equal(ledger.totals.errors, Object.values(ledger.programs).reduce((total, program) => total + program.errorCount, 0));
assert.equal(ledger.totals.explicitAny, Object.values(ledger.explicitAnyByFile).reduce((total, count) => total + count, 0));
assert.deepEqual(ledger.explicitAnyByFile, sourcePolicy.explicitAnyByFile);
assert.deepEqual(ledger.expectedErrorDirectives, sourcePolicy.expectedErrorDirectives);
assert.deepEqual(ledger.expectedErrorDirectives, [
  "tests/typecheck/browser-database-boundary.fixture.mjs:3",
  "tests/typecheck/client-project-contracts.fixture.mjs:27",
  "tests/typecheck/client-project-contracts.fixture.mjs:30",
  "tests/typecheck/database-contracts.fixture.mjs:15",
  "tests/typecheck/database-contracts.fixture.mjs:8",
  "tests/typecheck/job-payload-contracts.fixture.mjs:24",
  "tests/typecheck/job-payload-contracts.fixture.mjs:27",
  "tests/typecheck/precise-service-contracts.fixture.mjs:24",
  "tests/typecheck/precise-service-contracts.fixture.mjs:27",
  "tests/typecheck/precise-service-contracts.fixture.mjs:30",
  "tests/typecheck/task-workflow-contracts.fixture.mjs:28",
  "tests/typecheck/task-workflow-contracts.fixture.mjs:31",
  "tests/typecheck/task-server-contracts.fixture.mjs:26",
  "tests/typecheck/task-server-contracts.fixture.mjs:29",
  "tests/typecheck/time-tracking-edge-contracts.fixture.mjs:16",
  "tests/typecheck/time-tracking-server-contracts.fixture.mjs:29",
  "tests/typecheck/time-tracking-server-contracts.fixture.mjs:32",
].sort());
assert.deepEqual(ledger.declarationProbe, { config: "tsconfig.declarations.json", firstPartyFiles: 31, errors: 0 });

for (const config of [serverConfig, browserConfig, scriptsConfig]) {
  assert.equal(config.compilerOptions.allowJs, true);
  assert.equal(config.compilerOptions.checkJs, true);
  assert.equal(config.compilerOptions.strict, true);
  assert.equal(config.compilerOptions.noImplicitAny, true);
  assert.equal(config.compilerOptions.noEmit, true);
  assert.equal(config.compilerOptions.skipLibCheck, true);
}
assert.deepEqual(serverConfig.compilerOptions.types, ["node"]);
assert.deepEqual(browserConfig.compilerOptions.types, []);
assert.deepEqual(browserConfig.compilerOptions.lib, ["DOM", "DOM.Iterable", "ES2023"]);
assert.deepEqual(scriptsConfig.compilerOptions.types, ["node"]);
assert.deepEqual(serverConfig.include, ["server.js", "worker.js", "src/**/*.js", "src/**/*.d.ts", "tests/**/*.mjs"]);
assert.deepEqual(browserConfig.include, ["public/js/**/*.js", "src/types/browser-contracts.d.ts", "src/types/framework-contracts.d.ts", "tests/typecheck/browser-database-boundary.fixture.mjs"]);
assert.deepEqual(scriptsConfig.include, ["scripts/**/*.mjs", "eslint.config.js", "playwright.config.js", "vitest.config.mjs"]);
assert.equal(declarationConfig.compilerOptions.skipLibCheck, false);
assert.equal(declarationConfig.compilerOptions.strict, true);
assert.deepEqual(declarationConfig.include, ["src/types/**/*.d.ts"]);
assert.doesNotMatch(firstPartySource, /\bValidatedService\b/, "blanket-widened service exports must stay retired");
assert.doesNotMatch(
  firstPartyTypeSource,
  /\[\s*K\s+in\s+keyof[^\]]+\][\s\S]{0,500}infer\s+Args[\s\S]{0,500}\[\s*I\s+in\s+keyof\s+Args\s*\]\s*:\s*unknown/,
  "mapped service contracts must not rewrite every method argument to unknown",
);
assert.match(governanceSource, /process\.argv\.includes\("--write"\)/);
assert.match(governanceSource, /else verifyLedger\(state\)/);

for (const strictCleanPath of [
  "eslint.config.js",
  "playwright.config.js",
  "vitest.config.mjs",
  "scripts/typecheck-governance.mjs",
  "scripts/regressions/framework/full-strict-governance.regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[strictCleanPath], undefined, `${strictCleanPath} must stay strict-clean`);
  assert.equal(ledger.explicitAnyByFile[strictCleanPath], undefined, `${strictCleanPath} must not introduce explicit any`);
}
for (const strictCleanPath of [
  "src/core/linked-context/link-target-shape.js",
  "src/modules/client-projects/link-target.provider.js",
  "src/modules/lists/lists.contracts.js",
  "src/modules/lists/link-target.provider.js",
  "src/modules/notes/access-policy.js",
  "src/modules/notes/catalog-security.service.js",
  "src/modules/notes/consumer-artifacts.service.js",
  "src/modules/notes/consumer-policy.js",
  "src/modules/notes/effective-security.js",
  "src/modules/notes/library.js",
  "src/modules/notes/link-target-directory.service.js",
  "src/modules/notes/markdown.js",
  "src/modules/notes/notes.repo.js",
  "src/modules/notes/secure-crypto.js",
  "src/modules/tasks/link-target.provider.js",
  "src/modules/users/link-target.provider.js",
]) {
  assert.equal(ledger.programs["server-tests"].diagnostics[strictCleanPath], undefined, `${strictCleanPath} must stay strict-clean`);
  assert.equal(ledger.explicitAnyByFile[strictCleanPath], undefined, `${strictCleanPath} must not introduce explicit any`);
}
const notesOwnerDiagnostics = Object.keys(ledger.programs["server-tests"].diagnostics)
  .filter((filePath) => filePath.startsWith("src/modules/notes/"));
assert.deepEqual(notesOwnerDiagnostics, [], `Notes server owners must stay strict-clean after checkpoint 0.33.33.17.3`);
const notesOwnerExplicitAny = Object.keys(ledger.explicitAnyByFile)
  .filter((filePath) => filePath.startsWith("src/modules/notes/"));
assert.deepEqual(notesOwnerExplicitAny, [], `Notes server owners must stay free of explicit any after checkpoint 0.33.33.17.3`);
const listsOwnerDiagnostics = Object.keys(ledger.programs["server-tests"].diagnostics)
  .filter((filePath) => filePath.startsWith("src/modules/lists/"));
assert.deepEqual(listsOwnerDiagnostics, [], `Lists server owners must stay strict-clean after checkpoint 0.33.33.18.4`);
const listsOwnerExplicitAny = Object.keys(ledger.explicitAnyByFile)
  .filter((filePath) => filePath.startsWith("src/modules/lists/"));
assert.deepEqual(listsOwnerExplicitAny, [], `Lists server owners must stay free of explicit any after checkpoint 0.33.33.18.4`);
const tasksOwnerDiagnostics = Object.keys(ledger.programs["server-tests"].diagnostics)
  .filter((filePath) => filePath.startsWith("src/modules/tasks/"));
assert.deepEqual(tasksOwnerDiagnostics, [], `Tasks server owners must stay strict-clean after checkpoint 0.33.33.21.3`);
const tasksOwnerExplicitAny = Object.keys(ledger.explicitAnyByFile)
  .filter((filePath) => filePath.startsWith("src/modules/tasks/"));
assert.deepEqual(tasksOwnerExplicitAny, [], `Tasks server owners must stay free of explicit any after checkpoint 0.33.33.21.3`);
/** @param {string} filePath */
const clientProjectsOwnerPaths = (filePath) => (
  filePath.startsWith("src/modules/client-projects/") ||
  filePath === "src/types/client-project-contracts.d.ts" ||
  filePath === "tests/typecheck/client-project-contracts.fixture.mjs"
);
const clientProjectsOwnerDiagnostics = Object.keys(ledger.programs["server-tests"].diagnostics).filter(clientProjectsOwnerPaths);
assert.deepEqual(clientProjectsOwnerDiagnostics, [], "Clients/Projects server owners must stay strict-clean after checkpoint 0.33.33.25.1");
const clientProjectsOwnerExplicitAny = Object.keys(ledger.explicitAnyByFile).filter(clientProjectsOwnerPaths);
assert.deepEqual(clientProjectsOwnerExplicitAny, [], "Clients/Projects server owners must stay free of explicit any after checkpoint 0.33.33.25.1");
/** @param {string} filePath */
const timeTrackingOwnerPaths = (filePath) => (
  filePath.startsWith("src/modules/time-tracking/") ||
  filePath === "src/types/time-tracking-contracts.d.ts" ||
  filePath.startsWith("tests/typecheck/time-tracking-")
);
const timeTrackingOwnerDiagnostics = Object.keys(ledger.programs["server-tests"].diagnostics).filter(timeTrackingOwnerPaths);
assert.deepEqual(timeTrackingOwnerDiagnostics, [], "Time Tracking server owners must stay strict-clean after checkpoint 0.33.33.25.2");
const timeTrackingOwnerExplicitAny = Object.keys(ledger.explicitAnyByFile).filter(timeTrackingOwnerPaths);
assert.deepEqual(timeTrackingOwnerExplicitAny, [], "Time Tracking server owners must stay free of explicit any after checkpoint 0.33.33.25.2");
for (const strictCleanPath of [
  "worker.js",
  "src/core/jobs/index.js",
  "src/core/jobs/job-handlers.js",
  "src/core/jobs/job-queue.js",
  "src/core/jobs/job-runner.js",
  "src/core/jobs/job-types.js",
  "src/core/jobs/worker-cli.js",
  "src/core/jobs/worker-process-lock.js",
  "src/routes/jobs.routes.js",
  "src/services/jobs.service.js",
  "src/types/job-contracts.d.ts",
  "tests/typecheck/job-payload-contracts.fixture.mjs",
]) {
  assert.equal(ledger.programs["server-tests"].diagnostics[strictCleanPath], undefined, `${strictCleanPath} must stay strict-clean after checkpoint 0.33.33.25.3`);
  assert.equal(ledger.explicitAnyByFile[strictCleanPath], undefined, `${strictCleanPath} must stay free of explicit any after checkpoint 0.33.33.25.3`);
}
assert.doesNotMatch(frameworkJobsSeam, /\bany\b/, "the framework Jobs seam must not restore generic any payloads");
assert.match(jobContractsSource, /export interface JobPayloadRegistry/);
assert.match(jobContractsSource, /"file\.scan": FileScanJobPayload/);
assert.match(jobContractsSource, /"workspace\.purge": WorkspacePurgeJobPayload/);
assert.doesNotMatch(jobContractsSource, /\[key:\s*string\]/, "registered job payloads must not fall back to a speculative catch-all bag");
/** @param {string} filePath */
const smallOwnerPaths = (filePath) => (
  filePath.startsWith("src/core/search/") ||
  filePath.startsWith("src/services/search") ||
  filePath.startsWith("src/routes/search") ||
  filePath === "src/types/search-rebuild-contracts.d.ts" ||
  filePath.startsWith("src/repositories/notifications") ||
  filePath.startsWith("src/services/notifications") ||
  filePath.startsWith("src/routes/notifications") ||
  filePath.startsWith("src/modules/users/") ||
  filePath.startsWith("src/repositories/users") ||
  filePath.startsWith("src/services/users") ||
  filePath.startsWith("src/routes/users") ||
  filePath === "src/types/users-service-contracts.d.ts" ||
  filePath.startsWith("src/modules/tags/") ||
  filePath.startsWith("src/repositories/tags") ||
  filePath.startsWith("src/services/tags") ||
  filePath.startsWith("src/routes/tags") ||
  filePath.startsWith("src/modules/developer-example/")
);
const smallOwnerDiagnostics = Object.keys(ledger.programs["server-tests"].diagnostics).filter(smallOwnerPaths);
assert.deepEqual(smallOwnerDiagnostics, [], "Search, Notifications, Users, Tags, and developer-example owners must stay strict-clean after checkpoint 0.33.33.25.4");
const smallOwnerExplicitAny = Object.keys(ledger.explicitAnyByFile).filter(smallOwnerPaths);
assert.deepEqual(smallOwnerExplicitAny, [], "Search, Notifications, Users, Tags, and developer-example owners must stay free of explicit any after checkpoint 0.33.33.25.4");
assert.match(usersModuleSource, /function moduleDisabledNotificationBody\(\{ event \}\)/, "Users event summaries should use the named resolver-context projection");
assert.match(developerExampleRouteSource, /workspaceAsyncRoute\(async \(request, response\)/, "the example browser route should use the workspace request contract");
assert.match(developerExamplePublicApiRouteSource, /apiKeyAsyncRoute\(async \(request, response\)/, "the example public route should use the API-key request contract");
const remainingServerDiagnosticPaths = Object.keys(ledger.programs["server-tests"].diagnostics);
assert.deepEqual(
  remainingServerDiagnosticPaths,
  [],
  "the server/test program closed at checkpoint 0.33.33.26.2 and must stay at zero strict diagnostics",
);
assert.equal(
  ledger.programs["server-tests"].errorCount,
  0,
  "the server/test program's ledger section is retired at zero and may never regain debt",
);
const scriptInfrastructureDebt = Object.keys(ledger.programs.scripts.diagnostics)
  .filter((filePath) => filePath.startsWith("scripts/lib/") || filePath.startsWith("scripts/test-support/"));
assert.deepEqual(
  scriptInfrastructureDebt,
  [],
  "shared script libraries and test support closed at checkpoint 0.33.33.27 and must stay strict-clean",
);
const releaseOwnerDebt = Object.keys(ledger.programs.scripts.diagnostics)
  .filter((filePath) => filePath.startsWith("scripts/regressions/release/") || filePath.startsWith("scripts/regressions/docs/"));
assert.deepEqual(releaseOwnerDebt, [], "release and docs regression owners closed at checkpoint 0.33.33.29 and must stay strict-clean");
const viewOwnerDebt = Object.keys(ledger.programs.scripts.diagnostics)
  .filter((filePath) => filePath.startsWith("scripts/regressions/views/") || filePath.startsWith("scripts/regression-contracts/views/"));
assert.deepEqual(viewOwnerDebt, [], "view-surface contract owners closed at checkpoint 0.33.33.30.1 and must stay strict-clean");
const frameworkContractDebt = Object.keys(ledger.programs.scripts.diagnostics)
  .filter((filePath) => filePath.startsWith("scripts/regression-contracts/framework/"));
assert.deepEqual(frameworkContractDebt, [], "framework contract modules closed at checkpoint 0.33.33.30.2 and must stay strict-clean");
for (const httpSecurityOwner of [
  "browser-security-headers", "csrf-protection", "express-5-http-contract", "http-error-contract",
  "operational-security-basics", "production-configuration-hardening", "public-legal-surfaces",
  "security-event-logging", "tls-cookie-posture", "trusted-proxy-request-context",
].map((owner) => `scripts/regressions/framework/${owner}.regression.mjs`).concat("scripts/test-support/http-fixture-contracts.mjs")) {
  assert.equal(ledger.programs.scripts.diagnostics[httpSecurityOwner], undefined, `${httpSecurityOwner} must stay strict-clean after checkpoint 0.33.33.30.3`);
  assert.equal(ledger.explicitAnyByFile[httpSecurityOwner], undefined, `${httpSecurityOwner} must stay free of explicit any after checkpoint 0.33.33.30.3`);
}
// The database seam, adapter, and parameter-binding owners closed at
// 0.33.33.31.1, together with the shared row-assertion module they resolve
// their single-row reads through.
for (const databaseSeamOwner of [
  "scripts/better-sqlite3-helper-core-regression.mjs",
  "scripts/database-adapter-contract-regression.mjs",
  "scripts/database-boolean-time-seam-regression.mjs",
  "scripts/database-case-insensitive-seam-regression.mjs",
  "scripts/database-conflict-identity-seam-regression.mjs",
  "scripts/database-dialect-seam-scaffold-regression.mjs",
  "scripts/database-introspection-boundary-regression.mjs",
  "scripts/database-migration-locking-regression.mjs",
  "scripts/database-parameterized-query-pilot-regression.mjs",
  "scripts/database-result-fidelity-regression.mjs",
  "scripts/database-transaction-helper-regression.mjs",
  "scripts/event-bus-regression.mjs",
  "scripts/migration-compatibility-regression.mjs",
  "scripts/parameter-binding-conversion-wave-regression.mjs",
  "scripts/parameter-binding-layer-regression.mjs",
  "scripts/regression-contracts/database/dialect-enforcement-guardrail.contract.mjs",
  "scripts/regression-contracts/database/interpolation-enforcement-guardrail.contract.mjs",
  "scripts/regression-contracts/database/parameter-binding-audit.contract.mjs",
  "scripts/regressions/database/better-sqlite3-13-data-compatibility.regression.mjs",
  "scripts/regressions/database/database-dialect-binding-types.regression.mjs",
  "scripts/regressions/database/database-repository-signature-types.regression.mjs",
  "scripts/regressions/database/database-transaction-client-types.regression.mjs",
  "scripts/regressions/database/migration-schema-workflow.regression.mjs",
  "scripts/regressions/database/module-context-read-lifecycle.regression.mjs",
  "scripts/regressions/database/sqlite-statement-cache-adapter.regression.mjs",
  "scripts/regressions/database/verified-regression-baseline-fast-path.regression.mjs",
  "scripts/sqlite-connection-hardening-regression.mjs",
  "scripts/sqlite-small-office-performance-regression.mjs",
  "scripts/startup-maintenance-compatibility-regression.mjs",
  "scripts/test-support/database-row-assertions.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[databaseSeamOwner], undefined, `${databaseSeamOwner} must stay strict-clean after checkpoint 0.33.33.31.1`);
  assert.equal(ledger.explicitAnyByFile[databaseSeamOwner], undefined, `${databaseSeamOwner} must stay free of explicit any after checkpoint 0.33.33.31.1`);
}
// The authorization-model owners closed at 0.33.33.30.7.1 and the permission
// harness itself closed at 0.33.33.30.7.2.2, which completes the
// 0.33.33.30.7 cohort.
for (const authorizationModelOwner of [
  "scripts/permission-regression.mjs",
  "scripts/regression-contracts/permissions/client-child-create-scope.contract.mjs",
  "scripts/regression-contracts/permissions/icon-accessibility-contract.contract.mjs",
  "scripts/regressions/permissions/client-project-business-boundary.regression.mjs",
  "scripts/regressions/permissions/current-static-contracts.regression.mjs",
  "scripts/regressions/permissions/permission-resource-catalog.regression.mjs",
  "scripts/regressions/permissions/permission-resource-types.regression.mjs",
  "scripts/regressions/permissions/workspace-membership-billable.regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[authorizationModelOwner], undefined, `${authorizationModelOwner} must stay strict-clean after the 0.33.33.30.7 cohort`);
  assert.equal(ledger.explicitAnyByFile[authorizationModelOwner], undefined, `${authorizationModelOwner} must stay free of explicit any after the 0.33.33.30.7 cohort`);
}
for (const sessionOwner of [
  "scripts/regressions/framework/remembered-sessions.regression.mjs",
  "scripts/regressions/framework/session-auth-warning.regression.mjs",
  "scripts/regressions/framework/session-revocation.regression.mjs",
  "scripts/regressions/framework/support-view-request-enforcement.regression.mjs",
  "scripts/regressions/framework/support-view-session-contract.regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[sessionOwner], undefined, `${sessionOwner} must stay strict-clean after checkpoint 0.33.33.30.6`);
  assert.equal(ledger.explicitAnyByFile[sessionOwner], undefined, `${sessionOwner} must stay free of explicit any after checkpoint 0.33.33.30.6`);
}
for (const publicDemoOwner of [
  "scripts/regressions/framework/public-demo-account-catalog.regression.mjs",
  "scripts/regressions/framework/public-demo-budgets.regression.mjs",
  "scripts/regressions/framework/public-demo-capability-enforcement.regression.mjs",
  "scripts/regressions/framework/public-demo-cross-role-content-safety.regression.mjs",
  "scripts/regressions/framework/public-demo-files-ingress.regression.mjs",
  "scripts/regressions/framework/public-demo-identity-immutability.regression.mjs",
  "scripts/regressions/framework/public-demo-perimeter.regression.mjs",
  "scripts/regressions/permissions/public-demo-role-journey.regression.mjs",
  "scripts/regressions/permissions/sanitized-demo-role-journey.regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[publicDemoOwner], undefined, `${publicDemoOwner} must stay strict-clean after checkpoint 0.33.33.30.5`);
  assert.equal(ledger.explicitAnyByFile[publicDemoOwner], undefined, `${publicDemoOwner} must stay free of explicit any after checkpoint 0.33.33.30.5`);
}
for (const credentialOwner of [
  "account-export-recovery", "authentication-throttle", "password-hashing-modernization",
  "password-reset-hardening", "private-calendar-feed-authentication",
].map((owner) => `scripts/regressions/framework/${owner}.regression.mjs`)) {
  assert.equal(ledger.programs.scripts.diagnostics[credentialOwner], undefined, `${credentialOwner} must stay strict-clean after checkpoint 0.33.33.30.4`);
  assert.equal(ledger.explicitAnyByFile[credentialOwner], undefined, `${credentialOwner} must stay free of explicit any after checkpoint 0.33.33.30.4`);
}
for (const contributionOwnerPath of [
  "scripts/regressions/framework/app-shell-bootstrap-boundary.regression.mjs",
  "scripts/regressions/framework/asset-cache-version.regression.mjs",
  "scripts/regressions/framework/browser-recovery-boundary.regression.mjs",
  "scripts/regressions/framework/bundled-module-registry.regression.mjs",
  "scripts/regressions/framework/client-project-options-projection.regression.mjs",
  "scripts/regressions/framework/current-static-contracts.regression.mjs",
  "scripts/regressions/framework/generic-settings-engine.regression.mjs",
  "scripts/regressions/framework/module-import-boundaries.regression.mjs",
  "scripts/regressions/framework/reporting-catalog-execution.regression.mjs",
  "scripts/regressions/framework/reporting-contribution-contract.regression.mjs",
  "scripts/regressions/framework/settings-contribution-contract.regression.mjs",
  "scripts/regressions/framework/user-landing-preferences.regression.mjs",
  "scripts/regressions/framework/workbench-focus-policy.regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[contributionOwnerPath], undefined, `${contributionOwnerPath} must stay strict-clean after checkpoint 0.33.33.30.2`);
  assert.equal(ledger.explicitAnyByFile[contributionOwnerPath], undefined, `${contributionOwnerPath} must stay free of explicit any after checkpoint 0.33.33.30.2`);
}
for (const consolidatedStaticOwnerPath of [
  "scripts/framework-view-static-consolidation.mjs",
  "scripts/regression-contracts/data-files-security-static-owner.mjs",
  "scripts/regression-contracts/workflow-module-static-owner.mjs",
  "scripts/workflow-module-static-consolidation.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[consolidatedStaticOwnerPath], undefined, `${consolidatedStaticOwnerPath} must stay strict-clean after checkpoint 0.33.33.29`);
}
assert.equal(ledger.programs.scripts.diagnostics["scripts/development-data.mjs"], undefined, "scripts/development-data.mjs must stay strict-clean after checkpoint 0.33.33.28.6.1");
assert.equal(ledger.programs.scripts.diagnostics["scripts/seed-scale.mjs"], undefined, "scripts/seed-scale.mjs must stay strict-clean after checkpoint 0.33.33.28.6.2");
for (const deployProxyOwnerPath of [
  "scripts/reference-caddy-security-smoke.mjs",
  "scripts/release/deploy-via-ssh.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[deployProxyOwnerPath], undefined, `${deployProxyOwnerPath} must stay strict-clean after checkpoint 0.33.33.28.5.2`);
}
for (const artifactContainerOwnerPath of [
  "scripts/build-container-image.mjs",
  "scripts/build-runtime-artifact.mjs",
  "scripts/container-deployment-smoke.mjs",
  "scripts/release/published-container-image.mjs",
  "scripts/runtime-artifact-smoke.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[artifactContainerOwnerPath], undefined, `${artifactContainerOwnerPath} must stay strict-clean after checkpoint 0.33.33.28.5.1`);
}
for (const demoLifecycleOwnerPath of [
  "scripts/cleanup-development-workspaces.mjs",
  "scripts/demo-data-host.mjs",
  "scripts/sanitized-demo-role-journey.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[demoLifecycleOwnerPath], undefined, `${demoLifecycleOwnerPath} must stay strict-clean after checkpoint 0.33.33.28.4`);
}
for (const measurementOwnerPath of [
  "scripts/adapter-microbenchmark.mjs",
  "scripts/better-sqlite3-install-smoke.mjs",
  "scripts/measure-dashboard-performance.mjs",
  "scripts/public-demo-perimeter-load-smoke.mjs",
  "scripts/sqlite-small-office-performance.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[measurementOwnerPath], undefined, `${measurementOwnerPath} must stay strict-clean after checkpoint 0.33.33.28.3`);
}
for (const releaseCeremonyOwnerPath of [
  "scripts/bump-version.mjs",
  "scripts/generate-bundled-module-catalog.mjs",
  "scripts/release/checkpoint-commits.mjs",
  "scripts/release/configure-github-release-operations.mjs",
  "scripts/release/create-release-metadata.mjs",
  "scripts/release/nightly-proof.mjs",
  "scripts/release/public-demo-release-candidate-smoke.mjs",
  "scripts/release/rehearse-maintenance-boundary.mjs",
  "scripts/release/validate-release-revision.mjs",
  "scripts/suggest-docs-for-changes.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[releaseCeremonyOwnerPath], undefined, `${releaseCeremonyOwnerPath} must stay strict-clean after checkpoint 0.33.33.28.2`);
}
for (const backupMaintenanceOwnerPath of [
  "scripts/backup.mjs",
  "scripts/backup-restore-drill.mjs",
  "scripts/module-sanity-check.mjs",
  "scripts/schema-snapshot.mjs",
  "scripts/search-index-rebuild.mjs",
  "scripts/workspace-backup.mjs",
  "scripts/workspace-backup-drill.mjs",
  "scripts/workspace-purge.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[backupMaintenanceOwnerPath], undefined, `${backupMaintenanceOwnerPath} must stay strict-clean after checkpoint 0.33.33.28.1`);
}
for (const runnerOwnerPath of [
  "scripts/agent-brief.mjs",
  "scripts/generate-regression-doc-inventory.mjs",
  "scripts/generate-regression-manifest.mjs",
  "scripts/regression-suite.mjs",
  "scripts/run-changed-regressions.mjs",
  "scripts/run-closeout.mjs",
  "scripts/run-playwright-e2e.mjs",
  "scripts/run-regressions.mjs",
  "scripts/run-slice-verification.mjs",
  "scripts/run-timed-stage.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[runnerOwnerPath], undefined, `${runnerOwnerPath} must stay strict-clean after checkpoint 0.33.33.27`);
}
for (const rootRuntimeOwnerPath of [
  "src/config.js",
  "src/core/request-context.js",
  "src/runtime-env.js",
  "src/security/auth-throttle.js",
  "src/security/cookies.js",
  "src/security/current-password-verification.js",
  "src/security/password-events.js",
  "src/security/security-events.js",
  "src/utils/normalizers.js",
  "src/utils/workspaces.js",
]) {
  assert.equal(ledger.explicitAnyByFile[rootRuntimeOwnerPath], undefined, `${rootRuntimeOwnerPath} must stay free of explicit any after checkpoint 0.33.33.25.5`);
}
for (const strictCleanPath of [
  "src/modules/tasks/task-block-recovery-engine.js",
  "src/modules/tasks/task-list-engine.js",
  "src/types/task-block-recovery-contracts.d.ts",
  "src/types/task-list-engine-contracts.d.ts",
  "tests/unit/task-block-recovery-engine.test.mjs",
  "tests/unit/task-list-engine.test.mjs",
  "src/modules/tasks/task-calendar-feed.scope.js",
  "src/modules/tasks/task-calendar-feed.service.js",
  "src/modules/tasks/task-calendar.shared.js",
  "src/modules/tasks/task-jobs.service.js",
  "src/modules/tasks/task-recurrence.repo.js",
  "src/modules/tasks/task-recurrence.service.js",
  "src/types/task-recurrence-contracts.d.ts",
]) {
  assert.equal(ledger.programs["server-tests"].diagnostics[strictCleanPath], undefined, `${strictCleanPath} must stay strict-clean after checkpoint 0.33.33.19`);
  assert.equal(ledger.explicitAnyByFile[strictCleanPath], undefined, `${strictCleanPath} must stay free of explicit any after checkpoint 0.33.33.19`);
}
for (const strictCleanPath of [
  "src/modules/tasks/private-calendar-feed.provider.js",
  "src/modules/tasks/task-checklists.repo.js",
  "src/modules/tasks/task-relationships.repo.js",
  "src/modules/tasks/task-reminders.repo.js",
  "src/modules/tasks/task-reminders.service.js",
  "src/modules/tasks/tasks-settings.service.js",
  "src/modules/tasks/task-timers.repo.js",
  "src/modules/tasks/task-timers.service.js",
  "src/modules/tasks/task-work-evidence.service.js",
  "src/types/task-workflow-contracts.d.ts",
  "tests/typecheck/task-workflow-contracts.fixture.mjs",
  "src/types/task-server-contracts.d.ts",
  "src/types/task-status-contracts.d.ts",
  "tests/typecheck/task-server-contracts.fixture.mjs",
  "src/repositories/files.repo.js",
  "src/services/files-storage-accounting.service.js",
  "src/types/files-repository-contracts.d.ts",
  "src/types/files-storage-accounting-contracts.d.ts",
  "tests/unit/files-storage-accounting.service.test.mjs",
]) {
  assert.equal(ledger.programs["server-tests"].diagnostics[strictCleanPath], undefined, `${strictCleanPath} must stay strict-clean after checkpoint 0.33.33.21.2`);
  assert.equal(ledger.explicitAnyByFile[strictCleanPath], undefined, `${strictCleanPath} must stay free of explicit any after checkpoint 0.33.33.21.2`);
}
for (const strictCleanPath of [
  "src/services/files-scanner-job.service.js",
  "src/types/files-scanner-job-contracts.d.ts",
  "tests/unit/files-scanner-job.service.test.mjs",
]) {
  assert.equal(ledger.programs["server-tests"].diagnostics[strictCleanPath], undefined, `${strictCleanPath} must stay strict-clean after checkpoint 0.33.33.23`);
  assert.equal(ledger.explicitAnyByFile[strictCleanPath], undefined, `${strictCleanPath} must stay free of explicit any after checkpoint 0.33.33.23`);
}
for (const strictCleanPath of [
  "src/services/files-preview.service.js",
  "src/types/files-preview-contracts.d.ts",
  "tests/unit/files-preview.service.test.mjs",
]) {
  assert.equal(ledger.programs["server-tests"].diagnostics[strictCleanPath], undefined, `${strictCleanPath} must stay strict-clean after checkpoint 0.33.33.24`);
  assert.equal(ledger.explicitAnyByFile[strictCleanPath], undefined, `${strictCleanPath} must stay free of explicit any after checkpoint 0.33.33.24`);
}
/** @param {string} filePath */
const filesServerOwnerPaths = (filePath) => (
  filePath.startsWith("src/core/files/") ||
  filePath === "src/repositories/files.repo.js" ||
  filePath === "src/routes/files.routes.js" ||
  filePath.startsWith("src/services/files") ||
  filePath.startsWith("src/types/files-") ||
  filePath === "tests/contracts/files-contracts.test.mjs" ||
  filePath.startsWith("tests/unit/files-")
);
const filesServerOwnerDiagnostics = Object.keys(ledger.programs["server-tests"].diagnostics).filter(filesServerOwnerPaths);
assert.deepEqual(filesServerOwnerDiagnostics, [], "Files server owners must stay strict-clean after checkpoint 0.33.33.24");
const filesServerOwnerExplicitAny = Object.keys(ledger.explicitAnyByFile).filter(filesServerOwnerPaths);
assert.deepEqual(filesServerOwnerExplicitAny, [], "Files server owners must stay free of explicit any after checkpoint 0.33.33.24");
const frameworkOwnerDiagnostics = Object.keys(ledger.programs["server-tests"].diagnostics).filter((filePath) => (
  filePath.startsWith("src/core/") ||
  filePath.startsWith("src/services/") ||
  filePath.startsWith("src/repositories/")
));
if (frameworkOwnerDiagnostics.length > 0) {
  throw new Error(`Framework core, shared services, and repositories must stay strict-clean after checkpoint 0.33.33.16.2: ${frameworkOwnerDiagnostics.join(", ")}`);
}
for (const retiredPath of [
  "scripts/typecheck-seam-inventory.json",
  "scripts/typecheck-clean-file-passes.json",
  "scripts/typecheck-repository-passes.json",
  "scripts/typecheck-honesty-inventory.json",
  "scripts/regressions/framework/typecheck-seams.regression.mjs",
  "scripts/regressions/framework/typecheck-honesty-inventory.regression.mjs",
]) assert.equal(fs.existsSync(retiredPath), false, `${retiredPath} must stay retired behind ledger authority`);

assert.match(governanceSource, /count > prior/);
assert.match(governanceSource, /new file has/);
assert.match(governanceSource, /new file introduces explicit any/);
assert.match(governanceSource, /forbidden checker suppression/);
assert.match(governanceSource, /Full-strict diagnostics exactly match/);
assert.match(governanceSource, /tsconfig\.declarations\.json/);
assert.doesNotThrow(() => validateShrinkOnly(cloneLedger(), cloneLedger()));
const increasedDiagnostic = cloneLedger();
const seededDiagnosticPath = increasedDiagnostic.programs["server-tests"].files[0];
if (!seededDiagnosticPath) throw new Error("The shrink-only mutation proof requires at least one server/test program file.");
increasedDiagnostic.programs["server-tests"].diagnostics[seededDiagnosticPath] = [{ code: 7006, count: 1 }];
assert.throws(() => validateShrinkOnly(ledger, increasedDiagnostic), /7006 increased 0 -> 1/, "the closed server/test program must reject any regained diagnostic");
const increasedAny = cloneLedger();
increasedAny.explicitAnyByFile["server.js"] = (increasedAny.explicitAnyByFile["server.js"] || 0) + 1;
assert.throws(() => validateShrinkOnly(ledger, increasedAny), /explicit any increased/);
const newDirtyFile = cloneLedger();
newDirtyFile.programs.scripts.files.push("scripts/synthetic-new.mjs");
newDirtyFile.programs.scripts.diagnostics["scripts/synthetic-new.mjs"] = [{ code: 7006, count: 1 }];
assert.throws(() => validateShrinkOnly(ledger, newDirtyFile), /new file has 1 strict diagnostic/);
const newCleanFile = cloneLedger();
newCleanFile.programs.scripts.files.push("scripts/synthetic-new.mjs");
assert.doesNotThrow(() => validateShrinkOnly(ledger, newCleanFile));
assert.equal(isFirstPartyDirectoryName(".repository-signature-types-fixture"), false);

console.log(`Full-strict governance passed: ${ledger.totals.files} files, ${ledger.totals.errors} exact diagnostics, ${ledger.totals.explicitAny} explicit-any nodes, declarations clean.`);

/** @returns {GovernanceLedger} */
function cloneLedger() {
  return JSON.parse(JSON.stringify(ledger));
}
