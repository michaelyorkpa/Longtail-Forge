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
for (const scriptPath of discoveredScriptPaths()) {
  const source = fs.readFileSync(scriptPath, "utf8");
  assert.equal(
    /^\s*ip: /m.test(source),
    false,
    `${scriptPath} must not set the misnamed ip session field; published session contracts name ip_address`,
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

console.log(`Full-strict governance passed: ${ledger.totals.files} files, ${ledger.totals.errors} exact diagnostics, ${ledger.totals.explicitAny} explicit-any nodes, declarations clean.`);

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
