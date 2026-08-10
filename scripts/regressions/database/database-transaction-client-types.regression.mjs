export const regressionMeta = Object.freeze({
  id: "database.transaction-client-types",
  area: "database",
  tier: "focused",
  tags: ["adapter", "contracts", "database", "transactions", "typecheck"],
  description: "Proves the full database adapter and transaction-only client remain distinct checked contracts across the SQLite driver and injected repositories.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const contractSource = await fs.readFile("src/types/framework-contracts.d.ts", "utf8");
const sqliteAdapterSource = await fs.readFile("src/db/adapters/sqlite-adapter.js", "utf8");
const authenticationThrottleSource = await fs.readFile("src/repositories/authentication-throttle.repo.js", "utf8");
const privateFeedTokenSource = await fs.readFile("src/repositories/private-feed-tokens.repo.js", "utf8");
const accountExportRecoverySource = await fs.readFile("src/repositories/account-export-recovery.repo.js", "utf8");

const transactionClientContract = readInterface(contractSource, "TransactionClient");
assert.match(transactionClientContract, /readonly dialect: DatabaseDialect/);
assert.match(transactionClientContract, /query\(sql: string/);
assert.match(transactionClientContract, /get\(sql: string/);
assert.match(transactionClientContract, /run\(sql: string/);
assert.doesNotMatch(transactionClientContract, /transaction\s*</, "a transaction client must not expose the full adapter transaction method");
assert.match(contractSource, /export interface DatabaseAdapter extends TransactionClient/);
assert.match(contractSource, /transaction<T>\(work: \(transaction: TransactionClient\)/);

assert.match(sqliteAdapterSource, /@returns \{DatabaseAdapter\}/);
assert.match(sqliteAdapterSource, /@param \{\(transaction: TransactionClient\) => Promise<T> \| T\} callback/);
assert.match(sqliteAdapterSource, /Nested database transactions are not supported\./, "the runtime nested-transaction guard remains defense in depth");

assert.match(authenticationThrottleSource, /function readEntries[\s\S]*?database\.transaction/);
assert.match(authenticationThrottleSource, /@param \{DatabaseAdapter\} \[database\][\s\S]*?async function readEntries/);
assert.match(authenticationThrottleSource, /@param \{TransactionClient\} database[\s\S]*?async function pruneExpired/);
assert.match(privateFeedTokenSource, /@param \{DatabaseAdapter\} \[database\][\s\S]*?async function rotate/);
assert.match(privateFeedTokenSource, /@param \{TransactionClient\} \[database\][\s\S]*?async function readById/);
assert.match(accountExportRecoverySource, /@param \{TransactionClient\} \[database\][\s\S]*?async function prepareWorkspacePurge/);

const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-database-contract-types-"));
try {
  await fs.writeFile(path.join(tempDirectory, "framework-contracts.d.ts"), contractSource);
  await fs.writeFile(path.join(tempDirectory, "valid.js"), `// @ts-check
/** @typedef {import("./framework-contracts.js").TransactionClient} TransactionClient */
/** @param {TransactionClient} transaction */
async function useTransaction(transaction) {
  await transaction.run("UPDATE example SET value = :value", { value: 1 });
  await transaction.get("SELECT value FROM example LIMIT 1");
  return transaction.query("SELECT value FROM example");
}
void useTransaction;
`);
  await fs.writeFile(path.join(tempDirectory, "invalid.js"), `// @ts-check
/** @typedef {import("./framework-contracts.js").TransactionClient} TransactionClient */
/** @param {TransactionClient} transaction */
async function openNestedTransaction(transaction) {
  return transaction.transaction(async () => undefined);
}
void openNestedTransaction;
`);

  const validResult = compileProbe(path.join(tempDirectory, "valid.js"));
  assert.equal(validResult.status, 0, validResult.output);

  const invalidResult = compileProbe(path.join(tempDirectory, "invalid.js"));
  assert.notEqual(invalidResult.status, 0, "nested transaction misuse must fail the checked JavaScript build");
  assert.match(invalidResult.output, /Property 'transaction' does not exist on type 'TransactionClient'/);
} finally {
  await fs.rm(tempDirectory, { recursive: true, force: true });
}

console.log("Database adapter and transaction-client type regression passed.");

function compileProbe(probePath) {
  const result = spawnSync(process.execPath, [
    "node_modules/typescript/bin/tsc",
    "--ignoreConfig",
    "--allowJs",
    "--checkJs",
    "--noEmit",
    "--strict",
    "--noImplicitAny",
    "false",
    "--skipLibCheck",
    "--types",
    "node",
    "--module",
    "nodenext",
    "--moduleResolution",
    "nodenext",
    "--target",
    "es2023",
    probePath,
  ], { encoding: "utf8" });
  return {
    status: result.status,
    output: `${result.stdout || ""}${result.stderr || ""}`,
  };
}

function readInterface(source, interfaceName) {
  const declaration = source.match(new RegExp(`export interface ${interfaceName} \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(declaration, `${interfaceName} must remain an exported interface`);
  return declaration[1];
}
