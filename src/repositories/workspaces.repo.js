import { randomUUID } from "node:crypto";
import { modulesService } from "../core/modules/modules.service.js";
import { db, runSql, sqlInteger, sqlText } from "../core/database.js";
import { normalizeSettings } from "../utils/normalizers.js";
import { normalizeWorkspaceType } from "../utils/workspaces.js";

async function readForUser(userId) {
  return db.query(`
SELECT
  workspaces.workspace_id,
  workspaces.name AS workspace_name,
  workspaces.workspace_type,
  user_workspaces.status
FROM user_workspaces
INNER JOIN workspaces ON workspaces.workspace_id = user_workspaces.workspace_id
WHERE user_workspaces.user_id = :userId
ORDER BY workspaces.name;
`, { userId });
}

async function countUserWorkspacesByType(userId, workspaceType) {
  const row = await db.get(`
SELECT COUNT(1) AS count
FROM user_workspaces
INNER JOIN workspaces ON workspaces.workspace_id = user_workspaces.workspace_id
WHERE user_workspaces.user_id = :userId
  AND user_workspaces.status = 'active'
  AND workspaces.workspace_type = :workspaceType;
`, { userId, workspaceType: normalizeWorkspaceType(workspaceType) });

  return Number(row?.count) || 0;
}

async function readOwnedForUser(userId) {
  return db.query(`
SELECT
  workspace_id,
  name AS workspace_name,
  workspace_type
FROM workspaces
WHERE owner_user_id = :userId
ORDER BY name;
`, { userId });
}

async function readById(workspaceId) {
  return db.get(`
SELECT
  workspace_id,
  name AS workspace_name,
  workspace_type,
  owner_user_id
FROM workspaces
WHERE workspace_id = :workspaceId
LIMIT 1;
`, { workspaceId });
}

async function readOwnerTransferCandidate(workspaceId, previousOwnerUserId) {
  return db.get(`
SELECT
  users.user_id,
  users.username,
  user_workspaces.created_at AS membership_created_at
FROM user_workspaces
INNER JOIN users
  ON users.user_id = user_workspaces.user_id
  AND users.rowid = (
    SELECT MIN(user_rows.rowid)
    FROM users AS user_rows
    WHERE user_rows.user_id = user_workspaces.user_id
  )
INNER JOIN user_role_assignments
  ON user_role_assignments.user_id = user_workspaces.user_id
  AND user_role_assignments.workspace_id = user_workspaces.workspace_id
  AND user_role_assignments.role_id = 'workspace_admin'
WHERE user_workspaces.workspace_id = :workspaceId
  AND user_workspaces.status = 'active'
  AND users.user_status = 'active'
  AND user_workspaces.user_id <> :previousOwnerUserId
ORDER BY
  COALESCE(user_workspaces.created_at, '9999-12-31T23:59:59.999Z'),
  users.rowid,
  lower(users.username)
LIMIT 1;
`, { previousOwnerUserId, workspaceId });
}

async function updateOwner(workspaceId, ownerUserId) {
  const now = new Date().toISOString();

  await db.run(`
UPDATE workspaces
SET owner_user_id = :ownerUserId,
    updated_at = :updatedAt
WHERE workspace_id = :workspaceId;
`, { ownerUserId, updatedAt: now, workspaceId });
}

async function createWorkspace({ ownerUser, workspaceName, workspaceType }) {
  const workspaceId = randomUUID();
  const now = new Date().toISOString();
  const normalizedSettings = normalizeSettings({
    workspaceName,
    workspaceType,
  });
  const normalizedType = normalizeWorkspaceType(normalizedSettings.workspaceType);

  await runSql(`
BEGIN TRANSACTION;
INSERT INTO workspaces (
  workspace_id,
  name,
  status,
  workspace_type,
  owner_user_id,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(workspaceId)},
  ${sqlText(normalizedSettings.workspaceName)},
  'Active',
  ${sqlText(normalizedType)},
  ${sqlText(ownerUser.user_id)},
  ${sqlText(now)},
  ${sqlText(now)}
);
INSERT INTO workspace_settings (
  workspace_id,
  fiscal_year_start_month,
  fiscal_year_start_day,
  default_billing_rate,
  billing_period_type,
  billing_period_start_day,
  rounding_enabled,
  rounding_increment,
  audit_logging_enabled,
  audit_retention_days,
  audit_settings_updated_at,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(workspaceId)},
  ${sqlInteger(normalizedSettings.fiscalYear.startMonth)},
  ${sqlInteger(normalizedSettings.fiscalYear.startDay)},
  ${sqlText(normalizedSettings.defaultBillingRate)},
  ${sqlText(normalizedSettings.billingPeriod.type)},
  ${sqlInteger(normalizedSettings.billingPeriod.startDay)},
  ${sqlInteger(normalizedSettings.billingRounding.enabled ? 1 : 0)},
  ${sqlText(normalizedSettings.billingRounding.increment)},
  ${sqlInteger(normalizedSettings.audit.loggingEnabled ? 1 : 0)},
  ${sqlInteger(normalizedSettings.audit.retentionDays)},
  ${sqlText(now)},
  ${sqlText(now)},
  ${sqlText(now)}
);
INSERT INTO user_workspaces (
  user_workspace_id,
  user_id,
  workspace_id,
  status,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(ownerUser.user_id)},
  ${sqlText(workspaceId)},
  'active',
  ${sqlText(now)},
  ${sqlText(now)}
)
ON CONFLICT(user_id, workspace_id) DO UPDATE SET
  status = 'active',
  updated_at = excluded.updated_at;
INSERT INTO user_role_assignments (
  assignment_id,
  workspace_id,
  user_id,
  role_id,
  scope_type,
  scope_id,
  client_id,
  project_id,
  permission_overrides_json,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(workspaceId)},
  ${sqlText(ownerUser.user_id)},
  'workspace_admin',
  'workspace',
  ${sqlText(workspaceId)},
  NULL,
  NULL,
  NULL,
  ${sqlText(now)},
  ${sqlText(now)}
);
COMMIT;
`);

  await modulesService.syncModuleRegistry(workspaceId);
  return {
    workspaceId,
    workspaceName: normalizedSettings.workspaceName,
    workspaceType: normalizedType,
  };
}

export const workspacesRepository = {
  countUserWorkspacesByType,
  createWorkspace,
  readById,
  readForUser,
  readOwnedForUser,
  readOwnerTransferCandidate,
  updateOwner,
};
