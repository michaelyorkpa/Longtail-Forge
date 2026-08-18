export const regressionMeta = Object.freeze({
  id: "framework.password-startup-checked-core",
  area: "framework",
  tier: "release-gate",
  tags: ["authentication", "contracts", "readiness", "security", "startup", "typecheck"],
  description: "Proves password primitives and application startup/shutdown remain checked, explicitly contracted, safely narrowed, and behavior-ordered.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { strictCleanOwnerState } from "../../test-support/typecheck-ledger.mjs";

const [passwordSource, appSource, typecheckLedgerSource] = await Promise.all([
  fs.readFile("src/security/passwords.js", "utf8"),
  fs.readFile("src/core/app.js", "utf8"),
  fs.readFile("scripts/typecheck-debt-ledger.json", "utf8"),
]);
const typecheckLedger = JSON.parse(typecheckLedgerSource);

for (const [filePath, source] of [
  ["src/security/passwords.js", passwordSource],
  ["src/core/app.js", appSource],
]) {
  assert.deepEqual(strictCleanOwnerState(filePath), { owned: true, diagnostics: 0 }, `${filePath} must stay strict-clean in its checked program`);
  assert.ok(typecheckLedger.programs["server-tests"].files.includes(filePath), `${filePath} must stay in the strict server/tests program`);
  assert.doesNotMatch(source, /@ts-(?:ignore|expect-error)|\bany\b|as unknown as/, `${filePath} must not suppress or guess across its checked boundary`);
}
assert.equal(typecheckLedger.programs["server-tests"].config, "tsconfig.json");

assert.match(passwordSource, /@typedef \{"argon2id" \| "pbkdf2_sha256" \| "unknown"\} PasswordHashAlgorithm/);
assert.match(passwordSource, /@typedef \{ParsedArgon2Hash \| ParsedPbkdf2Hash\} ParsedPasswordHash/);
assert.match(passwordSource, /@returns \{Promise<PasswordVerificationResult>\}/);
assert.match(passwordSource, /@returns \{ParsedPasswordHash \| null\}/);
assert.match(passwordSource, /algorithm: "argon2id"[\s\S]*memory: 65_536[\s\S]*passes: 3[\s\S]*parallelism: 1[\s\S]*saltLength: 16[\s\S]*tagLength: 32/);
assert.match(passwordSource, /timingSafeEqualBuffers\(hash, parsed\.hash\)/);
assert.match(passwordSource, /leftBuffer\.length === rightBuffer\.length && timingSafeEqual\(leftBuffer, rightBuffer\)/);
assert.doesNotMatch(passwordSource, /argon2Sync|pbkdf2Sync|scryptSync/);

assert.match(appSource, /@typedef \{import\("node:http"\)\.Server\} HttpServer/);
assert.match(appSource, /@typedef \{import\("\.\.\/types\/database-contracts\.js"\)\.DatabaseStartupPhaseEvent\} StartupPhaseEvent/);
assert.match(appSource, /@param \{HttpServer\} server/);
assert.match(appSource, /@param \{NodeJS\.Signals\} signal/);
assert.match(appSource, /function readUnknownErrorMessage\(error\)/);
assert.match(appSource, /function readUnknownErrorType\(error\)/);

assertOrdered(appSource, [
  "logRuntimeConfigWarnings(",
  "await assertPublicDemoRuntimeReady();",
  "await assertRuntimeDataPathsReady();",
  "await filesService.assertConfiguredFileStorageProviderReady();",
  "await filesService.assertConfiguredFileScannerReady();",
  "await initializeDatabase({ report: reportStartupPhase });",
  "queueStartupJobRetentionPrune();",
  "queueStartupSearchIndexRebuildIfEmpty();",
  "const app = createApp();",
  "await runModuleStartupTasks(\"app\", { defer: true });",
  "const server = app.listen(",
  "startConfiguredInlineWorker();",
  "registerGracefulShutdown(server);",
], "application startup order");

assertOrdered(appSource, [
  "await stopJobWorker();",
  "server.close(resolve);",
  "await closeDatabase();",
  "process.exitCode = 0;",
], "graceful shutdown order");

assertOrdered(appSource, [
  "app.use(operationalHealthRoutes);",
  "app.use(express.static(config.publicDir));",
  "app.use(\"/api\", appInfoRoutes);",
  "app.use(\"/api\", authRoutes);",
  "app.use(publicApiRoutes);",
  "app.use(privateFeedPublicRoutes);",
  "app.use(requireAuth);",
  "app.use(supportViewRequestGate);",
  "app.use(createPublicDemoBudgetMiddleware());",
  "app.use(staticRoutes);",
  "app.use(browserNotFound);",
  "app.use(errorHandler);",
], "public/protected/error middleware order");

console.log("Password and application-startup checked-core regression passed.");

function assertOrdered(source, fragments, label) {
  let previousIndex = -1;
  for (const fragment of fragments) {
    const index = source.indexOf(fragment);
    assert.ok(index > previousIndex, `${label} must retain ${fragment}`);
    previousIndex = index;
  }
}
// Consolidated under framework.current-static-contracts by 0.33.33.11.
