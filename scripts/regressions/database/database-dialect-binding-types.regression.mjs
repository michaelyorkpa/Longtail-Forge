export const regressionMeta = Object.freeze({
  id: "database.dialect-binding-types",
  area: "database",
  tier: "focused",
  tags: ["bindings", "contracts", "database", "dialect", "typecheck"],
  description: "Proves dialect option bags, row identity, boolean field transforms, and scalar/array parameter bindings remain checked discriminated contracts.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { strictCleanOwnerState } from "../../test-support/typecheck-ledger.mjs";

const contractSource = await fs.readFile("src/types/database-contracts.d.ts", "utf8");
const dialectSource = await fs.readFile("src/db/adapters/sqlite-dialect-seams.js", "utf8");
const bindingSource = await fs.readFile("src/db/parameter-bindings.js", "utf8");

assert.deepEqual(strictCleanOwnerState("src/db/adapters/sqlite-dialect-seams.js"), { owned: true, diagnostics: 0 });
assert.deepEqual(strictCleanOwnerState("src/db/parameter-bindings.js"), { owned: true, diagnostics: 0 });
assert.match(dialectSource, /@param \{DatabaseInsertConflictUpdateOptions\} options/);
assert.match(dialectSource, /@param \{DatabaseRowIdOptions\} \[options\]/);
assert.match(bindingSource, /@returns \{Map<string, NamedBindingEntry>\}/);
assert.match(contractSource, /export type NamedBindingEntry = NamedScalarBinding \| NamedArrayBinding/);
assert.match(contractSource, /export type DatabaseRowIdOptions = string \|/);

const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-dialect-binding-types-"));
try {
  await fs.writeFile(path.join(tempDirectory, "database-contracts.d.ts"), contractSource);
  await fs.writeFile(path.join(tempDirectory, "valid.js"), `// @ts-check
/** @typedef {import("./database-contracts.js").DatabaseDialect} DatabaseDialect */
/** @typedef {import("./database-contracts.js").NamedBindingEntry} NamedBindingEntry */
/** @param {DatabaseDialect} dialect @param {NamedBindingEntry} binding */
function useContracts(dialect, binding) {
  const sql = dialect.conflict.buildInsertOnConflictDoUpdate({
    tableName: "example",
    columns: ["id", "enabled"],
    conflictColumns: ["id"],
    updateColumns: ["enabled"],
  });
  const rowId = dialect.identity.rowId({ tableAlias: "records", alias: "physical_id" });
  const bound = dialect.boolean.bindFields({ enabled: true, label: "Example" }, ["enabled"]);
  const placeholders = binding.isArray ? binding.placeholders : [binding.placeholder];
  return { sql, rowId, enabled: bound.enabled, placeholders };
}
void useContracts;
`);
  await fs.writeFile(path.join(tempDirectory, "invalid.js"), `// @ts-check
/** @typedef {import("./database-contracts.js").DatabaseDialect} DatabaseDialect */
/** @typedef {import("./database-contracts.js").NamedBindingEntry} NamedBindingEntry */
/** @param {DatabaseDialect} dialect @param {NamedBindingEntry} binding */
function misuseContracts(dialect, binding) {
  dialect.conflict.buildInsertOnConflictDoUpdate({
    tableName: "example",
    columns: ["id"],
    conflictColumns: ["id"],
  });
  dialect.identity.rowId({ table: "records", tableAlias: "records" });
  return binding.isArray ? binding.placeholder : binding.placeholders;
}
void misuseContracts;
`);

  const validResult = compileProbe(path.join(tempDirectory, "valid.js"));
  assert.equal(validResult.status, 0, validResult.output);

  const invalidResult = compileProbe(path.join(tempDirectory, "invalid.js"));
  assert.notEqual(invalidResult.status, 0, "malformed dialect and placeholder access must fail the checked build");
  assert.match(invalidResult.output, /Property 'updateColumns' is missing/);
  assert.match(invalidResult.output, /Property 'placeholder' does not exist on type 'NamedArrayBinding'/);
  assert.match(invalidResult.output, /Property 'placeholders' does not exist on type 'NamedScalarBinding'/);
  assert.match(invalidResult.output, /invalid\.js\(11,46\).*Type 'string' is not assignable to type 'undefined'/);
} finally {
  await fs.rm(tempDirectory, { recursive: true, force: true });
}

console.log("Database dialect and parameter-binding type regression passed.");

function compileProbe(/** @type {string} */ probePath) {
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
