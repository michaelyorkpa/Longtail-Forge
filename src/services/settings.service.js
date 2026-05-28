import { settingsRepository } from "../repositories/settings.repo.js";
import { auditService } from "./audit.service.js";
import { normalizeSettings } from "../utils/normalizers.js";

async function read(session) {
  return settingsRepository.readOrganizationSettings(session.organization_id);
}

async function save(payload, session) {
  const data = normalizeSettings(payload);
  const previousSettings = await settingsRepository.readOrganizationSettings(session.organization_id);

  await settingsRepository.saveOrganizationSettings(session.organization_id, data);
  await auditService.record({
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
    },
  });

  return { data };
}

export const settingsService = {
  read,
  save,
};
