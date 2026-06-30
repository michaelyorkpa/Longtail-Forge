import { config } from "../config.js";
import { querySql, runSql, sqlInteger, sqlNullableText, sqlText } from "../db/index.js";
import { AppError } from "../utils/app-error.js";
import { normalizeSettings } from "../utils/normalizers.js";

const DEFAULT_WORKSPACE_NAME = config.bootstrap.initialWorkspaceName;

async function readWorkspaceSettings(workspaceId) {
  const rows = await querySql(`
SELECT
  workspaces.name AS workspace_name,
  workspaces.workspace_type,
  workspace_settings.fiscal_year_start_month,
  workspace_settings.fiscal_year_start_day,
  workspace_settings.default_billing_rate,
  workspace_settings.billing_period_type,
  workspace_settings.billing_period_start_day,
  workspace_settings.rounding_enabled,
  workspace_settings.rounding_increment,
  workspace_settings.audit_logging_enabled,
  workspace_settings.audit_retention_days,
  workspace_settings.audit_settings_updated_at,
  workspace_settings.task_timers_enabled
FROM workspaces
INNER JOIN workspace_settings ON workspace_settings.workspace_id = workspaces.workspace_id
WHERE workspaces.workspace_id = ${sqlText(workspaceId)}
LIMIT 1;
`);

  if (rows.length === 0) {
    return normalizeSettings({ workspaceName: DEFAULT_WORKSPACE_NAME });
  }

  return settingsRowToWorkspaceSettings(rows[0]);
}

async function saveWorkspaceSettings(workspaceId, settings) {
  const workspaces = await querySql(`
SELECT workspace_id
FROM workspaces
WHERE workspace_id = ${sqlText(workspaceId)}
LIMIT 1;
`);

  if (workspaces.length === 0) {
    throw new AppError("No workspace exists for workspace settings.", 404);
  }

  const now = new Date().toISOString();
  const savedSettings = normalizeWorkspaceTypeSettings(settings);

  await runSql(`
UPDATE workspaces
SET name = ${sqlText(savedSettings.workspaceName)},
    workspace_type = ${sqlText(savedSettings.workspaceType)},
    updated_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(workspaceId)};

UPDATE workspace_settings
SET
  fiscal_year_start_month = ${sqlInteger(savedSettings.fiscalYear.startMonth)},
  fiscal_year_start_day = ${sqlInteger(savedSettings.fiscalYear.startDay)},
  default_billing_rate = ${sqlNullableText(savedSettings.defaultBillingRate)},
  billing_period_type = ${sqlText(savedSettings.billingPeriod.type)},
  billing_period_start_day = ${sqlInteger(savedSettings.billingPeriod.startDay)},
  rounding_enabled = ${sqlInteger(savedSettings.billingRounding.enabled ? 1 : 0)},
  rounding_increment = ${sqlText(savedSettings.billingRounding.increment)},
  audit_logging_enabled = ${sqlInteger(savedSettings.audit.loggingEnabled ? 1 : 0)},
  audit_retention_days = ${sqlInteger(savedSettings.audit.retentionDays)},
  audit_settings_updated_at = ${sqlText(now)},
  task_timers_enabled = ${sqlInteger(savedSettings.taskTimersEnabled === false ? 0 : 1)},
  updated_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(workspaceId)};
`);
}

function normalizeWorkspaceTypeSettings(settings) {
  if (settings.workspaceType === "business") {
    return settings;
  }

  return {
    ...settings,
    fiscalYear: { startMonth: 1, startDay: 1 },
    defaultBillingRate: null,
  };
}

function settingsRowToWorkspaceSettings(row) {
  return normalizeSettings({
    workspaceName: row.workspace_name,
    workspaceType: row.workspace_type,
    fiscalYear: {
      startMonth: row.fiscal_year_start_month,
      startDay: row.fiscal_year_start_day,
    },
    defaultBillingRate: row.default_billing_rate,
    billingPeriod: {
      type: row.billing_period_type,
      startDay: row.billing_period_start_day,
    },
    billingRounding: {
      enabled: Number(row.rounding_enabled) === 1,
      increment: row.rounding_increment,
    },
    audit: {
      loggingEnabled: row.audit_logging_enabled === undefined
        ? true
        : Number(row.audit_logging_enabled) === 1,
      retentionDays: row.audit_retention_days,
    },
    taskTimersEnabled: row.task_timers_enabled === undefined
      ? true
      : Number(row.task_timers_enabled) === 1,
  });
}

export const settingsRepository = {
  readWorkspaceSettings,
  saveWorkspaceSettings,
};
