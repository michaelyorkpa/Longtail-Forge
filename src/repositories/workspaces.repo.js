import { randomUUID } from "node:crypto";
import { modulesService } from "../core/modules/modules.service.js";
import { querySql, runSql, sqlInteger, sqlText } from "../db/index.js";
import { normalizeSettings } from "../utils/normalizers.js";
import { normalizeWorkspaceType } from "../utils/workspaces.js";

async function readForUser(userId) {
  return querySql(`
SELECT
  organizations.id AS workspace_id,
  organizations.name AS workspace_name,
  organizations.workspace_type,
  user_workspaces.status
FROM user_workspaces
INNER JOIN organizations ON organizations.id = user_workspaces.workspace_id
WHERE user_workspaces.user_id = ${sqlText(userId)}
ORDER BY organizations.name;
`);
}

async function countUserWorkspacesByType(userId, workspaceType) {
  const rows = await querySql(`
SELECT COUNT(1) AS count
FROM user_workspaces
INNER JOIN organizations ON organizations.id = user_workspaces.workspace_id
WHERE user_workspaces.user_id = ${sqlText(userId)}
  AND user_workspaces.status = 'active'
  AND organizations.workspace_type = ${sqlText(normalizeWorkspaceType(workspaceType))};
`);

  return Number(rows[0]?.count) || 0;
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
INSERT INTO organizations (
  id,
  name,
  status,
  created_at,
  updated_at,
  owner_user_id,
  workspace_type
)
VALUES (
  ${sqlText(workspaceId)},
  ${sqlText(normalizedSettings.workspaceName)},
  'Active',
  ${sqlText(now)},
  ${sqlText(now)},
  ${sqlText(ownerUser.user_id)},
  ${sqlText(normalizedType)}
);
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
INSERT INTO organization_settings (
  organization_id,
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
INSERT INTO users (
  user_id,
  organization_id,
  username,
  display_name,
  alt_email,
  timezone,
  password,
  theme_mode,
  user_status,
  protected_user
)
VALUES (
  ${sqlText(ownerUser.user_id)},
  ${sqlText(workspaceId)},
  ${sqlText(ownerUser.username)},
  ${sqlText(ownerUser.display_name || ownerUser.username)},
  ${ownerUser.alt_email ? sqlText(ownerUser.alt_email) : "NULL"},
  ${sqlText(ownerUser.timezone || "America/New_York")},
  ${sqlText(ownerUser.password)},
  ${sqlText(ownerUser.theme_mode || "light")},
  ${sqlText(ownerUser.user_status || "active")},
  ${sqlText(ownerUser.protected_user || "no")}
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
  organization_id,
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
  ${sqlText(workspaceId)},
  ${sqlText(ownerUser.user_id)},
  'organization_admin',
  'organization',
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
  readForUser,
};
