import { registerOnChangeEffect } from "../../core/settings/settings-behavior-registry.js";
import { settingsRepository } from "../../repositories/settings.repo.js";

/** @typedef {import("../../types/time-tracking-contracts.d.ts").TimeTrackingSettingsReadContext} TimeTrackingSettingsReadContext */
/** @typedef {import("../../types/http-contracts.d.ts").WorkspaceRequestSession} WorkspaceRequestSession */

const MODULE_ID = "time-tracking";
let registered = false;

/** @param {TimeTrackingSettingsReadContext} context */
async function read(context) {
  const workspaceId = readWorkspaceId(context);
  const [{ settingsService }, workspaceSettings] = await Promise.all([
    import("../../services/settings.service.js"),
    settingsRepository.readWorkspaceSettings(workspaceId),
  ]);
  const [startMonth, startDay, roundingEnabled, roundingIncrement] = await Promise.all([
    settingsService.getValue(context, MODULE_ID, "fiscalYearStartMonth"),
    settingsService.getValue(context, MODULE_ID, "fiscalYearStartDay"),
    settingsService.getValue(context, MODULE_ID, "billingRoundingEnabled"),
    settingsService.getValue(context, MODULE_ID, "billingRoundingIncrement"),
  ]);

  return {
    fiscalYear: workspaceSettings.workspaceType === "business"
      ? normalizeFiscalYear(startMonth, startDay)
      : { startMonth: 1, startDay: 1 },
    billingRounding: {
      enabled: roundingEnabled === true,
      increment: normalizeRoundingIncrement(roundingIncrement),
    },
  };
}

function registerTimeTrackingSettingEffects() {
  if (registered) {
    return;
  }
  registered = true;
  /** @param {{ context: unknown }} input */
  const normalizeFiscalYearEffect = async ({ context }) => {
    const settingsContext = /** @type {WorkspaceRequestSession} */ (context);
    const { settingsService } = await import("../../services/settings.service.js");
    const month = await settingsService.getValue(settingsContext, MODULE_ID, "fiscalYearStartMonth");
    const day = await settingsService.getValue(settingsContext, MODULE_ID, "fiscalYearStartDay");
    const normalized = normalizeFiscalYear(month, day);
    if (Number(day) !== normalized.startDay) {
      await settingsService.setValue(settingsContext, MODULE_ID, "fiscalYearStartDay", normalized.startDay);
    }
  };
  registerOnChangeEffect(`${MODULE_ID}.fiscalYearStartMonth`, normalizeFiscalYearEffect);
  registerOnChangeEffect(`${MODULE_ID}.fiscalYearStartDay`, normalizeFiscalYearEffect);
}

/** @param {unknown} month @param {unknown} day */
function normalizeFiscalYear(month, day) {
  const startMonth = Math.min(12, Math.max(1, Number.parseInt(String(month ?? ""), 10) || 1));
  const maxDay = new Date(2026, startMonth, 0).getDate();
  const startDay = Math.min(maxDay, Math.max(1, Number.parseInt(String(day ?? ""), 10) || 1));
  return { startMonth, startDay };
}

/** @param {unknown} value @returns {import("../../types/time-tracking-contracts.d.ts").BillingRoundingIncrement} */
function normalizeRoundingIncrement(value) {
  return ["nearestHour", "nearestHalfHour", "nearestQuarterHour"].includes(String(value || ""))
    ? /** @type {import("../../types/time-tracking-contracts.d.ts").BillingRoundingIncrement} */ (value)
    : "nearestQuarterHour";
}

/** @param {TimeTrackingSettingsReadContext} context */
function readWorkspaceId(context) {
  return typeof context === "string"
    ? context
    : String(context?.workspace_id || context?.workspaceId || "").trim();
}

export const timeTrackingSettingsService = {
  read,
  registerTimeTrackingSettingEffects,
};
