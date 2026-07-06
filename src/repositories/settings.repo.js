import { config } from "../config.js";
import { db } from "../core/database.js";
import { AppError } from "../utils/app-error.js";
import { normalizeSettings } from "../utils/normalizers.js";

const DEFAULT_WORKSPACE_NAME = config.bootstrap.initialWorkspaceName;

async function readWorkspaceSettings(workspaceId) {
  const row = await db.get(`
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
SELECT workspace_id
FROM workspaces
WHERE workspace_id = :workspaceId
LIMIT 1;
`, { workspaceId });

  if (!workspace) {
    throw new AppError("No workspace exists for workspace settings.", 404);
  }

  const now = new Date().toISOString();
  const savedSettings = normalizeWorkspaceTypeSettings(settings);
  const booleanParams = db.dialect.boolean.bindFields({
    auditLoggingEnabled: savedSettings.audit.loggingEnabled,
    roundingEnabled: savedSettings.billingRounding.enabled,
    taskTimersEnabled: savedSettings.taskTimersEnabled !== false,
  }, [
    "auditLoggingEnabled",
    "roundingEnabled",
    "taskTimersEnabled",
  ]);

  await db.transaction(async (transaction) => {
    await transaction.run(`
UPDATE workspaces
SET name = :workspaceName,
    workspace_type = :workspaceType,
    updated_at = :updatedAt
WHERE workspace_id = :workspaceId;
`, {
      updatedAt: now,
      workspaceId,
      workspaceName: savedSettings.workspaceName,
      workspaceType: savedSettings.workspaceType,
    });

    await transaction.run(`
UPDATE workspace_settings
SET
  fiscal_year_start_month = :fiscalYearStartMonth,
  fiscal_year_start_day = :fiscalYearStartDay,
  default_billing_rate = :defaultBillingRate,
  billing_period_type = :billingPeriodType,
  billing_period_start_day = :billingPeriodStartDay,
  rounding_enabled = :roundingEnabled,
  rounding_increment = :roundingIncrement,
  audit_logging_enabled = :auditLoggingEnabled,
  audit_retention_days = :auditRetentionDays,
  audit_settings_updated_at = :updatedAt,
  task_timers_enabled = :taskTimersEnabled,
  updated_at = :updatedAt
WHERE workspace_id = :workspaceId;
`, {
      auditLoggingEnabled: booleanParams.auditLoggingEnabled,
      auditRetentionDays: savedSettings.audit.retentionDays,
      billingPeriodStartDay: savedSettings.billingPeriod.startDay,
      billingPeriodType: savedSettings.billingPeriod.type,
      defaultBillingRate: savedSettings.defaultBillingRate,
      fiscalYearStartDay: savedSettings.fiscalYear.startDay,
      fiscalYearStartMonth: savedSettings.fiscalYear.startMonth,
      roundingEnabled: booleanParams.roundingEnabled,
      roundingIncrement: savedSettings.billingRounding.increment,
      taskTimersEnabled: booleanParams.taskTimersEnabled,
      updatedAt: now,
      workspaceId,
    });
  });
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
  const booleanRow = db.dialect.boolean.readFields(row, [
    "audit_logging_enabled",
    "rounding_enabled",
    "task_timers_enabled",
  ], {
    fallbacks: {
      audit_logging_enabled: true,
      task_timers_enabled: true,
    },
  });

  return normalizeSettings({
    workspaceName: booleanRow.workspace_name,
    workspaceType: booleanRow.workspace_type,
    fiscalYear: {
      startMonth: booleanRow.fiscal_year_start_month,
      startDay: booleanRow.fiscal_year_start_day,
    },
    defaultBillingRate: booleanRow.default_billing_rate,
    billingPeriod: {
      type: booleanRow.billing_period_type,
      startDay: booleanRow.billing_period_start_day,
    },
    billingRounding: {
      enabled: booleanRow.rounding_enabled === true,
      increment: booleanRow.rounding_increment,
    },
    audit: {
      loggingEnabled: booleanRow.audit_logging_enabled === true,
      retentionDays: booleanRow.audit_retention_days,
    },
    taskTimersEnabled: booleanRow.task_timers_enabled === true,
  });
}

export const settingsRepository = {
  readWorkspaceSettings,
  saveWorkspaceSettings,
};
