import { settingsRepository } from "../repositories/settings.repo.js";
import { appendAppLog } from "../utils/app-log.js";
import { normalizeSettings } from "../utils/normalizers.js";

async function read() {
  return settingsRepository.readOrganizationSettings();
}

async function save(payload) {
  const data = normalizeSettings(payload);

  await settingsRepository.saveOrganizationSettings(data);
  await appendAppLog({
    action: "organization_settings_updated",
    details: `organization_name=${data.organizationName};fiscal_year_start_month=${data.fiscalYear.startMonth};fiscal_year_start_day=${data.fiscalYear.startDay};default_billing_rate=${data.defaultBillingRate};billing_period_type=${data.billingPeriod.type};billing_period_start_day=${data.billingPeriod.startDay};rounding_enabled=${data.billingRounding.enabled};rounding_increment=${data.billingRounding.increment}`,
  });

  return { data };
}

export const settingsService = {
  read,
  save,
};
