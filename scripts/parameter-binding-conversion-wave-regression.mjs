import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.6.11b";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-parameter-binding-wave-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-binding-wave.db");
process.env.SUPER_ADMIN_PASSWORD = "Parameter-Binding-Wave-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const auditDocs = readText("docs/database-parameter-binding-audit.md");
const databaseDocs = readText("docs/database.md");
const regressionSuite = readText("scripts/regression-suite.mjs");
const convertedSources = new Map([
  ["app-settings.repo", readText("src/repositories/app-settings.repo.js")],
  ["permissions.repo", readText("src/repositories/permissions.repo.js")],
  ["settings.repo", readText("src/repositories/settings.repo.js")],
  ["user-workspaces.repo", readText("src/repositories/user-workspaces.repo.js")],
  ["users.repo", readText("src/repositories/users.repo.js")],
  ["workspaces.repo", readText("src/repositories/workspaces.repo.js")],
]);

const {
  closeDatabase,
  db,
  initializeDatabase,
  querySql,
} = await import("../src/db/index.js");
const { appSettingsRepository } = await import("../src/repositories/app-settings.repo.js");
const { permissionsRepository } = await import("../src/repositories/permissions.repo.js");
const { settingsRepository } = await import("../src/repositories/settings.repo.js");
const { userWorkspacesRepository } = await import("../src/repositories/user-workspaces.repo.js");
const { usersRepository } = await import("../src/repositories/users.repo.js");
const { workspacesRepository } = await import("../src/repositories/workspaces.repo.js");

