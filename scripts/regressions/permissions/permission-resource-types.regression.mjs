export const regressionMeta = Object.freeze({
  id: "permissions.permission-resource-types",
  area: "permissions",
  tier: "focused",
  tags: ["audit", "contracts", "permissions", "search", "typecheck"],
  description: "Proves permission resources require workspace scope and the Audit/Search route call sites construct that shared checked contract.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const [contractSource, resourceSource, permissionsServiceSource, auditRouteSource, searchRouteSource, searchIndexRouteSource] = await Promise.all([
  fs.readFile("src/types/http-contracts.d.ts", "utf8"),
  fs.readFile("src/core/permission-resource.js", "utf8"),
  fs.readFile("src/services/permissions.service.js", "utf8"),
  fs.readFile("src/routes/audit.routes.js", "utf8"),
  fs.readFile("src/routes/search.routes.js", "utf8"),
  fs.readFile("src/routes/search-index.routes.js", "utf8"),
]);

const permissionResourceContract = readInterface(contractSource, "PermissionResource");
assert.match(permissionResourceContract, /^  workspace_id: string;$/m);
assert.doesNotMatch(permissionResourceContract, /workspace_id\?:|workspace_id: string \| null/);
assert.match(resourceSource, /^\/\/ @ts-check\r?\n/);
assert.match(resourceSource, /function createWorkspacePermissionResource[\s\S]*?workspace_id: workspaceId/);
assert.match(resourceSource, /function createScopedPermissionResource[\s\S]*?client_id:[\s\S]*?project_id:[\s\S]*?workspace_id: workspaceId/);
assert.match(permissionsServiceSource, /^\/\/ @ts-check\r?\n/);
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
/** @type {PermissionResource} */
const resource = { workspace_id: "workspace-1", operation: "read" };
void resource;
`);
  await fs.writeFile(path.join(tempDirectory, "missing-workspace.js"), `// @ts-check
/** @typedef {import("./http-contracts.js").PermissionResource} PermissionResource */
/** @type {PermissionResource} */
const resource = { operation: "read" };
void resource;
`);

  const validResult = compileProbe(path.join(tempDirectory, "valid.js"));
  assert.equal(validResult.status, 0, validResult.output);

  const invalidResult = compileProbe(path.join(tempDirectory, "missing-workspace.js"));
  assert.notEqual(invalidResult.status, 0, "a permission resource without workspace scope must fail checked JavaScript");
  assert.match(invalidResult.output, /Property 'workspace_id' is missing/);
} finally {
  await fs.rm(tempDirectory, { recursive: true, force: true });
}

console.log("Permission resource type and route-construction regression passed.");

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
