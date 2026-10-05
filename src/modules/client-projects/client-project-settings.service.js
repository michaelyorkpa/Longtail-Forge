import { normalizeBillingPeriod } from "../../utils/normalizers.js";
import { settingsRepository } from "../../repositories/settings.repo.js";

const MODULE_ID = "client-projects";

/** @typedef {import("../../types/client-project-contracts.js").ClientProjectSettingsReadContext} ClientProjectSettingsReadContext */

/** @param {ClientProjectSettingsReadContext} context */
async function read(context) {
  const workspaceId = readWorkspaceId(context);
  const [{ settingsService }, workspaceSettings] = await Promise.all([
    import("../../services/settings.service.js"),
    settingsRepository.readWorkspaceSettings(workspaceId),
  ]);
  const [defaultBillingRate, billingPeriodType, billingPeriodStartDay] = await Promise.all([
    settingsService.getValue(context, MODULE_ID, "defaultBillingRate"),
    settingsService.getValue(context, MODULE_ID, "billingPeriodType"),
    settingsService.getValue(context, MODULE_ID, "billingPeriodStartDay"),
  ]);

  return {
    defaultBillingRate: workspaceSettings.workspaceType === "business"
      ? String(defaultBillingRate || "").trim()
      : "",
    billingPeriod: normalizeBillingPeriod({
      type: billingPeriodType,
      startDay: billingPeriodStartDay,
    }),
  };
}

/** @param {ClientProjectSettingsReadContext} context @returns {string} */
function readWorkspaceId(context) {
  return typeof context === "string"
    ? context
    : String(context?.workspace_id || context?.workspaceId || "").trim();
}

export const clientProjectSettingsService = {
  read,
};
