import { settingsRepository } from "../repositories/settings.repo.js";
import { auditService } from "./audit.service.js";
import { permissionsService } from "./permissions.service.js";
import { normalizeSettings } from "../utils/normalizers.js";

async function read(session) {
  return settingsRepository.readOrganizationSettings(session.organization_id);
}

async function save(payload, session) {
  await permissionsService.assertCan(session, "organization_settings.manage", {
    organization_id: session.organization_id,
    operation: "update",
  });

  const data = normalizeSettings(payload);
  const previousSettings = await settingsRepository.readOrganizationSettings(session.organization_id);
  const auditSettingChanged = previousSettings.audit.loggingEnabled !== data.audit.loggingEnabled ||
    previousSettings.audit.retentionDays !== data.audit.retentionDays;
  const auditDisabled = previousSettings.audit.loggingEnabled && !data.audit.loggingEnabled;
  const auditEnabled = !previousSettings.audit.loggingEnabled && data.audit.loggingEnabled;

  const auditEvent = {
    session,
    action: "organization_settings_updated",
    changeType: "settings_change",
    recordType: "organization_setting",
    recordId: session.organization_id,
    recordLabel: data.organizationName,
    recordUrl: "organization-settings.html",
    previousValue: previousSettings,
    newValue: data,
    metadata: {
      setting_group: "organization",
      audit_setting_changed: auditSettingChanged,
    },
  };

  if (auditDisabled) {
    await auditService.record({
      ...auditEvent,
      action: "audit_logging_disabled",
      force: true,
    });
  }

  await settingsRepository.saveOrganizationSettings(session.organization_id, data);

  if (auditEnabled) {
    await auditService.record({
      ...auditEvent,
      action: "audit_logging_enabled",
      force: true,
    });
  } else if (!auditDisabled) {
    await auditService.record(auditEvent);
  }

  await auditService.cleanupExpired(session.organization_id, data.audit.retentionDays);

  return { data };
}

export const settingsService = {
  read,
  save,
};
