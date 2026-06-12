import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const EXPECTED_VISIBLE_SCOPES = [
  "clients:read",
  "projects:read",
  "tasks:read",
  "tasks:write",
  "time_entries:read",
  "time_entries:write",
];

const DEFERRED_SCOPE_PREFIXES = [
  "clients:write",
  "projects:write",
  "files:",
  "search:",
  "notes:",
  "lists:",
  "tags:",
  "notifications:",
  "help:",
  "settings:",
  "discovery:",
];

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-api-scope-audit-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-api-scope-audit.db");
process.env.SUPER_ADMIN_PASSWORD = "Api-Scope-Audit-Test-123!";

const { initializeDatabase, closeSqlite, querySql } = await import("../src/db/index.js");
const { modulesService } = await import("../src/core/modules/modules.service.js");

try {
  await initializeDatabase();
  await assertWorkspaceVisibleScopes();
  assertRouteScopesAreDeclared();
  await assertDocsCaptureAudit();

  console.log("API key scope audit regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertWorkspaceVisibleScopes() {
  const workspaceId = await readWorkspaceId();
  const availableScopes = await modulesService.listAvailableApiScopes(workspaceId);
  const visibleScopeIds = availableScopes.map((scope) => scope.id).sort();

  assert.deepEqual(visibleScopeIds, EXPECTED_VISIBLE_SCOPES);
  for (const scope of availableScopes) {
    assert.ok(scope.label, `${scope.id} label is required for API key UI display`);
    assert.ok(scope.description, `${scope.id} description is required for API key UI display`);
    assert.ok(["read", "write"].includes(scope.access), `${scope.id} access should be read or write`);
  }
}

function assertRouteScopesAreDeclared() {
  const declaredScopes = new Set(modulesService.listModuleApiScopeEntries().map((scope) => scope.scope));
  const endpointScopes = modulesService.listModules()
    .flatMap((moduleDefinition) => moduleDefinition.publicApiEndpoints || [])
    .map((endpoint) => endpoint.scope)
    .filter(Boolean);

  for (const scope of endpointScopes) {
    assert.ok(declaredScopes.has(scope), `${scope} public API endpoint scope must be declared`);
  }

  for (const missingPrefix of DEFERRED_SCOPE_PREFIXES) {
    assert.equal(
      [...declaredScopes].some((scope) => scope === missingPrefix || scope.startsWith(missingPrefix)),
      false,
      `${missingPrefix} scopes should remain deferred until the 0.33.5.3.x repair line`,
    );
  }
}

async function assertDocsCaptureAudit() {
  const roadmap = await fs.readFile(path.join(process.cwd(), "ROADMAP.md"), "utf8");
  const publicApiDocs = await fs.readFile(path.join(process.cwd(), "docs/public-api.md"), "utf8");

  for (const scope of EXPECTED_VISIBLE_SCOPES) {
    assert.match(publicApiDocs, new RegExp(escapeRegExp(scope)));
  }

  for (const deferredScope of ["clients:write", "projects:write", "files:read", "search:read", "notes:read", "lists:read", "tags:read", "notifications:read", "help:read"]) {
    assert.match(publicApiDocs, new RegExp(escapeRegExp(deferredScope)));
  }

  assert.match(roadmap, /Version 0\.33\.5\.3\.x - API key scope repair/);
  assert.match(roadmap, /Scope registration and source-of-truth repair/);
  assert.match(roadmap, /Permission regression coverage for API-key-scoped reads and writes/);
}

async function readWorkspaceId() {
  const rows = await querySql(`
SELECT workspace_id
FROM workspaces
ORDER BY workspace_id
LIMIT 1;
`);

  assert.ok(rows[0]?.workspace_id, "workspace fixture is required");
  return rows[0].workspace_id;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
