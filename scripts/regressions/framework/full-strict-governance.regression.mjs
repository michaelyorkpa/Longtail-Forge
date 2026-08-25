export const regressionMeta = Object.freeze({
  id: "framework.full-strict-governance",
  area: "framework",
  tier: "release-gate",
  tags: ["contracts", "framework", "release", "typecheck"],
  description: "Proves every first-party JavaScript file belongs to one full-strict program and exact debt can only shrink behind the generated compiler ledger.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { extractFunctionBlock, extractFunctionBody, extractFunctionSpan, scannableSource } from "../../test-support/source-scan.mjs";
import fs from "node:fs";
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
const SHARED_SCOPE_BACKLOG = new Set([
  "public/js/notes.js",
  "public/js/workbench.js",
  "public/js/tasks.js",
  "public/js/lists.js",
  "public/js/clients-projects.js",
  "public/js/files.js",
  "public/js/time-entries.js",
  "public/js/stop-watch.js",
  "public/js/tags.js",
]);

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

// Publication ownership.
//
// The namespace root is not a surface. Every script that contributes to
// `window.LongtailForge` opens it with an idempotent bootstrap, so the root is counted
// separately and each bootstrap is checked for idempotency: a write that replaces the
// namespace instead of extending it would silently discard every surface already on it.
/** @type {Map<string, string[]>} */
const surfacePublishers = new Map();
/** @type {string[]} */
const clobberingNamespaceWrites = [];
for (const browserScript of browserScriptFiles) {
  const masked = scannableSource(fs.readFileSync(browserScript, "utf8"));
  for (const match of masked.matchAll(/\bwindow\.((?:[A-Za-z_$][\w$]*)(?:\.[A-Za-z_$][\w$]*)*)\s*=(?!=)([^\n;]*)/g)) {
    const surface = `window.${match[1]}`;
    // `window.location.href = ...` is navigation, not a publication.
    if (surface.startsWith("window.location")) continue;
    if (surface === "window.LongtailForge") {
      // Idempotent bootstrap forms only: `window.LongtailForge || {}`, or a local
      // namespace binding this file derived from it.
      const assigned = match[2].trim();
      const derivesFromNamespace = /window\.LongtailForge\s*\|\|/.test(assigned)
        || (/^[A-Za-z_$][\w$]*;?$/.test(assigned) && /const\s+namespace\s*=\s*window\.LongtailForge\s*\|\|/.test(masked));
      if (!derivesFromNamespace) clobberingNamespaceWrites.push(`${browserScript}: window.LongtailForge = ${assigned}`);
      continue;
    }
    if (!surfacePublishers.has(surface)) surfacePublishers.set(surface, []);
    const owners = surfacePublishers.get(surface) ?? [];
    if (!owners.includes(browserScript)) owners.push(browserScript);
  }
}
assert.deepEqual(
  clobberingNamespaceWrites,
  [],
  `the LongtailForge namespace root may only be extended, never replaced: ${clobberingNamespaceWrites.join(" | ")}`,
);

// A published surface has exactly one owner unless it is recorded here. Each record
// carries the exact surface, its exact writers, the architectural reason, and whether it
// is permanent or scheduled for retirement. The recorded writers must match the tree
// exactly in both directions: an extra writer fails, and a record that outlives its
// writer fails so a retired exception cannot become permanent governance debt.
/**
 * @type {Map<string, {kind: string, writers: string[], reason: string, disposition: string}>}
 */
const MULTI_WRITER_SURFACES = new Map([
  [
    "window.fetch",
    {
      kind: "platform-primitive-composition",
      // Order is the contract: theme-init installs the CSRF guard over the native fetch,
      // and navigation then wraps whatever fetch is current, so mutations still carry a
      // CSRF header underneath the 401 handling.
      writers: ["public/js/theme-init.js", "public/js/navigation.js"],
      reason: "An ordered decorator chain over a host primitive, not two application modules"
        + " claiming one Longtail Forge surface. Each guard is idempotent, wraps the current"
        + " fetch rather than a saved native reference, and is proved as a composition by"
        + " scripts/regressions/framework/fetch-guard-composition.regression.mjs.",
      disposition: "permanent",
    },
  ],
  [
    "window.LongtailForge.filesDialog",
    {
      kind: "temporary-migration",
      writers: ["public/js/files.js", "public/js/workbench.js"],
      reason: "Files is the canonical owner and publishes the whole editor and preview"
        + " surface. Workbench conditionally merges a preview-only compatibility bridge for"
        + " hosts where the Files controller is not loaded, and its own guard returns early"
        + " when the canonical publisher is present.",
      disposition: "retire in 0.33.33.34, which removes the Workbench bridge",
    },
  ],
]);

const CANONICAL_SURFACE_OWNERS = new Map([
  ["window.LongtailForge.filesDialog", "public/js/files.js"],
]);

for (const [surface, record] of MULTI_WRITER_SURFACES) {
  assert.ok(record.reason.length > 0, `${surface} must record why it has more than one writer`);
  assert.ok(record.disposition.length > 0, `${surface} must record whether the exception is permanent or retiring`);
  const actualWriters = surfacePublishers.get(surface) ?? [];
  // Membership is compared as a set: the order the files happen to be walked in carries
  // no meaning, and the order that does matter is proved from the rendered load order.
  assert.deepEqual(
    [...actualWriters].sort(),
    [...record.writers].sort(),
    `${surface} is recorded as a ${record.kind} written by ${record.writers.join(" then ")};`
      + ` the tree has ${actualWriters.join(", ") || "no writer"}. A recorded exception must match`
      + " the code exactly, so a new writer fails and a retired one must be struck from the record.",
  );
  const canonicalOwner = CANONICAL_SURFACE_OWNERS.get(surface);
  if (canonicalOwner) {
    assert.ok(
      actualWriters.includes(canonicalOwner),
      `${surface} names ${canonicalOwner} as its canonical owner, which must still publish it`,
    );
  }
}

// For a platform-primitive composition the writer order is the contract, and the order
// is decided by the rendered pages rather than by the files. Every view that loads both
// guards must load them in the recorded order, or navigation would capture the native
// fetch and the CSRF guard would sit above it instead of underneath.
const fetchComposition = MULTI_WRITER_SURFACES.get("window.fetch");
if (fetchComposition) {
  const [firstWriter, secondWriter] = fetchComposition.writers;
  const firstTag = `${firstWriter.replace("public/", "")}`;
  const secondTag = `${secondWriter.replace("public/", "")}`;
  /** @type {string[]} */
  const misorderedViews = [];
  let viewsLoadingBoth = 0;
  (function walkOrderedViews(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = `${directory}/${entry.name}`;
      if (entry.isDirectory()) {
        walkOrderedViews(full);
        continue;
      }
      if (!full.endsWith(".html")) continue;
      const html = fs.readFileSync(full, "utf8");
      const firstAt = html.indexOf(firstTag);
      const secondAt = html.indexOf(secondTag);
      if (firstAt === -1 || secondAt === -1) continue;
      viewsLoadingBoth += 1;
      if (firstAt > secondAt) misorderedViews.push(full);
    }
  })("views");
  assert.deepEqual(
    misorderedViews,
    [],
    `${firstTag} must load before ${secondTag} so the session-expiry guard wraps the CSRF guard`
      + ` rather than the native fetch: ${misorderedViews.join(" | ")}`,
  );
  assert.ok(
    viewsLoadingBoth > 0,
    "no rendered view loads both fetch guards, so the recorded composition order proves nothing",
  );
}

const unexpectedlyContestedSurfaces = [...surfacePublishers.entries()]
  .filter(([surface, owners]) => owners.length > 1 && !MULTI_WRITER_SURFACES.has(surface))
  .map(([surface, owners]) => `${surface} <- ${owners.join(", ")}`);
assert.deepEqual(
  unexpectedlyContestedSurfaces,
  [],
  `these window surfaces have more than one publisher and no recorded owner: ${unexpectedlyContestedSurfaces.join(" | ")}`,
);

console.log(`Full-strict governance passed: ${ledger.totals.files} files, ${ledger.totals.errors} exact diagnostics, ${ledger.totals.explicitAny} explicit-any nodes, declarations clean.`);
console.log(`Shared-global inventory: ${browserScriptFiles.length - leakingBrowserScripts.length - NATIVE_MODULE_ENTRIES.size}/${browserScriptFiles.length - NATIVE_MODULE_ENTRIES.size} classic browser scripts out of the shared lexical environment, ${leakingBrowserScripts.length} in the 0.33.33.33 backlog, ${NATIVE_MODULE_ENTRIES.size} native ES-module entry exempt, ${surfacePublishers.size} published surfaces with ${MULTI_WRITER_SURFACES.size} recorded multi-writer exceptions.`);

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
