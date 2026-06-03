import { settingsRepository } from "../repositories/settings.repo.js";
import { modulesService } from "../core/modules/modules.service.js";
import { auditService } from "./audit.service.js";
import { permissionsService } from "./permissions.service.js";
import { normalizeSettings } from "../utils/normalizers.js";

const TIME_TRACKING_MODULE_ID = "time-tracking";

async function read(session) {
  return modulesService.decorateWorkspaceSettings(
    await settingsRepository.readWorkspaceSettings(session.workspace_id),
    session.workspace_id,
  );
}

async function readWorkspaceBootstrap(session) {
  const settings = await read(session);

  return {
    enabledModules: settings.enabledModules,
    timeTrackingEnabled: settings.timeTrackingEnabled,
    workspaceCapabilities: settings.workspaceCapabilities,
    workspaceId: settings.workspaceId,
    workspaceName: settings.workspaceName,
    workspaceType: settings.workspaceType,
  };
}

async function save(payload, session) {
  await permissionsService.assertCan(session, "workspace_settings.manage", {
    workspace_id: session.workspace_id,
    operation: "update",
  });

  const data = normalizeSettings(payload);
  const previousSettings = await read(session);
  const timeTrackingEnabled = payload.timeTrackingEnabled !== false;
  data.timeTrackingEnabled = timeTrackingEnabled;
  const auditSettingChanged = previousSettings.audit.loggingEnabled !== data.audit.loggingEnabled ||
    previousSettings.audit.retentionDays !== data.audit.retentionDays;
  const moduleSettingChanged = previousSettings.timeTrackingEnabled !== timeTrackingEnabled;
  const auditDisabled = previousSettings.audit.loggingEnabled && !data.audit.loggingEnabled;
  const auditEnabled = !previousSettings.audit.loggingEnabled && data.audit.loggingEnabled;

  const auditEvent = {
    session,
    action: "workspace_settings_updated",
    changeType: "settings_change",
    recordType: "workspace_setting",
    recordId: session.workspace_id,
    recordLabel: data.workspaceName,
    recordUrl: "workspace-settings.html",
    previousValue: previousSettings,
    newValue: data,
    metadata: {
      setting_group: "workspace",
      audit_setting_changed: auditSettingChanged,
      module_setting_changed: moduleSettingChanged,
    },
  };

  if (auditDisabled) {
    await auditService.record({
      ...auditEvent,
      action: "audit_logging_disabled",
      force: true,
    });
  }

  await settingsRepository.saveWorkspaceSettings(session.workspace_id, data);
  await modulesService.setModuleStatus(session.workspace_id, TIME_TRACKING_MODULE_ID, timeTrackingEnabled);

  if (auditEnabled) {
    await auditService.record({
      ...auditEvent,
      action: "audit_logging_enabled",
      force: true,
    });
  } else if (!auditDisabled) {
    await auditService.record(auditEvent);
  }

  await auditService.cleanupExpired(session.workspace_id, data.audit.retentionDays);

  return { data: await modulesService.decorateWorkspaceSettings(data, session.workspace_id) };
}

export const settingsService = {
  read,
  readWorkspaceBootstrap,
  save,
};
