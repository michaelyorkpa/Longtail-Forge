import { config } from "../config.js";
import { db } from "../core/database.js";
import { AppError } from "../utils/app-error.js";
import { normalizeSettings } from "../utils/normalizers.js";

const DEFAULT_WORKSPACE_NAME = config.bootstrap.initialWorkspaceName;
const MODULE_SETTING_UPSERT_SQL = `${db.dialect.conflict.buildInsertOnConflictDoUpdate({
  columns: [
    "workspace_id",
    "module_id",
    "setting_id",
    "setting_value_json",
    "created_at",
    "updated_at",
  ],
  conflictColumns: ["workspace_id", "module_id", "setting_id"],
  tableName: "workspace_module_settings",
  updateColumns: ["setting_value_json", "updated_at"],
  valueExpressions: {
    created_at: ":createdAt",
    module_id: ":moduleId",
    setting_id: ":settingId",
    setting_value_json: ":settingValueJson",
    updated_at: ":updatedAt",
    workspace_id: ":workspaceId",
  },
})};`;

async function readWorkspaceSettings(workspaceId) {
  const row = await db.get(`
SELECT
  workspaces.name AS workspace_name,
  workspaces.workspace_type,
  workspace_settings.audit_logging_enabled,
  workspace_settings.audit_retention_days,
  workspace_settings.audit_settings_updated_at
FROM workspaces
INNER JOIN workspace_settings ON workspace_settings.workspace_id = workspaces.workspace_id
WHERE workspaces.workspace_id = :workspaceId
LIMIT 1;
`, { workspaceId });

  if (!row) {
    return normalizeSettings({ workspaceName: DEFAULT_WORKSPACE_NAME });
  }

  return settingsRowToWorkspaceSettings(row);
}

async function saveWorkspaceSettings(workspaceId, settings) {
  const workspace = await db.get(`
SELECT workspace_id, workspace_type
FROM workspaces
WHERE workspace_id = :workspaceId
LIMIT 1;
`, { workspaceId });

  if (!workspace) {
    throw new AppError("No workspace exists for workspace settings.", 404);
  }

  const now = new Date().toISOString();
  const savedSettings = normalizeSettings(settings);
  if (savedSettings.workspaceType !== workspace.workspace_type) {
    throw new AppError("Workspace type cannot be changed after creation.", 400);
  }
  const booleanParams = db.dialect.boolean.bindFields({
    auditLoggingEnabled: savedSettings.audit.loggingEnabled,
  }, [
    "auditLoggingEnabled",
  ]);

  await db.transaction(async (transaction) => {
    await transaction.run(`
UPDATE workspaces
SET name = :workspaceName,
    updated_at = :updatedAt
WHERE workspace_id = :workspaceId;
`, {
      updatedAt: now,
      workspaceId,
      workspaceName: savedSettings.workspaceName,
    });

    await transaction.run(`
UPDATE workspace_settings
SET
  audit_logging_enabled = :auditLoggingEnabled,
  audit_retention_days = :auditRetentionDays,
  audit_settings_updated_at = :updatedAt,
  updated_at = :updatedAt
WHERE workspace_id = :workspaceId;
`, {
      auditLoggingEnabled: booleanParams.auditLoggingEnabled,
      auditRetentionDays: savedSettings.audit.retentionDays,
      updatedAt: now,
      workspaceId,
    });
  });
}

async function readModuleSetting(workspaceId, moduleId, settingId) {
  return db.get(`
SELECT
  setting_value_json,
  created_at,
  updated_at
FROM workspace_module_settings
WHERE workspace_id = :workspaceId
  AND module_id = :moduleId
  AND setting_id = :settingId
LIMIT 1;
`, {
    moduleId,
    settingId,
    workspaceId,
  });
}

async function saveModuleSetting(workspaceId, moduleId, settingId, value) {
  const workspace = await db.get(`
SELECT workspace_id
FROM workspaces
WHERE workspace_id = :workspaceId
LIMIT 1;
`, { workspaceId });

  if (!workspace) {
    throw new AppError("No workspace exists for module settings.", 404);
  }

  const now = new Date().toISOString();
  await db.run(MODULE_SETTING_UPSERT_SQL, {
    createdAt: now,
    moduleId,
    settingId,
    settingValueJson: JSON.stringify(value),
    updatedAt: now,
    workspaceId,
  });
}

function settingsRowToWorkspaceSettings(row) {
  const booleanRow = db.dialect.boolean.readFields(row, [
    "audit_logging_enabled",
  ], {
    fallbacks: {
      audit_logging_enabled: true,
    },
  });

  return normalizeSettings({
    workspaceName: booleanRow.workspace_name,
    workspaceType: booleanRow.workspace_type,
    audit: {
      loggingEnabled: booleanRow.audit_logging_enabled === true,
      retentionDays: booleanRow.audit_retention_days,
    },
  });
}

export const settingsRepository = {
  readModuleSetting,
  readWorkspaceSettings,
  saveModuleSetting,
  saveWorkspaceSettings,
};
