import {
  handleLogin,
  handleLogout,
  handlePasswordChange,
  handleSessionRead,
} from "../legacy/handlers.js";

export const authService = {
  login: handleLogin,
  logout: handleLogout,
  readSession: handleSessionRead,
  changePassword: handlePasswordChange,
};
