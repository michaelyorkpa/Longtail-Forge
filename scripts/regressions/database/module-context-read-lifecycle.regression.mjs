export const regressionMeta = Object.freeze({
  id: "database.module-context-read-lifecycle",
  area: "database",
  tier: "focused",
  tags: ["lifecycle", "modules", "performance", "workspace"],
  description: "Proves module-context reads perform zero writes, workspace module rows are ensured by the startup and workspace-creation lifecycle, enable/disable stays immediately visible through the context cache, and repeated request-scoped settings reads hit the memo.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-module-context-read-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "module-context-read.db");
process.env.SUPER_ADMIN_PASSWORD = "Module-Context-Read-Test-123!";

const modulesSource = readFileSync(path.join(root, "src/core/modules/modules.service.js"), "utf8");
const startupSource = readFileSync(path.join(root, "src/db/app-startup-maintenance.js"), "utf8");

const { closeDatabase, db, initializeDatabase } = await import("../../../src/db/index.js");
const { modulesService } = await import("../../../src/core/modules/modules.service.js");
const { settingsRepository } = await import("../../../src/repositories/settings.repo.js");
const { workbenchService } = await import("../../../src/services/workbench.service.js");

async function totalChanges() {
  const row = await db.get("SELECT total_changes() AS total;");
  return Number(row.total);
}

try {
  // Lifecycle ownership: row-ensuring runs at startup and workspace
  // creation/module install, never inside the context read path.
  assert.match(startupSource, /app\.ensure-workspace-module-rows/, "startup should ensure module rows for every existing workspace");
  assert.match(modulesSource, /function loadWorkspaceModuleContext/, "module context should build from a cached pure read");
  assert.doesNotMatch(
    modulesSource.slice(modulesSource.indexOf("function readWorkspaceModuleContext"), modulesSource.indexOf("function invalidateWorkspaceModuleContext")),
    /ensureWorkspaceModuleRows/,
    "readWorkspaceModuleContext must not ensure rows",
  );

  // Fresh install: startup creates the default workspace with its module rows.
  await initializeDatabase();
  const workspace = await db.get("SELECT workspace_id FROM workspaces ORDER BY created_at LIMIT 1;");
  const workspaceId = workspace.workspace_id;
  const moduleRowCount = await db.get(
    "SELECT COUNT(*) AS row_count FROM workspace_modules WHERE workspace_id = :workspaceId;",
    { workspaceId },
  );
  assert.ok(moduleRowCount.row_count >= modulesService.listModules().length, "fresh install should persist a row per registered module");
  assert.equal(await modulesService.readModuleStatus(workspaceId, "tasks"), "enabled", "default-enabled modules should read enabled on a fresh install");

  const user = await db.get("SELECT user_id, username FROM users WHERE protected_user = 'yes' LIMIT 1;");
  const session = {
    user_id: user.user_id,
    username: user.username,
    workspace_id: workspaceId,
  };

  // Zero-write proof: module-context reads, contribution lists, decorated
  // settings, and the workbench bootstrap registry reads change no rows.
  const changesBefore = await totalChanges();
  const moduleContext = await modulesService.readWorkspaceModuleContext(workspaceId);
  await modulesService.readModuleStatus(workspaceId, "notes");
  await modulesService.readEnabledModuleIds(workspaceId);
  await modulesService.listWorkbenchCards(workspaceId, session);
  await modulesService.listTimerSources(workspaceId, session);
  await modulesService.listWorkItemSources(workspaceId, session);
  await modulesService.listModuleNavigation(workspaceId, session);
  await modulesService.listAvailableApiScopes(workspaceId);
  await modulesService.decorateWorkspaceSettings(
    await settingsRepository.readWorkspaceSettings(workspaceId),
    workspaceId,
  );
  await workbenchService.bootstrap(session);
  assert.equal(await totalChanges(), changesBefore, "module-context reads must not write any rows");

  // Cache behavior: repeated reads reuse the cached context object.
  const repeatContext = await modulesService.readWorkspaceModuleContext(workspaceId);
  assert.equal(repeatContext, moduleContext, "repeated context reads should hit the per-workspace cache");

  // Enable/disable visibility: status changes invalidate the cache immediately.
  await modulesService.setModuleStatus(workspaceId, "notes", false, { session });
  assert.equal(await modulesService.readModuleStatus(workspaceId, "notes"), "disabled", "disable should be visible immediately");
  const disabledContext = await modulesService.readWorkspaceModuleContext(workspaceId);
  assert.notEqual(disabledContext, moduleContext, "status changes must produce a fresh context");
  assert.equal(disabledContext.moduleStatusById.notes, "disabled");
  assert.equal(disabledContext.enabledModules.includes("notes"), false);

  await modulesService.setModuleStatus(workspaceId, "notes", true, { session });
  assert.equal(await modulesService.readModuleStatus(workspaceId, "notes"), "enabled", "re-enable should be visible immediately");

  // Out-of-band writes (another process, direct SQL) are still observed.
  await db.run(`
UPDATE workspace_modules
SET status = 'disabled'
WHERE workspace_id = :workspaceId
  AND module_id = 'notes';
`, { workspaceId });
  assert.equal(await modulesService.readModuleStatus(workspaceId, "notes"), "disabled", "direct row updates must be observed without service invalidation");
  await modulesService.setModuleStatus(workspaceId, "notes", true, { session });

  // Required modules cannot be disabled and always read enabled.
  const requiredModule = modulesService.listModules().find((moduleDefinition) => moduleDefinition.canDisable === false);
  assert.ok(requiredModule, "a required core module should exist");
  await assert.rejects(
    modulesService.setModuleStatus(workspaceId, requiredModule.id, false, { session }),
    /cannot be disabled/,
  );
  assert.equal(await modulesService.readModuleStatus(workspaceId, requiredModule.id), "enabled");

  // Workspace creation ensures module rows at creation time.
  const { workspacesRepository } = await import("../../../src/repositories/workspaces.repo.js");
  const createdWorkspace = await workspacesRepository.createWorkspace({
    ownerUser: { user_id: user.user_id },
    workspaceName: "Module Context Created Workspace",
    workspaceType: "personal",
  });
  const createdRows = await db.get(
    "SELECT COUNT(*) AS row_count FROM workspace_modules WHERE workspace_id = :workspaceId;",
    { workspaceId: createdWorkspace.workspaceId },
  );
  assert.ok(createdRows.row_count > 0, "workspace creation should persist module rows");
  const createdChangesBefore = await totalChanges();
  await modulesService.readWorkspaceModuleContext(createdWorkspace.workspaceId);
  assert.equal(await totalChanges(), createdChangesBefore, "context reads for a created workspace must not write");

  // Request-scoped memo: repeated settings reads with the same session reuse
  // one read; sessionless reads stay fresh.
  const memoSession = { ...session };
  const firstSettings = await settingsRepository.readWorkspaceSettings(workspaceId, memoSession);
  const secondSettings = await settingsRepository.readWorkspaceSettings(workspaceId, memoSession);
  assert.equal(secondSettings, firstSettings, "same-session settings reads should hit the request memo");
  const freshSettings = await settingsRepository.readWorkspaceSettings(workspaceId);
  assert.notEqual(freshSettings, firstSettings, "sessionless settings reads should stay fresh");
  assert.deepEqual(freshSettings, firstSettings, "memoized and fresh settings must agree");

  const integrity = await db.query("PRAGMA integrity_check;");
  assert.equal(integrity[0]?.integrity_check, "ok", "module-context database should pass integrity check");

  console.log("module context read lifecycle regression passed.");
} finally {
  await closeDatabase();
  await fs.rm(tempDir, { force: true, recursive: true });
}
