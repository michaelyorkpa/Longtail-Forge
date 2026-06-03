import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-storage-alias-regression-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-storage-alias-test.db");
process.env.SUPER_ADMIN_PASSWORD = "Storage-Alias-Test-Password-123!";

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
  const workspaceId = await readDefaultWorkspaceId();
  const userId = await readDefaultUserId(workspaceId);

  await assertWorkspaceTablesSynchronized("initial bootstrap", workspaceId);

  await settingsRepository.saveOrganizationSettings(workspaceId, {
    organizationName: "Storage Alias Workspace",
    workspaceName: "Storage Alias Workspace",
    workspaceType: "family",
    fiscalYear: { startMonth: 4, startDay: 15 },
    defaultBillingRate: "125",
    billingPeriod: { type: "monthly", startDay: 7 },
    billingRounding: { enabled: true, increment: "nearestQuarterHour" },
    audit: { loggingEnabled: true, retentionDays: 45 },
  });
  await assertWorkspaceTablesSynchronized("settings save", workspaceId);

  const clientId = `storage-client-${randomUUID()}`;
  const projectId = `storage-project-${randomUUID()}`;
  const entryId = `storage-entry-${randomUUID()}`;

  await clientsRepository.create(workspaceId, {
    id: clientId,
    name: "Storage Alias Client",
    status: "Active",
    billable: "yes",
  });
  await projectsRepository.create(workspaceId, clientId, {
    id: projectId,
    name: "Storage Alias Project",
    status: "Active",
    billable: "yes",
  });
  await timeEntriesRepository.create({
    entry_id: entryId,
    organization_id: workspaceId,
    user_id: userId,
    client_id: clientId,
    client_name: "Storage Alias Client",
    project_id: projectId,
    project_name: "Storage Alias Project",
    description: "Storage alias regression entry",
    start_time: "2026-06-02T12:00:00.000Z",
    end_time: "2026-06-02T13:00:00.000Z",
    duration_seconds: 3600,
    duration_hours: "1.00",
    billable: "yes",
    invoice_status: "Uninvoiced",
  });
  await auditLogsRepository.create({
    audit_id: `storage-audit-${randomUUID()}`,
    organization_id: workspaceId,
    created_at: new Date().toISOString(),
    actor_user_id: userId,
    actor_user_name: "storage alias test",
    action: "storage_alias_regression_created",
    change_type: "test",
    record_type: "storage_alias",
    record_id: entryId,
    record_label: "Storage alias regression",
  });
  await apiKeysRepository.create({
    organizationId: workspaceId,
    createdByUserId: userId,
    name: "Storage alias regression key",
    keyHash: `storage-hash-${randomUUID()}`,
    keyPrefix: "ltf_test",
    scopes: ["clients:read"],
  });
  await modulesService.syncModuleRegistry(workspaceId);

  await assertScopedAliasColumnsSynchronized(workspaceId);
  console.log("Storage alias regression passed.");
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function readDefaultWorkspaceId() {
  const rows = await querySql("SELECT id FROM organizations ORDER BY created_at LIMIT 1;");
  assert.ok(rows[0]?.id, "expected initialized default workspace");
  return rows[0].id;
}

async function readDefaultUserId(workspaceId) {
  const rows = await querySql(`
SELECT user_id
FROM users
WHERE organization_id = ${sqlText(workspaceId)}
ORDER BY protected_user DESC, username
LIMIT 1;
`);
  assert.ok(rows[0]?.user_id, "expected initialized default user");
  return rows[0].user_id;
}

async function assertWorkspaceTablesSynchronized(label, workspaceId) {
  const workspaceMismatches = await querySql(`
SELECT organizations.id
FROM organizations
LEFT JOIN workspaces ON workspaces.workspace_id = organizations.id
WHERE organizations.id = ${sqlText(workspaceId)}
  AND (
    workspaces.workspace_id IS NULL
    OR workspaces.name != organizations.name
    OR workspaces.status != organizations.status
    OR workspaces.workspace_type != organizations.workspace_type
    OR COALESCE(workspaces.owner_user_id, '') != COALESCE(organizations.owner_user_id, '')
  );
`);
  assert.equal(workspaceMismatches.length, 0, `${label}: workspaces must mirror organizations`);

  const settingsMismatches = await querySql(`
SELECT organization_settings.organization_id
FROM organization_settings
LEFT JOIN workspace_settings ON workspace_settings.workspace_id = organization_settings.organization_id
WHERE organization_settings.organization_id = ${sqlText(workspaceId)}
  AND (
    workspace_settings.workspace_id IS NULL
    OR workspace_settings.fiscal_year_start_month != organization_settings.fiscal_year_start_month
    OR workspace_settings.fiscal_year_start_day != organization_settings.fiscal_year_start_day
    OR workspace_settings.default_billing_rate != organization_settings.default_billing_rate
    OR workspace_settings.billing_period_type != organization_settings.billing_period_type
    OR workspace_settings.billing_period_start_day != organization_settings.billing_period_start_day
    OR workspace_settings.rounding_enabled != organization_settings.rounding_enabled
    OR workspace_settings.rounding_increment != organization_settings.rounding_increment
    OR workspace_settings.audit_logging_enabled != organization_settings.audit_logging_enabled
    OR workspace_settings.audit_retention_days != organization_settings.audit_retention_days
  );
`);
  assert.equal(settingsMismatches.length, 0, `${label}: workspace_settings must mirror organization_settings`);
}

async function assertScopedAliasColumnsSynchronized(workspaceId) {
  const checks = [
    ["clients", "organization_id", "workspace_id"],
    ["projects", "organization_id", "workspace_id"],
    ["time_entries", "organization_id", "workspace_id"],
    ["audit_logs", "organization_id", "workspace_id"],
    ["api_keys", "organization_id", "workspace_id"],
    ["user_role_assignments", "organization_id", "workspace_id"],
    ["organization_modules", "organization_id", "workspace_id"],
  ];

  for (const [tableName, legacyColumn, workspaceColumn] of checks) {
    const rows = await runAliasMismatchQuery(tableName, legacyColumn, workspaceColumn, workspaceId);
    assert.equal(rows.length, 0, `${tableName}.${workspaceColumn} must mirror ${legacyColumn}`);
  }
}

async function runAliasMismatchQuery(tableName, legacyColumn, workspaceColumn, workspaceId) {
  return querySql(`
SELECT rowid
FROM ${tableName}
WHERE ${legacyColumn} = ${sqlText(workspaceId)}
  AND (${workspaceColumn} IS NULL OR ${workspaceColumn} != ${legacyColumn})
LIMIT 1;
`);
}
