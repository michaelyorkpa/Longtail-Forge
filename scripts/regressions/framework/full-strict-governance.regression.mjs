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

assert.equal(ledger.schemaVersion, 1);
assert.equal(ledger.checkpoint, "0.33.33.12");
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
  "tests/typecheck/time-tracking-edge-contracts.fixture.mjs:16",
].sort());
assert.deepEqual(ledger.declarationProbe, { config: "tsconfig.declarations.json", firstPartyFiles: 10, errors: 0 });

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
