export const regressionMeta = Object.freeze({
  id: "framework.full-strict-governance",
  area: "framework",
  tier: "release-gate",
  tags: ["contracts", "framework", "release", "typecheck"],
  description: "Proves every first-party JavaScript file belongs to one full-strict program and exact debt can only shrink behind the generated compiler ledger.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { collectBrowserPublicationInventory, contestedSurfaces } from "../../test-support/browser-publication-inventory.mjs";
import { createNamespaceResolver } from "../../test-support/browser-namespace-resolver.mjs";
import { classifyBrowserDiagnostics, declaredNamespaceMembers } from "../../test-support/browser-diagnostic-classification.mjs";
import { collectDeclarationCoverage } from "../../test-support/browser-declaration-coverage.mjs";
import { extractClassMethodBlock, extractFunctionBlock, extractFunctionBody, extractFunctionSpan, scannableSource } from "../../test-support/source-scan.mjs";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  PROGRAMS,
  collectSourcePolicy,
  countExplicitAnyAnnotations,
  firstPartyJavaScriptFiles,
  isFirstPartyDirectoryName,
  validateShrinkOnly,
} from "../../typecheck-governance.mjs";
import { compareDottedVersions } from "../../lib/roadmap-cursor.mjs";
import { strictCleanOwnerProgram, strictCleanOwnerState } from "../../test-support/typecheck-ledger.mjs";

/** @typedef {{ code: number, count: number }} DiagnosticCount */
/** @typedef {{ config: string, environment: string, files: string[], errorCount: number, diagnostics: Record<string, DiagnosticCount[]> }} ProgramState */
/** @typedef {{ schemaVersion: number, checkpoint: string, programs: Record<string, ProgramState>, totals: { files: number, errors: number, explicitAny: number }, explicitAnyByFile: Record<string, number>, expectedErrorDirectives: string[], declarationProbe: { config: string, firstPartyFiles: number, errors: number } }} GovernanceLedger */
/** @typedef {{ compilerOptions: Record<string, unknown>, include: string[], exclude: string[] }} TypeScriptConfig */

// The published session members that make a literal session-shaped.
const SESSION_LITERAL_MEMBERS = ["active_workspace_id", "home_workspace_id", "session_mode", "user_id", "username", "workspace_id"];

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
// 0.33.33.32.28.1 retires the scripts program's debt at zero, exactly as the
// server/test program was retired at 0.33.33.26.2: the ledger section stays,
// its diagnostics map is empty, its error count is zero, and it may never
// regain debt.
//
// **Retirement means permanently required to remain at zero. It never means
// no longer checked.** `tsconfig.scripts.json` carries unqualified `strict`,
// `checkJs`, and `noImplicitAny` and excludes nothing under `scripts/`, so the
// program still compiles on every canonical `npm run typecheck`; the ledger
// generator refuses a universe in which any first-party file is unowned. The
// two assertions below hold both halves of that: the debt is zero, and the
// program still carries every script on disk.
assert.equal(
  ledger.programs.scripts.errorCount,
  0,
  "the scripts program's ledger section is retired at zero and may never regain debt",
);
assert.deepEqual(
  Object.keys(ledger.programs.scripts.diagnostics),
  [],
  "the retired scripts program carries no per-file debt",
);
const scriptsOnDisk = discoveredScriptPaths();
assert.ok(
  scriptsOnDisk.length > 500,
  "the retired scripts program still compiles the whole scripts estate, not an emptied file list",
);
// The program also owns the three root configuration files `tsconfig.scripts.json`
// names, of which one is an `.mjs` this discovery sees.
assert.deepEqual(
  scriptsOnDisk.filter((scriptPath) => !scriptPath.startsWith("scripts/")),
  ["vitest.config.mjs"],
  "the scripts program's file list is the scripts estate plus the root configuration it is defined to cover",
);
// Retirement is a floor for the whole program, so the per-checkpoint pins above
// are now implied by it rather than the other way round. The pins stay because
// they name which checkpoint closed which owner, which the floor cannot say.
assert.equal(
  ledger.totals.errors,
  ledger.programs.browser.errorCount,
  "with two of the three programs retired at zero, every remaining diagnostic belongs to the browser program",
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
// The workspace lifecycle, purge, cleanup-isolation, and role-seed convergence
// owners closed at 0.33.33.31.2. Each holds a destructive or convergence
// contract, so the pin keeps their proofs typed rather than merely passing.
for (const workspaceLifecycleOwner of [
  "scripts/regressions/database/role-seed-scope-convergence.regression.mjs",
  "scripts/regressions/database/workspace-cleanup-isolation.regression.mjs",
  "scripts/regressions/database/workspace-deletion-lifecycle.regression.mjs",
  "scripts/regressions/database/workspace-final-purge.regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[workspaceLifecycleOwner], undefined, `${workspaceLifecycleOwner} must stay strict-clean after checkpoint 0.33.33.31.2`);
  assert.equal(ledger.explicitAnyByFile[workspaceLifecycleOwner], undefined, `${workspaceLifecycleOwner} must stay free of explicit any after checkpoint 0.33.33.31.2`);
}
// The demo host, public-demo candidate, development-seed, and startup
// maintenance owners closed at 0.33.33.31.3. Each proves a seeded estate or a
// startup repair that everything downstream trusts.
for (const seededEstateOwner of [
  "scripts/regressions/database/demo-data-host-operation.regression.mjs",
  "scripts/regressions/database/development-data-seed.regression.mjs",
  "scripts/regressions/database/public-demo-baseline-candidate.regression.mjs",
  "scripts/regressions/database/startup-maintenance-lifecycle.regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[seededEstateOwner], undefined, `${seededEstateOwner} must stay strict-clean after checkpoint 0.33.33.31.3`);
  assert.equal(ledger.explicitAnyByFile[seededEstateOwner], undefined, `${seededEstateOwner} must stay free of explicit any after checkpoint 0.33.33.31.3`);
}
// The Files upload ingress owners closed at 0.33.33.31.4. The shared
// response-payload narrowing they cross the unknown body boundary through is
// already covered by the test-support pin from checkpoint 0.33.33.27.
for (const filesIngressOwner of [
  "scripts/file-api-lifecycle-regression.mjs",
  "scripts/file-multipart-batch-upload-helper-regression.mjs",
  "scripts/file-multipart-upload-route-regression.mjs",
  "scripts/file-upload-compatibility-error-hardening-regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[filesIngressOwner], undefined, `${filesIngressOwner} must stay strict-clean after checkpoint 0.33.33.31.4`);
  assert.equal(ledger.explicitAnyByFile[filesIngressOwner], undefined, `${filesIngressOwner} must stay free of explicit any after checkpoint 0.33.33.31.4`);
}
// The Files egress owners closed at 0.33.33.31.5: preview availability,
// preview content, and streamed validation with download metadata.
for (const filesEgressOwner of [
  "scripts/file-streamed-validation-download-metadata-regression.mjs",
  "scripts/files-preview-availability-route-regression.mjs",
  "scripts/files-preview-content-route-regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[filesEgressOwner], undefined, `${filesEgressOwner} must stay strict-clean after checkpoint 0.33.33.31.5`);
  assert.equal(ledger.explicitAnyByFile[filesEgressOwner], undefined, `${filesEgressOwner} must stay free of explicit any after checkpoint 0.33.33.31.5`);
}
// The Files attachment target and context read owners closed at
// 0.33.33.31.6, including the two parameter-binding conversion owners that
// still hold the converted-state contract.
for (const attachmentReadOwner of [
  "scripts/files-attachable-target-options-regression.mjs",
  "scripts/files-attachment-context-route-regression.mjs",
  "scripts/files-attachment-readmodel-regression.mjs",
  "scripts/files-browse-attachment-reads-conversion-regression.mjs",
  "scripts/files-context-targets-conversion-regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[attachmentReadOwner], undefined, `${attachmentReadOwner} must stay strict-clean after checkpoint 0.33.33.31.6`);
  assert.equal(ledger.explicitAnyByFile[attachmentReadOwner], undefined, `${attachmentReadOwner} must stay free of explicit any after checkpoint 0.33.33.31.6`);
}
// The storage provider, S3, and quota owners closed at 0.33.33.31.7. The
// shared package-manifest narrowing they cross the filesystem JSON boundary
// through is already covered by the test-support pin from 0.33.33.27.
for (const storageProviderOwner of [
  "scripts/file-s3-diagnostics-signed-url-boundary-regression.mjs",
  "scripts/file-s3-object-operation-proof-regression.mjs",
  "scripts/file-s3-provider-registration-regression.mjs",
  "scripts/file-storage-accounting-regression.mjs",
  "scripts/file-storage-diagnostics-regression.mjs",
  "scripts/file-storage-provider-configuration-regression.mjs",
  "scripts/file-storage-quota-enforcement-regression.mjs",
  "scripts/file-storage-streaming-contract-regression.mjs",
  "scripts/workspace-storage-regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[storageProviderOwner], undefined, `${storageProviderOwner} must stay strict-clean after checkpoint 0.33.33.31.7`);
  assert.equal(ledger.explicitAnyByFile[storageProviderOwner], undefined, `${storageProviderOwner} must stay free of explicit any after checkpoint 0.33.33.31.7`);
}
// The scanner adapter and worker owners closed at 0.33.33.31.8. Each parses
// output that crosses back from a separate process, so the pin keeps those
// boundaries narrowed rather than merely passing.
for (const scannerWorkerOwner of [
  "scripts/file-clamd-adapter-regression.mjs",
  "scripts/file-clamscan-adapter-regression.mjs",
  "scripts/file-scan-job-handoff-regression.mjs",
  "scripts/file-scanner-health-diagnostics-regression.mjs",
  "scripts/file-scanner-mode-resolver-regression.mjs",
  "scripts/separate-worker-end-to-end-regression.mjs",
  "scripts/worker-runner-regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[scannerWorkerOwner], undefined, `${scannerWorkerOwner} must stay strict-clean after checkpoint 0.33.33.31.8`);
  assert.equal(ledger.explicitAnyByFile[scannerWorkerOwner], undefined, `${scannerWorkerOwner} must stay free of explicit any after checkpoint 0.33.33.31.8`);
}
// The job claiming, idempotency, outbox schema, and retention owners closed
// at 0.33.33.31.9. Each holds a concurrency or bounded-window proof, so the
// pin keeps those assertions typed rather than merely passing.
for (const jobDurabilityOwner of [
  "scripts/job-claiming-locking-regression.mjs",
  "scripts/job-idempotency-at-least-once-regression.mjs",
  "scripts/job-outbox-schema-regression.mjs",
  "scripts/job-retention-pruning-regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[jobDurabilityOwner], undefined, `${jobDurabilityOwner} must stay strict-clean after checkpoint 0.33.33.31.9`);
  assert.equal(ledger.explicitAnyByFile[jobDurabilityOwner], undefined, `${jobDurabilityOwner} must stay free of explicit any after checkpoint 0.33.33.31.9`);
}
// The job observability and background work owners closed at 0.33.33.31.10.
// These are the readouts that leak job payloads if typed loosely, so the pin
// keeps their envelope reads checked rather than merely passing.
for (const jobObservabilityOwner of [
  "scripts/admin-job-observability-regression.mjs",
  "scripts/background-work-jobs-regression.mjs",
  "scripts/notification-jobs-regression.mjs",
  "scripts/regressions/jobs/job-worker-shutdown-rejection.regression.mjs",
  "scripts/search-index-jobs-regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[jobObservabilityOwner], undefined, `${jobObservabilityOwner} must stay strict-clean after checkpoint 0.33.33.31.10`);
  assert.equal(ledger.explicitAnyByFile[jobObservabilityOwner], undefined, `${jobObservabilityOwner} must stay free of explicit any after checkpoint 0.33.33.31.10`);
}

// The Files settings, descriptor host, and folded Files contract owners closed
// at 0.33.33.31.11, which completes the 0.33.33.31 rollup. These carry the
// settings and quota conversion proofs plus the folded contract ownership
// reconciliation, so the pin keeps their payload reads named rather than
// merely passing.
for (const filesClosingOwner of [
  "scripts/file-framework-contract-regression.mjs",
  "scripts/file-settings-regression.mjs",
  "scripts/files-descriptor-host-regression.mjs",
  "scripts/files-lifecycle-settings-quota-conversion-regression.mjs",
  "scripts/files-time-tracking-qol-closeout-regression.mjs",
  "scripts/regression-contracts/files/file-scanner-setup-docs.contract.mjs",
  "scripts/regression-contracts/files/files-attachment-panel-shell.contract.mjs",
  "scripts/regression-contracts/files/files-browse-compact-reset.contract.mjs",
  "scripts/regression-contracts/files/files-browse-list-shell.contract.mjs",
  "scripts/regression-contracts/files/files-edit-modal-save.contract.mjs",
  "scripts/regression-contracts/files/files-edit-modal-shell.contract.mjs",
  "scripts/regression-contracts/files/files-filter-sidebar.contract.mjs",
  "scripts/regression-contracts/files/files-preview-modal.contract.mjs",
  "scripts/regression-contracts/files/files-row-attachment-actions.contract.mjs",
  "scripts/regression-contracts/files/files-strict-guardrail-inventory.contract.mjs",
  "scripts/regression-contracts/files/files-upload-shell.contract.mjs",
  "scripts/regression-contracts/files/files-visual-state-control-parity.contract.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[filesClosingOwner], undefined, `${filesClosingOwner} must stay strict-clean after checkpoint 0.33.33.31.11`);
  assert.equal(ledger.explicitAnyByFile[filesClosingOwner], undefined, `${filesClosingOwner} must stay free of explicit any after checkpoint 0.33.33.31.11`);
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
for (const taskQueryOwner of [
  "scripts/regressions/tasks/task-list-pipeline-projection.regression.mjs",
  "scripts/task-activity-metrics-regression.mjs",
  "scripts/task-canonical-query-regression.mjs",
  "scripts/task-modal-complete-action-regression.mjs",
  "scripts/task-options-payload-regression.mjs",
  "scripts/task-qol-closeout-regression.mjs",
  "scripts/tasks-primary-repository-conversion-regression.mjs",
  "scripts/tasks-server-side-list-paging-regression.mjs",
  "scripts/tasks-view-selector-query-contract-regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[taskQueryOwner], undefined, `${taskQueryOwner} must stay strict-clean after checkpoint 0.33.33.32.1`);
}
for (const taskWorkflowOwner of [
  "scripts/task-bulk-due-tags-regression.mjs",
  "scripts/task-checklist-regression.mjs",
  "scripts/task-checklists-repository-conversion-regression.mjs",
  "scripts/task-recurrence-checklist-propagation-regression.mjs",
  "scripts/task-relationships-regression.mjs",
  "scripts/task-relationships-repository-conversion-regression.mjs",
  "scripts/tasks-bulk-lifecycle-toolbar-regression.mjs",
  "scripts/tasks-bulk-nondestructive-toolbar-regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[taskWorkflowOwner], undefined, `${taskWorkflowOwner} must stay strict-clean after checkpoint 0.33.33.32.2`);
}
for (const recurrenceReminderOwner of [
  "scripts/async-recurrence-response-closeout-regression.mjs",
  "scripts/regressions/tasks/task-recurrence-materialize-on-touch-permissions.regression.mjs",
  "scripts/regressions/tasks/task-recurrence-skip-to-current.regression.mjs",
  "scripts/task-recurrence-completion-continuity-regression.mjs",
  "scripts/task-recurrence-frequency-regression.mjs",
  "scripts/task-recurrence-linked-note-propagation-regression.mjs",
  "scripts/task-recurrence-reminders-repository-conversion-regression.mjs",
  "scripts/task-reminder-notification-delivery-regression.mjs",
  "scripts/task-reminder-scheduling-horizon-regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[recurrenceReminderOwner], undefined, `${recurrenceReminderOwner} must stay strict-clean after checkpoint 0.33.33.32.3`);
}
for (const calendarFeedOwner of [
  "scripts/regressions/tasks/private-calendar-feed-scope.regression.mjs",
  "scripts/regressions/tasks/task-calendar-feed-serialization.regression.mjs",
  "scripts/regressions/tasks/task-calendar-window.regression.mjs",
  "scripts/regressions/tasks/task-estimate-minutes.regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[calendarFeedOwner], undefined, `${calendarFeedOwner} must stay strict-clean after checkpoint 0.33.33.32.4`);
}
for (const readBudgetOwner of [
  "scripts/dashboard-workbench-regression.mjs",
  "scripts/regressions/dashboard/hot-endpoint-budgets.regression.mjs",
  "scripts/regressions/tasks/dashboard-summary-budgets.regression.mjs",
  "scripts/regressions/time-tracking/dashboard-effort-summary-budgets.regression.mjs",
  "scripts/regressions/workbench/hot-endpoint-budgets.regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[readBudgetOwner], undefined, `${readBudgetOwner} must stay strict-clean after checkpoint 0.33.33.32.5`);
}
for (const notificationOwner of [
  "scripts/notes-notification-follow-regression.mjs",
  "scripts/notification-regression.mjs",
  "scripts/notifications-inbox-lifecycle-conversion-regression.mjs",
  "scripts/notifications-preferences-subscriptions-conversion-regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[notificationOwner], undefined, `${notificationOwner} must stay strict-clean after checkpoint 0.33.33.32.6`);
}
for (const timeEntryWriteOwner of [
  "scripts/time-entries-repository-conversion-regression.mjs",
  "scripts/workspace-storage-regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[timeEntryWriteOwner], undefined, `${timeEntryWriteOwner} must stay strict-clean after checkpoint 0.33.33.32.7`);
}
for (const timerBillingOwner of [
  "scripts/active-timers-repository-conversion-regression.mjs",
  "scripts/regressions/time-tracking/billing-dashboard-timezone-boundaries.regression.mjs",
  "scripts/regressions/time-tracking/project-time-billing-runner.regression.mjs",
  "scripts/regressions/time-tracking/sourced-task-timer-bridge.regression.mjs",
  "scripts/regressions/time-tracking/timer-task-linking.regression.mjs",
  "scripts/task-timer-status-regression.mjs",
  "scripts/timer-resume-metadata-regression.mjs",
  "scripts/timer-timestamp-integrity-regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[timerBillingOwner], undefined, `${timerBillingOwner} must stay strict-clean after checkpoint 0.33.33.32.7.1`);
}
for (const publicApiScopeOwner of [
  "scripts/notes-lists-tags-api-scope-regression.mjs",
  "scripts/personal-family-workspace-scope-regression.mjs",
  "scripts/public-api-client-project-write-regression.mjs",
  "scripts/regressions/time-tracking/public-api-duration-persistence.regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[publicApiScopeOwner], undefined, `${publicApiScopeOwner} must stay strict-clean after checkpoint 0.33.33.32.8`);
}
for (const workResumeOwner of [
  "scripts/regressions/workbench/workbench-client-fanout.regression.mjs",
  "scripts/work-resume-state-api-regression.mjs",
  "scripts/work-resume-state-closeout-regression.mjs",
  "scripts/work-resume-state-conversion-regression.mjs",
  "scripts/work-resume-state-initial-producers-regression.mjs",
  "scripts/work-resume-state-producer-regression.mjs",
  "scripts/work-resume-state-service-regression.mjs",
  "scripts/workbench-service-dehardcode-regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[workResumeOwner], undefined, `${workResumeOwner} must stay strict-clean after checkpoint 0.33.33.32.9`);
}
// The four resume producer builders re-opened an event the producer registry
// already types. They are reconciled with the published context, so the local
// widening cannot return. The retired annotation is matched by its parameter
// prefix rather than spelled out, because the explicit-any detector scans this
// file's own source too.
const resumeProducerSource = fs.readFileSync("src/services/work-resume-state-initial-producers.js", "utf8");
assert.equal(
  resumeProducerSource.includes("{ event: Record<string, "),
  false,
  "src/services/work-resume-state-initial-producers.js must not reintroduce the widened producer event parameter",
);
assert.ok(
  resumeProducerSource.includes("@param {ProducerBuilderContext} input"),
  "src/services/work-resume-state-initial-producers.js should annotate its builders with the published producer context",
);
for (const focusOwner of [
  "scripts/regression-contracts/workbench/workbench-task-focus-related-context-ui.contract.mjs",
  "scripts/regressions/workbench/direct-task-completion.regression.mjs",
  "scripts/regressions/workbench/focus-candidate-pipeline.regression.mjs",
  "scripts/regressions/workbench/task-focus-exit-capture.regression.mjs",
  "scripts/task-resume-context-regression.mjs",
  "scripts/work-candidate-service-regression.mjs",
  "scripts/work-focus-modes-regression.mjs",
  "scripts/workbench-task-focus-related-context-regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[focusOwner], undefined, `${focusOwner} must stay strict-clean after checkpoint 0.33.33.32.10`);
}
// The task-source fixture defaulted its whole parameter, which left `projectId`
// and `title` off the inferred type and produced fifteen excess-property
// failures at its call sites. The empty default cannot return.
assert.equal(
  fs.readFileSync("scripts/work-focus-modes-regression.mjs", "utf8").includes("} = {}) {"),
  false,
  "scripts/work-focus-modes-regression.mjs must not reintroduce the dead fixture parameter default",
);
// 0.33.33.32.10.1 corrected the resume-state resolver context to publish the
// workspace-scoped session its only producer already guarantees, so neither
// Tasks resolver needs a type assertion to reach a Tasks read. The assertion
// cannot return, and the runtime scope proof the type cannot express must stay.
const resumeResolverSource = fs.readFileSync("src/services/work-resume-state-initial-producers.js", "utf8");
assert.equal(
  resumeResolverSource.includes("TaskServerSession"),
  false,
  "src/services/work-resume-state-initial-producers.js must not reintroduce the Tasks session assertion",
);
assert.ok(
  resumeResolverSource.includes("function isWorkspaceScopedSession(session, workspaceId)"),
  "src/services/work-resume-state-initial-producers.js should keep the resolver workspace-scope proof",
);
for (const notesOwner of [
  "scripts/notes-access-contract-regression.mjs",
  "scripts/notes-api-service-regression.mjs",
  "scripts/notes-foundation-regression.mjs",
  "scripts/notes-integration-closeout-regression.mjs",
  "scripts/notes-records-filters-repository-conversion-regression.mjs",
  "scripts/notes-server-side-list-paging-regression.mjs",
  "scripts/notes-writes-revisions-links-collections-repository-conversion-regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[notesOwner], undefined, `${notesOwner} must stay strict-clean after checkpoint 0.33.33.32.11`);
}
// Two manifest contracts had been silently dropped by collapsing a second
// assertion into the version check's message position. Both are restored and
// must not collapse again.
assert.ok(
  fs.readFileSync("scripts/notes-integration-closeout-regression.mjs", "utf8")
    .includes('assert.equal(notesModule.publicApiRoutes.length, 1,'),
  "scripts/notes-integration-closeout-regression.mjs should keep the restored public API router count",
);
assert.ok(
  fs.readFileSync("scripts/notes-foundation-regression.mjs", "utf8")
    .includes("assert.equal(notesModule.enabledByDefault, true,"),
  "scripts/notes-foundation-regression.mjs should keep the restored enabled-by-default contract",
);
for (const secureCatalogOwner of [
  "scripts/notes-secure-regression.mjs",
  "scripts/regressions/notes/notes-settings-catalog-management.regression.mjs",
  "scripts/regressions/notes/secure-catalog-consumer-enforcement.regression.mjs",
  "scripts/regressions/notes/secure-catalog-effective-security.regression.mjs",
  "scripts/regressions/notes/secure-catalog-transitions.regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[secureCatalogOwner], undefined, `${secureCatalogOwner} must stay strict-clean after checkpoint 0.33.33.32.12`);
}
for (const notesEditorOwner of [
  "scripts/notes-external-markdown-links-preference-regression.mjs",
  "scripts/notes-markdown-revision-regression.mjs",
  "scripts/notes-markdown-soft-break-regression.mjs",
  "scripts/notes-preview-editor-regression.mjs",
  "scripts/notes-ui-workflow-regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[notesEditorOwner], undefined, `${notesEditorOwner} must stay strict-clean after checkpoint 0.33.33.32.13`);
}
for (const notesContextOwner of [
  "scripts/notes-collections-regression.mjs",
  "scripts/notes-files-hierarchy-scope-regression.mjs",
  "scripts/notes-linked-panel-regression.mjs",
  "scripts/notes-primary-context-regression.mjs",
  "scripts/notes-search-help-regression.mjs",
  "scripts/notes-task-context-regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[notesContextOwner], undefined, `${notesContextOwner} must stay strict-clean after checkpoint 0.33.33.32.14`);
}
// A third assertion had been silently dropped by collapsing it into an
// `assert.equal` message slot: note_library_collections lost its column check
// at 0.33.6.14a. Restored and pinned.
assert.ok(
  fs.readFileSync("scripts/notes-collections-regression.mjs", "utf8")
    .includes('await assertColumns("note_library_collections", ['),
  "scripts/notes-collections-regression.mjs should keep the restored note_library_collections column check",
);
for (const listsOwner of [
  "scripts/lists-catalog-links-repository-conversion-regression.mjs",
  "scripts/lists-foundation-regression.mjs",
  "scripts/lists-records-items-repository-conversion-regression.mjs",
  "scripts/lists-service-regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[listsOwner], undefined, `${listsOwner} must stay strict-clean after checkpoint 0.33.33.32.15`);
}
// The fourth and last collapsed assertion is restored: lists-foundation lost
// its enabled-by-default contract to an `assert.equal` message slot.
assert.ok(
  fs.readFileSync("scripts/lists-foundation-regression.mjs", "utf8")
    .includes("assert.equal(listsModule.enabledByDefault, true,"),
  "scripts/lists-foundation-regression.mjs should keep the restored enabled-by-default contract",
);
for (const listsSurfaceOwner of [
  "scripts/batched-list-enrichment-regression.mjs",
  "scripts/high-volume-admin-lists-regression.mjs",
  "scripts/lists-api-regression.mjs",
  "scripts/lists-closeout-regression.mjs",
  "scripts/lists-query-suggestions-regression.mjs",
  "scripts/lists-ui-workflow-regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[listsSurfaceOwner], undefined, `${listsSurfaceOwner} must stay strict-clean after checkpoint 0.33.33.32.16`);
}
// The Lists API owner reads every response body through the shared payload
// helper rather than off a parsed `any`, and the two link assertions prove
// the picker resolved a target instead of reading through a nullable one.
assert.ok(
  fs.readFileSync("scripts/lists-api-regression.mjs", "utf8")
    .includes("readPayload(projectLink, [\"link\"]"),
  "scripts/lists-api-regression.mjs should keep narrowing its response bodies through the shared payload helper",
);
assert.ok(
  fs.readFileSync("scripts/lists-api-regression.mjs", "utf8")
    .includes("assert.ok(projectLinkBody.link.target,"),
  "scripts/lists-api-regression.mjs should keep proving a created link resolves its target",
);
for (const tagOwner of [
  "scripts/tag-bulk-assignment-regression.mjs",
  "scripts/tag-core-records-regression.mjs",
  "scripts/tag-propagation-contract-regression.mjs",
  "scripts/tag-propagation-foundation-regression.mjs",
  "scripts/tag-propagation-paths-regression.mjs",
  "scripts/tag-propagation-service-conversion-regression.mjs",
  "scripts/tag-service-regression.mjs",
  "scripts/tags-repository-conversion-regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[tagOwner], undefined, `${tagOwner} must stay strict-clean after checkpoint 0.33.33.32.17`);
}
// The tag owners answer to the session, record, and propagation shapes Tags
// and the propagation registry already publish, rather than to five local
// redescriptions of the same rows.
for (const propagationOwner of [
  "scripts/tag-bulk-assignment-regression.mjs",
  "scripts/tag-propagation-contract-regression.mjs",
  "scripts/tag-propagation-foundation-regression.mjs",
  "scripts/tag-propagation-paths-regression.mjs",
  "scripts/tag-propagation-service-conversion-regression.mjs",
]) {
  assert.ok(
    fs.readFileSync(propagationOwner, "utf8").includes('import("../src/services/tags.service.js").TagSession'),
    `${propagationOwner} should keep answering to the published Tags session contract`,
  );
}
// The tags repository create and update paths resolve the row they read back,
// so the conversion owner proves each write persisted rather than comparing
// fields on a null the repository can legitimately answer.
assert.ok(
  fs.readFileSync("scripts/tags-repository-conversion-regression.mjs", "utf8")
    .includes("creating the first tag should read the persisted record back"),
  "scripts/tags-repository-conversion-regression.mjs should keep proving its tag writes read back",
);
for (const searchOwner of [
  "scripts/search-api-regression.mjs",
  "scripts/search-contract-regression.mjs",
  "scripts/search-shell-regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[searchOwner], undefined, `${searchOwner} must stay strict-clean after checkpoint 0.33.33.32.18`);
}
// The Search API owner reads every response body through the shared payload
// helper, and the canonical description proves each indexed record type was
// written before comparing its columns.
assert.ok(
  fs.readFileSync("scripts/search-api-regression.mjs", "utf8")
    .includes('readPayload(response, ["backend", "pagination", "query", "results"]'),
  "scripts/search-api-regression.mjs should keep narrowing its response bodies through the shared payload helper",
);
assert.ok(
  fs.readFileSync("scripts/search-contract-regression.mjs", "utf8")
    .includes("indexer should have written a search_index row"),
  "scripts/search-contract-regression.mjs should keep proving each module indexer wrote its row",
);
for (const searchIndexOwner of [
  "scripts/search-adapter-rebuild-service-conversion-regression.mjs",
  "scripts/search-fts-repair-regression.mjs",
  "scripts/search-fts-seam-regression.mjs",
  "scripts/search-index-sync-regression.mjs",
  "scripts/search-lifecycle-regression.mjs",
  "scripts/search-rebuild-regression.mjs",
  "scripts/search-workflow-regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[searchIndexOwner], undefined, `${searchIndexOwner} must stay strict-clean after checkpoint 0.33.33.32.19`);
}
// 0.33.33.32.19 corrected two search producers 0.33.33.32.18 measured as
// narrower than what they publish. The record-indexer reference is now a
// published contract rather than an undeclared shape, and the FTS statement's
// parameter bag is annotated as the shared bound-parameter record that
// buildSearchWhereClause mutates into it.
assert.ok(
  fs.readFileSync("src/types/framework-contracts.d.ts", "utf8")
    .includes("export type SearchRecordIndexerReference = {"),
  "framework contracts should keep publishing the record-indexer reference",
);
assert.ok(
  fs.readFileSync("src/core/search/adapters/sqlite-search-adapter.js", "utf8")
    .includes("/** @type {SearchParams} */\n  const params = {\n    ftsQuery,"),
  "the SQLite FTS statement should keep declaring its shared bound-parameter record",
);
assert.ok(
  fs.readFileSync("scripts/search-contract-regression.mjs", "utf8")
    .includes("the single-record indexer reference should carry"),
  "scripts/search-contract-regression.mjs should keep proving the record-indexer reference members",
);
for (const helpOwner of [
  "scripts/help-center-surface-regression.mjs",
  "scripts/help-content-regression.mjs",
  "scripts/help-contract-regression.mjs",
  "scripts/help-markdown-source-layout-regression.mjs",
  "scripts/help-navigation-boundary-regression.mjs",
  "scripts/help-search-regression.mjs",
  "scripts/help-workflow-regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[helpOwner], undefined, `${helpOwner} must stay strict-clean after checkpoint 0.33.33.32.20`);
}
// The recursive Help navigation walk answers to the published navigation node
// rather than to inference, in both owners that carry it.
for (const navigationOwner of [
  "scripts/help-center-surface-regression.mjs",
  "scripts/help-navigation-boundary-regression.mjs",
]) {
  assert.ok(
    fs.readFileSync(navigationOwner, "utf8")
      .includes('import("../src/types/help-static-contracts.js").HelpNavigationItem'),
    `${navigationOwner} should keep walking navigation through the published node contract`,
  );
}
for (const clientProjectsOwner of [
  "scripts/client-projects-canonical-payload-regression.mjs",
  "scripts/clients-projects-bulk-toolbar-regression.mjs",
  "scripts/clients-projects-framework-read-anatomy-regression.mjs",
  "scripts/clients-projects-read-descriptor-host-regression.mjs",
  "scripts/clients-projects-related-regions-regression.mjs",
  "scripts/clients-projects-strict-closeout-regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[clientProjectsOwner], undefined, `${clientProjectsOwner} must stay strict-clean after checkpoint 0.33.33.32.21`);
}
// The read-anatomy owners prove the framework-owned table anatomy is present
// before asserting on it, rather than weakening the assertions that make this
// module's framework-versus-module boundary provable.
assert.ok(
  fs.readFileSync("scripts/clients-projects-framework-read-anatomy-regression.mjs", "utf8")
    .includes("descriptor should contribute a table"),
  "scripts/clients-projects-framework-read-anatomy-regression.mjs should keep proving the contributed table anatomy",
);
assert.ok(
  fs.readFileSync("scripts/clients-projects-read-descriptor-host-regression.mjs", "utf8")
    .includes("should declare a data source"),
  "scripts/clients-projects-read-descriptor-host-regression.mjs should keep proving each surface declares its data source",
);
for (const hierarchyOwner of [
  "scripts/client-project-hierarchy-branch-closeout-regression.mjs",
  "scripts/client-projects-bugfix-regression.mjs",
  "scripts/client-projects-repositories-conversion-regression.mjs",
  "scripts/framework-admin-low-count-repositories-conversion-regression.mjs",
  "scripts/project-default-assignee-regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[hierarchyOwner], undefined, `${hierarchyOwner} must stay strict-clean after checkpoint 0.33.33.32.22`);
}
// No published session contract declares a bare `ip` member; every one names
// `ip_address`. Fixtures that set `ip` therefore set a field nothing reads and
// omit the field the contract declares, and a double cast to the session type
// hides that from the checker. 0.33.33.32.21 and 0.33.33.32.22 found seven such
// fixtures in one module family; 0.33.33.32.22.1 audited the estate, classified
// every remaining `ip:` member by its receiving contract, found seven more that
// were all session-shaped, and corrected them. This guard is estate-wide rather
// than a list of owners so the class cannot reopen anywhere.
// 0.33.33.32.28 narrowed this from a blanket prohibition on any `ip:` member
// to one tied to session-shaped literals. The blanket form was correct for the
// estate as it stood but would have failed a future legitimate `ip` on an
// unrelated shape - a request-context record, an HTTP client option, a
// rate-limit or audit fixture describing a remote address. The narrowed rule
// was verified against all seven pre-correction fixtures in Git rather than
// assumed: every one of them names a session member in the same literal, so
// all seven still fail. The broader alternative - forbidding a laundering cast
// to any published session type - was measured and rejected: ten such casts
// remain estate-wide and every one is a deliberate probe stub, so that rule
// would be all false positives.
for (const scriptPath of discoveredScriptPaths()) {
  const source = fs.readFileSync(scriptPath, "utf8");
  assert.deepEqual(
    sessionShapedIpMembers(source),
    [],
    `${scriptPath} sets the misnamed ip field on a session-shaped literal; published session contracts name ip_address`,
  );
}
for (const sessionOwner of [
  "scripts/client-project-hierarchy-branch-closeout-regression.mjs",
  "scripts/client-projects-bugfix-regression.mjs",
  "scripts/client-projects-repositories-conversion-regression.mjs",
  "scripts/framework-admin-low-count-repositories-conversion-regression.mjs",
  "scripts/project-default-assignee-regression.mjs",
]) {
  const source = fs.readFileSync(sessionOwner, "utf8");
  assert.ok(source.includes("workspaceSessionFixture"), `${sessionOwner} should seed sessions through the shared workspace session fixture`);
}
// The Clients/Projects audit metadata is a JSON-bearing database column, so it
// is proven to be text and narrowed to a record before the recorded action is
// read off it.
assert.ok(
  fs.readFileSync("scripts/client-projects-repositories-conversion-regression.mjs", "utf8")
    .includes("audit row should persist metadata as JSON text"),
  "scripts/client-projects-repositories-conversion-regression.mjs should keep narrowing its audit metadata column",
);
for (const pickerOwner of [
  "scripts/linked-context-client-project-label-sort-regression.mjs",
  "scripts/linked-context-client-scope-picker-regression.mjs",
  "scripts/linked-context-note-list-label-regression.mjs",
  "scripts/linked-context-picker-shell-regression.mjs",
  "scripts/linked-context-task-label-sort-regression.mjs",
  "scripts/linked-context-unavailable-fallback-regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[pickerOwner], undefined, `${pickerOwner} must stay strict-clean after checkpoint 0.33.33.32.23`);
}
// The five database-backed picker owners answer to one shared session contract
// rather than five local session shapes.
for (const pickerSessionOwner of [
  "scripts/linked-context-client-project-label-sort-regression.mjs",
  "scripts/linked-context-client-scope-picker-regression.mjs",
  "scripts/linked-context-note-list-label-regression.mjs",
  "scripts/linked-context-task-label-sort-regression.mjs",
  "scripts/linked-context-unavailable-fallback-regression.mjs",
]) {
  assert.ok(
    fs.readFileSync(pickerSessionOwner, "utf8")
      .includes('import("../src/types/http-contracts.js").WorkspaceRequestSession} PickerSession'),
    `${pickerSessionOwner} should answer to the shared picker session contract`,
  );
}
for (const viewOwner of [
  "scripts/app-shell-navigation-regression.mjs",
  "scripts/module-actions-regression.mjs",
  "scripts/module-file-closeout-regression.mjs",
  "scripts/quick-action-capture-regression.mjs",
  "scripts/quick-action-opener-rollout-regression.mjs",
  "scripts/view-conversion-branch-closeout-regression.mjs",
  "scripts/view-descriptor-bootstrap-regression.mjs",
  "scripts/view-descriptor-reference-regression.mjs",
  "scripts/view-renderer-actions-regression.mjs",
  "scripts/view-shared-capabilities-regression.mjs",
]) {
  assert.equal(ledger.programs.scripts.diagnostics[viewOwner], undefined, `${viewOwner} must stay strict-clean after checkpoint 0.33.33.32.24`);
}
// The module-actions owner reads browser source through the shared project text
// reader rather than nineteen private readFileSync calls.
assert.ok(
  fs.readFileSync("scripts/module-actions-regression.mjs", "utf8").includes("createProjectTextReader"),
  "scripts/module-actions-regression.mjs should read browser source through the shared reader",
);
assert.equal(
  fs.readFileSync("scripts/module-actions-regression.mjs", "utf8").includes("fs.readFileSync("),
  false,
  "scripts/module-actions-regression.mjs must not reintroduce private file reads",
);
// The renderer-action owner proves the fake browser context installed the API
// it supplied, rather than reading counters back through the harness cast.
assert.ok(
  fs.readFileSync("scripts/view-renderer-actions-regression.mjs", "utf8")
    .includes("should install the provided action API"),
  "scripts/view-renderer-actions-regression.mjs should keep proving its action API install",
);
// The 0.33.33.32.5 compatibility casts are retired: the published
// TimeEntryWriteInput contract means no owner needs to launder a fixture
// through `unknown` to reach timeEntriesRepository.create().
for (const budgetOwner of [
  "scripts/regressions/dashboard/hot-endpoint-budgets.regression.mjs",
  "scripts/regressions/time-tracking/dashboard-effort-summary-budgets.regression.mjs",
]) {
  assert.equal(
    fs.readFileSync(budgetOwner, "utf8").includes("TimeEntry} */ (/** @type {unknown}"),
    false,
    `${budgetOwner} must not reintroduce the retired TimeEntry compatibility cast`,
  );
}

// 0.33.33.32.25 typed the Workbench and Time Tracking declarative contract
// modules. These are side-effect modules loaded by their area aggregators, so
// they are pinned by path rather than by regression id.
for (const contractModule of [
  "scripts/regression-contracts/time-tracking/time-entries-screen.contract.mjs",
  "scripts/regression-contracts/time-tracking/time-tracking-create-timer-modal.contract.mjs",
  "scripts/regression-contracts/workbench/task-focus-deep-link.contract.mjs",
  "scripts/regression-contracts/workbench/workbench-collapsible-sections.contract.mjs",
  "scripts/regression-contracts/workbench/workbench-in-place-open-work.contract.mjs",
  "scripts/regression-contracts/workbench/workbench-inspector-panel.contract.mjs",
  "scripts/regression-contracts/workbench/workbench-recommended-cycling.contract.mjs",
  "scripts/regression-contracts/workbench/workbench-remove-all-tasks-list.contract.mjs",
  "scripts/regression-contracts/workbench/workbench-remove-quick-notes.contract.mjs",
  "scripts/regression-contracts/workbench/workbench-task-focus-checklist.contract.mjs",
  "scripts/regression-contracts/workbench/workbench-task-focus-linked-note-view.contract.mjs",
  "scripts/regression-contracts/workbench/workbench-task-focus-surface.contract.mjs",
  "scripts/regression-contracts/workbench/workbench-task-focus-timer.contract.mjs",
  "scripts/regression-contracts/workbench/workbench-view-state.contract.mjs",
]) {
  assert.equal(
    ledger.programs.scripts.diagnostics[contractModule],
    undefined,
    `${contractModule} must stay strict-clean after checkpoint 0.33.33.32.25`,
  );
}
// 0.33.33.32.26 typed the Tasks, Notes, Lists, and Tags declarative contract
// modules. Pinned by path for the same reason as the 0.33.33.32.25 cohort:
// these are side-effect modules with no regression id of their own.
for (const contractModule of [
  "scripts/regression-contracts/lists/lists-declarative-readonly-surface.contract.mjs",
  "scripts/regression-contracts/lists/lists-workflow-linked-layout.contract.mjs",
  "scripts/regression-contracts/notes/notes-critical-quick-fixes.contract.mjs",
  "scripts/regression-contracts/notes/notes-file-preview-actions.contract.mjs",
  "scripts/regression-contracts/notes/notes-tasks-modal-footer-visual-parity.contract.mjs",
  "scripts/regression-contracts/tags/tag-record-workflow.contract.mjs",
  "scripts/regression-contracts/tasks/task-checklist-editor-display.contract.mjs",
  "scripts/regression-contracts/tasks/task-critical-quick-fixes.contract.mjs",
  "scripts/regression-contracts/tasks/task-editor-workbench-handoff.contract.mjs",
  "scripts/regression-contracts/tasks/tasks-bulk-toolbar-shell.contract.mjs",
  "scripts/regression-contracts/tasks/tasks-checklist-escape-hatch.contract.mjs",
  "scripts/regression-contracts/tasks/tasks-declarative-readonly-surface.contract.mjs",
  "scripts/regression-contracts/tasks/tasks-detail-read-panel.contract.mjs",
  "scripts/regression-contracts/tasks/tasks-filter-sidebar-anatomy.contract.mjs",
  "scripts/regression-contracts/tasks/tasks-lifecycle-action-descriptor.contract.mjs",
  "scripts/regression-contracts/tasks/tasks-list-surface-boundary.contract.mjs",
  "scripts/regression-contracts/tasks/tasks-readonly-list-binding.contract.mjs",
  "scripts/regression-contracts/tasks/tasks-relationship-linked-context.contract.mjs",
  "scripts/regression-contracts/tasks/tasks-strict-guardrail-inventory.contract.mjs",
  "scripts/regression-contracts/tasks/tasks-tags-files-child-dialog.contract.mjs",
  "scripts/regression-contracts/tasks/tasks-workflow-action-descriptor.contract.mjs",
]) {
  assert.equal(
    ledger.programs.scripts.diagnostics[contractModule],
    undefined,
    `${contractModule} must stay strict-clean after checkpoint 0.33.33.32.26`,
  );
}
// Every area aggregator that has left the planning-document pin baseline is
// covered here: the two from 0.33.33.32.25 and the four from 0.33.33.32.26.
// Every module under them must stay off archived release prose, off live-roadmap
// breadcrumb reads, and off the redundant cursor floor that
// release.roadmap-cursor-floor already asserts once. Plain substring checks: a
// regex here would carry an escaping surface, and 0.33.33.32.24 shipped a guard
// that a consumed escape had already made unmatchable.
for (const contractDirectory of [
  "scripts/regression-contracts/lists",
  "scripts/regression-contracts/notes",
  "scripts/regression-contracts/tags",
  "scripts/regression-contracts/tasks",
  "scripts/regression-contracts/time-tracking",
  "scripts/regression-contracts/workbench",
]) {
  for (const entry of fs.readdirSync(contractDirectory)) {
    const modulePath = `${contractDirectory}/${entry}`;
    const source = fs.readFileSync(modulePath, "utf8");
    // The document names are assembled rather than written out. Spelling them
    // literally would make this guard itself a planning-document pinner, which
    // release.historical-evidence-retirement correctly rejects as a new pin.
    const forbiddenReads = ["CHANGELOG", "ROADMAP", "ROADMAP-ARCHIVE"].map((document) => `${document}.md`);
    for (const forbidden of [...forbiddenReads, "assertRoadmapCursorAtLeast"]) {
      assert.equal(
        source.includes(forbidden),
        false,
        `${modulePath} must not read ${forbidden}; its area aggregator has left the planning-document pin baseline and the baseline is shrink-only`,
      );
    }
  }
}
// 0.33.33.32.27 typed the last of the legacy and operational owners. This is
// the highest parse density in the rollup, so the pins below cover both the
// strict state and the boundaries that state depends on.
for (const legacyOwner of [
  "scripts/audit-extensibility-regression.mjs",
  "scripts/bump-version-regression.mjs",
  "scripts/legacy-cleanup-regression.mjs",
  "scripts/performance-regression.mjs",
  "scripts/regression-clean-clone-contract.mjs",
  "scripts/regression-runner-regression.mjs",
  "scripts/regression-suite-inventory-regression.mjs",
  "scripts/regressions/licensing/licensing-public-release-gates.regression.mjs",
  "scripts/runtime-configuration-contract-regression.mjs",
  "scripts/runtime-diagnostics-route-regression.mjs",
  "scripts/runtime-env-loading-regression.mjs",
  "scripts/scale-seed-framework-regression.mjs",
  "scripts/user-theme-auto-mode-regression.mjs",
  "scripts/version-literal-guardrail-regression.mjs",
]) {
  assert.equal(
    ledger.programs.scripts.diagnostics[legacyOwner],
    undefined,
    `${legacyOwner} must stay strict-clean after checkpoint 0.33.33.32.27`,
  );
}
// Every owner that parses JSON or a child process's structured stdout must
// keep reaching it through a shared narrowing. Reading a field straight off
// JSON.parse is the inherited-zero shape this rollup exists to remove, and it
// leaves no diagnostic behind to catch it later.
for (const parseOwner of [
  "scripts/bump-version-regression.mjs",
  "scripts/regression-suite-inventory-regression.mjs",
  "scripts/runtime-configuration-contract-regression.mjs",
  "scripts/runtime-diagnostics-route-regression.mjs",
  "scripts/runtime-env-loading-regression.mjs",
  "scripts/scale-seed-framework-regression.mjs",
  "scripts/version-literal-guardrail-regression.mjs",
  "scripts/regressions/licensing/licensing-public-release-gates.regression.mjs",
]) {
  const source = fs.readFileSync(parseOwner, "utf8");
  assert.ok(
    [
      "requireJsonRecord",
      "readPayload",
      "requireRow",
      "requireFirstRow",
      "fixtureString",
    ].some((narrowing) => source.includes(narrowing)),
    `${parseOwner} parses a dynamic boundary and must narrow it through a shared assertion helper`,
  );
}
// The dead live-roadmap breadcrumb reads 0.33.33.32.27 retired must not come
// back. The document name is assembled rather than written out so this guard
// does not itself register as a planning-document pinner.
  const liveRoadmapRead = `readText("${"ROADMAP"}.md")`;
for (const breadcrumbOwner of [
  "scripts/runtime-configuration-contract-regression.mjs",
  "scripts/runtime-diagnostics-route-regression.mjs",
  "scripts/runtime-env-loading-regression.mjs",
  "scripts/user-theme-auto-mode-regression.mjs",
]) {
  assert.equal(
    fs.readFileSync(breadcrumbOwner, "utf8").includes(liveRoadmapRead),
    false,
    `${breadcrumbOwner} must not reintroduce the retired live-roadmap breadcrumb read`,
  );
}
// An express application is a Node request listener, and the first-party
// declaration now says so. Dropping that call signature would push every
// caller that mounts the app through http.createServer back onto a cast.
assert.ok(
  fs.readFileSync("src/types/server-runtime-modules.d.ts", "utf8")
    .includes("(request: import(\"node:http\").IncomingMessage, response: import(\"node:http\").ServerResponse): void;"),
  "the express Application declaration should keep its Node request-listener call signature",
);
// 0.33.33.32.28 audited the explicit-`any` inventory and closed it. One of the
// three recorded occurrences was a detector false positive - a regular
// expression whose own purpose was to forbid such annotations - and the
// detector now blanks string, template, and regular-expression literals before
// scanning. The other two were real and were replaced with truthful contracts.
// This pins the result: the repository carries no explicit `any`.
assert.equal(
  ledger.totals.explicitAny,
  0,
  `the repository should carry no explicit any; the ledger records ${JSON.stringify(ledger.explicitAnyByFile)}`,
);
// The detector must stay literal-aware, and that is proven by driving it
// rather than by reading its source: a zero inventory is only trustworthy if
// the thing producing it still finds a real annotation. Both fixtures are
// assembled from parts so this file does not spell the token it is testing.
const annotationToken = `{${"an"}${"y"}}`;
assert.equal(
  countExplicitAnyAnnotations(`/** @param ${annotationToken} value */`),
  1,
  "the explicit-any detector must still count a real JSDoc annotation",
);
assert.equal(
  countExplicitAnyAnnotations(`const forbidden = /@param ${annotationToken}/;`),
  0,
  "the explicit-any detector must not count an annotation spelled inside a regular expression",
);
assert.equal(
  countExplicitAnyAnnotations(`const message = "a ${annotationToken} annotation is forbidden";`),
  0,
  "the explicit-any detector must not count an annotation spelled inside a string",
);
// 0.33.33.32.28 published AppShellSearchTarget and SearchTargetFieldMap, so
// consumers now trust those members statically. Each needs a live proof that
// the producer really emits them.
assert.ok(
  fs.readFileSync("scripts/search-shell-regression.mjs", "utf8")
    .includes("should carry exactly the six contract members"),
  "scripts/search-shell-regression.mjs should keep proving the published search-target contract at runtime",
);
assert.ok(
  fs.readFileSync("scripts/search-contract-regression.mjs", "utf8")
    .includes("should publish its column map"),
  "scripts/search-contract-regression.mjs should keep proving the published search target column map",
);
// SessionSeed now names the eight fields prepareSessionRecord consumes, so no
// caller needs to launder a precise session through an object literal.
// The needle is assembled rather than spelled out. A source-text guard that
// writes its own forbidden pattern matches itself - the third time this
// rollup has hit that, after the planning-document names at 0.33.33.32.25
// and the annotation-shaped token in the detector's own comment.
  const spreadOnlySeed = `createSession({ ${"."}${".."}`;
for (const seedOwner of discoveredScriptPaths()) {
  assert.equal(
    fs.readFileSync(seedOwner, "utf8").includes(spreadOnlySeed),
    false,
    `${seedOwner} must not reintroduce the spread-only createSession compatibility pattern`,
  );
}
// 0.33.33.32.28.2 retired the request-listener laundering casts. 0.33.33.32.27
// declared that an express Application is a Node request listener, which is
// what http.createServer requires, so the compensating cast became dead and 45
// owners were carrying it. The needle is assembled from parts because a
// source-text guard that spells its own forbidden pattern matches itself - the
// fourth time this rollup would have hit that.
const requestListenerCast = `${"Request"}${"Listener"}} */ (/** @type {unknown} */ (`;
for (const listenerOwner of discoveredScriptPaths()) {
  const source = fs.readFileSync(listenerOwner, "utf8");
  assert.equal(
    source.includes(requestListenerCast),
    false,
    `${listenerOwner} must not reintroduce the request-listener laundering cast; express Application is declared as a Node request listener`,
  );
}
// The declaration that made those casts dead has to stay. 0.33.33.32.28 already
// pins the call signature; this pins the consequence, so a future edit that
// removes one without the other fails on both.
assert.equal(
  fs.readFileSync("scripts/sqlite-small-office-performance.mjs", "utf8").includes("@param {HttpFixtureApp} app"),
  true,
  "the small-office performance owner should keep typing its fixture app from the published contract rather than casting",
);
// 0.33.33.32.28.3.2 narrowed the response-body boundaries. Each of these
// owners parses a response, a probe body, or a serialized log line, and each
// must keep crossing that boundary through a shared narrowing rather than
// reading a member straight off JSON.parse.
for (const responseOwner of [
  "scripts/backup-restore-drill.mjs",
  "scripts/lib/regression-change-routing.mjs",
  "scripts/regressions/framework/operational-security-basics.regression.mjs",
  "scripts/regressions/framework/public-demo-account-catalog.regression.mjs",
  "scripts/regressions/framework/support-view-session-contract.regression.mjs",
  "scripts/regressions/framework/tls-cookie-posture.regression.mjs",
  "scripts/regressions/framework/trusted-proxy-request-context.regression.mjs",
  "scripts/regressions/workbench/hot-endpoint-budgets.regression.mjs",
]) {
  const source = fs.readFileSync(responseOwner, "utf8");
  assert.ok(
    ["readPayload", "requireJsonRecord", "fixtureString", "isJsonRecord"].some((narrowing) => source.includes(narrowing)),
    `${responseOwner} parses a response body and must narrow it through a shared assertion helper`,
  );
}
// Three probe clients declared their parsed body as a named shape that nothing
// checked - a route that stopped publishing a field would have compared
// undefined rather than failing. The body stays open and is proven per read.
for (const probeOwner of [
  "scripts/regressions/framework/tls-cookie-posture.regression.mjs",
  "scripts/regressions/framework/trusted-proxy-request-context.regression.mjs",
]) {
  assert.ok(
    fs.readFileSync(probeOwner, "utf8").includes("{ body: unknown,"),
    `${probeOwner} should keep publishing its probe body as unknown rather than reclaiming a shape nothing proves`,
  );
}
// The version-only change detector used JSON.parse(JSON.stringify(value)) to
// clone two `unknown` parameters, which also silently widened them so their
// members could be read. structuredClone keeps the clone without the widening.
const roundTripClone = `JSON.parse(JSON.${"stringify"}(`;
assert.equal(
  fs.readFileSync("scripts/lib/regression-change-routing.mjs", "utf8").includes(roundTripClone),
  false,
  "scripts/lib/regression-change-routing.mjs must not reintroduce the round-trip clone that widened its unknown inputs",
);
// 0.33.33.32.28.3.1 narrowed the generated policy, ledger, and audit reads.
// Every one of these owners parses a file this repository itself writes, and
// must keep crossing that boundary through a shared narrowing - or, where the
// estate already publishes a probe for the artefact, through the probe.
for (const generatedOwner of [
  "scripts/regression-contracts/database/migration-runner-checked-boundary.contract.mjs",
  "scripts/regressions/framework/asset-cache-version.regression.mjs",
  "scripts/regressions/release/files-regression-isolation-audit.regression.mjs",
  "scripts/regressions/release/public-demo-compose-reset.regression.mjs",
  "scripts/regressions/release/regression-baseline-bypass-audit.regression.mjs",
  "scripts/regressions/release/regression-discovery-runner.regression.mjs",
  "scripts/regressions/release/regression-routing-commands.regression.mjs",
  "scripts/test-support/typecheck-ledger.mjs",
]) {
  const source = fs.readFileSync(generatedOwner, "utf8");
  assert.ok(
    ["requireJsonRecord", "strictCleanOwnerState", "strictCleanOwnerProgram"].some((narrowing) => source.includes(narrowing)),
    `${generatedOwner} parses a generated artefact and must narrow it through a shared assertion helper or read it through the shared probe`,
  );
}
// The strict-ledger probe is now what several owners read the ledger through
// rather than parsing it themselves, so its own behaviour is proven here
// rather than assumed. A probe nothing checks is the same hazard as a
// detector nothing checks.
assert.deepEqual(
  strictCleanOwnerState("src/db/migrations.js"),
  { owned: true, diagnostics: 0 },
  "the strict-ledger probe should report a checked, strict-clean file as owned with no diagnostics",
);
assert.deepEqual(
  strictCleanOwnerState("src/db/this-file-does-not-exist.js"),
  { owned: false, diagnostics: 0 },
  "the strict-ledger probe should report an unknown path as unowned rather than throwing",
);
assert.equal(
  strictCleanOwnerProgram("src/db/migrations.js"),
  "server-tests",
  "the strict-ledger probe should name the program that owns a file",
);
assert.equal(
  strictCleanOwnerProgram("src/db/this-file-does-not-exist.js"),
  null,
  "the strict-ledger probe should answer null for a path no program owns",
);
// 0.33.33.32.28.3.3 narrowed the in-test synthetic and computed sources: a
// staging script's stdout, a fixture the owner wrote moments earlier, a
// git-show of a tracked manifest, a JSON-bearing column, a checked-in
// baseline. Each owner must keep crossing its boundary through a shared
// narrowing, a published probe, or a declared `unknown` the local guards then
// prove - never by reading a member straight off JSON.parse.
for (const syntheticOwner of [
  "scripts/build-runtime-artifact.mjs",
  "scripts/lib/demo-data-operation.mjs",
  "scripts/lib/development-data-safety.mjs",
  "scripts/lib/docs-change-routing.mjs",
  "scripts/lib/sanitized-demo-role-fixtures.mjs",
  "scripts/regression-contracts/framework/calendar-subscription-settings.contract.mjs",
  "scripts/regression-contracts/framework/identifier-authority.contract.mjs",
  "scripts/regression-contracts/framework/markdown-checked-core.contract.mjs",
  "scripts/regression-contracts/framework/password-startup-checked-core.contract.mjs",
  "scripts/regressions/framework/module-import-boundaries.regression.mjs",
  "scripts/regressions/framework/public-legal-surfaces.regression.mjs",
  "scripts/regressions/framework/support-view-request-enforcement.regression.mjs",
  "scripts/regressions/permissions/public-demo-role-journey.regression.mjs",
  "scripts/regressions/permissions/sanitized-demo-role-journey.regression.mjs",
  "scripts/regressions/release/immutable-image-publication.regression.mjs",
  "scripts/regressions/release/maintenance-release-rehearsal.regression.mjs",
  "scripts/regressions/release/preview-deployment-boundary.regression.mjs",
  "scripts/release/checkpoint-commits.mjs",
  "scripts/release/install-playwright-browser.mjs",
]) {
  const source = fs.readFileSync(syntheticOwner, "utf8");
  assert.ok(
    [
      "requireJsonRecord",
      "requirePackageManifest",
      "requirePackageLock",
      "strictCleanOwnerProgram",
      "strictCleanOwnerConfig",
      "@type {unknown}",
    ].some((narrowing) => source.includes(narrowing)),
    `${syntheticOwner} parses a synthetic or computed source and must narrow it rather than read a member off JSON.parse`,
  );
}
// Three owners re-asked by hand what the shared strict-ledger probe already
// answers. The probe answers all three questions now, so nothing needs to
// reach past it into the generated ledger.
const rawLedgerRead = `programs[${"\""}server-tests${"\""}]`;
const ledgerGovernanceOwner = "scripts/regressions/framework/full-strict-governance.regression.mjs";
for (const ledgerOwner of discoveredScriptPaths().filter((path) => path !== ledgerGovernanceOwner)) {
  assert.equal(
    fs.readFileSync(ledgerOwner, "utf8").includes(rawLedgerRead),
    false,
    `${ledgerOwner} must read the strict ledger through the shared probe rather than indexing its programs directly`,
  );
}
// 0.33.33.32.28.4.1 replaced sixteen local function-region extractors with the
// two published ones, so those two now carry every precondition the sixteen
// used to assert for themselves. Nothing proved them before. Each case below
// is a shape that appears in the browser sources the migrated owners read.
assert.equal(
  extractFunctionBlock('function target(a) {\n  return a;\n}\n', "target"),
  'function target(a) {\n  return a;\n}',
  "extractFunctionBlock should cut a plain declaration through its close",
);
assert.equal(
  extractFunctionBody('function target(a) {\n  return a;\n}\n', "target"),
  '{\n  return a;\n}',
  "extractFunctionBody should cut a plain declaration's brace through its close",
);
assert.equal(
  extractFunctionBlock('async function target(a) {\n  return a;\n}\n', "target"),
  'async function target(a) {\n  return a;\n}',
  "extractFunctionBlock should keep the async prefix it matched",
);
assert.equal(
  extractFunctionBody('async function target(a) {\n  return a;\n}\n', "target"),
  '{\n  return a;\n}',
  "extractFunctionBody should return the same body whether or not the declaration is async",
);
assert.equal(
  extractFunctionBlock('function target(options = {}, other = { x: 1 }) {\n  return options;\n}\n', "target"),
  'function target(options = {}, other = { x: 1 }) {\n  return options;\n}',
  "extractFunctionBlock should not close on a brace inside a parameter default",
);
assert.equal(
  extractFunctionBody('function target(options = {}, other = { x: 1 }) {\n  return options;\n}\n', "target"),
  '{\n  return options;\n}',
  "extractFunctionBody should open on the body brace rather than a parameter default",
);
assert.equal(
  extractFunctionBlock('function target() {\n  return `a${"{"}b`;\n}\n', "target"),
  'function target() {\n  return `a${"{"}b`;\n}',
  "extractFunctionBlock should not close on a brace inside a template literal",
);
assert.equal(
  extractFunctionBody('function target() {\n  return `a${"{"}b`;\n}\n', "target"),
  '{\n  return `a${"{"}b`;\n}',
  "extractFunctionBody should not close on a brace inside a template literal",
);
assert.equal(
  extractFunctionBlock('const value = target(1);\nfunction target(a) {\n  return a;\n}\n', "target"),
  'function target(a) {\n  return a;\n}',
  "extractFunctionBlock should skip a call site and answer the declaration",
);
assert.equal(
  extractFunctionBody('const value = target(1);\nfunction target(a) {\n  return a;\n}\n', "target"),
  '{\n  return a;\n}',
  "extractFunctionBody should skip a call site and answer the declaration",
);
assert.equal(
  extractFunctionBlock('function target(a) {\n  function inner() {\n    return 1;\n  }\n  return inner() + a;\n}\n', "target"),
  'function target(a) {\n  function inner() {\n    return 1;\n  }\n  return inner() + a;\n}',
  "extractFunctionBlock should close on the outer function, not a nested one",
);
assert.equal(
  extractFunctionBody('function target(a) {\n  function inner() {\n    return 1;\n  }\n  return inner() + a;\n}\n', "target"),
  '{\n  function inner() {\n    return 1;\n  }\n  return inner() + a;\n}',
  "extractFunctionBody should close on the outer function, not a nested one",
);
assert.equal(
  extractFunctionBlock('function target(a) {\r\n  return a;\r\n}\r\n', "target"),
  'function target(a) {\r\n  return a;\r\n}',
  "extractFunctionBlock should read a source checked out with Windows line endings",
);
assert.equal(
  extractFunctionBody('function target(a) {\r\n  return a;\r\n}\r\n', "target"),
  '{\r\n  return a;\r\n}',
  "extractFunctionBody should read a source checked out with Windows line endings",
);
assert.equal(
  extractFunctionBlock('function target (a) {\n  return a;\n}\n', "target"),
  'function target (a) {\n  return a;\n}',
  "extractFunctionBlock should tolerate a space before the parameter list",
);
assert.equal(
  extractFunctionBody('function target (a) {\n  return a;\n}\n', "target"),
  '{\n  return a;\n}',
  "extractFunctionBody should tolerate a space before the parameter list",
);
assert.equal(
  extractFunctionBlock('function targetExtra(a) {\n  return a;\n}\nfunction target(b) {\n  return b;\n}\n', "target"),
  'function target(b) {\n  return b;\n}',
  "extractFunctionBlock should not answer a longer name that starts with the one asked for",
);
assert.equal(
  extractFunctionBody('function targetExtra(a) {\n  return a;\n}\nfunction target(b) {\n  return b;\n}\n', "target"),
  '{\n  return b;\n}',
  "extractFunctionBody should not answer a longer name that starts with the one asked for",
);
assert.equal(
  extractFunctionBlock('function target(\n  a,\n  b,\n) {\n  return a + b;\n}\n', "target"),
  'function target(\n  a,\n  b,\n) {\n  return a + b;\n}',
  "extractFunctionBlock should span a parameter list broken across lines",
);
assert.equal(
  extractFunctionBody('function target(\n  a,\n  b,\n) {\n  return a + b;\n}\n', "target"),
  '{\n  return a + b;\n}',
  "extractFunctionBody should open after a parameter list broken across lines",
);
assert.equal(
  extractFunctionBlock('function target() {\n  return "}";\n}\n', "target"),
  'function target() {\n  return "}";\n}',
  "extractFunctionBlock should not close on a brace inside a string literal",
);
assert.equal(
  extractFunctionBody('function target() {\n  return "}";\n}\n', "target"),
  '{\n  return "}";\n}',
  "extractFunctionBody should not close on a brace inside a string literal",
);
// A bare call, and a name that is never declared, must both be refused. This is
// the property the Tags record workflow's local extractor lacked: it answered a
// call site, so the two negative assertions it fed had nothing to find and
// passed for the wrong reason.
assert.throws(
  () => extractFunctionBlock("target(1);\n", "target"),
  /target should exist/,
  "extractFunctionBlock should refuse a source that only calls the name",
);
assert.throws(
  () => extractFunctionBody("target(1);\n", "target"),
  /target should exist/,
  "extractFunctionBody should refuse a source that only calls the name",
);
assert.throws(
  () => extractFunctionBlock('function other() {\n  return 1;\n}\n', "target"),
  /target should exist/,
  "extractFunctionBlock should refuse a source that never declares the name",
);
assert.throws(
  () => extractFunctionBody('function other() {\n  return 1;\n}\n', "target"),
  /target should exist/,
  "extractFunctionBody should refuse a source that never declares the name",
);
assert.throws(
  () => extractFunctionBlock('const target = (a) => {\n  return a;\n};\n', "target"),
  /target should exist/,
  "extractFunctionBlock should refuse an arrow function rather than guess at its region",
);
assert.throws(
  () => extractFunctionBody('const target = (a) => {\n  return a;\n};\n', "target"),
  /target should exist/,
  "extractFunctionBody should refuse an arrow function rather than guess at its region",
);
// 0.33.33.32.28.4 closed the two defects 0.33.33.32.28.4.1 pinned, and the
// pins were load-bearing: both failed the moment the scanner changed, which is
// how the fix was confirmed to be the fix. Both extractors now locate the
// declaration in masked source, so declaration-shaped text inside a comment or
// a string cannot be chosen, and both walk masked braces, so a brace inside a
// comment, a string, a template literal, or a regular expression cannot end a
// region early.
//
// Comment anchoring: a decoy in a line comment, a block comment, and a JSDoc
// block, each ahead of the real declaration. Before the fix the first threw,
// the second returned the commented-out fake, and the third returned prose.
assert.equal(
  extractFunctionBlock('// function target() {\nfunction target(a) {\n  return a;\n}\n', "target"),
  'function target(a) {\n  return a;\n}',
  "extractFunctionBlock should ignore a declaration decoy in a line comment",
);
assert.equal(
  extractFunctionBody('// function target() {\nfunction target(a) {\n  return a;\n}\n', "target"),
  '{\n  return a;\n}',
  "extractFunctionBody should ignore a declaration decoy in a line comment",
);
assert.equal(
  extractFunctionBlock('/*\nfunction target() {\n}\n*/\nfunction target(a) {\n  return a;\n}\n', "target"),
  'function target(a) {\n  return a;\n}',
  "extractFunctionBlock should ignore a complete declaration commented out in a block comment",
);
assert.equal(
  extractFunctionBody('/*\nfunction target() {\n}\n*/\nfunction target(a) {\n  return a;\n}\n', "target"),
  '{\n  return a;\n}',
  "extractFunctionBody should ignore a complete declaration commented out in a block comment",
);
assert.equal(
  extractFunctionBlock('/**\n * function target() { described here }\n */\nfunction target(a) {\n  return a;\n}\n', "target"),
  'function target(a) {\n  return a;\n}',
  "extractFunctionBlock should ignore a declaration named in a JSDoc block",
);
assert.equal(
  extractFunctionBody('/**\n * function target() { described here }\n */\nfunction target(a) {\n  return a;\n}\n', "target"),
  '{\n  return a;\n}',
  "extractFunctionBody should ignore a declaration named in a JSDoc block",
);
// Comments inside the body must not move brace depth. Before the fix both of
// these truncated at the brace in the comment - the dangerous direction.
assert.equal(
  extractFunctionBlock('function target(a) {\n  // closing brace } in a comment\n  return a;\n}\n', "target"),
  'function target(a) {\n  // closing brace } in a comment\n  return a;\n}',
  "extractFunctionBlock should not close on a brace inside a line comment in the body",
);
assert.equal(
  extractFunctionBody('function target(a) {\n  // closing brace } in a comment\n  return a;\n}\n', "target"),
  '{\n  // closing brace } in a comment\n  return a;\n}',
  "extractFunctionBody should not close on a brace inside a line comment in the body",
);
assert.equal(
  extractFunctionBlock('function target(a) {\n  /* } */\n  return a;\n}\n', "target"),
  'function target(a) {\n  /* } */\n  return a;\n}',
  "extractFunctionBlock should not close on a brace inside a block comment in the body",
);
assert.equal(
  extractFunctionBody('function target(a) {\n  /* } */\n  return a;\n}\n', "target"),
  '{\n  /* } */\n  return a;\n}',
  "extractFunctionBody should not close on a brace inside a block comment in the body",
);
assert.equal(
  extractFunctionBody('function target(a) {\n  /* { */\n  return a;\n}\n', "target"),
  '{\n  /* { */\n  return a;\n}',
  "extractFunctionBody should not open a level on a brace inside a block comment in the body",
);
// Regular-expression literals. Before the fix the first truncated, the second
// threw, and the sixth truncated at the slash inside its character class.
assert.equal(
  extractFunctionBody('function target() {\n  return /[}]/.test("x");\n}\n', "target"),
  '{\n  return /[}]/.test("x");\n}',
  "extractFunctionBody should not close on a brace inside a regular-expression character class",
);
assert.equal(
  extractFunctionBody('function target() {\n  return /[{]/.test("x");\n}\n', "target"),
  '{\n  return /[{]/.test("x");\n}',
  "extractFunctionBody should not open a level on a brace inside a regular-expression character class",
);
assert.equal(
  extractFunctionBody('function target() {\n  return /[{}]/.test("x");\n}\n', "target"),
  '{\n  return /[{}]/.test("x");\n}',
  "extractFunctionBody should read a character class holding both braces",
);
assert.equal(
  extractFunctionBody('function target() {\n  return /\\{foo\\}/.test("x");\n}\n', "target"),
  '{\n  return /\\{foo\\}/.test("x");\n}',
  "extractFunctionBody should read escaped braces in a regular-expression body",
);
assert.equal(
  extractFunctionBody('function target() {\n  return /(?:a|{b})/.test("x");\n}\n', "target"),
  '{\n  return /(?:a|{b})/.test("x");\n}',
  "extractFunctionBody should read a brace inside a regular-expression group",
);
assert.equal(
  extractFunctionBody('function target() {\n  return /a\\/b[/}]c/.test("x");\n}\n', "target"),
  '{\n  return /a\\/b[/}]c/.test("x");\n}',
  "extractFunctionBody should not end a regular expression at an escaped slash or one inside a character class",
);
assert.equal(
  extractFunctionBlock('function target() {\n  return /a\\/b[/}]c/.test("x");\n}\n', "target"),
  'function target() {\n  return /a\\/b[/}]c/.test("x");\n}',
  "extractFunctionBlock should not end a regular expression at an escaped slash or one inside a character class",
);
// Division must stay division. These two are the controls that stop the regex
// reading from being bought at the price of ordinary arithmetic; the repository
// has 49 slashes after a closing paren and every one of them divides.
assert.equal(
  extractFunctionBody('function target(a, b) {\n  const half = (a + b) / 2;\n  const third = half / 3;\n  return { half, third };\n}\n', "target"),
  '{\n  const half = (a + b) / 2;\n  const third = half / 3;\n  return { half, third };\n}',
  "extractFunctionBody should read a slash after a closing paren as division",
);
assert.equal(
  extractFunctionBody('function target() {\n  return "a / b / c }";\n}\n', "target"),
  '{\n  return "a / b / c }";\n}',
  "extractFunctionBody should not read slashes inside a string as a regular expression",
);
// A template substitution is code, and its own braces are tracked, so an
// object literal inside `${...}` does not close the substitution early.
assert.equal(
  extractFunctionBody('function target(a) {\n  return `x${JSON.stringify({ a })}y`;\n}\n', "target"),
  '{\n  return `x${JSON.stringify({ a })}y`;\n}',
  "extractFunctionBody should track brace depth inside a template substitution",
);
// The scanner decides what is code by walking the source, so the shapes that
// can fool a simpler reader are worth pinning. Every one of these appears in
// the browser and repository sources these owners read.
assert.equal(
  extractFunctionBody('function target() {\n  return "http://example.com/}";\n}\n', "target"),
  '{\n  return "http://example.com/}";\n}',
  "extractFunctionBody should not read the double slash inside a URL string as a comment",
);
assert.equal(
  extractFunctionBlock('function target() {\n  return "http://example.com/}";\n}\n', "target"),
  'function target() {\n  return "http://example.com/}";\n}',
  "extractFunctionBlock should not read the double slash inside a URL string as a comment",
);
assert.equal(
  extractFunctionBody('function target(c) {\n  return `a${`b${c}`}d`;\n}\n', "target"),
  '{\n  return `a${`b${c}`}d`;\n}',
  "extractFunctionBody should read a template literal nested inside a substitution",
);
assert.equal(
  extractFunctionBody('function target(s) {\n  return /["\']}/.test(s);\n}\n', "target"),
  '{\n  return /["\']}/.test(s);\n}',
  "extractFunctionBody should not open a string on a quote inside a regular expression",
);
assert.equal(
  extractFunctionBody("function target() {\n  return 'it\\'s }';\n}\n", "target"),
  "{\n  return 'it\\'s }';\n}",
  "extractFunctionBody should not close a string on an escaped quote",
);
assert.equal(
  extractFunctionBody('function target() {\n  return "*/ }";\n}\n', "target"),
  '{\n  return "*/ }";\n}',
  "extractFunctionBody should not read a comment terminator inside a string",
);
assert.equal(
  extractFunctionBody('function target(s) {\n  return /{a}/.test(s);\n}\n', "target"),
  '{\n  return /{a}/.test(s);\n}',
  "extractFunctionBody should read a regular expression opening a statement after return",
);
// 0.33.33.32.28.4.2 published `extractFunctionSpan`, the third region: a
// declaration through everything that follows it, up to the next top-level
// function or the end of the source. Thirteen Tasks contract modules had
// written it by hand and asserted about the trailing constants it carries, so
// every property their hand-written version depended on is pinned here, and so
// is every property it got wrong.
assert.equal(
  extractFunctionSpan('function target() {\n  return 1;\n}\nconst trailing = 2;\nfunction next() {\n  return 3;\n}\n', "target"),
  'function target() {\n  return 1;\n}\nconst trailing = 2;',
  "extractFunctionSpan should carry the trailing declarations and stop at the next top-level function",
);
assert.equal(
  extractFunctionSpan('function target() {\n  return 1;\n}\nconst table = { a: 1 };\nclass Thing {}\nfunction next() {}\n', "target"),
  'function target() {\n  return 1;\n}\nconst table = { a: 1 };\nclass Thing {}',
  "a top-level const or class should not end the span - only the next function does",
);
assert.equal(
  extractFunctionSpan('function target() {\n  return 1;\n}\nconst trailing = 2;\n', "target"),
  'function target() {\n  return 1;\n}\nconst trailing = 2;\n',
  "extractFunctionSpan should run to the end of the source when no function follows",
);
assert.equal(
  extractFunctionSpan('const before = 1;\nasync function target() {\n  return 1;\n}\nfunction next() {}\n', "target"),
  'async function target() {\n  return 1;\n}',
  "extractFunctionSpan should begin at the async keyword, not after it",
);
// The hand-written version located its declaration with a substring search,
// which answers a longer name that merely starts with the one asked for. That
// is not hypothetical: one Tasks owner asked for `open` and was reading
// `openTaskEditor`, so its assertion had never once read the function it named.
assert.equal(
  extractFunctionSpan('function targetExtra() {\n  return 0;\n}\nfunction target() {\n  return 1;\n}\nfunction next() {}\n', "target"),
  'function target() {\n  return 1;\n}',
  "extractFunctionSpan should not answer a longer name that starts with the one asked for",
);
assert.equal(
  extractFunctionSpan('// function target() { fake }\nfunction target() {\n  return 1;\n}\nfunction next() {}\n', "target"),
  'function target() {\n  return 1;\n}',
  "extractFunctionSpan should not begin at a declaration decoy inside a comment",
);
// The span deliberately reaches past the function's own closing brace, so what
// ends it matters as much as what starts it. A nested function must not, and
// neither must one that only looks top-level because it sits in a comment or a
// template literal - the hand-written version searched raw text and could be
// ended by either.
assert.equal(
  extractFunctionSpan('function target() {\n  function inner() {\n    return 1;\n  }\n  return inner();\n}\nfunction next() {}\n', "target"),
  'function target() {\n  function inner() {\n    return 1;\n  }\n  return inner();\n}',
  "a nested function should not end the span",
);
assert.equal(
  extractFunctionSpan('function target() {\n  return 1;\n}\n// function decoy() {}\nconst trailing = 2;\nfunction next() {}\n', "target"),
  'function target() {\n  return 1;\n}\n// function decoy() {}\nconst trailing = 2;',
  "a function declaration inside a comment should not end the span",
);
assert.equal(
  extractFunctionSpan('function target() {\n  return 1;\n}\nconst snippet = `\nfunction decoy() {}\n`;\nfunction next() {}\n', "target"),
  'function target() {\n  return 1;\n}\nconst snippet = `\nfunction decoy() {}\n`;',
  "a function declaration inside a template literal should not end the span",
);
assert.equal(
  extractFunctionSpan('function target() {\n  return 1;\n}\nfunction  \nasync function next() {}\n', "target"),
  'function target() {\n  return 1;\n}',
  "an async function should end the span as readily as a plain one",
);
// `0.33.33.32.28.4.2` pinned the opposite of this: an indented function did not end the
// span, so every span over a closure-wrapped source ran to the end of its file. That was
// deliberate - 58 of that checkpoint's 154 spans already asserted against the widened
// region, and it was pinned rather than quietly changed.
//
// `0.33.33.33.6` made that pin untenable. Scoping the browser estate indents every
// controller, so the rule was converting more spans into whole-file reads with each
// child: 112 of the suite's 289 resolvable span extractions had become end-of-file reads
// across 13 regressions. A widened span turns a `doesNotMatch` assertion into a false
// failure - which is how this was found - and silently turns a `match` assertion into a
// vacuous one.
//
// Indentation was never the question: a function at depth 0 of a bare script and one at
// depth 1 of an IIFE-wrapped script are the same structural thing. The span now ends at
// the next declaration at the *same brace depth*, indented or not, and no extraction in
// the suite reaches end-of-file any more.
assert.equal(
  extractFunctionSpan('function target() {\n  return 1;\n}\n  function indentedNext() {}\n', "target"),
  'function target() {\n  return 1;\n}',
  "an indented sibling ends the span, because depth rather than column decides what a sibling is",
);
assert.equal(
  extractFunctionSpan('(function wrapper() {\n  function target() {\n    return 1;\n  }\n  function next() {}\n})();\n', "target"),
  'function target() {\n    return 1;\n  }',
  "a span inside a closure ends at the next declaration in that closure rather than at the end of the file",
);
assert.equal(
  extractFunctionSpan('function target() {\n  function nested() {}\n  return nested;\n}\nfunction next() {}\n', "target"),
  'function target() {\n  function nested() {}\n  return nested;\n}',
  "a nested declaration is deeper than the span's owner and must not end it",
);
// Reading depth rather than column made function expressions matter. Under the column
// rule an expression could only be mistaken for a declaration if it began a line; at the
// same brace depth an assignment, an argument, and a named function expression all sit
// exactly where a declaration would. Only statement position separates them.
for (const [label, source, mustContain] of [
  ["an assignment", 'function target() {}\nconst handler = function (event) {};\nfunction next() {}\n', "const handler = function (event) {};"],
  ["a named function expression", 'function target() {}\nconst handler = function inner() {};\nfunction next() {}\n', "const handler = function inner() {};"],
  ["a callback argument", 'function target() {}\nregister(function (event) {});\nfunction next() {}\n', "register(function (event) {});"],
  ["an object property", 'function target() {}\nconst handlers = { onClick: function (event) {} };\nfunction next() {}\n', "onClick: function (event) {}"],
  ["an exported declaration", 'function target() {}\nexport function exported() {}\nfunction next() {}\n', "export function exported() {}"],
]) {
  assert.ok(
    extractFunctionSpan(source, "target").includes(mustContain),
    `${label} is not a declaration in statement position and must not end a span`,
  );
}
assert.equal(
  extractFunctionSpan('function target() {}\nconst handler = function (event) {};\nfunction next() {}\n', "target"),
  'function target() {}\nconst handler = function (event) {};',
  "the span still ends at the next real declaration once the expression is passed over",
);

// A class method name is not unique within a file, so `extractClassMethodBlock` requires
// the class. `0.33.33.33.7` first published a name-only version and every one of the four
// shapes below redirected it; because the brace walk anchors to whatever the start locator
// found, a wrong start silently widens the region. These fixtures prove the start locator,
// which the end-boundary fixtures alone could never do.
for (const [shape, ambiguousSource] of [
  ["a bare call with the same name", "function wrapper() {\n  target();\n}\n\nclass Example {\n  target() {\n    return 1;\n  }\n}\n"],
  ["an ordinary function with the same name", "function target() {\n  return false;\n}\n\nclass Example {\n  target() {\n    return 1;\n  }\n}\n"],
  ["an object-literal method with the same name", "const handlers = {\n  target() {\n    return false;\n  },\n};\n\nclass Example {\n  target() {\n    return 1;\n  }\n}\n"],
  ["another class with the same method name", "class Other {\n  target() {\n    return false;\n  }\n}\n\nclass Example {\n  target() {\n    return 1;\n  }\n}\n"],
]) {
  const extracted = extractClassMethodBlock(ambiguousSource, "Example", "target");
  assert.equal(extracted, "target() {\n    return 1;\n  }", `${shape} before the class must not be selected`);
  assert.doesNotMatch(extracted, /return false;/, `${shape} must not leak into the extracted region`);
}

// Scoping a controller indents its class by one level and must change nothing else.
assert.equal(
  extractClassMethodBlock("(function wrap() {\n  class Example {\n    target() {\n      return 1;\n    }\n  }\n})();\n", "Example", "target"),
  "target() {\n      return 1;\n    }",
  "the same method inside a scoped controller reads the same region, one indent level deeper",
);
assert.equal(
  extractClassMethodBlock("class Example {\n  async target() {\n    await this.other();\n  }\n}\n", "Example", "target"),
  "async target() {\n    await this.other();\n  }",
  "an async instance method is supported",
);
assert.equal(
  extractClassMethodBlock("class Example {\n  target({ a } = {}) {\n    return a;\n  }\n}\n", "Example", "target"),
  "target({ a } = {}) {\n    return a;\n  }",
  "a default parameter value containing braces does not end the region early",
);
assert.ok(
  extractClassMethodBlock("class Example {\n  target() {\n    this.target();\n    this.next();\n    return 1;\n  }\n  next() {}\n}\n", "Example", "target")
    .includes("this.next();"),
  "calls inside the method body do not alter its boundaries",
);

// Masked syntax cannot create a false match.
for (const [shape, maskedSource] of [
  ["a line comment", "// class Example { target() { return 0; } }\nclass Example {\n  target() {\n    return 1;\n  }\n}\n"],
  ["a block comment", "/* class Example { target() { return 0; } } */\nclass Example {\n  target() {\n    return 1;\n  }\n}\n"],
  ["a string literal", "const s = \"class Example { target() { return 0; } }\";\nclass Example {\n  target() {\n    return 1;\n  }\n}\n"],
  ["a template literal", "const s = `class Example { target() { return 0; } }`;\nclass Example {\n  target() {\n    return 1;\n  }\n}\n"],
  ["a regular expression literal", "const r = /class Example \\{ target\\(\\) \\{/;\nclass Example {\n  target() {\n    return 1;\n  }\n}\n"],
]) {
  assert.equal(
    extractClassMethodBlock(maskedSource, "Example", "target"),
    "target() {\n    return 1;\n  }",
    `class-shaped text inside ${shape} must not be matched`,
  );
}

// Brace depth alone does not prove class-element position. A call in a field initialiser
// or in another method's parameter list also sits at class-body depth 0, and matching one
// produced a region that was not a method at all: the field case widened through to the
// real method and the parameter case returned a fragment. The same rule is what stops
// `static async target()` being re-entered at the name after the `async` candidate was
// refused, which is how an unsupported static member was previously returned.
for (const [shape, positionSource] of [
  ["a call in a field initialiser", "class Example {\n  field = target();\n\n  target() {\n    return 1;\n  }\n}\n"],
  ["a call in another method's parameter list", "class Example {\n  other(value = target()) {}\n\n  target() {\n    return 1;\n  }\n}\n"],
]) {
  const extracted = extractClassMethodBlock(positionSource, "Example", "target");
  assert.equal(extracted, "target() {\n    return 1;\n  }", `${shape} is not a class element and must not be selected`);
}
assert.throws(
  () => extractClassMethodBlock("class Example {\n  static async target() {\n    return 1;\n  }\n}\n", "Example", "target"),
  /should exist as a direct class method/,
  "a static async member must not be re-entered at the method name after its prefix is refused",
);
// The contract is ordinary and async identifier-named instance methods, and it says so by
// refusing everything else rather than returning a near-miss.
for (const [shape, unsupportedSource] of [
  ["a getter", "class Example {\n  get target() {\n    return 1;\n  }\n}\n"],
  ["a setter", "class Example {\n  set target(value) {\n    this.v = value;\n  }\n}\n"],
  ["a generator", "class Example {\n  *target() {\n    yield 1;\n  }\n}\n"],
  ["an async generator", "class Example {\n  async *target() {\n    yield 1;\n  }\n}\n"],
  ["a private member", "class Example {\n  #target() {\n    return 1;\n  }\n}\n"],
  ["a computed key", "class Example {\n  [\"target\"]() {\n    return 1;\n  }\n}\n"],
  ["a static member", "class Example {\n  static target() {\n    return 1;\n  }\n}\n"],
]) {
  assert.throws(
    () => extractClassMethodBlock(unsupportedSource, "Example", "target"),
    /should exist as a direct class method/,
    `${shape} is outside the supported contract and must not be returned as the method`,
  );
}
assert.throws(
  () => extractClassMethodBlock("class Example {\n  other() {}\n}\n", "Missing", "other"),
  /class Missing should exist/,
  "an absent class is reported as an absent class",
);

assert.throws(
  () => extractFunctionSpan('function other() {\n  return 1;\n}\n', "target"),
  /target should exist/,
  "extractFunctionSpan should refuse a source that never declares the name",
);
// Two properties the remaining family-C children need, both inherited from the
// hand-written helper rather than introduced here. An `export` keyword is not
// part of the span: it begins at `function`. And an exported function does not
// end a span, because the terminator pattern anchors on a line-initial
// `function` or `async function`. No subject in this checkpoint's thirteen
// owners declares an exported function - 0 of 216 - so nothing here is
// affected, but a family-C owner reading an ES module surface would find its
// span running to the end of the file.
assert.equal(
  extractFunctionSpan('export function target() {\n  return 1;\n}\nfunction next() {}\n', "target"),
  'function target() {\n  return 1;\n}',
  "extractFunctionSpan should begin at the function keyword, leaving an export keyword outside the span",
);
assert.equal(
  extractFunctionSpan('function target() {\n  return 1;\n}\nexport function next() {\n  return 2;\n}\n', "target"),
  'function target() {\n  return 1;\n}\nexport function next() {\n  return 2;\n}\n',
  "an exported function does not end a span, so a span over an ES module surface reaches the end of the file",
);
// 0.33.33.32.28.4.3 migrated the eight Files contract modules onto
// `extractFunctionSpan`. Seven of them wrote the same terminator the Tasks
// modules did; the eighth wrote `\n\s*(?:async\s+)?function\s+`, which ends a
// span at an *indented* function too. These pin the boundary properties that
// difference turns on, so the next family-C child meets them as assertions.
assert.equal(
  extractFunctionSpan('function target() {\n  return 1;\n}\n\nfunction next() {}\n', "target"),
  'function target() {\n  return 1;\n}\n',
  "a blank line before the next function belongs to the span, which ends at the newline the declaration sits on",
);
assert.equal(
  extractFunctionSpan('function target() {\n  return 1;\n}\nfunction next() {}\n', "target"),
  'function target() {\n  return 1;\n}',
  "a span against an immediately adjacent function ends at its own closing brace",
);
assert.equal(
  extractFunctionSpan('function target() {\r\n  return 1;\r\n}\r\nconst t = 2;\r\nfunction next() {}\r\n', "target"),
  'function target() {\r\n  return 1;\r\n}\r\nconst t = 2;\r',
  "a span over a source with Windows line endings carries its trailing declarations and ends before the terminator's newline",
);
assert.equal(
  extractFunctionSpan('/**\n * Docs.\n */\nfunction target() {\n  return 1;\n}\nfunction next() {}\n', "target"),
  'function target() {\n  return 1;\n}',
  "a JSDoc block above a declaration is not part of its span",
);
assert.equal(
  extractFunctionSpan('function target() {\n  return 1;\n}\nconst s = "\\nfunction decoy() {}";\nfunction next() {}\n', "target"),
  'function target() {\n  return 1;\n}\nconst s = "\\nfunction decoy() {}";',
  "a function declaration inside an ordinary string should not end the span",
);
assert.equal(
  extractFunctionSpan('class Thing {\n  target() {\n    return 1;\n  }\n}\nfunction target() {\n  return 2;\n}\nfunction next() {}\n', "target"),
  'function target() {\n  return 2;\n}',
  "a class method sharing the name should not be mistaken for the declaration",
);
assert.equal(
  extractFunctionSpan('target();\nfunction target() {\n  return 1;\n}\nfunction next() {}\n', "target"),
  'function target() {\n  return 1;\n}',
  "a call site above the declaration should not anchor a span",
);
assert.throws(
  () => extractFunctionSpan('const target = () => {\n  return 1;\n};\n', "target"),
  /target should exist/,
  "extractFunctionSpan should refuse an arrow function rather than guess at its region",
);
// 0.33.33.32.28.4.4 migrated the fourteen top-level regression owners, and
// measuring them found three terminator variants no plan had recorded: one that
// only stops at an `async function`, one that only stops at a plain `function`,
// and one that is brace balanced and never reaches a terminator at all. The
// first two produced regions several times wider than the function they name -
// 2,083 characters for a 411-character function in one case - because an
// intervening declaration of the other kind did not end them. These pin the
// terminator behaviour that difference turns on, and the relationship between
// the three published regions.
assert.equal(
  extractFunctionSpan('async function target() {\n  return 1;\n}\nconst t = 2;\nfunction next() {}\n', "target"),
  'async function target() {\n  return 1;\n}\nconst t = 2;',
  "a plain function ends the span of an async one",
);
assert.equal(
  extractFunctionSpan('function target() {\n  return 1;\n}\nconst t = 2;\nasync function next() {}\n', "target"),
  'function target() {\n  return 1;\n}\nconst t = 2;',
  "an async function ends the span of a plain one",
);
assert.equal(
  extractFunctionSpan('function target() {\n  return 1;\n}\nclass Between {\n  method() {}\n}\nfunction next() {}\n', "target"),
  'function target() {\n  return 1;\n}\nclass Between {\n  method() {}\n}',
  "a class declaration between two functions is carried by the span rather than ending it",
);
assert.equal(
  extractFunctionSpan('function target() {\n  async function inner() {}\n  return inner;\n}\nfunction next() {}\n', "target"),
  'function target() {\n  async function inner() {}\n  return inner;\n}',
  "a nested async function does not end a span",
);
// Generators. The extractors refuse to answer one, which is the safe reading -
// but a generator does not end a span either, so a family-C owner whose subject
// declares one would find its span running past it. Neither behaviour is
// reachable from any owner migrated so far; both are pinned so the next child
// meets them as assertions.
assert.throws(
  () => extractFunctionBlock('function* target() {\n  yield 1;\n}\nfunction next() {}\n', "target"),
  /target should exist/,
  "extractFunctionBlock should refuse a generator rather than guess at its region",
);
assert.throws(
  () => extractFunctionSpan('function* target() {\n  yield 1;\n}\nfunction next() {}\n', "target"),
  /target should exist/,
  "extractFunctionSpan should refuse a generator rather than guess at its region",
);
assert.equal(
  extractFunctionSpan('function target() {\n  return 1;\n}\nfunction* next() {}\n', "target"),
  'function target() {\n  return 1;\n}\nfunction* next() {}\n',
  "a generator does not end a span, so a span over a source declaring one reaches the end of the file",
);
// The three published regions nest: a body is the tail of its block, and a
// block is the head of its span. An owner choosing between them is choosing how
// much context to read, never a different function.
for (const nesting of [
  'function target(a) {\n  return a;\n}\nconst trailing = 1;\nfunction next() {}\n',
  'async function target(a) {\n  return a;\n}\nconst trailing = 1;\nfunction next() {}\n',
  'function target(options = {}) {\n  return `x${options}`;\n}\nclass Trailing {}\nfunction next() {}\n',
]) {
  const block = extractFunctionBlock(nesting, "target");
  const body = extractFunctionBody(nesting, "target");
  const span = extractFunctionSpan(nesting, "target");
  assert.ok(block.endsWith(body), "a function body should be the tail of its block");
  assert.ok(span.startsWith(block), "a function block should be the head of its span");
  assert.ok(span.length >= block.length && block.length >= body.length, "the three regions should widen in a fixed order");
}
// The async prefix belongs to the declaration, not to the body, and a
// declaration named inside a string anchors nothing. Both are relied on by
// the owners this checkpoint migrated: several read async repository
// functions, and several read sources that quote function names in messages.
assert.equal(
  extractFunctionBlock(`async function target(a) {\n  return a;\n}\nconst trailing = 1;\n`, "target"),
  `async function target(a) {\n  return a;\n}`,
  "extractFunctionBlock should keep the async prefix of the declaration",
);
assert.equal(
  extractFunctionBody(`async function target(a) {\n  return a;\n}\nconst trailing = 1;\n`, "target"),
  `{\n  return a;\n}`,
  "extractFunctionBody should omit the signature of an async declaration entirely",
);
assert.equal(
  extractFunctionSpan(`async function target(a) {\n  return a;\n}\nconst trailing = 1;\n`, "target"),
  `async function target(a) {\n  return a;\n}\nconst trailing = 1;\n`,
  "a span whose source declares no further function reaches the end of the file",
);
assert.equal(
  extractFunctionBlock(`const note = "function target() {}";\nfunction target(a) {\n  return a;\n}\n`, "target"),
  `function target(a) {\n  return a;\n}`,
  "a declaration quoted inside a string should not anchor an extraction",
);
// Each region refuses an undeclared name rather than answering the file, and
// refuses a bare call site or an arrow function rather than anchoring on one.
for (const [label, cut] of /** @type {const} */ ([
  ["extractFunctionBlock", extractFunctionBlock],
  ["extractFunctionBody", extractFunctionBody],
  ["extractFunctionSpan", extractFunctionSpan],
])) {
  assert.throws(
    () => cut(`function other() {\n  return 1;\n}\n`, "target"),
    /target should exist/,
    `${label} should refuse a source that never declares the name`,
  );
  assert.throws(
    () => cut(`target(1);\n`, "target"),
    /target should exist/,
    `${label} should refuse a source that only calls the name`,
  );
  assert.throws(
    () => cut(`const target = () => {\n  return 1;\n};\n`, "target"),
    /target should exist/,
    `${label} should refuse an arrow function rather than guess at its region`,
  );
}
// The scanner refuses rather than guesses. The one lexical form it cannot read
// is a regular expression immediately after a closing paren, because that
// position is genuinely ambiguous and every occurrence in this repository is
// division. When such a literal carries an unbalanced brace the masked source
// stops balancing, and the source is refused instead of being cut wrong.
assert.throws(
  () => extractFunctionBody('function target(ok) {\n  if (ok) /}/.test("x");\n  return ok;\n}\n', "target"),
  /Source could not be scanned/,
  "the scanner should refuse a source whose masked braces do not balance rather than return a truncated region",
);
assert.throws(
  () => extractFunctionBlock('function target(ok) {\n  if (ok) /{/.test("x");\n  return ok;\n}\n', "target"),
  /Source could not be scanned/,
  "the scanner should refuse an unbalanced masked source from extractFunctionBlock as well",
);
// 0.33.33.32.28.4.1 migrated the family-B contract modules onto the published
// helpers, 0.33.33.32.28.4 migrated twelve more, and 0.33.33.32.28.4.2 the
// thirteen Tasks contract modules, and 0.33.33.32.28.4.3 the eight Files
// contract modules, 0.33.33.32.28.4.4 the fourteen top-level regression owners,
// and 0.33.33.32.28.4.5 the last ten module-area owners, so seventy-three now
// depend on them. Each of these owners carried its
// own function-region extractor, and every one of them found its target by
// building a `function <name>` needle and walking braces from there. That
// construction is what made the Tags record workflow read a call site instead
// of the definition it named, which left both of its negative assertions
// vacuous before any migration touched them. The published extractors anchor
// on a declaration pattern instead, so they cannot match a call.
//
// The needle is assembled rather than spelled: a guard that writes out the
// text it forbids matches itself.
const localExtractorNeedle = `function $${"{"}`;
/**
 * The local functions in one owner that build a `function <name>` needle.
 *
 * The check looks inside declarations rather than at the whole file, because
 * an owner may legitimately assert that such a declaration is *absent* from a
 * subject - `files-browse-compact-reset` proves five functions were removed
 * that way, and a file-wide check reads that as a rebuilt extractor. The
 * bodies are cut with the published extractor, so the guard is held to the
 * same contract it enforces.
 * @param {string} source
 * @returns {string[]}
 */
const rebuiltExtractors = (source) => {
  /** @type {string[]} */
  const offenders = [];
  for (const declaration of source.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/gm)) {
    // A declaration the published extractor refuses is one the raw scan found
    // inside a comment or a string; it is not a definition this rule is about.
    let region = "";
    try {
      region = extractFunctionBlock(source, declaration[1]);
    } catch {
      continue;
    }
    if (region.includes(localExtractorNeedle)) {
      offenders.push(declaration[1]);
    }
  }
  return offenders;
};
for (const familyBOwner of [
  "scripts/regression-contracts/files/files-edit-modal-save.contract.mjs",
  "scripts/regression-contracts/files/files-edit-modal-shell.contract.mjs",
  "scripts/regression-contracts/files/files-preview-modal.contract.mjs",
  "scripts/regression-contracts/notes/notes-file-preview-actions.contract.mjs",
  "scripts/regression-contracts/tags/tag-record-workflow.contract.mjs",
  "scripts/regression-contracts/tasks/task-editor-workbench-handoff.contract.mjs",
  "scripts/regression-contracts/views/ui.contract.mjs",
  "scripts/regression-contracts/workbench/task-focus-deep-link.contract.mjs",
  "scripts/regression-contracts/workbench/workbench-inspector-panel.contract.mjs",
  "scripts/regression-contracts/workbench/workbench-remove-quick-notes.contract.mjs",
  "scripts/regression-contracts/workbench/workbench-task-focus-checklist.contract.mjs",
  "scripts/regression-contracts/workbench/workbench-task-focus-linked-note-view.contract.mjs",
  "scripts/regression-contracts/workbench/workbench-task-focus-related-context-ui.contract.mjs",
  "scripts/regression-contracts/workbench/workbench-task-focus-surface.contract.mjs",
  "scripts/regression-contracts/workbench/workbench-task-focus-timer.contract.mjs",
  "scripts/regressions/workbench/direct-task-completion.regression.mjs",
  "scripts/async-recurrence-response-closeout-regression.mjs",
  "scripts/clients-projects-bulk-toolbar-regression.mjs",
  "scripts/clients-projects-related-regions-regression.mjs",
  "scripts/database-boolean-time-seam-regression.mjs",
  "scripts/database-case-insensitive-seam-regression.mjs",
  "scripts/database-transaction-helper-regression.mjs",
  "scripts/files-browse-attachment-reads-conversion-regression.mjs",
  "scripts/files-context-targets-conversion-regression.mjs",
  "scripts/notifications-inbox-lifecycle-conversion-regression.mjs",
  "scripts/regressions/framework/session-auth-warning.regression.mjs",
  "scripts/search-shell-regression.mjs",
  "scripts/separate-worker-end-to-end-regression.mjs",
  "scripts/regression-contracts/tasks/task-checklist-editor-display.contract.mjs",
  "scripts/regression-contracts/tasks/task-critical-quick-fixes.contract.mjs",
  "scripts/regression-contracts/tasks/tasks-bulk-toolbar-shell.contract.mjs",
  "scripts/regression-contracts/tasks/tasks-checklist-escape-hatch.contract.mjs",
  "scripts/regression-contracts/tasks/tasks-declarative-readonly-surface.contract.mjs",
  "scripts/regression-contracts/tasks/tasks-detail-read-panel.contract.mjs",
  "scripts/regression-contracts/tasks/tasks-filter-sidebar-anatomy.contract.mjs",
  "scripts/regression-contracts/tasks/tasks-lifecycle-action-descriptor.contract.mjs",
  "scripts/regression-contracts/tasks/tasks-list-surface-boundary.contract.mjs",
  "scripts/regression-contracts/tasks/tasks-readonly-list-binding.contract.mjs",
  "scripts/regression-contracts/tasks/tasks-relationship-linked-context.contract.mjs",
  "scripts/regression-contracts/tasks/tasks-tags-files-child-dialog.contract.mjs",
  "scripts/regression-contracts/tasks/tasks-workflow-action-descriptor.contract.mjs",
  "scripts/regression-contracts/files/files-attachment-panel-shell.contract.mjs",
  "scripts/regression-contracts/files/files-browse-compact-reset.contract.mjs",
  "scripts/regression-contracts/files/files-browse-list-shell.contract.mjs",
  "scripts/regression-contracts/files/files-filter-sidebar.contract.mjs",
  "scripts/regression-contracts/files/files-row-attachment-actions.contract.mjs",
  "scripts/regression-contracts/files/files-strict-guardrail-inventory.contract.mjs",
  "scripts/regression-contracts/files/files-upload-shell.contract.mjs",
  "scripts/regression-contracts/files/files-visual-state-control-parity.contract.mjs",
  "scripts/database-introspection-boundary-regression.mjs",
  "scripts/file-multipart-batch-upload-helper-regression.mjs",
  "scripts/file-scanner-mode-resolver-regression.mjs",
  "scripts/file-storage-provider-configuration-regression.mjs",
  "scripts/files-lifecycle-settings-quota-conversion-regression.mjs",
  "scripts/files-preview-availability-route-regression.mjs",
  "scripts/files-preview-content-route-regression.mjs",
  "scripts/lists-ui-workflow-regression.mjs",
  "scripts/notifications-preferences-subscriptions-conversion-regression.mjs",
  "scripts/quick-action-capture-regression.mjs",
  "scripts/tags-repository-conversion-regression.mjs",
  "scripts/tasks-bulk-lifecycle-toolbar-regression.mjs",
  "scripts/tasks-bulk-nondestructive-toolbar-regression.mjs",
  "scripts/worker-runner-regression.mjs",
  "scripts/regression-contracts/framework/reporting-closeout.contract.mjs",
  "scripts/regression-contracts/lists/lists-declarative-readonly-surface.contract.mjs",
  "scripts/regression-contracts/lists/lists-workflow-linked-layout.contract.mjs",
  "scripts/regression-contracts/notes/notes-tasks-modal-footer-visual-parity.contract.mjs",
  "scripts/regression-contracts/views/client-modal-footer-actions.contract.mjs",
  "scripts/regression-contracts/views/mobile-app-shell-header.contract.mjs",
  "scripts/regression-contracts/views/view-builder-converted-surface-guardrails.contract.mjs",
  "scripts/regression-contracts/views/view-descriptor-declarative-guardrails.contract.mjs",
  "scripts/regressions/database/demo-data-host-operation.regression.mjs",
  "scripts/regressions/workbench/task-focus-exit-capture.regression.mjs",
]) {
  const source = fs.readFileSync(familyBOwner, "utf8");
  assert.ok(
    source.includes("test-support/source-scan.mjs"),
    `${familyBOwner} must cut function regions through the published source-scan helpers`,
  );
  const rebuilt = rebuiltExtractors(source);
  assert.equal(
    rebuilt.length,
    0,
    `${familyBOwner} must not rebuild a local function-region extractor: ${rebuilt.join(", ")}`,
  );
}
// 0.33.33.32.28.3 routed the package manifest and lockfile boundaries through
// the published narrowings. These owners prove dependency, packaging, and
// release decisions by reading package.json and package-lock.json, and every
// one of them used to read a member straight off a parse that answers `any`:
// a renamed field, a manifest that failed to parse into the expected shape,
// or a read that returned a string would all have looked identical.
//
// The needle is assembled rather than spelled, because a guard that writes
// out the text it forbids matches itself.
const parseCall = `${"JSON"}.parse(`;
// A parse may also be published open - annotated `unknown` so every read has
// to prove the envelope it depends on - which is how the Express contract
// owner crosses a served response body.
const manifestNarrowings = ["requirePackageManifest", "requirePackageLock", "requireJsonRecord", "@type {unknown}"];
for (const manifestOwner of [
  "scripts/better-sqlite3-install-smoke.mjs",
  "scripts/demo-data-host.mjs",
  "scripts/file-storage-scanner-runtime-closeout-regression.mjs",
  "scripts/lib/package-script-runner.mjs",
  "scripts/lib/public-demo-baseline-candidate.mjs",
  "scripts/lib/regression-manifest.mjs",
  "scripts/lib/third-party-notices.mjs",
  "scripts/regression-contracts/views/markdown-renderer-service.contract.mjs",
  "scripts/regressions/database/backup-restore-foundation.regression.mjs",
  "scripts/regressions/database/workspace-backup-package.regression.mjs",
  "scripts/regressions/framework/bundled-module-registry.regression.mjs",
  "scripts/regressions/framework/express-5-http-contract.regression.mjs",
  "scripts/regressions/release/closeout-conductor.regression.mjs",
  "scripts/regressions/release/current-static-contracts.regression.mjs",
  "scripts/regressions/release/dependency-baseline.regression.mjs",
  "scripts/regressions/release/developer-verification-throughput.regression.mjs",
  "scripts/regressions/release/playwright-dev-only-boundary.regression.mjs",
  "scripts/regressions/release/runtime-artifact-boundary.regression.mjs",
  "scripts/runtime-artifact-smoke.mjs",
  "scripts/workspace-backup-drill.mjs",
]) {
  const source = fs.readFileSync(manifestOwner, "utf8");
  assert.ok(
    [
      "requirePackageManifest",
      "requirePackageLock",
      "requireJsonRecord",
      "structuredClone",
    ].some((narrowing) => source.includes(narrowing)),
    `${manifestOwner} crosses a manifest or co-located boundary and must narrow it rather than read a member off a parse`,
  );
  // Every parse in these owners has to be an argument to a narrowing. Checking
  // the parse line rather than the whole file is what makes the rule precise:
  // an owner may narrow one boundary and leave another open, and this catches
  // exactly that.
  const openParses = source
    .split(String.fromCharCode(10))
    .filter((line) => line.includes(parseCall) && !manifestNarrowings.some((narrowing) => line.includes(narrowing)));
  assert.deepEqual(
    openParses.map((line) => line.trim()),
    [],
    `${manifestOwner} must pass every parsed value through a published narrowing`,
  );
}
// The three helpers must anchor on the same declaration. A source carrying a
// commented decoy, a quoted decoy, and a longer name sharing the prefix is the
// combination that defeated the hand-written readers this rollup retired, so
// the three are checked to agree on it rather than each checked alone.
const decoyedSource = `// function target() { decoy }\nconst note = "function target() {}";\nfunction targetExtra() {}\nfunction target(a) {\n  return a;\n}\nfunction next() {}\n`;
const decoyedBlock = extractFunctionBlock(decoyedSource, "target");
const decoyedBody = extractFunctionBody(decoyedSource, "target");
const decoyedSpan = extractFunctionSpan(decoyedSource, "target");
assert.equal(decoyedBlock, `function target(a) {\n  return a;\n}`, "the block helper anchors past every decoy");
assert.equal(decoyedBody, `{\n  return a;\n}`, "the body helper anchors past every decoy");
assert.equal(decoyedSpan, `function target(a) {\n  return a;\n}`, "the span helper anchors past every decoy and stops at the next function");
assert.ok(decoyedBlock.endsWith(decoyedBody), "the three helpers agree on the declaration they anchor");
assert.ok(decoyedSpan.startsWith(decoyedBlock), "the span begins where the block begins");

// 0.33.33.32.28.4.5 finished the helper consolidation. Seventy-three owners
// cut function regions through the three published helpers, and exactly five
// local readers remain - the family-A Workbench contract modules, which return
// a body *without* its braces. That is a fourth region, not a variant of the
// three, and five definitions do not justify publishing a contract for it.
//
// These assertions record that end state and keep it: the five are named, each
// is checked to still be the brace-less reader it is kept for, and nothing
// anywhere else in the scripts program may define a function-region extractor
// again. The last rule supersedes the per-owner list above - a new owner cannot
// be added without being migrated.
const familyAReaders = [
  "scripts/regression-contracts/workbench/workbench-collapsible-sections.contract.mjs",
  "scripts/regression-contracts/workbench/workbench-in-place-open-work.contract.mjs",
  "scripts/regression-contracts/workbench/workbench-recommended-cycling.contract.mjs",
  "scripts/regression-contracts/workbench/workbench-remove-all-tasks-list.contract.mjs",
  "scripts/regression-contracts/workbench/workbench-view-state.contract.mjs",
];
for (const familyAOwner of familyAReaders) {
  const source = fs.readFileSync(familyAOwner, "utf8");
  assert.ok(
    source.includes("openBrace + 1"),
    `${familyAOwner} should keep the brace-less body reader it is exempt for`,
  );
}
const strayExtractors = discoveredScriptPaths()
  .filter((scriptPath) => !familyAReaders.includes(scriptPath))
  .filter((scriptPath) => rebuiltExtractors(fs.readFileSync(scriptPath, "utf8")).length > 0);
assert.deepEqual(
  strayExtractors,
  [],
  "no script outside the five recorded family-A readers may define a function-region extractor",
);
// The brace-less family-A region really is a different shape: the published
// body carries its braces, which is why those five were not migrated onto it.
const bracedSource = 'function target(a) {\n  return a;\n}\nfunction next() {}\n';
const publishedBody = extractFunctionBody(bracedSource, "target");
assert.ok(publishedBody.startsWith("{"), "the published body region opens with its brace");
assert.ok(publishedBody.endsWith("}"), "the published body region closes with its brace");
assert.equal(
  publishedBody.slice(1, -1),
  "\n  return a;\n",
  "the family-A region is the published body without its braces, which is why it is a fourth shape rather than a variant",
);
// One family-A reader also answers an arrow-function property, `name: () => (`,
// which every published extractor refuses on purpose. That is the second reason
// those five cannot migrate.
assert.throws(
  () => extractFunctionBody('const surface = {\n  target: () => (1),\n};\n', "target"),
  /target should exist/,
  "the published extractors refuse an arrow-function property, which one family-A reader answers",
);
// 0.33.33.33.1 scoped the three classic scripts the app shell injects into
// every rendered page. `footer.js` loads on 35 pages, `navigation.js` on 30,
// and `src/services/static.service.js` injects `shared/view-response-records.js`
// alongside four scripts that were already isolated. Between them they used to
// declare 137 names in the browser's shared global scope.
//
// The guard is two-sided because wrapping can fail in two directions: a name
// can leak back out, or a surface other scripts depend on can stop being
// published. Both are checked, because the second failure is silent - the
// page still parses and the consumer simply finds `undefined` at runtime.
//
// `0.33.33.33.2` added the three pre-authentication page controllers. Scoping
// `account-recovery.js` cleared two diagnostics rather than one: its
// `const status` was colliding with the DOM's own `Window.status`, which is a
// `string`, so `status.textContent = message` had been type-checked against a
// string instead of against the element the code actually holds. A lexical
// collision is not only noise; it can point the checker at a different entity.
for (const shellOwner of [
  "public/js/footer.js",
  "public/js/navigation.js",
  "public/js/shared/view-response-records.js",
  "public/js/login.js",
  "public/js/splash.js",
  "public/js/account-recovery.js",
  "public/js/workspace-settings.js",
  "public/js/notes-settings.js",
  "public/js/files-settings.js",
  "public/js/module-settings.js",
  "public/js/user-admin.js",
  "public/js/role-assignments.js",
  "public/js/audit-log.js",
  "public/js/support-view.js",
  "public/js/support-view-audit.js",
  "public/js/api-keys.js",
  "public/js/reporting.js",
  "public/js/calendar.js",
  "public/js/dashboard.js",
  "public/js/tags.js",
  "public/js/files.js",
  "public/js/lists.js",
  "public/js/tasks.js",
  "public/js/clients-projects.js",
  "public/js/notes.js",
  "public/js/stop-watch.js",
  "public/js/time-entries.js",
  "public/js/workbench.js",
]) {
  const shellSource = fs.readFileSync(shellOwner, "utf8").split("\r\n").join("\n");
  const leaked = shellSource
    .split("\n")
    .filter((line) => /^(?:export\s+)?(?:async\s+)?(?:const|let|var|function\*?|class)\s/.test(line));
  assert.deepEqual(
    leaked,
    [],
    `${shellOwner} is an isolated browser controller and must declare no name at top level: ${leaked.join(" | ")}`,
  );
}
// The published surfaces are the reason the wrap is safe, so they are pinned by
// name rather than by count. `0.33.33.33.3` scoped the four settings page
// controllers and, owning the one consumer, moved `applyWorkspaceName` under
// `window.LongtailForge`, so the only bare `window.*` navigation still owns is
// the deliberate `fetch` patch.
//
// Those four controllers collided on `settingsPageController` and
// `settingsCatalog`, which TypeScript reports, and on `normalizeSettings` and
// `normalizeWorkspaceType`, which it does not: a duplicate `function`
// declaration merges silently instead of raising TS2451. `clients-projects.js`
// was being checked against the Workspace Settings copy of `normalizeSettings`
// rather than its own, from a page it never co-loads with. A collision count
// built from TS2451 therefore undercounts, and the guard below pins the
// scoping rather than the count.
// `0.33.33.33.2` published one surface of its own. Scoping `login.js` removed
// the implicit global that `tests/e2e/login.spec.mjs` had been driving the
// required-password-change transition through - a hook that lives in the test
// suite rather than in `public/js/`, which is why the child's first
// cross-consumption scan missed it. The surface is named here so it cannot be
// withdrawn silently a second time.
const loginSource = fs.readFileSync("public/js/login.js", "utf8");
assert.ok(
  loginSource.includes("window.LongtailForge.loginPage = Object.freeze({ showRequiredPasswordChange })"),
  "public/js/login.js must keep publishing window.LongtailForge.loginPage; tests/e2e/login.spec.mjs drives the required-password-change transition through it",
);
const navigationSource = fs.readFileSync("public/js/navigation.js", "utf8");
for (const publishedSurface of [
  "window.LongtailForge.navigationIntent",
  "window.LongtailForge.getWorkspaceProjectsLabel",
  "window.LongtailForge.refreshNotifications",
  "window.LongtailForge.sessionAuthWarnings",
  "window.LongtailForge.refreshAppShell",
  "window.LongtailForge.workspaceContextReady",
  "window.LongtailForge.workspaceContext",
  "window.LongtailForge.userPreferences",
  "window.LongtailForge.supportView",
  "window.LongtailForge.applyWorkspaceName",
  "window.fetch",
]) {
  assert.ok(
    navigationSource.includes(`${publishedSurface} =`),
    `public/js/navigation.js must keep publishing ${publishedSurface}; scoping the script must not withdraw a surface other pages read`,
  );
}
// `0.33.33.33.6` introduced governed diagnostic reclassification: scoping a controller
// changes which declaration an identifier resolves to, so a file can report the same debt
// under different codes while its total falls. The door is deliberately narrow, and these
// fixtures are what keep it narrow, because the records themselves are struck once spent
// and the mechanism would otherwise sit untested.
/** @param {Record<string, {diagnostics: Record<string, {code: number, count: number}[]>, files: string[]}>} programs */
function governanceStateFixture(programs) {
  return /** @type {Parameters<typeof validateShrinkOnly>[0]} */ ({
    programs,
    explicitAnyByFile: {},
    totals: { files: 0, errors: 0, explicitAny: 0 },
  });
}
const reclassificationBefore = governanceStateFixture({
  browser: { files: ["public/js/a.js"], diagnostics: { "public/js/a.js": [{ code: 2339, count: 10 }] } },
});
const reclassificationAfter = governanceStateFixture({
  browser: { files: ["public/js/a.js"], diagnostics: { "public/js/a.js": [{ code: 2339, count: 4 }, { code: 2322, count: 2 }] } },
});
// With no record, a code that rises fails even though the file's total fell 10 -> 6.
assert.throws(
  () => validateShrinkOnly(reclassificationBefore, reclassificationAfter),
  /2322 increased 0 -> 2/,
  "an unrecorded code may not rise, however much the rest of the file improved",
);
// An unrelated file gaining debt fails regardless of any reclassification elsewhere.
const unrelatedGrowth = governanceStateFixture({
  browser: {
    files: ["public/js/a.js", "public/js/b.js"],
    diagnostics: {
      "public/js/a.js": [{ code: 2339, count: 4 }],
      "public/js/b.js": [{ code: 7006, count: 1 }],
    },
  },
});
assert.throws(
  () => validateShrinkOnly(reclassificationBefore, unrelatedGrowth),
  /public\/js\/b\.js: 7006 increased 0 -> 1/,
  "a new diagnostic in a file nothing scoped is new debt, not a reclassification",
);

// The shared-global inventory that `0.33.33.33` closes against.
//
// `TS2451` reaching zero is necessary but not sufficient, and `0.33.33.33.3` proved why:
// it counts block-scoped redeclarations only, so a duplicate `function` declaration
// raises nothing at all, and a name declared by exactly one remaining script raises
// nothing either while still sitting in the shared lexical scope.
//
// `0.33.33.33.4.1` corrected two things this inventory measured too broadly.
//
// First, delivery mode. Top-level-ness is measured by brace depth, never by column - a
// script whose IIFE body is unindented declares nothing at depth 0 - but depth alone
// does not decide whether a declaration is *shared*. A native ES module's top-level
// declarations are module scoped and never enter the classic shared lexical
// environment, so the invariant is about classic delivery, not about brace depth.
//
// Second, publication ownership. A surface written by two scripts is not automatically
// a governance failure: a platform primitive can be an intentional ordered decorator
// chain, and a migration can have a named, dated end. Each is recorded below with its
// exact writers, reason, and disposition, rather than waved through by an allowlist.
/** @type {string[]} */
const browserScriptFiles = [];
(function collectBrowserScripts(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = `${directory}/${entry.name}`;
    if (entry.isDirectory()) collectBrowserScripts(full);
    else if (full.endsWith(".js")) browserScriptFiles.push(full);
  }
})("public/js");

/** @param {string} source @returns {string[]} */
function topLevelDeclaredNames(source) {
  const masked = scannableSource(source);
  /** @type {string[]} */
  const names = [];
  let depth = 0;
  for (const line of masked.split("\n")) {
    if (depth === 0) {
      const declaration = /^\s*(?:export\s+)?(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/.exec(line);
      if (declaration) names.push(declaration[1]);
    }
    for (const char of line) {
      if (char === "{" || char === "(" || char === "[") depth += 1;
      else if (char === "}" || char === ")" || char === "]") depth -= 1;
    }
  }
  return names;
}

/** Every `<script src>` in the rendered views, split by whether it is module delivery. */
function collectViewScriptDelivery() {
  /** @type {Set<string>} */
  const classicSources = new Set();
  /** @type {Set<string>} */
  const moduleSources = new Set();
  /** @param {string} directory */
  (function walkViews(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = `${directory}/${entry.name}`;
      if (entry.isDirectory()) {
        walkViews(full);
        continue;
      }
      if (!full.endsWith(".html")) continue;
      const html = fs.readFileSync(full, "utf8");
      for (const tag of html.matchAll(/<script\b([^>]*)\bsrc\s*=\s*"([^"]+)"([^>]*)>/g)) {
        const attributes = `${tag[1]} ${tag[3]}`;
        // A view writes `js/name.js` or `/js/name.js`; both address `public/js/name.js`.
        const resolved = `public/${tag[2].replace(/^\//, "")}`;
        if (/type\s*=\s*"module"/.test(attributes)) moduleSources.add(resolved);
        else classicSources.add(resolved);
      }
    }
  })("views");
  return { classicSources, moduleSources };
}

const viewDelivery = collectViewScriptDelivery();

// A native ES-module entry is exempt from the classic shared-scope invariant, but the
// exemption is proved on every run rather than asserted once. Each entry must be
// structurally impossible to deliver as a classic script and must actually be delivered
// as a module, so a change to either fact fails here instead of silently widening the
// exemption.
const NATIVE_MODULE_ENTRIES = new Map([
  [
    "public/js/dashboard.entry.js",
    {
      delivery: "view-module-tag",
      reason: "Dashboard is the one page delivered through a native ES-module entry; its"
        + " top-level await is a syntax error in a classic script, so its declarations can"
        + " only ever be module scoped.",
    },
  ],
  [
    "public/js/tasks-dashboard.js",
    {
      delivery: "dynamic-import",
      // Found by 0.33.33.33.5, which tried to wrap it. Its top-level await loads the
      // renderer's dependencies before it registers a panel renderer, and the importing
      // module waits for that. Wrapping it in a synchronous IIFE is a parse error, and an
      // async IIFE would let import() resolve before registration, so the file is a
      // native ES module by delivery and by construction.
      reason: "Contributed to the Dashboard view and loaded through the ES-module bridge's"
        + " dynamic import; its top-level await sequences dependency loading before panel"
        + " registration, so it cannot be a classic script or a synchronous wrap.",
    },
  ],
]);

for (const [moduleEntry, record] of NATIVE_MODULE_ENTRIES) {
  const reason = record.reason;
  assert.ok(reason.length > 0, `${moduleEntry} must record why it is a native module entry`);
  assert.ok(
    fs.existsSync(moduleEntry),
    `${moduleEntry} is recorded as a native ES-module entry but does not exist`,
  );
  const entrySource = fs.readFileSync(moduleEntry, "utf8").split("\r\n").join("\n");
  const maskedEntry = scannableSource(entrySource);
  // Top-level await is the structural proof: it cannot appear in a classic script, so
  // this file cannot be delivered into the shared lexical environment at all.
  let awaitDepth = 0;
  let hasTopLevelAwait = false;
  for (const line of maskedEntry.split("\n")) {
    if (awaitDepth === 0 && /^\s*await\s/.test(line)) hasTopLevelAwait = true;
    for (const char of line) {
      if (char === "{" || char === "(" || char === "[") awaitDepth += 1;
      else if (char === "}" || char === ")" || char === "]") awaitDepth -= 1;
    }
  }
  assert.ok(
    hasTopLevelAwait,
    `${moduleEntry} is exempt from the classic shared-scope invariant because it is a native`
      + " ES module, and top-level await is the proof of that. The proof is gone, so the"
      + " exemption is no longer earned.",
  );
  // Runtime module delivery is only half of the invariant. `0.33.33.33.5.1` found that
  // TypeScript was still modelling both of these files as global scripts, because it
  // decides module scope from syntax alone and neither carried a top-level import or
  // export. Their declarations were therefore offered to the classic shared scope in the
  // type system while being module scoped in the browser: a classic controller could be
  // checked against a name that does not exist for it at runtime.
  //
  // The compiler's answer is deduced from its own output rather than re-implemented. A
  // file with a top-level await that TypeScript does not treat as a module necessarily
  // produces TS1375 ("await expressions are only allowed at the top level of a file when
  // that file is a module"). Every entry here is required to have that await, so the
  // absence of TS1375 in the generated ledger proves the compiler classifies it as a
  // module. The export marker is asserted alongside it as the direct statement of intent.
  assert.match(
    maskedEntry,
    /^\s*export\s*\{\s*\}\s*;/m,
    `${moduleEntry} is a native ES module at runtime and must carry a top-level export marker`
      + " so TypeScript models it with module scope too; without one its declarations join the"
      + " classic shared scope in the type system only",
  );
  const moduleEntryDiagnostics = ledger.programs.browser.diagnostics[moduleEntry] || [];
  const notAModuleDiagnostic = moduleEntryDiagnostics.find((entry) => entry.code === 1375);
  assert.ok(
    !notAModuleDiagnostic,
    `${moduleEntry} still reports TS1375, which is the compiler stating it does not treat this`
      + " file as a module. Runtime module delivery and TypeScript module scope must agree.",
  );

  // The negative proof applies to both delivery kinds: whatever loads the file, no view
  // may load it as a classic script, because that would put every one of its top-level
  // declarations into the shared scope.
  assert.ok(
    !viewDelivery.classicSources.has(moduleEntry),
    `${moduleEntry} is exempt as a native ES module but a view loads it as a classic script,`
      + " which would put every one of its top-level declarations into the shared scope",
  );
  if (record.delivery === "view-module-tag") {
    assert.ok(
      viewDelivery.moduleSources.has(moduleEntry),
      `${moduleEntry} is recorded as loaded by a <script type="module"> tag in a rendered view`,
    );
  } else {
    // A dynamically imported module has no tag to point at, so the positive proof is that
    // no view references it at all - it is reached only through the module bridge.
    assert.ok(
      !viewDelivery.moduleSources.has(moduleEntry),
      `${moduleEntry} is recorded as reached only through dynamic import, but a view names it`,
    );
    assert.ok(
      moduleEntry.startsWith("public/js/"),
      `${moduleEntry} must be a browser asset the module bridge can import`,
    );
  }
}

// The browser program must keep modelling the classic global scope. `moduleDetection`
// set to "force" would make TypeScript treat every file as a module, which would make the
// assertions above pass for the wrong reason and, far worse, would stop the compiler
// modelling the shared script scope that `0.33.33.33` exists to measure. Each native
// module earns its module scope with a marker of its own instead.
/** @type {{compilerOptions?: {moduleDetection?: string}}} */
const browserProgramConfig = JSON.parse(fs.readFileSync("tsconfig.public.json", "utf8"));
assert.notEqual(
  browserProgramConfig.compilerOptions?.moduleDetection,
  "force",
  "tsconfig.public.json must not force module detection: it would hide the classic shared"
    + " global scope that the 0.33.33.33 inventory measures, and would grant module scope to"
    + " files that have not proved they are delivered as modules",
);

// Every script here still declares names in the classic shared lexical environment. The
// list may only shrink: a script that leaves it must not come back, and no classic script
// outside it may start leaking. `0.33.33.33` closes when this list is empty.
// `0.33.33.33.7` emptied this list: every classic browser script is now scoped. The set
// stays because the invariant it enforces is permanent - a classic script that starts
// declaring names in the shared lexical environment fails whether or not it was ever
// an owner of this rollup.
/** @type {Set<string>} */
const SHARED_SCOPE_BACKLOG = new Set([]);

for (const backlogEntry of SHARED_SCOPE_BACKLOG) {
  assert.ok(
    !NATIVE_MODULE_ENTRIES.has(backlogEntry),
    `${backlogEntry} cannot be both a native ES-module entry and a classic shared-scope owner`,
  );
}

const leakingBrowserScripts = browserScriptFiles.filter((file) => (
  !NATIVE_MODULE_ENTRIES.has(file)
  && topLevelDeclaredNames(fs.readFileSync(file, "utf8").split("\r\n").join("\n")).length > 0
));
const regressedBrowserScripts = leakingBrowserScripts.filter((file) => !SHARED_SCOPE_BACKLOG.has(file));
assert.deepEqual(
  regressedBrowserScripts,
  [],
  `these classic browser scripts declare names in the shared lexical environment and are not in the 0.33.33.33 backlog: ${regressedBrowserScripts.join(" | ")}`,
);
assert.ok(
  leakingBrowserScripts.length <= SHARED_SCOPE_BACKLOG.size,
  `the shared-scope backlog may only shrink: ${leakingBrowserScripts.length} classic scripts leak against a recorded ${SHARED_SCOPE_BACKLOG.size}`,
);

// `0.33.33.38.2.4.2` made the estate's semantic numbers a repository command. These prove the
// properties that make them trustworthy, and each one exists because its absence already
// produced a wrong number that nothing caught.
//
// The classifier runs against a small fixture tree rather than the estate, so the assertions
// are about *behaviour* and stay readable; the reconciliation against the real estate is
// asserted by the command itself, which throws if the families do not cover every governed
// diagnostic or the owner budgets do not sum to their families.
{
  const governanceSourceText = fs.readFileSync("scripts/typecheck-governance.mjs", "utf8");

  // ARCHITECTURE - one compiler run, classified in the same process. The invariant of this
  // child is that the diagnostics and the tree cannot be mismatched, and the way that is
  // guaranteed is that there is nothing to mismatch: the classifier is handed the run that
  // just happened. A second spawn, or a snapshot path argument, would reopen the defect.
  assert.equal(
    (governanceSourceText.match(/spawnSync\(/g) || []).length,
    1,
    "typecheck governance must run the compiler through exactly one spawn site",
  );
  assert.match(
    governanceSourceText,
    /locatedDiagnostics\.set\(definition\.id, located\)/,
    "the compiler run must keep its own located diagnostics for classification",
  );
  assert.match(
    governanceSourceText,
    /classifyBrowserDiagnostics\(\{ diagnostics, root: rootDir \}\)/,
    "classification must consume this process's diagnostics and this tree, not a snapshot",
  );
  const classificationSourceText = fs.readFileSync("scripts/test-support/browser-diagnostic-classification.mjs", "utf8");
  assert.doesNotMatch(
    classificationSourceText,
    /spawnSync|require\("typescript\/unstable\/sync"\)\.API\b.*tsc/,
    "the classifier must not start a compiler run of its own",
  );

  // FIDELITY - the widened diagnostic keeps everything classification needs. Before this
  // child the parse threw away line, column and message and kept only file and code, which
  // is exactly why the ledger could enforce monotonicity while knowing nothing about meaning.
  const fidelityLine = "public/js/shared/icons.js(12,34): error TS2339: Property 'render' does not exist on type '{}'.";
  const fidelityMatch = fidelityLine.match(/^(.*?)\((\d+),(\d+)\): error TS(\d+): (.*)$/);
  assert.ok(fidelityMatch, "the governance diagnostic pattern must match a located diagnostic");
  assert.deepEqual(
    {
      filePath: fidelityMatch[1],
      line: Number(fidelityMatch[2]),
      column: Number(fidelityMatch[3]),
      code: Number(fidelityMatch[4]),
      message: fidelityMatch[5],
    },
    {
      filePath: "public/js/shared/icons.js",
      line: 12,
      column: 34,
      code: 2339,
      message: "Property 'render' does not exist on type '{}'.",
    },
  );

  // LIVE DECLARATION - the defect this replaces was a frozen set holding one member while the
  // declaration held thirty. `declaredNamespaceMembers` reads the declaration it is given, and
  // the classifier reads the declaration in the tree it is classifying.
  assert.deepEqual(
    [...declaredNamespaceMembers([
      "export interface LongtailForgeBrowserNamespace {",
      "  [key: string]: unknown;",
      "  alpha?: BrowserAlpha;",
      "  beta?: BrowserBeta;",
      "}",
    ].join("\n"))].sort(),
    ["alpha", "beta", "key"].filter((name) => name !== "key"),
    "declared members come from the declaration text itself",
  );
  assert.doesNotMatch(
    classificationSourceText,
    /rootsites\.json|nsmap\.json|const DECLARED_MEMBERS/,
    "the declared-member set must be derived from the tree, never carried in the classifier",
  );

  const classifierFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ltf-classify-fixtures-"));
  fs.mkdirSync(path.join(classifierFixtureRoot, "sources"));
  fs.mkdirSync(path.join(classifierFixtureRoot, "types"));
  fs.writeFileSync(path.join(classifierFixtureRoot, "sources", "page.js"), [
    "(function attachClassifierFixture(global) {",
    "  const namespace = global.LongtailForge || {};",
    "  const decoy = { icons: {} };",
    "  const key = \"icons\";",
    "  function readsThroughAlias() {",
    "    return namespace.icons.render();",
    "  }",
    "  function readsDecoy() {",
    "    return decoy.icons.render();",
    "  }",
    "  function readsComputed() {",
    "    return namespace[key].render();",
    "  }",
    "  function shadows() {",
    "    const namespace = { icons: {} };",
    "    return namespace.icons.render();",
    "  }",
    "  function readsThroughAccessor() {",
    "    const surfaceA = namespaceIcons();",
    "    return surfaceA.render();",
    "  }",
    "  function readsThroughDecoyAccessor() {",
    "    const surfaceB = decoyIcons();",
    "    return surfaceB.render();",
    "  }",
    "  function readsThroughAccessorTakingAnArgument() {",
    "    const surfaceC = iconsFor();",
    "    return surfaceC.render();",
    "  }",
    "  function readsThroughSequencedAccessor() {",
    "    const surfaceD = sequencedIcons();",
    "    return surfaceD.render();",
    "  }",
    "  function readsThroughRedeclaredAccessor() {",
    "    const surfaceE = redeclaredIcons();",
    "    return surfaceE.render();",
    "  }",
    "  function readsThroughReassignedAlias() {",
    "    let surfaceF = namespaceIcons();",
    "    surfaceF = decoy.icons;",
    "    return surfaceF.render();",
    "  }",
    "  function readsThroughFallbackAccessor() {",
    "    const surfaceG = fallbackIcons();",
    "    return surfaceG.render();",
    "  }",
    "  function readsThroughArgumentedCall() {",
    "    const surfaceH = namespaceIcons(key);",
    "    return surfaceH.render();",
    "  }",
    "  function namespaceIcons() {",
    "    return namespace.icons || null;",
    "  }",
    "  function decoyIcons() {",
    "    return decoy.icons || null;",
    "  }",
    "  function iconsFor(key = \"a\") {",
    "    return namespace.icons;",
    "  }",
    "  function sequencedIcons() {",
    "    const unused = 1;",
    "    void unused;",
    "    return namespace.icons;",
    "  }",
    "  function fallbackIcons() {",
    "    return namespace.icons || decoy.icons;",
    "  }",
    "  function redeclaredIcons() {",
    "    return namespace.icons;",
    "  }",
    "  const redeclaredIcons = null;",
    "  namespace.icons = { render() {} };",
    "  global.LongtailForge = namespace;",
    "  return [readsThroughAlias, readsDecoy, readsComputed, shadows, readsThroughAccessor, readsThroughFallbackAccessor, readsThroughArgumentedCall,",
    "    readsThroughDecoyAccessor, readsThroughAccessorTakingAnArgument, readsThroughSequencedAccessor,",
    "    readsThroughRedeclaredAccessor, readsThroughReassignedAlias, redeclaredIcons];",
    "})(window);",
  ].join("\n"));
  fs.writeFileSync(path.join(classifierFixtureRoot, "types", "contracts.d.ts"), [
    "export interface BrowserIconsFixture { render(): void; }",
    "export interface LongtailForgeBrowserNamespace {",
    "  icons?: BrowserIconsFixture;",
    "}",
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(classifierFixtureRoot, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "es2023",
      module: "esnext",
      moduleResolution: "bundler",
      allowJs: true,
      checkJs: false,
      noEmit: true,
      lib: ["DOM", "DOM.Iterable", "ES2023"],
      types: [],
    },
    include: ["sources/**/*.js"],
  }));

  /** @param {string} declarationFile @param {{line: number, column: number, code: number, message: string}[]} rows */
  const classifyFixture = (declarationFile, rows) => classifyBrowserDiagnostics({
    diagnostics: rows.map((row) => ({ filePath: "sources/page.js", ...row })),
    root: classifierFixtureRoot,
    configFile: "tsconfig.json",
    scanDirectory: "sources",
    declarationFile,
  });

  const aliasRead = { line: 6, column: 12, code: 18046, message: "'namespace.icons' is of type 'unknown'." };
  const decoyRead = { line: 9, column: 12, code: 18046, message: "'decoy.icons' is of type 'unknown'." };
  const computedRead = { line: 12, column: 12, code: 18046, message: "'namespace[key]' is of type 'unknown'." };
  const shadowedRead = { line: 16, column: 12, code: 18046, message: "'namespace.icons' is of type 'unknown'." };
  // The accessor forms. Line 20 is the supported one; the rest are the refusals.
  const accessorRead = { line: 20, column: 20, code: 2339, message: "Property 'render' does not exist on type '{}'." };
  const decoyAccessorRead = { line: 24, column: 20, code: 2339, message: "Property 'render' does not exist on type '{}'." };
  const argumentAccessorRead = { line: 28, column: 20, code: 2339, message: "Property 'render' does not exist on type '{}'." };
  const sequencedAccessorRead = { line: 32, column: 20, code: 2339, message: "Property 'render' does not exist on type '{}'." };
  const redeclaredAccessorRead = { line: 36, column: 20, code: 2339, message: "Property 'render' does not exist on type '{}'." };
  const reassignedAliasRead = { line: 41, column: 20, code: 2339, message: "Property 'render' does not exist on type '{}'." };
  const fallbackAccessorRead = { line: 45, column: 20, code: 2339, message: "Property 'render' does not exist on type '{}'." };
  const argumentedCallRead = { line: 49, column: 20, code: 2339, message: "Property 'render' does not exist on type '{}'." };

  // NAMESPACE IDENTITY - through the resolver, not the spelling. `namespace.icons` is the
  // surface, `decoy.icons` is not, and the inner `namespace` is a local that shadows the alias.
  const declaredRun = classifyFixture("types/contracts.d.ts", [aliasRead, decoyRead, computedRead, shadowedRead]);
  const familyAt = (/** @type {typeof declaredRun} */ run, /** @type {number} */ line) =>
    run.diagnostics.find((entry) => entry.line === line)?.family;
  assert.equal(familyAt(declaredRun, 6), "unknown", "a declared member that is still unshaped is a genuine trust boundary");
  assert.equal(familyAt(declaredRun, 9), "unknown", "an unrelated receiver is not a namespace read");
  assert.equal(familyAt(declaredRun, 16), "unknown", "a shadowed local is not the namespace");
  assert.equal(
    declaredRun.diagnostics.find((entry) => entry.line === 9)?.member,
    null,
    "an unrelated receiver resolves to no member",
  );

  // UNSUPPORTED - a computed key stays unresolved rather than being guessed into the family.
  assert.equal(
    declaredRun.diagnostics.find((entry) => entry.line === 12)?.member,
    null,
    "a computed member name must remain unresolved rather than guessed",
  );

  // LIVE DECLARATION, behaviourally. The same diagnostic on the same tree changes family when
  // the declaration stops naming the member: undeclared, the read is an index-signature
  // symptom and namespace work; declared, it is a genuine `unknown`. A frozen set cannot see
  // that difference, which is precisely the defect that went unnoticed.
  fs.writeFileSync(path.join(classifierFixtureRoot, "types", "empty.d.ts"), [
    "export interface LongtailForgeBrowserNamespace {",
    "}",
    "",
  ].join("\n"));
  const undeclaredRun = classifyFixture("types/empty.d.ts", [aliasRead]);
  assert.equal(
    familyAt(undeclaredRun, 6),
    "namespace",
    "an undeclared member read is namespace work, not a trust boundary",
  );
  assert.notEqual(
    familyAt(undeclaredRun, 6),
    familyAt(declaredRun, 6),
    "classification must follow the live declaration; a frozen set would answer identically for both",
  );

  // NAMESPACE ACCESSOR ALIASES - `0.33.33.38.2.2.6.6.2`. A `const` bound to a zero-argument call
  // of a zero-parameter function whose whole body returns a namespace member names that member.
  // Reading it as page-local state filed seven `notifications.js` diagnostics under
  // `0.33.33.44`'s state budget, which is an ownership claim rather than a presentation detail.
  const accessorRun = classifyFixture("types/empty.d.ts", [
    accessorRead,
    decoyAccessorRead,
    argumentAccessorRead,
    sequencedAccessorRead,
    redeclaredAccessorRead,
    reassignedAliasRead,
    fallbackAccessorRead,
    argumentedCallRead,
  ]);
  // **Asserted on the family, not on `member`.** The reported member for a `TS2339` comes from the
  // receiver's own expression, which an alias never is, so it is `null` on every row here -
  // including the supported one. Asserting `member === null` for the refusals would have passed
  // whatever the rule did, which is the vacuous shape this estate keeps finding.
  assert.equal(familyAt(accessorRun, 20), "namespace", "an undeclared member read through an accessor alias is namespace work");

  // THE REFUSALS, each one a shape the rule deliberately does not follow.
  /** @type {readonly {line: number, reason: string}[]} */
  const refusals = [
    { line: 24, reason: "an accessor returning an unrelated object is not the namespace" },
    { line: 28, reason: "a function that takes a parameter is not a plain accessor" },
    { line: 32, reason: "a body of more than one statement is sequencing, not a shape" },
    { line: 36, reason: "a name declared twice is shadowed somewhere and must be refused" },
    { line: 41, reason: "a reassigned alias is flow, and flow is still refused" },
    { line: 45, reason: "a real alternative is not a literal default and must not be peeled away" },
    { line: 49, reason: "a call that passes an argument is not the zero-argument shape" },
  ];
  for (const refusal of refusals) {
    assert.equal(familyAt(accessorRun, refusal.line), "state", refusal.reason);
  }

  // ACCOUNTING and OWNERSHIP - one family each, one owner for the three owned families, and
  // totals that reconcile. Zero owners and two owners are both failures.
  const accounted = classifyFixture("types/contracts.d.ts", [
    aliasRead,
    { line: 6, column: 12, code: 7006, message: "Parameter 'value' implicitly has an 'any' type." },
    { line: 9, column: 12, code: 7034, message: "Variable 'rows' implicitly has type 'any[]'." },
    { line: 9, column: 20, code: 2571, message: "Object is of type 'unknown'." },
  ]);
  assert.equal(accounted.diagnostics.length, 4, "every diagnostic is accounted for exactly once");
  const ownedFamilies = new Set(["params", "state", "assorted"]);
  for (const entry of accounted.diagnostics) {
    assert.ok(entry.family, "every diagnostic has a family");
    if (ownedFamilies.has(entry.family)) {
      assert.ok(entry.owner, `${entry.family} diagnostics must name exactly one owner`);
    } else {
      assert.equal(entry.owner, null, "families the post-0.33.33.38 owners do not hold must name no owner");
    }
  }
  const ownerSum = Object.values(accounted.owners).reduce((total, bucket) => total + bucket.total, 0);
  const ownedCount = accounted.diagnostics.filter((entry) => ownedFamilies.has(entry.family)).length;
  assert.equal(ownerSum, ownedCount, "owner budgets must hold every owned-family diagnostic and no other");
  assert.equal(
    Object.values(accounted.families).reduce((total, count) => total + count, 0),
    accounted.total,
    "canonical families must cover the whole diagnostic set",
  );

  // DETERMINISM - an unchanged tree serialises identically. A classifier whose answers depend
  // on iteration order cannot be a durable number.
  const repeated = classifyFixture("types/contracts.d.ts", [aliasRead, decoyRead, computedRead, shadowedRead]);
  assert.deepEqual(
    JSON.parse(JSON.stringify(repeated.diagnostics)),
    JSON.parse(JSON.stringify(declaredRun.diagnostics)),
    "classifying an unchanged tree twice must serialise identically",
  );
  assert.deepEqual(repeated.families, declaredRun.families);
  assert.deepEqual(repeated.owners, declaredRun.owners);

  fs.rmSync(classifierFixtureRoot, { recursive: true, force: true });
}

// `0.33.33.38.2.4.1` gave the estate one namespace resolver, and these fixtures are what
// make it safe for the next tool to call instead of writing its own.
//
// **Read the labels.** Most of what follows is a *preservation* proof: the publication
// inventory already resolved root aliases, the logical-assignment root, shadowing and
// index-paired parameters correctly, and the fixtures above prove that end to end. Those
// answers must not change now that the logic lives somewhere else, and asserting them
// directly against the resolver is how a future edit to the shared module gets caught by
// the thing it would break rather than by an estate count moving.
//
// One case is genuinely new. `namespaceMemberOf` answers member identity for a **read**,
// which the inventory never had to ask: it resolves assignment targets. Every
// spelling-versus-binding defect on this branch was about a read - `namespace.timezones`
// reached through an IIFE alias - and before this child the repository exported no
// function that could answer it, so each analysis pass answered it again and three of
// them answered it wrongly.
const resolverFixtureSource = [
  '(function attachResolverFixture(global) {',
  '  const namespace = global.LongtailForge || {};',
  '  const bootstrapped = global.LongtailForge ||= {};',
  '  const customer = { timezones: {} };',
  '  function usesApi() {',
  '    const client = namespace.api;',
  '    return client;',
  '  }',
  '  function usesCustomer() {',
  '    const client = customer;',
  '    return customer.timezones || client;',
  '  }',
  '  function shadowsModal() {',
  '    const modal = document.createElement("div");',
  '    return modal;',
  '  }',
  '  function capturesOuterAlias() {',
  '    return namespace.timezones;',
  '  }',
  '  const ltf = global.LongtailForge || {};',
  '  function aliasSpelledAnything() {',
  '    return ltf.oddlyNamedMember;',
  '  }',
  '  function decoySpelledLikeTheRoot() {',
  '    const namespace = { decoyMember: {} };',
  '    return namespace.decoyMember;',
  '  }',
  '  function shorthandReference() {',
  '    const shorthandLocal = { ok: true };',
  '    const shorthandAlias = global.LongtailForge || {};',
  '    return { shorthandLocal, shorthandAlias };',
  '  }',
  '  function aliasThenMutate() {',
  '    const promises = namespace.dashboardBootstrap;',
  '    return promises.dataPromises;',
  '  }',
  '  function requireNamespace() {',
  '    return namespace;',
  '  }',
  '  function accessorForm() {',
  '    return requireNamespace().accessorMember;',
  '  }',
  '  return [usesApi, usesCustomer, shadowsModal, capturesOuterAlias,',
  '    aliasSpelledAnything, decoySpelledLikeTheRoot, shorthandReference,',
  '    aliasThenMutate, accessorForm, bootstrapped];',
  '})(window);',
].join("\n");

const resolverFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ltf-resolver-fixtures-"));
fs.mkdirSync(path.join(resolverFixtureRoot, "sources"));
fs.writeFileSync(path.join(resolverFixtureRoot, "sources", "resolver.js"), resolverFixtureSource);
fs.writeFileSync(
  path.join(resolverFixtureRoot, "tsconfig.json"),
  JSON.stringify({
    compilerOptions: {
      target: "es2023",
      module: "esnext",
      moduleResolution: "bundler",
      allowJs: true,
      checkJs: false,
      noEmit: true,
      lib: ["DOM", "DOM.Iterable", "ES2023"],
      types: [],
    },
    include: ["sources/**/*.js"],
  }),
);

{
  const { API } = createRequire(`${process.cwd()}/package.json`)("typescript/unstable/sync");
  const resolverApi = new API({ cwd: resolverFixtureRoot });
  const resolverSnapshot = resolverApi.updateSnapshot({
    openProjects: [path.join(resolverFixtureRoot, "tsconfig.json")],
  });
  const resolverProject = resolverSnapshot.getProjects()[0];
  assert.ok(resolverProject, "the resolver fixture project must load");
  const resolverSource = resolverProject.program.getSourceFile(
    path.join(resolverFixtureRoot, "sources", "resolver.js").replaceAll("\\", "/"),
  );
  assert.ok(resolverSource, "the resolver fixture source must parse");

  const resolver = createNamespaceResolver();

  /**
   * Every reference in the fixture, paired with the scope it was seen in, so each assertion
   * below asks the resolver about a real node rather than a reconstructed one.
   * @type {{text: string, member: string | null, kind: string}[]}
   */
  const observed = [];
  resolver.walkScoped(resolverSource, (node, scope) => {
    const kind = resolver.kindOf(node);
    if (kind !== "PropertyAccessExpression" && kind !== "Identifier") return;
    observed.push({
      text: node.getText().replaceAll(/\s+/g, ""),
      member: resolver.namespaceMemberOf(node, scope),
      kind: resolver.classifyExpression(node, scope),
    });
  });

  /**
   * The recorded answer for one reference. A reference the walk never reached is a broken
   * fixture rather than a passing assertion, so it fails here instead of comparing
   * `undefined` against an expectation and looking correct.
   * @param {string} text
   */
  const seen = (text) => {
    const entry = observed.find((candidate) => candidate.text === text);
    assert.ok(entry, `the resolver fixture must contain the reference \`${text}\``);
    return entry;
  };

  // PRESERVATION - the direct root and the alias root both classify as the namespace, which
  // is what `0.33.33.34` had to teach the inventory when a text scanner reported 19 surfaces.
  assert.equal(seen("global.LongtailForge").kind, "namespace", "the direct root must resolve");
  assert.equal(seen("namespace").kind, "namespace", "a root alias must resolve by binding");

  // PRESERVATION - `||= {}` is the same bootstrap as `= x || {}`. Recognising only the long
  // form hid `settingsHost` and `settingsPageController` from every count this feeds.
  assert.equal(seen("bootstrapped").kind, "namespace", "the logical-assignment root must resolve");

  // NEW - member identity for a read, through an alias whose spelling is not `LongtailForge`.
  // A spelling-based routine called this an unrelated local and mis-classified its TS18046
  // as a genuine trust boundary rather than namespace work.
  assert.equal(seen("namespace.timezones").member, "timezones", "a member read through an alias must resolve");
  assert.equal(seen("namespace.api").member, "api", "a member read through an alias must resolve");

  // NEW - root identity is required. A property whose name matches a surface is not that
  // surface when its receiver is an unrelated object.
  assert.equal(seen("customer.timezones").member, null, "an unrelated receiver must not resolve to a surface");

  // NEW, and the pair that actually discriminates binding from spelling. Neither of these
  // is decided by how the receiver is written: `ltf` resolves because its binding is the
  // namespace, and the inner `namespace` does not resolve because its binding is a local
  // object literal. **The first version of this fixture proved neither** - it used the
  // namespace through an identifier that happened to be spelled `namespace`, so a resolver
  // that matched the spelling passed it. That was checked by making it fail, and it did not.
  assert.equal(
    seen("ltf.oddlyNamedMember").member,
    "oddlyNamedMember",
    "an alias resolves by binding, whatever it is called",
  );
  assert.equal(
    seen("namespace.decoyMember").member,
    null,
    "an identifier spelled like the root is not the root when its binding is a local object",
  );

  // PRESERVATION - same spelling, separate scopes, different declarations. Only the
  // API-bound `client` is the API; there is no name heuristic and no special case.
  const clients = observed.filter((entry) => entry.text === "client");
  assert.equal(clients.length >= 2, true, "the fixture must declare `client` in two scopes");
  assert.deepEqual(
    [...new Set(clients.map((entry) => entry.kind))],
    ["other"],
    "neither `client` is the namespace or the global object; sharing a spelling proves nothing",
  );

  // PRESERVATION - a local DOM variable that shares a surface's name is not that surface.
  assert.equal(seen("modal").kind, "other", "an inner local must not resolve to a namespace surface");
  assert.equal(seen("modal").member, null, "an inner local names no namespace member");

  // PRESERVATION - a shorthand property is a reference like any other, and resolves by its
  // binding rather than by the key it happens to supply. One of these two is the namespace
  // and one is a local object; nothing about the shorthand form decides which.
  assert.equal(seen("shorthandLocal").kind, "other", "a shorthand reference to a local is not the namespace");
  assert.equal(seen("shorthandAlias").kind, "namespace", "a shorthand reference to an alias is still the namespace");

  // LIMIT - alias-then-mutate. `0.33.33.38.2.2.6.7` searched for `dataPromises.set` and found
  // nothing, because both consumers alias the map into a local and mutate through the alias;
  // taking that at face value would have inverted a contract to `ReadonlyMap`. The resolver's
  // documented model tracks bindings, **not values through containers**, so a local
  // initialised from a member access is `other` and the read through it names no member.
  // That is the correct answer here, and the reason a *search* still has to be written
  // knowing it: this is the resolver refusing to guess, not the resolver resolving.
  assert.equal(
    seen("promises.dataPromises").member,
    null,
    "a local initialised from a member access is a binding of its own, not that member",
  );

  // LIMIT - the accessor form. `requireClientProjectOptions().normalizeClients` is how five
  // sites acquired a surface in `0.33.33.38.2.2.6.4.1`, and a receiver-pinned audit missed
  // every one of them. The resolver does not follow values through calls, so the member is
  // **explicitly unresolved rather than guessed into the namespace family** - the disposition
  // `0.33.33.38.2.4.2` must then treat as unclassified rather than as a surface read.
  assert.equal(
    seen("requireNamespace().accessorMember").member,
    null,
    "a member reached through a call is not resolvable under the documented model",
  );

  // The resolver is the only implementation of this, and the inventory now calls it rather
  // than carrying its own copy - which is the whole point of the child.
  const inventorySource = fs.readFileSync("scripts/test-support/browser-publication-inventory.mjs", "utf8");
  assert.match(
    inventorySource,
    /from "\.\/browser-namespace-resolver\.mjs"/,
    "the publication inventory must resolve identity through the shared resolver",
  );
  assert.doesNotMatch(
    inventorySource,
    /const resolveBinding = |const classifyExpression = /,
    "the publication inventory must not carry a second copy of the resolver",
  );

  fs.rmSync(resolverFixtureRoot, { recursive: true, force: true });
}

// The publication inventory is fixture-proved before it is trusted about the estate.
// Every alias form the first-party code actually uses is covered, and so is every
// false-positive class an expanding regex family could not separate: alias provenance
// is the contract, never variable spelling.
//
// The fixture sources live here rather than in the repository tree. They contain
// deliberate anti-patterns - a namespace clobber, a parameter that is not the global
// object - and every `.js` file under `tests/` is a first-party file the debt ledger
// tracks, so materialising them into a temporary directory keeps the estate honest.
const publicationFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ltf-publication-fixtures-"));
fs.mkdirSync(path.join(publicationFixtureRoot, "sources"));
for (const [fixtureName, fixtureSource] of [
  ["direct-writes.js", "// Direct namespace member, and a direct bare window surface.\nwindow.LongtailForge.directSurface = { ok: true };\nwindow.directBareSurface = { ok: true };\n"],
  ["namespace-alias.js", "// Alias declared from window.LongtailForge, then written through.\nconst namespace = window.LongtailForge || {};\nnamespace.aliasSurface = { ok: true };\nwindow.LongtailForge = namespace;\n"],
  ["iife-global-alias.js", "// Alias from an IIFE parameter proved to receive window, published through\n// Object.freeze, plus a merge over the existing surface.\n(function attachFixture(global) {\n  const root = global.LongtailForge || {};\n  root.frozenSurface = Object.freeze({ a: 1 });\n  root.mergedSurface = Object.freeze({\n    ...(root.mergedSurface || {}),\n    b: 2,\n  });\n  global.LongtailForge = root;\n})(window);\n"],
  ["two-aliases.js", "// Two aliases in one file both resolve to the namespace.\n(function attachTwoAliases(global) {\n  const first = global.LongtailForge || {};\n  const second = global.LongtailForge || {};\n  first.firstAliasSurface = { ok: true };\n  second.secondAliasSurface = { ok: true };\n  global.LongtailForge = first;\n})(window);\n"],
  ["false-positives.js", "// None of these publish anything.\n(function attachFalsePositives(notTheGlobal) {\n  const namespace = { view: null };\n  namespace.localOnly = 1;\n  const root = document.createElement(\"div\");\n  root.className = \"not-a-surface\";\n  const fromParameter = notTheGlobal.LongtailForge || {};\n  fromParameter.notPublished = 1;\n  const readOnly = window.LongtailForge.view;\n  window.LongtailForge.view.renderSurface(readOnly);\n  return { namespace, root, fromParameter };\n})({ LongtailForge: {} });\n"],
  ["namespace-clobber.js", "// A namespace replacement through an alias that does not derive from the namespace.\n(function attachClobber(global) {\n  const replacement = { onlyThis: true };\n  global.LongtailForge = replacement;\n})(window);\n"],
  ["direct-and-alias.js", "// Direct and alias writes resolving to the same surface, and one file writing the\n// same surface twice.\nconst sharedNamespace = window.LongtailForge || {};\nwindow.LongtailForge.sharedSurface = { first: true };\nsharedNamespace.sharedSurface = { second: true };\nsharedNamespace.repeatedSurface = { a: 1 };\nsharedNamespace.repeatedSurface = { b: 2 };\nwindow.LongtailForge = sharedNamespace;\n"],
  ["binding-shadow.js", "// Binding identity, not spelling. The outer `root` is the namespace and publishes;\n// the inner `root` is a DOM element that merely shares the name and must not.\n(function attachBindingShadow(global) {\n  const root = global.LongtailForge || {};\n  root.shadowedOuterSurface = { ok: true };\n  function localScope() {\n    const root = document.createElement(\"div\");\n    root.shadowedInnerSurface = \"not published\";\n    return root;\n  }\n  localScope();\n  global.LongtailForge = root;\n})(window);\n"],
  ["global-parameter-shadow.js", "// An inner parameter that shadows a proven global parameter is not the global object.\n(function attachGlobalShadow(global) {\n  function inner(global) {\n    global.shadowedBareSurface = { ok: true };\n  }\n  inner({});\n  global.provenBareSurface = { ok: true };\n})(window);\n"],
  ["parameter-pairing.js", "// Parameters pair with arguments by index. The first received {} and is not the\n// global object; only the second, which received window, is.\n(function attachPairing(localObject, global) {\n  localObject.unpairedSurface = { ok: true };\n  global.pairedBareSurface = { ok: true };\n})({}, window);\n"],
  ["previous-namespace-clobber.js", "// Mentioning the previous namespace is not deriving from it.\nwindow.LongtailForge = {\n  previous: window.LongtailForge,\n};\n"],
  ["literal-element-access.js", "// A string-literal key is as static as a dotted member, directly and through an alias.\n(function attachLiteralElementAccess(global) {\n  const namespace = global.LongtailForge || {};\n  global.LongtailForge[\"directLiteralSurface\"] = { ok: true };\n  namespace[\"aliasLiteralSurface\"] = { ok: true };\n  global.LongtailForge = namespace;\n})(window);\n"],
  ["logical-assignment-root.js", "// The bootstrap root written with logical assignment. `ns ||= {}` evaluates to the\n// namespace exactly as `ns = ns || {}` does, and two shared scripts bind the root that way.\n(function attachLogicalAssignmentRoot(global) {\n  const root = global.LongtailForge ||= {};\n  root.logicalAssignmentSurface = { ok: true };\n})(window);\n"],
  ["computed-element-access.js", "// A computed key rooted at the namespace cannot be named, so it is recorded as an\n// unsupported rooted write rather than silently dropped.\n(function attachComputedElementAccess(global) {\n  const namespace = global.LongtailForge || {};\n  const key = \"computed\";\n  namespace[key] = { ok: true };\n  global.LongtailForge = namespace;\n})(window);\n"],
]) {
  fs.writeFileSync(path.join(publicationFixtureRoot, "sources", fixtureName), fixtureSource);
}
fs.writeFileSync(path.join(publicationFixtureRoot, "tsconfig.json"), "{\n  \"compilerOptions\": {\n    \"target\": \"es2023\",\n    \"module\": \"esnext\",\n    \"moduleResolution\": \"bundler\",\n    \"allowJs\": true,\n    \"checkJs\": false,\n    \"noEmit\": true,\n    \"lib\": [\n      \"DOM\",\n      \"DOM.Iterable\",\n      \"ES2023\"\n    ],\n    \"types\": []\n  },\n  \"include\": [\n    \"sources/**/*.js\"\n  ]\n}");

const publicationFixtures = collectBrowserPublicationInventory({
  root: publicationFixtureRoot,
  configFile: "tsconfig.json",
  scanDirectory: "sources",
});
const fixtureSurfaces = [...publicationFixtures.surfaces.keys()].sort();
assert.deepEqual(
  fixtureSurfaces,
  [
    "window.LongtailForge.aliasLiteralSurface",
    "window.LongtailForge.aliasSurface",
    "window.LongtailForge.directLiteralSurface",
    "window.LongtailForge.directSurface",
    "window.LongtailForge.firstAliasSurface",
    "window.LongtailForge.frozenSurface",
    "window.LongtailForge.logicalAssignmentSurface",
    "window.LongtailForge.mergedSurface",
    "window.LongtailForge.repeatedSurface",
    "window.LongtailForge.secondAliasSurface",
    "window.LongtailForge.shadowedOuterSurface",
    "window.LongtailForge.sharedSurface",
    "window.directBareSurface",
    "window.pairedBareSurface",
    "window.provenBareSurface",
  ],
  "the inventory must find every supported publication form and nothing else",
);
for (const [fixtureSurface, expectedForm] of [
  ["window.LongtailForge.directSurface", "direct"],
  ["window.directBareSurface", "direct"],
  ["window.LongtailForge.aliasSurface", "alias"],
  ["window.LongtailForge.frozenSurface", "alias"],
  ["window.LongtailForge.mergedSurface", "alias"],
  ["window.LongtailForge.firstAliasSurface", "alias"],
  ["window.LongtailForge.secondAliasSurface", "alias"],
  // Binding-scoped provenance: the outer `root` publishes, the inner one does not.
  ["window.LongtailForge.shadowedOuterSurface", "alias"],
  // A parameter is the global object only when the argument at its own index was.
  ["window.provenBareSurface", "direct"],
  ["window.pairedBareSurface", "direct"],
  // A string-literal key resolves statically, so it is an ordinary publication.
  ["window.LongtailForge.directLiteralSurface", "direct"],
  ["window.LongtailForge.aliasLiteralSurface", "alias"],
]) {
  const entry = publicationFixtures.surfaces.get(fixtureSurface);
  assert.equal(entry?.writers.length, 1, `${fixtureSurface} should have exactly one fixture writer`);
  assert.equal(entry?.writers[0]?.form, expectedForm, `${fixtureSurface} should be discovered as a ${expectedForm} write`);
}
assert.equal(
  publicationFixtures.surfaces.get("window.LongtailForge.repeatedSurface")?.writers.length,
  1,
  "repeated writes from one file must deduplicate to a single writer",
);
for (const absentSurface of [
  "window.LongtailForge.localOnly",
  "window.LongtailForge.notPublished",
  "window.LongtailForge.className",
  "window.LongtailForge.view",
  // The inner `root` is a DOM element; sharing a name with the namespace alias is not
  // sharing its binding.
  "window.LongtailForge.shadowedInnerSurface",
  // A shadowing parameter never received the global object.
  "window.shadowedBareSurface",
  // The first parameter was paired with {}, not with window.
  "window.unpairedSurface",
  // A computed key is recorded as unsupported, never invented as a named surface.
  "window.LongtailForge.key",
  "window.LongtailForge.computed",
]) {
  assert.ok(
    !publicationFixtures.surfaces.has(absentSurface),
    `${absentSurface} is a local object, a non-window parameter, or a read, and must not be counted as a publication`,
  );
}
// A namespace-root write is safe only when what it assigns *is* the namespace. Both
// clobber fixtures must be caught: one replaces the namespace with an unrelated object,
// the other keeps a reference to the previous namespace inside a new one, which reads
// like derivation and is not.
const fixtureClobbers = publicationFixtures.namespaceRootWrites
  .filter((entry) => !entry.derivesFromNamespace)
  .map((entry) => path.basename(entry.file))
  .sort();
assert.deepEqual(
  fixtureClobbers,
  ["namespace-clobber.js", "previous-namespace-clobber.js"],
  `exactly the two clobber fixtures must be detected; found ${fixtureClobbers.join(", ")}`,
);
const fixtureSafeRootWrites = publicationFixtures.namespaceRootWrites
  .filter((entry) => entry.derivesFromNamespace)
  .map((entry) => path.basename(entry.file))
  .sort();
assert.deepEqual(
  fixtureSafeRootWrites,
  [
    "binding-shadow.js",
    "computed-element-access.js",
    "direct-and-alias.js",
    "iife-global-alias.js",
    "literal-element-access.js",
    "namespace-alias.js",
    "two-aliases.js",
  ],
  `every bootstrap form that does derive from the namespace must stay authorised; found ${fixtureSafeRootWrites.join(", ")}`,
);

// A rooted write that cannot be read statically is recorded, never dropped.
assert.deepEqual(
  publicationFixtures.unsupportedTargets.map((entry) => `${path.basename(entry.file)} ${entry.target}`),
  ["computed-element-access.js window.LongtailForge[key]"],
  "a computed key rooted at the namespace must be recorded as an unsupported rooted write",
);
assert.deepEqual(
  publicationFixtures.deepWrites.map((entry) => `${path.basename(entry.file)} ${entry.target}`),
  [],
  "no fixture writes below a published surface",
);
const publicationFixtureRepeat = collectBrowserPublicationInventory({
  root: publicationFixtureRoot,
  configFile: "tsconfig.json",
  scanDirectory: "sources",
});
assert.deepEqual(
  [...publicationFixtureRepeat.surfaces.keys()].sort(),
  fixtureSurfaces,
  "the inventory must be deterministic across runs",
);
fs.rmSync(publicationFixtureRoot, { recursive: true, force: true });
// Publication ownership.
//
// `0.33.33.33` closed against a scanner that recognised only direct
// `window.<surface> = ...` assignments. The `0.33.33.34` preflight proved that model
// incomplete: most of this namespace is published through an alias, and a third writer of
// `window.LongtailForge.filesDialog` was invisible to it. `0.33.33.33.8` replaced the
// text scan with an AST-backed inventory that resolves alias provenance, and the estate it
// measures is 59 surfaces rather than 19.
//
// The inventory is the shared, published one so that a future audit and this guard cannot
// disagree about what the tree publishes.
const publicationInventory = collectBrowserPublicationInventory({});

// The namespace root is a container, not an application surface. Every write to it must
// still derive from the namespace, so alias-based code cannot hide a clobber.
const clobberingNamespaceWrites = publicationInventory.namespaceRootWrites
  .filter((entry) => !entry.derivesFromNamespace)
  .map((entry) => `${entry.file}:${entry.line}: window.LongtailForge = ${entry.text}`);
assert.deepEqual(
  clobberingNamespaceWrites,
  [],
  `the LongtailForge namespace root may only be extended, never replaced: ${clobberingNamespaceWrites.join(" | ")}`,
);

// A write rooted at the global object or the namespace that the inventory cannot resolve
// statically - `window.LongtailForge[key] = ...` - is recorded rather than dropped, and so
// is a write below a published surface. Both have exact baselines rather than an
// allowance: the estate has none of either, so the truthful baseline is empty and any
// addition fails. There is no wildcard here and no threshold; the lists shrink or fail.
//
// This bucket means "rooted but unnameable". It is deliberately narrower than the one
// 0.33.33.33.8 first reported six entries in, which recorded any assignment target that
// was not a dotted path regardless of what it was rooted at. All six of those were local
// DOM writes through a `querySelector(...)` result - `element.dataset.x = ...` - which are
// not publications at all and never affected the surface count.
const rootedUnnameableWrites = publicationInventory.unsupportedTargets
  .map((entry) => `${entry.file}:${entry.line}: ${entry.target}`);
assert.deepEqual(
  rootedUnnameableWrites,
  [],
  "a publication rooted at the global object or the LongtailForge namespace must be"
    + ` statically nameable so it can be owned: ${rootedUnnameableWrites.join(" | ")}`,
);
const writesBelowSurfaces = publicationInventory.deepWrites
  .map((entry) => `${entry.file}:${entry.line}: ${entry.target}`);
assert.deepEqual(
  writesBelowSurfaces,
  [],
  "a browser script may publish a surface but may not reach into one that is already"
    + ` published: ${writesBelowSurfaces.join(" | ")}`,
);

// Every surface written by more than one file is named here with its exact writers, the
// reason, and whether it retires. Writers are compared as an exact set in both directions,
// so an unrecorded writer fails and a record that outlives a writer fails as stale. There
// is no wildcard, no per-directory rule, and no writer-count ceiling.
/**
 * @typedef {object} MultiWriterRecord
 * @property {string} kind
 * @property {string[]} writers
 * @property {string[] | null} order
 * @property {Record<string, "declared" | "injected">} [delivery] how each ordered writer
 *   reaches the page, which decides how its position can be proved
 * @property {string} reason
 * @property {string} disposition
 */

// `window.LongtailForge.filesDialog` stood here as the one temporary-migration record
// 0.33.33.33 closed with. 0.33.33.34 struck it: the shared preview helper stopped merging
// `openFilePreview` in through its namespace alias and Workbench's compatibility bridge was
// retired, leaving public/js/files.js as the sole writer. The inventory fails on a record
// that outlives its writers as well as on an unrecorded surface, so the record had to go in
// the same change as the writers.
/** @type {Array<[string, MultiWriterRecord]>} */
const MULTI_WRITER_RECORDS = [
  [
    "window.fetch",
    {
      kind: "platform-primitive-composition",
      // 0.33.33.33.8 found a third guard the direct-assignment scanner never saw:
      // browser-recovery.js writes through its own IIFE `global` parameter. It is
      // injected immediately after <head> by src/services/static.service.js, so it runs
      // before the two script tags and wraps the native fetch first.
      writers: [
        "public/js/navigation.js",
        "public/js/shared/browser-recovery.js",
        "public/js/theme-init.js",
      ],
      order: [
        "public/js/shared/browser-recovery.js",
        "public/js/theme-init.js",
        "public/js/navigation.js",
      ],
      // How each writer reaches the page decides how its position can be proved. A page
      // scan can never witness browser-recovery, because no page declares it: it is
      // injected at <head> by src/services/static.service.js. Recording the mechanism is
      // what stops the order proof from passing vacuously.
      delivery: {
        "public/js/navigation.js": "declared",
        "public/js/shared/browser-recovery.js": "injected",
        "public/js/theme-init.js": "declared",
      },
      reason: "An ordered decorator chain over a host primitive. Each guard wraps whatever"
        + " fetch is current rather than a saved native reference, each brands itself so a"
        + " repeat install is a no-op, and each adds one concern: 403 permission-denied"
        + " recovery, CSRF, then 401 session expiry.",
      disposition: "permanent",
    },
  ],
  [
    "window.LongtailForge.view",
    {
      kind: "ordered-application-composition",
      writers: [
        "public/js/shared/view-builder.js",
        "public/js/shared/view-renderer.js",
      ],
      order: [
        "public/js/shared/view-builder.js",
        "public/js/shared/view-renderer.js",
      ],
      delivery: {
        "public/js/shared/view-builder.js": "declared",
        "public/js/shared/view-renderer.js": "declared",
      },
      // Measured by 0.33.33.33.8: 8 views load both and none loads them out of order;
      // builder publishes 30 members and renderer 10 with zero overlap, so neither
      // overwrites the other; renderer spreads the existing surface while builder does
      // not, which is what makes the order contractual rather than incidental; renderer is
      // never loaded without builder, while builder is loaded alone on 10 settings views.
      reason: "view-builder publishes the base primitives and can stand alone; view-renderer"
        + " extends the same surface with descriptor rendering and must load after it,"
        + " because builder republishes without spreading and would discard renderer's"
        + " members if the order were reversed.",
      disposition: "permanent under the current architecture; 0.33.33.35 extracts"
        + " responsibilities from both files but its own contract forbids adding to or"
        + " reordering this frozen factory namespace, so no retirement is scheduled",
    },
  ],
];
const MULTI_WRITER_SURFACES = new Map(MULTI_WRITER_RECORDS);

// Empty since 0.33.33.34 struck the `filesDialog` record. The map is read inside the
// multi-writer loop, so an owner recorded for a surface with one writer would assert
// nothing; the mechanism stays for the next temporary migration that needs it.
/** @type {Map<string, string>} */
const CANONICAL_SURFACE_OWNERS = new Map();

const contested = contestedSurfaces(publicationInventory);
const contestedNames = contested.map((entry) => entry.surface).sort();
assert.deepEqual(
  contestedNames,
  [...MULTI_WRITER_SURFACES.keys()].sort(),
  `every surface with more than one writer must be recorded; the tree has ${contestedNames.join(", ")}`,
);

for (const [surface, record] of MULTI_WRITER_SURFACES) {
  const entry = contested.find((candidate) => candidate.surface === surface);
  assert.ok(entry, `${surface} is recorded as a ${record.kind} but no longer has more than one writer; a spent record must be struck`);
  const actualWriters = (entry?.writers ?? []).map((writer) => writer.file).sort();
  assert.deepEqual(
    actualWriters,
    [...record.writers].sort(),
    `${surface} is recorded as written by ${record.writers.join(", ")}; the tree has ${actualWriters.join(", ")}.`
      + " A recorded exception must match the code exactly, so a new writer fails and a"
      + " departed one must be struck from the record.",
  );
  assert.ok(record.reason.length > 0, `${surface} must record why it has more than one writer`);
  assert.ok(record.disposition.length > 0, `${surface} must record whether it is permanent or retiring`);
  const canonicalOwner = CANONICAL_SURFACE_OWNERS.get(surface);
  if (canonicalOwner) {
    assert.ok(
      actualWriters.includes(canonicalOwner),
      `${surface} names ${canonicalOwner} as its canonical owner, which must still publish it`,
    );
  }
}

// The four invariants are fixture-proved before the estate is trusted to them, on a tree small
// enough that each assertion is about one thing. Every case below is a *behaviour* of the
// derivation, so an implementation that satisfied the estate by accident still fails here.
{
  const coverageFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ltf-coverage-fixtures-"));
  fs.mkdirSync(path.join(coverageFixtureRoot, "sources"));
  fs.mkdirSync(path.join(coverageFixtureRoot, "types"));

  const writeFixtureSource = (/** @type {string} */ name, /** @type {string[]} */ lines) =>
    fs.writeFileSync(path.join(coverageFixtureRoot, "sources", name), `${lines.join("\n")}\n`);

  // `declaredSurface` is published by two files, which is what makes unique surfaces and
  // publication occurrences different numbers on this tree.
  writeFixtureSource("alpha.js", [
    "(function attachAlpha(global) {",
    "  const namespace = global.LongtailForge || {};",
    "  namespace.declaredSurface = { ok: true };",
    "  namespace.undeclaredSurface = { ok: true };",
    "  global.LongtailForge = namespace;",
    "})(window);",
  ]);
  writeFixtureSource("beta.js", [
    "(function attachBeta(global) {",
    "  const namespace = global.LongtailForge || {};",
    "  namespace.declaredSurface = { second: true };",
    "  global.LongtailForge = namespace;",
    "})(window);",
  ]);

  fs.writeFileSync(path.join(coverageFixtureRoot, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "es2023",
      module: "esnext",
      moduleResolution: "bundler",
      allowJs: true,
      checkJs: false,
      noEmit: true,
      lib: ["DOM", "DOM.Iterable", "ES2023"],
      types: [],
    },
    include: ["sources/**/*.js"],
  }));

  const writeFixtureDeclaration = (/** @type {string} */ name, /** @type {string[]} */ members) =>
    fs.writeFileSync(path.join(coverageFixtureRoot, "types", name), [
      "export interface LongtailForgeBrowserNamespace {",
      ...members.map((member) => `  ${member}?: unknown;`),
      "}",
      "",
    ].join("\n"));

  writeFixtureDeclaration("both.d.ts", ["declaredSurface", "typeOnlySurface"]);
  writeFixtureDeclaration("neither.d.ts", []);

  const fixtureCoverage = (/** @type {string} */ declarationFile) => collectDeclarationCoverage({
    root: coverageFixtureRoot,
    configFile: "tsconfig.json",
    scanDirectory: "sources",
    declarationFile: `types/${declarationFile}`,
  });

  const withDeclaration = fixtureCoverage("both.d.ts");

  // TERMINOLOGY - the numbers this checkpoint must never let a reader conflate. One surface is
  // written by two files, so occurrences exceed unique surfaces; and a declared member with no
  // writer is known without being published, so the member universes differ in both directions.
  assert.equal(withDeclaration.uniqueSurfaces, 2, "two distinct surfaces are published");
  assert.equal(withDeclaration.publicationOccurrences, 3, "three writer-surface pairs publish them");
  assert.notEqual(
    withDeclaration.uniqueSurfaces,
    withDeclaration.publicationOccurrences,
    "unique publication surfaces and publication occurrences are different measurements",
  );
  assert.deepEqual(withDeclaration.publishedMembers, ["declaredSurface", "undeclaredSurface"]);
  assert.deepEqual(withDeclaration.declaredMembers, ["declaredSurface", "typeOnlySurface"]);
  assert.deepEqual(
    withDeclaration.knownMembers,
    ["declaredSurface", "typeOnlySurface", "undeclaredSurface"],
    "known members are the union of declared and published, which is neither one alone",
  );

  // A - PUBLISHED WITHOUT DECLARATION. The undeclared one is reported by exact name, and the
  // declared one is not. A backlog entry naming something else cannot cover it, which is the
  // property that makes the record an inventory rather than an allowance.
  assert.deepEqual(withDeclaration.undeclaredPublishedMembers, ["undeclaredSurface"]);
  const wrongName = ["someOtherSurface"];
  assert.deepEqual(
    withDeclaration.undeclaredPublishedMembers.filter((member) => !wrongName.includes(member)),
    ["undeclaredSurface"],
    "an exception for a differently named member must not cover an undeclared publication",
  );

  // B - DECLARED WITHOUT WRITER. `typeOnlySurface` is declared and nothing publishes it, which
  // is exactly the state that needs a disposition rather than a silent pass.
  assert.deepEqual(withDeclaration.declaredMembersWithoutWriter, ["typeOnlySurface"]);
  const recordedTypeOnly = new Map([["typeOnlySurface", "fixture: declared with no writer on purpose"]]);
  assert.deepEqual(
    withDeclaration.declaredMembersWithoutWriter.filter((member) => !recordedTypeOnly.has(member)),
    [],
    "a recorded type-only declaration satisfies the writer invariant",
  );
  assert.equal(
    withDeclaration.declaredMembersWithoutWriter.includes("declaredSurface"),
    false,
    "a declared member that is published must never be reported as missing a writer",
  );

  // C - CANONICAL WRITER. Two writers on one surface is the contested case; the single-writer
  // surface is not reported. Whether a lone additive writer is open or closed is not asked here.
  assert.deepEqual(
    withDeclaration.multiWriterSurfaces.map((entry) => entry.surface),
    ["window.LongtailForge.declaredSurface"],
    "only the surface with more than one writer is contested",
  );
  assert.deepEqual(
    withDeclaration.multiWriterSurfaces[0]?.writers,
    ["sources/alpha.js", "sources/beta.js"],
    "a contested surface reports its exact writer set so a stale record fails",
  );

  // LIVE DERIVATION - the same tree, read against a declaration that names nothing, moves
  // members between the two coverage answers. **No snapshot is edited and no second inventory
  // exists**; changing the declaration is the only difference between these two results.
  const withoutDeclaration = fixtureCoverage("neither.d.ts");
  assert.deepEqual(
    withoutDeclaration.undeclaredPublishedMembers,
    ["declaredSurface", "undeclaredSurface"],
    "removing a declaration must make its published member undeclared",
  );
  assert.deepEqual(
    withoutDeclaration.declaredMembersWithoutWriter,
    [],
    "removing a declaration must also remove it from the writer-coverage question",
  );
  assert.notDeepEqual(
    withoutDeclaration.undeclaredPublishedMembers,
    withDeclaration.undeclaredPublishedMembers,
    "declaration coverage must follow the live declaration rather than a carried list",
  );

  // LIVE DERIVATION, the other direction - adding a publication changes writer coverage without
  // a second inventory being updated anywhere.
  writeFixtureSource("gamma.js", [
    "(function attachGamma(global) {",
    "  const namespace = global.LongtailForge || {};",
    "  namespace.typeOnlySurface = { nowPublished: true };",
    "  global.LongtailForge = namespace;",
    "})(window);",
  ]);
  const afterPublishing = fixtureCoverage("both.d.ts");
  assert.deepEqual(
    afterPublishing.declaredMembersWithoutWriter,
    [],
    "publishing a declared member must clear it from the missing-writer set",
  );
  assert.equal(
    afterPublishing.uniqueSurfaces,
    3,
    "a new publication is a new unique surface",
  );

  // D - UNRESOLVABLE ROOTED WRITE. A computed key rooted at the namespace is recorded rather
  // than guessed into a member name, and it is not counted as a published surface.
  writeFixtureSource("computed.js", [
    "(function attachComputed(global) {",
    "  const namespace = global.LongtailForge || {};",
    "  const key = \"whicheverSurface\";",
    "  namespace[key] = { ok: true };",
    "  global.LongtailForge = namespace;",
    "})(window);",
  ]);
  const withComputed = fixtureCoverage("both.d.ts");
  assert.equal(
    withComputed.unresolvableRootedWrites.length,
    1,
    "a computed rooted write must be recorded as unresolvable",
  );
  assert.match(withComputed.unresolvableRootedWrites[0], /sources\/computed\.js:\d+: window\.LongtailForge\[key\]/);
  assert.equal(
    withComputed.publishedMembers.includes("whicheverSurface"),
    false,
    "a computed key must never be guessed into a published member name",
  );
  assert.equal(
    withComputed.publishedMembers.includes("key"),
    false,
    "nor into the name of the variable that supplied it",
  );

  // DETERMINISM - an unchanged tree answers identically.
  assert.deepEqual(fixtureCoverage("both.d.ts"), withComputed, "an unchanged tree must serialise identically");

  fs.rmSync(coverageFixtureRoot, { recursive: true, force: true });
}

// `0.33.33.38.2.4.3` - publication and declaration can no longer drift apart silently.
//
// Four invariants, kept apart on purpose. They fail for different reasons and a reviewer has
// to be able to tell which one broke, so each has its own vocabulary, its own recorded
// dispositions, and its own failure text. "Namespace governance failed" is not a diagnosis.
//
// **The counting vocabulary is part of the contract.** A unique publication surface is not a
// publication occurrence and neither is a known `LongtailForge` member. The estate is 65
// unique surfaces across 68 publication occurrences, of which 63 are namespace members and
// two are bare globals; the three numbers are asserted separately below precisely so no
// future reader can take one for another, which is how an earlier reconciliation went wrong.
const declarationCoverage = collectDeclarationCoverage({});

// A - PUBLISHED SURFACE WITHOUT DECLARATION.
//
// Twenty-three members are published with no contract. **This is a backlog, not an
// allowance**: it names every one of them exactly, and it is asserted by identity rather than
// by count, so a new undeclared publication fails immediately *and* an entry that has since
// been declared fails until it is struck. A count-based allowance would let a declared member
// pay for a newly undeclared one, which is the escape hatch this must not become.
//
// Declaring these is `0.33.33.38.2.2`'s work and its descendants', not this checkpoint's.
// The list shrinks as those land; it may never grow without a deliberate edit here.
const UNDECLARED_PUBLICATION_BACKLOG = [
  "clientProjectDialog",
  "filePreview",
  "filesDialog",
  "helpPageReady",
  "navigationIntent",
  "notificationsPageReady",
  "overlayHost",
  "quickActionRefresh",
  "recovery",
  "refreshAppShell",
  "refreshNotifications",
  "reporting",
  "sessionAuthWarnings",
  "settingsRenderer",
  "supportView",
  "tags",
  "taskCalendar",
  "tasksDialog",
  "userPreferences",
  "workspaceContext",
  "workspaceContextReady",
];

const newlyUndeclaredMembers = declarationCoverage.undeclaredPublishedMembers
  .filter((member) => !UNDECLARED_PUBLICATION_BACKLOG.includes(member));
assert.deepEqual(
  newlyUndeclaredMembers,
  [],
  "these LongtailForge members are published at runtime with no declaration and are not in the"
    + ` 0.33.33.38.2.4.3 backlog: ${newlyUndeclaredMembers.join(", ")}`,
);
const struckBacklogEntries = UNDECLARED_PUBLICATION_BACKLOG
  .filter((member) => !declarationCoverage.undeclaredPublishedMembers.includes(member));
assert.deepEqual(
  struckBacklogEntries,
  [],
  "these members are recorded as undeclared publications but are now declared or no longer"
    + ` published; a spent record must be struck from the backlog: ${struckBacklogEntries.join(", ")}`,
);

// B - DECLARED MEMBER WITHOUT RUNTIME WRITER.
//
// A declaration with no publisher is either a genuine type-only contract or a stale one, and
// they are not interchangeable. **The estate currently has neither**: every declared member is
// published. The record exists so the distinction is available the moment it is needed, and it
// is asserted by identity so an entry cannot outlive the condition that justified it.
/** @type {Map<string, string>} */
const TYPE_ONLY_DECLARATIONS = new Map();

const declarationsMissingWriter = declarationCoverage.declaredMembersWithoutWriter
  .filter((member) => !TYPE_ONLY_DECLARATIONS.has(member));
assert.deepEqual(
  declarationsMissingWriter,
  [],
  "these LongtailForge members are declared but nothing publishes them; declare them type-only"
    + ` with a reason or remove the stale contract: ${declarationsMissingWriter.join(", ")}`,
);
for (const [member, reason] of TYPE_ONLY_DECLARATIONS) {
  assert.ok(
    declarationCoverage.declaredMembersWithoutWriter.includes(member),
    `${member} is recorded as a type-only declaration but now has a runtime writer; a spent record must be struck`,
  );
  assert.ok(reason.length > 0, `${member} must record why it is type-only rather than stale`);
}

// C - CANONICAL WRITER OWNERSHIP.
//
// One writer is the rule. More than one is a failure unless the surface carries a
// multi-writer record, which `0.33.33.33.8` already models with its writers, order, delivery,
// reason and disposition - reused here rather than duplicated. A surface with no writer at
// all is not a published surface and would mean the inventory recorded something it should
// not have.
//
// **A single additive writer is not this invariant's business.** Whether a spread-merged
// surface with one writer is open or closed is `0.33.33.38.2.4.4`'s decision.
assert.deepEqual(
  declarationCoverage.unwrittenSurfaces,
  [],
  "a published surface must have at least one runtime writer",
);
const uncontestedByRecord = declarationCoverage.multiWriterSurfaces
  .filter((entry) => !MULTI_WRITER_SURFACES.has(entry.surface))
  .map((entry) => `${entry.surface} written by ${entry.writers.join(", ")}`);
assert.deepEqual(
  uncontestedByRecord,
  [],
  `these surfaces have more than one runtime writer and no multi-writer record: ${uncontestedByRecord.join(" | ")}`,
);
const singleWriterSurfaces = declarationCoverage.uniqueSurfaces - declarationCoverage.multiWriterSurfaces.length;
assert.equal(
  singleWriterSurfaces,
  64,
  "64 of the 66 unique publication surfaces must have exactly one canonical writer",
);

// D - NO UNRESOLVABLE ROOTED WRITE.
//
// Restated here beside the other three so the four invariants read as one contract, using the
// inventory's own result rather than a second scan. A computed key stays unresolved rather
// than being guessed into a member name.
assert.deepEqual(declarationCoverage.unresolvableRootedWrites, [], "a rooted write must be statically nameable");
assert.deepEqual(declarationCoverage.writesBelowSurfaces, [], "nothing may write below an already-published surface");
assert.deepEqual(declarationCoverage.clobberingRootWrites, [], "the namespace root may only be extended, never replaced");

// E - A DECLARATION MUST BE CHECKED AGAINST ITS WRITER, NOT MERELY EXIST.
//
// `0.33.33.38.2.2.6.3` proved that a declaration alone guarantees nothing: deleting a member
// from a declared surface stayed green, because a TypeScript object type is not exact, and a
// false return type stayed green, because the writer was inferred through `any`.
// `0.33.33.38.2.4.5` audited all 39 declared members by adding a required member to every
// declared interface and asking which writers failed. **Thirty-six already failed** - a
// publication that assigns an object literal or a value straight onto a typed namespace
// property is checked by the compiler already, which is why so much of the estate was safe
// without anyone arranging it.
//
// **Three were not, and both escape hatches are now closed.** `viewResponseRecords` published
// through a JSDoc cast, which tells the compiler what to believe instead of checking;
// `applyWorkspaceName` and `getWorkspaceProjectsLabel` published functions whose implicit-`any`
// parameters were assignable to any contract at all.
//
// This assertion closes the first hatch structurally: **a namespace publication may not assert
// its own value.** The second is closed per-surface by typing the published function from its
// contract, which is a property of the writer rather than of the publication statement, and is
// audited by the probe recorded in the `0.33.33.38.2.4.5` archive entry.
assert.deepEqual(
  declarationCoverage.assertedPublications,
  [],
  "a namespace publication must be a checked expression, not a cast; a cast means the writer is"
    + ` never checked against the declaration it claims to implement: ${declarationCoverage.assertedPublications.join(" | ")}`,
);

// DISPOSITION - member-level diagnostic attribution stays durable *reporting*, and no
// governance rule depends on it.
//
// `0.33.33.38.2.4.2` already produces a member name per classified diagnostic deterministically
// and at no extra cost, so it is kept rather than thrown away. But **declaration coverage must
// hold even if the browser program reaches zero diagnostics**: every invariant above is derived
// from the AST publication inventory and the declaration text, and none of them consults a
// diagnostic. The two modules share a declaration *parser* and nothing else, which is asserted
// here so a later edit cannot quietly make governance depend on the measuring instrument.
const coverageSourceText = fs.readFileSync("scripts/test-support/browser-declaration-coverage.mjs", "utf8");
assert.doesNotMatch(
  coverageSourceText,
  /classifyBrowserDiagnostics|consume the diagnostics|options\.diagnostics/,
  "declaration coverage must be structural and must never consume diagnostics",
);
assert.match(
  coverageSourceText,
  /import \{ declaredNamespaceMembers \}/,
  "declaration coverage reads the live declaration through the shared parser rather than a copied list",
);
assert.doesNotMatch(
  coverageSourceText,
  /readdirSync|querySelector|\.match\(\/.*LongtailForge/,
  "declaration coverage must not scan source text for publications; that is the inventory's job",
);

// TERMINOLOGY - the three numbers are different numbers, asserted apart so no future summary
// can print one as another.
assert.equal(declarationCoverage.uniqueSurfaces, 66, "unique publication surfaces");
assert.equal(declarationCoverage.publicationOccurrences, 69, "publication occurrences, which exceed unique surfaces");
assert.equal(declarationCoverage.knownMembers.length, 64, "known LongtailForge members, which are not all governed surfaces");
assert.equal(declarationCoverage.declaredMembers.length, 43, "declared LongtailForge members");
assert.equal(declarationCoverage.publishedMembers.length, 64, "LongtailForge members with a runtime writer");
assert.ok(
  declarationCoverage.publicationOccurrences > declarationCoverage.uniqueSurfaces,
  "publication occurrences must exceed unique surfaces while any surface has co-writers",
);
assert.ok(
  declarationCoverage.knownMembers.length < declarationCoverage.uniqueSurfaces,
  "the LongtailForge members are a subset of the governed surfaces, not the same universe",
);

// The additive/multi-writer matrix, proved on a fixture tree because the estate only contains
// two of its four cells. All four are legal shapes and the governance must tell them apart.
{
  const additiveFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ltf-additive-fixtures-"));
  fs.mkdirSync(path.join(additiveFixtureRoot, "sources"));
  fs.mkdirSync(path.join(additiveFixtureRoot, "types"));

  const write = (/** @type {string} */ name, /** @type {string[]} */ lines) =>
    fs.writeFileSync(path.join(additiveFixtureRoot, "sources", name), `${lines.join("\n")}\n`);

  // one writer, replacement publication
  write("one-replace.js", [
    "(function attachOneReplace(global) {",
    "  const namespace = global.LongtailForge || {};",
    "  namespace.oneReplace = { ok: true };",
    "  global.LongtailForge = namespace;",
    "})(window);",
  ]);
  // one writer, additive publication
  write("one-additive.js", [
    "(function attachOneAdditive(global) {",
    "  const namespace = global.LongtailForge || {};",
    "  namespace.oneAdditive = { ...(namespace.oneAdditive || {}), ok: true };",
    "  global.LongtailForge = namespace;",
    "})(window);",
  ]);
  // two writers, neither additive
  write("two-replace-a.js", [
    "(function attachTwoReplaceA(global) {",
    "  const namespace = global.LongtailForge || {};",
    "  namespace.twoReplace = { first: true };",
    "  global.LongtailForge = namespace;",
    "})(window);",
  ]);
  write("two-replace-b.js", [
    "(function attachTwoReplaceB(global) {",
    "  const namespace = global.LongtailForge || {};",
    "  namespace.twoReplace = { second: true };",
    "  global.LongtailForge = namespace;",
    "})(window);",
  ]);
  // two writers, the second additive - the `view` shape
  write("two-additive-a.js", [
    "(function attachTwoAdditiveA(global) {",
    "  const namespace = global.LongtailForge || {};",
    "  namespace.twoAdditive = { first: true };",
    "  global.LongtailForge = namespace;",
    "})(window);",
  ]);
  write("two-additive-b.js", [
    "(function attachTwoAdditiveB(global) {",
    "  const namespace = global.LongtailForge || {};",
    "  namespace.twoAdditive = { ...namespace.twoAdditive, second: true };",
    "  global.LongtailForge = namespace;",
    "})(window);",
  ]);

  fs.writeFileSync(path.join(additiveFixtureRoot, "types", "contracts.d.ts"), [
    "export interface LongtailForgeBrowserNamespace {",
    "}",
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(additiveFixtureRoot, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "es2023",
      module: "esnext",
      moduleResolution: "bundler",
      allowJs: true,
      checkJs: false,
      noEmit: true,
      lib: ["DOM", "DOM.Iterable", "ES2023"],
      types: [],
    },
    include: ["sources/**/*.js"],
  }));

  const matrix = collectDeclarationCoverage({
    root: additiveFixtureRoot,
    configFile: "tsconfig.json",
    scanDirectory: "sources",
    declarationFile: "types/contracts.d.ts",
  });
  const additiveBySurface = new Set(matrix.additivePublications.map((entry) => entry.surface));
  const multiWriterBySurface = new Set(matrix.multiWriterSurfaces.map((entry) => entry.surface));

  // The four cells, each asserted on both axes so neither can stand in for the other.
  assert.equal(additiveBySurface.has("window.LongtailForge.oneReplace"), false, "one writer, replacement: not additive");
  assert.equal(multiWriterBySurface.has("window.LongtailForge.oneReplace"), false, "one writer, replacement: not multi-writer");

  assert.equal(additiveBySurface.has("window.LongtailForge.oneAdditive"), true, "one writer can still publish additively");
  assert.equal(multiWriterBySurface.has("window.LongtailForge.oneAdditive"), false, "additive does not imply more than one writer");

  assert.equal(additiveBySurface.has("window.LongtailForge.twoReplace"), false, "more than one writer does not imply additive");
  assert.equal(multiWriterBySurface.has("window.LongtailForge.twoReplace"), true, "two writers are contested however they publish");

  assert.equal(additiveBySurface.has("window.LongtailForge.twoAdditive"), true, "the `view` shape: contested and additive");
  assert.equal(multiWriterBySurface.has("window.LongtailForge.twoAdditive"), true, "the `view` shape: contested and additive");

  // An additive publication is attributed to the writer that spreads, not to the surface as a
  // whole, so a record naming the wrong file cannot satisfy it.
  const twoAdditive = matrix.additivePublications.filter((entry) => entry.surface === "window.LongtailForge.twoAdditive");
  assert.deepEqual(
    twoAdditive.map((entry) => entry.writer),
    ["sources/two-additive-b.js"],
    "only the writer that preserves is recorded as additive, not its co-writer",
  );

  // A record for an unrelated surface cannot cover an undisposed one, which is the property
  // that makes the record an inventory rather than a permission slip.
  const wrongSurfaceRecord = new Map([["window.LongtailForge.somethingElse", { writer: "sources/two-additive-b.js" }]]);
  const stillUndisposed = matrix.additivePublications
    .filter((entry) => wrongSurfaceRecord.get(entry.surface)?.writer !== entry.writer)
    .map((entry) => entry.surface);
  assert.deepEqual(
    [...new Set(stillUndisposed)].sort(),
    ["window.LongtailForge.oneAdditive", "window.LongtailForge.twoAdditive"],
    "a record for another surface must not dispose of an additive publication",
  );

  // WHAT THE RETAINED POLICY PROMISES. `view`'s record is `co-writer-member-preservation`, so
  // the promise is that the first writer's known members survive the second publication. This
  // executes that shape rather than asserting it from syntax.
  const host = /** @type {Record<string, Record<string, unknown>>} */ ({});
  host.twoAdditive = { first: true };
  const captured = host.twoAdditive;
  host.twoAdditive = { ...host.twoAdditive, second: true };
  assert.deepEqual(host.twoAdditive, { first: true, second: true }, "the co-writer's members must survive");
  assert.notEqual(
    host.twoAdditive,
    captured,
    "a spread assigns a NEW object, so co-writer-member-preservation is explicitly not an"
      + " identity guarantee - which is why `dashboard`'s comment claiming one could not be true",
  );

  fs.rmSync(additiveFixtureRoot, { recursive: true, force: true });
}

// `0.33.33.38.2.4.4` - additive publication, governed independently of writer multiplicity.
//
// **These are two properties, not one.** A surface may have one writer or several, and may
// replace or preserve what it finds, in any of the four combinations. `MULTI_WRITER_RECORDS`
// above answers *how many writers are permitted and why*; it does not answer *why a writer
// preserves an existing surface*, and extending it until it meant both would lose exactly the
// distinction this child exists to draw.
//
// The estate arrived here with six preserving publications. Five of them preserved nothing on
// any delivery path and are gone: `dashboard` and `reporting` publish from a single call in a
// single delivery with their renderer registries in file-local closures; `filesDialog` carried
// the residue of the three-writer arrangement `0.33.33.33.8` recorded and `0.33.33.34` retired;
// `notesDialog` and `listsDialog` have the estate's only genuine double-delivery path, but
// their module-action descriptors name a readiness probe that stops the second load, and a
// second evaluation would rebuild the same members anyway. **A spread that cannot preserve
// anything is not a contract, and policy saying it is allowed forever would be worse than the
// spread.**
//
// One remains, and it is the real thing.
/** @type {readonly [string, {kind: string, writer: string, preserves: string, reason: string, disposition: string}][]} */
const ADDITIVE_PUBLICATION_RECORDS = [
  [
    "window.LongtailForge.view",
    {
      kind: "co-writer-member-preservation",
      writer: "public/js/shared/view-renderer.js",
      preserves: "public/js/shared/view-builder.js",
      reason: "The view factory is published by two files in a fixed order. The builder"
        + " publishes 30 primitives and the renderer adds 10 more, so the renderer must"
        + " spread what the builder published or the primitives would disappear from the"
        + " surface every page that loads both. This preserves the *known members of a named"
        + " co-writer*, which is why it is recorded here rather than described as"
        + " extensibility: nothing outside those two files may contribute to `view`.",
      disposition: "permanent",
    },
  ],
];
const ADDITIVE_PUBLICATIONS = new Map(ADDITIVE_PUBLICATION_RECORDS);

const undisposedAdditive = declarationCoverage.additivePublications
  .filter((entry) => ADDITIVE_PUBLICATIONS.get(entry.surface)?.writer !== entry.writer)
  .map((entry) => `${entry.surface} preserved by ${entry.writer}`);
assert.deepEqual(
  undisposedAdditive,
  [],
  "these publications preserve an existing surface with no recorded reason; decide whether the"
    + ` preservation is part of the contract or remove the spread: ${undisposedAdditive.join(" | ")}`,
);
for (const [surface, record] of ADDITIVE_PUBLICATIONS) {
  const live = declarationCoverage.additivePublications
    .find((entry) => entry.surface === surface && entry.writer === record.writer);
  assert.ok(
    live,
    `${surface} is recorded as additively published by ${record.writer}, which no longer preserves`
      + " an existing surface; a spent record must be struck",
  );
  assert.ok(record.reason.length > 0, `${surface} must record why preserving existing members is part of its contract`);
  assert.ok(record.disposition.length > 0, `${surface} must record whether its additive publication is permanent or retiring`);
  // The preserved-from writer has to be a real writer of the same surface. This is where the
  // two dimensions meet without merging: additive governance names a file, and multi-writer
  // governance is what says that file is allowed to be a second writer at all.
  const surfaceWriters = declarationCoverage.multiWriterSurfaces.find((entry) => entry.surface === surface)?.writers
    ?? [];
  assert.ok(
    surfaceWriters.includes(record.preserves),
    `${surface} records that it preserves ${record.preserves}, which must still publish it`,
  );
  assert.ok(
    MULTI_WRITER_SURFACES.has(surface),
    `${surface} preserves a co-writer's members, so it must also carry a multi-writer record`,
  );
}

// INDEPENDENCE - the two dimensions do not imply each other. Every multi-writer surface in the
// estate is checked against the additive record rather than assumed to be additive: `window.fetch`
// has three writers and preserves nothing, which is the case that would break a governance model
// that treated "more than one writer" and "preserves the previous value" as the same fact.
const additiveSurfaces = new Set(declarationCoverage.additivePublications.map((entry) => entry.surface));
const multiWriterNonAdditive = [...MULTI_WRITER_SURFACES.keys()].filter((surface) => !additiveSurfaces.has(surface));
assert.deepEqual(
  multiWriterNonAdditive,
  ["window.fetch"],
  "window.fetch must remain the estate's proof that multiple writers do not imply additive publication",
);
assert.equal(
  declarationCoverage.additivePublications.length,
  1,
  "one additive publication remains after 0.33.33.38.2.4.4; the other five preserved nothing and were removed",
);

// The five removals are asserted at the source, so restoring a spread that archaeology found
// inert fails here rather than silently re-entering the estate as an undisposed additive.
/** @type {readonly [string, RegExp][]} */
const REPLACEMENT_PUBLICATIONS = [
  // `0.33.33.38.2.2.6.8` gave the surface a declaration, so the object is now built as an
  // annotated `dashboardApi` const and then assigned. The claim is that nothing spreads the
  // previous value, not which of the two shapes the file uses to say so.
  ["public/js/dashboard.js", /(?:namespace\.dashboard|const dashboardApi) = \{\s*\n\s*registerPanelRenderer/],
  ["public/js/reporting.js", /namespace\.reporting = \{\s*\n\s*registerRenderer/],
  ["public/js/files.js", /window\.LongtailForge\.filesDialog = Object\.freeze\(\{\s*\n\s*openFileEditor/],
  ["public/js/notes.js", /window\.LongtailForge\.notesDialog = Object\.freeze\(\{\s*\n\s*\.\.\.notesDialogApi/],
  ["public/js/lists.js", /window\.LongtailForge\.listsDialog = Object\.freeze\(\{\s*\n\s*\.\.\.listsDialogApi/],
];
for (const [publisher, pattern] of REPLACEMENT_PUBLICATIONS) {
  assert.match(
    fs.readFileSync(publisher, "utf8").split("\r\n").join("\n"),
    pattern,
    `${publisher} must publish its surface without spreading the previous value`,
  );
}

// Where order is the contract, it is proved from how the writers are actually delivered.
//
// The first version of this loop skipped any page that did not declare every writer, so a
// writer no page declares produced no witnesses and the record passed without proving
// anything. `window.fetch` is exactly that case: browser-recovery.js is injected at
// <head>, so a page scan alone can never see it. Each ordered record now states the
// delivery mechanism of every writer, each mechanism has a proof appropriate to it, and
// neither proof is allowed to be vacuous.
const staticServiceSource = fs.readFileSync("src/services/static.service.js", "utf8");
const headInjectionBlock = extractFunctionBlock(staticServiceSource, "injectErrorBoundaryScripts");

/** @param {string} directory @param {string[]} out */
function collectRenderedViews(directory, out) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const full = `${directory}/${entry.name}`;
    if (entry.isDirectory()) collectRenderedViews(full, out);
    else if (full.endsWith(".html")) out.push(full);
  }
}
/** @type {string[]} */
const renderedViews = [];
collectRenderedViews("views", renderedViews);
assert.ok(renderedViews.length > 0, "the ordered-composition proofs need rendered views to read");

for (const [surface, record] of MULTI_WRITER_SURFACES) {
  if (!record.order) continue;
  const delivery = record.delivery ?? {};
  assert.deepEqual(
    Object.keys(delivery).sort(),
    [...record.order].sort(),
    `${surface} records an order, so it must state how every one of its writers is delivered`,
  );
  const injectedWriters = record.order.filter((writer) => delivery[writer] === "injected");
  const declaredWriters = record.order.filter((writer) => delivery[writer] === "declared");
  assert.equal(
    injectedWriters.length + declaredWriters.length,
    record.order.length,
    `${surface} records a writer whose delivery is neither "declared" nor "injected"`,
  );
  // Injection lands at the opening <head>, so an injected writer always precedes a
  // declared one. A record that claims otherwise is describing something that cannot
  // happen.
  assert.deepEqual(
    [...injectedWriters, ...declaredWriters],
    record.order,
    `${surface} records an injected writer after a declared one, which the delivery order`
      + " makes impossible: injection is placed at <head>, ahead of every declared asset",
  );

  // Injected writers are proved against the injector, because no page declares them.
  for (const writer of injectedWriters) {
    const assetPath = writer.replace("public/", "/");
    assert.ok(
      headInjectionBlock.includes(`<script src="${assetPath}"></script>`),
      `${surface} records ${writer} as injected, but src/services/static.service.js does not inject it`,
    );
    assert.ok(
      headInjectionBlock.includes("<head") && headInjectionBlock.includes("'$1"),
      `${surface} records ${writer} as injected ahead of declared assets, which holds only`
        + " while the injector anchors its scripts to the opening <head> tag",
    );
    const declaringViews = renderedViews.filter((view) => fs.readFileSync(view, "utf8").includes(assetPath));
    assert.deepEqual(
      declaringViews,
      [],
      `${writer} is recorded as injected, so no view may also declare it: ${declaringViews.join(", ")}`,
    );
  }

  // Declared writers are proved against the pages that actually deliver them.
  /** @type {string[]} */
  const misordered = [];
  let viewsProvingOrder = 0;
  for (const view of renderedViews) {
    const html = fs.readFileSync(view, "utf8");
    const positions = declaredWriters.map((writer) => html.indexOf(writer.replace("public/", "")));
    if (positions.some((position) => position === -1)) continue;
    viewsProvingOrder += 1;
    for (let index = 1; index < positions.length; index += 1) {
      if (positions[index - 1] > positions[index]) {
        misordered.push(`${view} (${declaredWriters[index - 1]} after ${declaredWriters[index]})`);
      }
    }
  }
  assert.deepEqual(
    misordered,
    [],
    `${surface} is an ordered composition and its writers must appear in the recorded order: ${misordered.join(" | ")}`,
  );
  if (declaredWriters.length > 1) {
    assert.ok(
      viewsProvingOrder > 0,
      `${surface} records an order over ${declaredWriters.join(" then ")} that no rendered view proves;`
        + " an order proof with no witnesses is not a proof",
    );
  }
}

// The view surface is a permanent ordered composition, so its composition semantics are
// governed rather than described. These are the facts that make the order contractual: if
// the renderer stopped preserving what the builder published, or the two started
// publishing the same member, the order would no longer be the thing keeping the surface
// whole.
const VIEW_SURFACE = "window.LongtailForge.view";
const viewComposition = publicationInventory.surfaces.get(VIEW_SURFACE);
assert.ok(viewComposition, `${VIEW_SURFACE} must be published for its composition contract to mean anything`);
const viewBase = viewComposition?.writers.find((writer) => writer.file === "public/js/shared/view-builder.js");
const viewExtension = viewComposition?.writers.find((writer) => writer.file === "public/js/shared/view-renderer.js");
assert.ok(viewBase && viewExtension, `${VIEW_SURFACE} must still be composed by view-builder.js and view-renderer.js`);
assert.ok(
  (viewBase?.members.length ?? 0) > 0,
  "view-builder.js must publish the base member set of the view surface",
);
assert.ok(
  (viewExtension?.members.length ?? 0) > 0,
  "view-renderer.js must add its own members to the view surface rather than merely re-freezing it",
);
const viewMemberOverlap = (viewBase?.members ?? []).filter((member) => (viewExtension?.members ?? []).includes(member));
assert.deepEqual(
  viewMemberOverlap,
  [],
  "the two view writers must publish disjoint members; an overlapping member means one"
    + ` writer silently replaces the other's: ${viewMemberOverlap.join(", ")}`,
);
assert.equal(
  viewExtension?.preservesExisting,
  true,
  "view-renderer.js must spread the surface it is extending; without that it would discard"
    + " every member view-builder.js published",
);
assert.equal(
  viewBase?.preservesExisting,
  false,
  "view-builder.js republishes without spreading, which is exactly why it must load first;"
    + " if that changed the recorded order would no longer be the contract it is recorded as",
);
const rendererWithoutBuilder = renderedViews.filter((view) => {
  const html = fs.readFileSync(view, "utf8");
  return html.includes("js/shared/view-renderer.js") && !html.includes("js/shared/view-builder.js");
});
assert.deepEqual(
  rendererWithoutBuilder,
  [],
  "view-renderer.js extends a surface view-builder.js creates, so no view may load it"
    + ` alone: ${rendererWithoutBuilder.join(", ")}`,
);

console.log(`Full-strict governance passed: ${ledger.totals.files} files, ${ledger.totals.errors} exact diagnostics, ${ledger.totals.explicitAny} explicit-any nodes, declarations clean.`);
console.log(`Shared-global inventory: ${browserScriptFiles.length - leakingBrowserScripts.length - NATIVE_MODULE_ENTRIES.size}/${browserScriptFiles.length - NATIVE_MODULE_ENTRIES.size} classic browser scripts out of the shared lexical environment, ${leakingBrowserScripts.length} in the 0.33.33.33 backlog, ${NATIVE_MODULE_ENTRIES.size} native ES-module entry exempt, ${publicationInventory.surfaces.size} published surfaces (AST-resolved, alias-aware) with ${MULTI_WRITER_SURFACES.size} recorded multi-writer records.`);

/**
 * Every line in one source that sets an `ip` member inside an object literal
 * that also names a published session member.
 *
 * The enclosing literal is found by walking outward on brace depth, so a
 * session member anywhere in the same literal counts and one in a neighbouring
 * literal does not.
 * @param {string} source
 * @returns {number[]} the 1-based line numbers of the offending members
 */
function sessionShapedIpMembers(source) {
  /** @type {number[]} */
  const offenders = [];
  const lines = source.split("\r\n").join("\n").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\s*ip:\s/.test(lines[index])) continue;
    const open = literalStart(lines, index);
    const close = literalEnd(lines, index);
    const literal = lines.slice(open, close + 1).join("\n");
    if (SESSION_LITERAL_MEMBERS.some((member) => new RegExp(`\\b${member}\\s*:`).test(literal))) {
      offenders.push(index + 1);
    }
  }
  return offenders;
}

/** @param {string[]} lines @param {number} from @returns {number} */
function literalStart(lines, from) {
  let depth = 0;
  for (let index = from; index >= 0; index -= 1) {
    for (const character of [...lines[index]].reverse()) {
      if (character === "}") depth += 1;
      else if (character === "{") {
        if (depth === 0) return index;
        depth -= 1;
      }
    }
  }
  return 0;
}

/** @param {string[]} lines @param {number} from @returns {number} */
function literalEnd(lines, from) {
  let depth = 0;
  for (let index = from; index < lines.length; index += 1) {
    for (const character of lines[index]) {
      if (character === "{") depth += 1;
      else if (character === "}") {
        if (depth === 0) return index;
        depth -= 1;
      }
    }
  }
  return lines.length - 1;
}
/**
 * Every first-party script the scripts program checks.
 *
 * Read from the ledger's own file list so the sweep cannot drift from the
 * program it governs, and so a new script is covered the moment it exists.
 * @returns {string[]}
 */
function discoveredScriptPaths() {
  return ledger.programs.scripts.files.filter((filePath) => filePath.endsWith(".mjs"));
}

/** @returns {GovernanceLedger} */
function cloneLedger() {
  return JSON.parse(JSON.stringify(ledger));
}
