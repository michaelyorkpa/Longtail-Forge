import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-legacy-cleanup-regression-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-legacy-cleanup-test.db");
process.env.SUPER_ADMIN_PASSWORD = "Legacy-Cleanup-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql, sqlText } = await import("../src/db/index.js");
const { settingsService } = await import("../src/services/settings.service.js");
const { staticService } = await import("../src/services/static.service.js");

let checks = 0;

try {
  await initializeDatabase();
  await assertLegacyTablesRemoved();
  await assertLegacyStaticPagesRemoved();
  await assertSettingsRejectLegacyAliases();
  await assertActiveSourceHasNoLegacyOrganizationSurface();
  console.log(`Legacy cleanup regression passed ${checks} checks.`);
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertLegacyTablesRemoved() {
  const rows = await querySql(`
SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND name IN (
    'organizations',
    'organization_settings',
    'organization_modules',
    'active_timers',
    'active_task_timers'
  );
`);
  assert.deepEqual(rows, [], "legacy organization and active timer tables should not exist");
  checks += 1;
}

async function assertLegacyStaticPagesRemoved() {
  const workspaceId = await readDefaultWorkspaceId();
  const userId = await readDefaultUserId(workspaceId);
  const session = { workspace_id: workspaceId, user_id: userId, username: "legacy-cleanup", timezone: "America/New_York" };
  const organizationSettings = await staticService.read("/organization-settings.html", session);
  const clientsProjects = await staticService.read("/clients-projects.html", session);

  assert.equal(organizationSettings.statusCode, 404, "organization-settings.html should not be served");
  assert.equal(clientsProjects.statusCode, 404, "clients-projects.html should not be served");
  checks += 1;
}

async function assertSettingsRejectLegacyAliases() {
  const workspaceId = await readDefaultWorkspaceId();
  const user = await readDefaultUser(workspaceId);
  const session = {
    workspace_id: workspaceId,
    user_id: user.user_id,
    username: user.username,
    timezone: user.timezone || "America/New_York",
  };
  const settings = await settingsService.read(session);

  await assert.rejects(
    () => settingsService.save({
      workspaceName: settings.workspaceName,
      workspaceType: settings.workspaceType,
      timeTrackingEnabled: false,
    }, session),
    /Use moduleSettings for module setting 'timeTrackingEnabled'\./,
  );

  await settingsService.save({
    workspaceName: settings.workspaceName,
    workspaceType: settings.workspaceType,
    fiscalYear: settings.fiscalYear,
    defaultBillingRate: settings.defaultBillingRate,
    billingPeriod: settings.billingPeriod,
    billingRounding: settings.billingRounding,
    audit: settings.audit,
    taskReminderDefaults: settings.taskReminderDefaults,
    moduleSettings: {
      "time-tracking": {
        timeTrackingEnabled: settings.timeTrackingEnabled,
      },
      tasks: {
        tasksEnabled: settings.tasksEnabled,
        taskTimersEnabled: settings.taskTimersEnabled,
      },
    },
  }, session);
  checks += 1;
}

async function assertActiveSourceHasNoLegacyOrganizationSurface() {
  const files = await listFiles(process.cwd(), {
    includeExtensions: new Set([".js", ".mjs", ".html", ".md"]),
    skipDirs: new Set([".git", "data", "logs", "node_modules"]),
  });
  const allowedPatterns = [
    /(^|[\\/])CHANGELOG\.md$/,
    /(^|[\\/])DECISIONS\.md$/,
    /(^|[\\/])ROADMAP\.md$/,
    /(^|[\\/])ROADMAP-ARCHIVE\.md$/,
    /(^|[\\/])TODO\.md$/,
    /(^|[\\/])LICENSE$/,
    /(^|[\\/])archive[\\/]/,
    /(^|[\\/])docs[\\/]storage-rename-plan\.md$/,
    /(^|[\\/])src[\\/]db[\\/]migrations\.js$/,
    /(^|[\\/])scripts[\\/]legacy-cleanup-regression\.mjs$/,
    /(^|[\\/])scripts[\\/]workspace-storage-regression\.mjs$/,
  ];
  const forbidden = [];
  const legacyPattern = /\borganizations?\b|organization_id|organization_settings|organization_modules|organization-settings\.html/i;

  for (const filePath of files) {
    const normalizedPath = filePath.replaceAll(path.sep, "/");

    if (allowedPatterns.some((pattern) => pattern.test(normalizedPath))) {
      continue;
    }

    const contents = await fs.readFile(filePath, "utf8");
    if (legacyPattern.test(contents)) {
      forbidden.push(path.relative(process.cwd(), filePath));
    }
  }

  assert.deepEqual(forbidden.sort(), [], `active source should not contain legacy organization surfaces: ${forbidden.join(", ")}`);
  checks += 1;
}

async function readDefaultWorkspaceId() {
  const rows = await querySql("SELECT workspace_id FROM workspaces ORDER BY created_at LIMIT 1;");
  assert.ok(rows[0]?.workspace_id, "expected initialized default workspace");
  return rows[0].workspace_id;
}

async function readDefaultUserId(workspaceId) {
  const user = await readDefaultUser(workspaceId);
  return user.user_id;
}

async function readDefaultUser(workspaceId) {
  const rows = await querySql(`
SELECT user_id, username, timezone
FROM users
WHERE home_workspace_id = ${sqlText(workspaceId)}
ORDER BY protected_user DESC, username
LIMIT 1;
`);
  assert.ok(rows[0]?.user_id, "expected initialized default user");
  return rows[0];
}

async function listFiles(root, options) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      if (!options.skipDirs.has(entry.name)) {
        files.push(...await listFiles(entryPath, options));
      }
      continue;
    }

    if (entry.isFile() && options.includeExtensions.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
}
