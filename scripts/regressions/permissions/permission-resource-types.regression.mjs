export const regressionMeta = Object.freeze({
  id: "permissions.permission-resource-types",
  area: "permissions",
  tier: "focused",
  tags: ["audit", "contracts", "permissions", "search", "typecheck"],
  description: "Proves permission and active API-key contracts reject missing or misspelled fields while Audit/Search routes construct the shared checked resource.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { strictCleanOwnerState } from "../../test-support/typecheck-ledger.mjs";

const [contractSource, resourceSource, permissionsServiceSource, auditRouteSource, searchRouteSource, searchIndexRouteSource] = await Promise.all([
  fs.readFile("src/types/http-contracts.d.ts", "utf8"),
  fs.readFile("src/core/permission-resource.js", "utf8"),
  fs.readFile("src/services/permissions.service.js", "utf8"),
  fs.readFile("src/routes/audit.routes.js", "utf8"),
  fs.readFile("src/routes/search.routes.js", "utf8"),
  fs.readFile("src/routes/search-index.routes.js", "utf8"),
]);

const permissionResourceContract = readInterface(contractSource, "PermissionResource");
const activeApiKeyContract = readInterface(contractSource, "ActiveApiKey");
assert.match(permissionResourceContract, /^  workspace_id: string;$/m);
assert.doesNotMatch(permissionResourceContract, /workspace_id\?:|workspace_id: string \| null/);
assert.doesNotMatch(permissionResourceContract, /\[key: string\]/);
assert.doesNotMatch(activeApiKeyContract, /\[key: string\]/);
assert.deepEqual(strictCleanOwnerState("src/core/permission-resource.js"), { owned: true, diagnostics: 0 });
assert.match(resourceSource, /function createWorkspacePermissionResource[\s\S]*?workspace_id: workspaceId/);
assert.match(resourceSource, /function createScopedPermissionResource[\s\S]*?client_id:[\s\S]*?project_id:[\s\S]*?workspace_id: workspaceId/);
assert.deepEqual(strictCleanOwnerState("src/services/permissions.service.js"), { owned: true, diagnostics: 0 });
assert.match(permissionsServiceSource, /@typedef \{import\("\.\.\/types\/http-contracts\.js"\)\.PermissionResource\} PermissionResource/);
assert.match(permissionsServiceSource, /@param \{PermissionResource\} resource[\s\S]*?async function can/);
assert.match(permissionsServiceSource, /const workspaceSession = \/\*\* @type \{WorkspaceRequestSession\} \*\//);

assert.match(auditRouteSource, /createWorkspacePermissionResource\(request\.session\.workspace_id, "read"\)/);
assert.match(auditRouteSource, /createWorkspacePermissionResource\(session\.workspace_id, "read"\)/);
assert.match(searchRouteSource, /createScopedPermissionResource\(session\.workspace_id, "read", \{/);
assert.match(searchRouteSource, /clientId: resolvePermissionClientId\(result\)/);
assert.match(searchRouteSource, /projectId: resolvePermissionProjectId\(result\)/);
assert.match(searchIndexRouteSource, /createWorkspacePermissionResource\(request\.session\.workspace_id, "update"\)/);

const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-permission-resource-types-"));
try {
  await fs.writeFile(path.join(tempDirectory, "http-contracts.d.ts"), contractSource);
  await fs.writeFile(path.join(tempDirectory, "valid.js"), `// @ts-check
/** @typedef {import("./http-contracts.js").PermissionResource} PermissionResource */
/** @typedef {import("./http-contracts.js").ActiveApiKey} ActiveApiKey */
/** @type {PermissionResource} */
const resource = { workspace_id: "workspace-1", operation: "read" };
/** @type {ActiveApiKey} */
const apiKey = {
  api_key_id: "key-1",
  workspace_id: "workspace-1",
  created_by_user_id: "user-1",
  key_prefix: "ltf_1234",
  status: "active",
  scopes: ["tasks:read"],
};
void resource;
void apiKey;
`);
  await fs.writeFile(path.join(tempDirectory, "missing-workspace.js"), `// @ts-check
/** @typedef {import("./http-contracts.js").PermissionResource} PermissionResource */
/** @type {PermissionResource} */
const resource = { operation: "read" };
void resource;
`);
  await fs.writeFile(path.join(tempDirectory, "misspelled-resource.js"), `// @ts-check
/** @typedef {import("./http-contracts.js").PermissionResource} PermissionResource */
/** @type {PermissionResource} */
const resource = { workspace_id: "workspace-1", operaton: "read" };
void resource;
`);
  await fs.writeFile(path.join(tempDirectory, "misspelled-api-key.js"), `// @ts-check
/** @typedef {import("./http-contracts.js").ActiveApiKey} ActiveApiKey */
/** @type {ActiveApiKey} */
const apiKey = {
  api_key_id: "key-1",
  workspace_id: "workspace-1",
  created_by_user_id: "user-1",
  key_prefix: "ltf_1234",
  status: "active",
  scopes: ["tasks:read"],
  scopse: ["tasks:write"],
};
void apiKey;
`);

  const validResult = compileProbe(path.join(tempDirectory, "valid.js"));
  assert.equal(validResult.status, 0, validResult.output);

  const invalidResult = compileProbe(path.join(tempDirectory, "missing-workspace.js"));
  assert.notEqual(invalidResult.status, 0, "a permission resource without workspace scope must fail checked JavaScript");
  assert.match(invalidResult.output, /Property 'workspace_id' is missing/);

  const misspelledResourceResult = compileProbe(path.join(tempDirectory, "misspelled-resource.js"));
  assert.notEqual(misspelledResourceResult.status, 0, "a misspelled permission-resource field must fail checked JavaScript");
  assert.match(misspelledResourceResult.output, /Object literal may only specify known properties/);
  assert.match(misspelledResourceResult.output, /operaton/);

  const misspelledApiKeyResult = compileProbe(path.join(tempDirectory, "misspelled-api-key.js"));
  assert.notEqual(misspelledApiKeyResult.status, 0, "a misspelled active API-key field must fail checked JavaScript");
  assert.match(misspelledApiKeyResult.output, /Object literal may only specify known properties/);
  assert.match(misspelledApiKeyResult.output, /scopse/);
} finally {
  await fs.rm(tempDirectory, { recursive: true, force: true });
}

console.log("Permission resource, active API-key, and route-construction regression passed.");

/** @param {string} probePath @returns {{ output: string, status: number | null }} */
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

/** @param {string} source @param {string} interfaceName @returns {string} */
function readInterface(source, interfaceName) {
  const declaration = source.match(new RegExp(`export interface ${interfaceName} \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(declaration, `${interfaceName} must remain an exported interface`);
  return declaration[1];
}
