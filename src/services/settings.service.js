import {
  handleSettingsRead,
  handleSettingsSave,
} from "../legacy/handlers.js";

export const settingsService = {
  read: handleSettingsRead,
  save: handleSettingsSave,
};
