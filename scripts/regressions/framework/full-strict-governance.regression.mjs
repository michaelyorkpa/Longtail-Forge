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

assert.equal(ledger.schemaVersion, 1);
assert.equal(ledger.checkpoint, "0.33.33.18.1");
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
  "tests/typecheck/database-contracts.fixture.mjs:15",
  "tests/typecheck/database-contracts.fixture.mjs:8",
  "tests/typecheck/precise-service-contracts.fixture.mjs:24",
  "tests/typecheck/precise-service-contracts.fixture.mjs:27",
  "tests/typecheck/precise-service-contracts.fixture.mjs:30",
  "tests/typecheck/time-tracking-edge-contracts.fixture.mjs:16",
].sort());
assert.deepEqual(ledger.declarationProbe, { config: "tsconfig.declarations.json", firstPartyFiles: 21, errors: 0 });

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
increasedDiagnostic.programs["server-tests"].diagnostics["src/config.js"][0].count += 1;
assert.throws(() => validateShrinkOnly(ledger, increasedDiagnostic), /2339 increased/);
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
