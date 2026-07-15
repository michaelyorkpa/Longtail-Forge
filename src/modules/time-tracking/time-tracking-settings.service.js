import { registerOnChangeEffect } from "../../core/settings/settings-behavior-registry.js";
import { settingsRepository } from "../../repositories/settings.repo.js";

const MODULE_ID = "time-tracking";
let registered = false;

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
  const normalizeFiscalYearEffect = async ({ context }) => {
    const { settingsService } = await import("../../services/settings.service.js");
    const month = await settingsService.getValue(context, MODULE_ID, "fiscalYearStartMonth");
    const day = await settingsService.getValue(context, MODULE_ID, "fiscalYearStartDay");
    const normalized = normalizeFiscalYear(month, day);
    if (Number(day) !== normalized.startDay) {
      await settingsService.setValue(context, MODULE_ID, "fiscalYearStartDay", normalized.startDay);
    }
  };
  registerOnChangeEffect(`${MODULE_ID}.fiscalYearStartMonth`, normalizeFiscalYearEffect);
  registerOnChangeEffect(`${MODULE_ID}.fiscalYearStartDay`, normalizeFiscalYearEffect);
}

function normalizeFiscalYear(month, day) {
  const startMonth = Math.min(12, Math.max(1, Number.parseInt(month, 10) || 1));
  const maxDay = new Date(2026, startMonth, 0).getDate();
  const startDay = Math.min(maxDay, Math.max(1, Number.parseInt(day, 10) || 1));
  return { startMonth, startDay };
}

function normalizeRoundingIncrement(value) {
  return ["nearestHour", "nearestHalfHour", "nearestQuarterHour"].includes(value)
    ? value
    : "nearestQuarterHour";
}

function readWorkspaceId(context) {
  return typeof context === "string"
    ? context
    : String(context?.workspace_id || context?.workspaceId || "").trim();
}

export const timeTrackingSettingsService = {
  read,
  registerTimeTrackingSettingEffects,
};