try {
  assert.equal(packageJson.version, appVersion, "package.json should report the conversion-wave version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the conversion-wave version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the conversion-wave version");

  assertConvertedSourceShape();
  await assertConvertedRepositoriesRuntime();

  assert.match(auditDocs, /0\.33\.5\.23\.3 Conversion Wave/, "audit docs should record the conversion wave");
  assert.match(auditDocs, /The canonical Inventory table above now marks these six repositories as `Converted`/, "audit docs should point converted wave rows back to the canonical inventory");
  assert.match(auditDocs, /`sessions\.repo` is not part of this converted wave; it was already a bound-params pilot/, "audit docs should keep the sessions pilot separate from the converted wave");
  assert.doesNotMatch(auditDocs, /Converted wave rows in the current runtime audit/, "audit docs should not keep a divergent converted-wave sub-table");
  assertConvertedInventoryRows();
  assert.match(auditDocs, /Remaining runtime literal-helper invocations after the conversion wave: 1,499/, "audit docs should record the wave helper burndown");
  assert.match(auditDocs, /Remaining direct interpolated SQL operation sites after the conversion wave: 233/, "audit docs should record the wave operation-site burndown");
  assert.match(databaseDocs, /As of version 0\.33\.5\.23\.3[\s\S]*auth, workspace, permission, and settings repositories/, "database docs should record the converted wave");
  assert.match(databaseDocs, /As of version 0\.33\.5\.23\.4[\s\S]*SQL parameter-binding branch is closed/, "database docs should record the closeout boundary");
  assert.match(roadmap, /^Active cursor: `0\.33\.6`\. Completed `0\.33\.5\.29` is archived in `ROADMAP-ARCHIVE\.md`\./m, "live roadmap should record the archived 0.33.5.29 handoff");
  assert.match(roadmap, /^## Version 0\.33\.6 - Dashboard and Workbench Formalization as Project hub and work center/m, "live roadmap should advance after the completed database extraction contract and parameter-binding gap closeout branches");
  assert.match(changelog, /## Version 0\.33\.5\.23\.3 - [\s\S]*Converted the first parameter-binding wave/, "changelog should include the conversion-wave slice");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the parameter-binding closeout");
  assert.match(regressionSuite, /scripts\/parameter-binding-conversion-wave-regression\.mjs/, "regression suite should include conversion-wave coverage");

  const integrityRows = await querySql("PRAGMA integrity_check;");
  assert.equal(integrityRows[0]?.integrity_check, "ok", "conversion-wave database should pass integrity check");

  console.log("Parameter-binding conversion wave regression passed.");
} finally {
  await closeDatabase();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertConvertedSourceShape() {
  for (const [label, source] of convertedSources) {
    assert.doesNotMatch(
      source,
      /\bsqlText\b|\bsqlInteger\b|\bsqlNullableText\b|\bsqlNullableInteger\b|\bquerySql\b|\brunSql\b/,
      `${label} should use bound params instead of interpolation helpers`,
    );
    assert.match(source, /\bdb\.(?:query|get|run|transaction)\b/, `${label} should use the adapter db path`);
  }

  assert.match(convertedSources.get("users.repo"), /USER_REMOVAL_STATEMENTS[\s\S]*transaction\.run/, "user cleanup should be transaction-backed bound statements");
  assert.match(convertedSources.get("workspaces.repo"), /createWorkspace[\s\S]*db\.transaction/, "workspace creation should use adapter transactions");
  assert.match(convertedSources.get("permissions.repo"), /ensurePermissionContracts[\s\S]*db\.transaction/, "permission contract repair should use adapter transactions");
  assert.match(convertedSources.get("settings.repo"), /saveWorkspaceSettings[\s\S]*db\.transaction/, "settings save should use adapter transactions");
  assert.match(convertedSources.get("app-settings.repo"), /ensureDefaults[\s\S]*db\.transaction/, "app settings defaults should use adapter transactions");
}

function assertConvertedInventoryRows() {
  const convertedRows = [
    ["users.repo", 17, 17],
    ["workspaces.repo", 10, 10],
    ["permissions.repo", 8, 10],
    ["user-workspaces.repo", 6, 7],
    ["settings.repo", 4, 4],
    ["app-settings.repo", 2, 3],
  ];

  for (const [group, boundOperationSites, dbOperationSites] of convertedRows) {
    assert.match(
      auditDocs,
      new RegExp(`\\| ${escapeRegExp(group)} \\| Converted \\| 0 \\| 0 \\| ${boundOperationSites} \\| ${dbOperationSites} \\|`),
      `${group} should be marked Converted in the canonical audit inventory`,
    );
  }

  assert.match(
    auditDocs,
    /\| sessions\.repo \| Already bound \| 0 \| 0 \| 8 \| 8 \|/,
    "sessions.repo should be marked Already bound in the canonical audit inventory",
  );
}

async function assertConvertedRepositoriesRuntime() {
  await initializeDatabase();

  const workspace = await db.get("SELECT workspace_id FROM workspaces ORDER BY created_at LIMIT 1;");
  assert.ok(workspace?.workspace_id, "fresh database should create the default workspace");

  const hostileSuffix = `'; DROP TABLE users; -- ${randomUUID()}`;
  const username = `wave-${randomUUID()}-${hostileSuffix}`;
  const user = await usersRepository.create(workspace.workspace_id, {
    altEmail: `alt-${randomUUID()}@example.com`,
    displayName: `Display ${hostileSuffix}`,
    timezone: "America/New_York",
    username,
  }, `hash-${hostileSuffix}`);
  await userWorkspacesRepository.upsert({
    userId: user.user_id,
    workspaceId: workspace.workspace_id,
    status: "active",
  });

  const readUser = await usersRepository.readByUsername(username);
  assert.equal(readUser.user_id, user.user_id, "usersRepository should read SQL-like usernames through bound params");

  await usersRepository.updateProfile(workspace.workspace_id, user.user_id, {
    altEmail: "",
    displayName: `Updated ${hostileSuffix}`,
    timezone: "UTC",
    username,
  });
  await usersRepository.updateThemeMode(workspace.workspace_id, user.user_id, "dark");
  await usersRepository.updateOpenExternalLinksNewTab(workspace.workspace_id, user.user_id, true);

  const membership = await userWorkspacesRepository.readByUserAndWorkspace(user.user_id, workspace.workspace_id);
  assert.equal(membership.status, "active", "user workspace reads should stay scoped and bound");

  const settings = await settingsRepository.readWorkspaceSettings(workspace.workspace_id);
  await settingsRepository.saveWorkspaceSettings(workspace.workspace_id, {
    ...settings,
    workspaceName: `Workspace ${hostileSuffix}`,
  });
  const updatedSettings = await settingsRepository.readWorkspaceSettings(workspace.workspace_id);
  assert.equal(updatedSettings.workspaceName, `Workspace ${hostileSuffix}`, "settings save should preserve SQL-like workspace names");

  await permissionsRepository.replaceUserAssignments(workspace.workspace_id, user.user_id, [{
    role_id: "workspace_admin",
    scope_type: "workspace",
    scope_id: workspace.workspace_id,
  }]);
  const assignments = await permissionsRepository.readAssignmentsForUser(workspace.workspace_id, user.user_id);
  assert.equal(assignments.length, 1, "permission assignment replacement should preserve one bound assignment");
  assert.equal(assignments[0].role_id, "workspace_admin");

  const createdWorkspace = await workspacesRepository.createWorkspace({
    ownerUser: { user_id: user.user_id },
    workspaceName: `Owned ${hostileSuffix}`,
    workspaceType: "personal",
  });
  const ownedWorkspace = await workspacesRepository.readById(createdWorkspace.workspaceId);
  assert.equal(ownedWorkspace.workspace_name, `Owned ${hostileSuffix}`, "workspace creation should preserve SQL-like names");

  const defaultCreationPermission = await appSettingsRepository.readWorkspaceCreationPermission(`missing-${hostileSuffix}`);
  assert.deepEqual(defaultCreationPermission.allowedWorkspaceTypes, ["business", "personal", "family"], "missing app-setting permission reads should stay defaulted");

  const removableUsername = `remove-${randomUUID()}-${hostileSuffix}`;
  const removableUser = await usersRepository.create(workspace.workspace_id, {
    displayName: `Remove ${hostileSuffix}`,
    timezone: "America/New_York",
    username: removableUsername,
  }, `remove-hash-${hostileSuffix}`);
  await userWorkspacesRepository.upsert({
    userId: removableUser.user_id,
    workspaceId: workspace.workspace_id,
    status: "active",
  });
  await usersRepository.remove(workspace.workspace_id, removableUser.user_id);
  assert.equal(await usersRepository.readFirstByUserId(removableUser.user_id), null, "home-workspace user cleanup should delete the user record");

  const usersTable = await db.get("SELECT COUNT(1) AS count FROM users;");
  const workspacesTable = await db.get("SELECT COUNT(1) AS count FROM workspaces;");
  assert.ok(Number(usersTable.count) >= 1, "users table should survive SQL-like bound values");
  assert.ok(Number(workspacesTable.count) >= 1, "workspaces table should survive SQL-like bound values");
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
