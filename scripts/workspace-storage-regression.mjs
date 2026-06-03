import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-workspace-storage-regression-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-workspace-storage-test.db");
process.env.SUPER_ADMIN_PASSWORD = "Workspace-Storage-Test-Password-123!";

const { initializeDatabase, querySql, sqlText } = await import("../src/db/index.js");
const { settingsRepository } = await import("../src/repositories/settings.repo.js");
const { clientsRepository } = await import("../src/repositories/clients.repo.js");
const { projectsRepository } = await import("../src/repositories/projects.repo.js");
const { timeEntriesRepository } = await import("../src/repositories/time-entries.repo.js");
const { auditLogsRepository } = await import("../src/repositories/audit-logs.repo.js");
const { apiKeysRepository } = await import("../src/repositories/api-keys.repo.js");
const { modulesService } = await import("../src/core/modules/modules.service.js");

try {
  await initializeDatabase();
  await assertLegacyTablesRemoved();
  const workspaceId = await readDefaultWorkspaceId();
  const userId = await readDefaultUserId(workspaceId);

  await settingsRepository.saveWorkspaceSettings(workspaceId, {
    workspaceName: "Workspace Storage Regression",
    workspaceType: "family",
    fiscalYear: { startMonth: 4, startDay: 15 },
    defaultBillingRate: "125",
    billingPeriod: { type: "monthly", startDay: 7 },
    billingRounding: { enabled: true, increment: "nearestQuarterHour" },
    audit: { loggingEnabled: true, retentionDays: 45 },
  });

  const clientId = `storage-client-${randomUUID()}`;
  const projectId = `storage-project-${randomUUID()}`;
  const entryId = `storage-entry-${randomUUID()}`;

  await clientsRepository.create(workspaceId, {
    id: clientId,
    name: "Workspace Storage Client",
    status: "Active",
    billable: "yes",
  });
  await projectsRepository.create(workspaceId, clientId, {
    id: projectId,
    name: "Workspace Storage Project",
    status: "Active",
    billable: "yes",
  });
  await timeEntriesRepository.create({
    entry_id: entryId,
    workspace_id: workspaceId,
    user_id: userId,
    client_id: clientId,
    client_name: "Workspace Storage Client",
    project_id: projectId,
    project_name: "Workspace Storage Project",
    description: "Workspace storage regression entry",
    start_time: "2026-06-02T12:00:00.000Z",
    end_time: "2026-06-02T13:00:00.000Z",
    duration_seconds: 3600,
    duration_hours: "1.00",
    billable: "yes",
    invoice_status: "unbilled",
  });
  await auditLogsRepository.create({
    audit_id: `storage-audit-${randomUUID()}`,
    workspace_id: workspaceId,
    created_at: new Date().toISOString(),
    actor_user_id: userId,
    actor_user_name: "workspace storage test",
    action: "workspace_storage_regression_created",
    change_type: "test",
    record_type: "workspace",
    record_id: entryId,
    record_label: "Workspace storage regression",
  });
  await apiKeysRepository.create({
    workspaceId,
    createdByUserId: userId,
    name: "Workspace storage regression key",
    keyHash: `storage-hash-${randomUUID()}`,
    keyPrefix: "ltf_test",
    scopes: ["clients:read"],
  });
  await modulesService.syncModuleRegistry(workspaceId);

  await assertWorkspaceRows(workspaceId);
  console.log("Workspace storage regression passed.");
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function readDefaultWorkspaceId() {
  const rows = await querySql("SELECT workspace_id FROM workspaces ORDER BY created_at LIMIT 1;");
  assert.ok(rows[0]?.workspace_id, "expected initialized default workspace");
  return rows[0].workspace_id;
}

async function readDefaultUserId(workspaceId) {
  const rows = await querySql(`
SELECT user_id
FROM users
WHERE home_workspace_id = ${sqlText(workspaceId)}
ORDER BY protected_user DESC, username
LIMIT 1;
`);
  assert.ok(rows[0]?.user_id, "expected initialized default user");
  return rows[0].user_id;
}

async function assertLegacyTablesRemoved() {
  const rows = await querySql(`
SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND name IN ('organizations', 'organization_settings', 'organization_modules');
`);
  assert.equal(rows.length, 0, "legacy organization tables should not exist after workspace migration");
}

async function assertWorkspaceRows(workspaceId) {
  const checks = [
    ["workspaces", "workspace_id"],
    ["workspace_settings", "workspace_id"],
    ["clients", "workspace_id"],
    ["projects", "workspace_id"],
    ["time_entries", "workspace_id"],
    ["audit_logs", "workspace_id"],
    ["api_keys", "workspace_id"],
    ["user_role_assignments", "workspace_id"],
    ["workspace_modules", "workspace_id"],
  ];

  for (const [tableName, columnName] of checks) {
    const rows = await querySql(`
SELECT ${columnName}
FROM ${tableName}
WHERE ${columnName} = ${sqlText(workspaceId)}
LIMIT 1;
`);
    assert.equal(rows.length, 1, `${tableName} should contain workspace-keyed data`);
  }
}
