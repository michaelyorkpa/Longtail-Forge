import {
  handleUserAction,
  handleUserCreate,
  handleUserDelete,
  handleUsersRead,
  handleUserSettingsRead,
  handleUserSettingsSave,
} from "../legacy/handlers.js";

export const usersService = {
  list: handleUsersRead,
  create: handleUserCreate,
  action: handleUserAction,
  delete: handleUserDelete,
  readSettings: handleUserSettingsRead,
  saveSettings: handleUserSettingsSave,
};
