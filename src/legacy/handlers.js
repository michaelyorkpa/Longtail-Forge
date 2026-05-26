// Compatibility exports kept for older imports during the refactor.
// New code should use src/services, src/repositories, src/security, and src/db directly.
import { ensureDatabase } from "../db/index.js";
import { authService } from "../services/auth.service.js";
import { clientsService } from "../services/clients.service.js";
import { settingsService } from "../services/settings.service.js";
import { staticService } from "../services/static.service.js";
import { timeEntriesService } from "../services/time-entries.service.js";
import { usersService } from "../services/users.service.js";
import { getRequestSession } from "../security/sessions.js";
import { sendJson } from "../utils/http.js";

async function handleUnauthenticatedRequest(request, response, pathname) {
  if (request.method === "GET" && isLoginAssetPath(pathname)) {
    const result = await staticService.read(request.url);

    response.writeHead(result.statusCode, {
      "Content-Type": result.contentType,
    });
    response.end(result.contents);
    return;
  }

  if (pathname.startsWith("/api/")) {
    sendJson(response, 401, { error: "Login required." });
    return;
  }

  if (request.method === "GET") {
    response.writeHead(302, {
      Location: "/login.html",
      "Cache-Control": "no-store",
    });
    response.end();
    return;
  }

  sendJson(response, 401, { error: "Login required." });
}

async function serveStaticFile(request, response) {
  const result = await staticService.read(request.url);

  response.writeHead(result.statusCode, {
    "Content-Type": result.contentType,
  });
  response.end(result.contents);
}

function isLoginAssetPath(pathname) {
  return (
    pathname === "/" ||
    pathname === "/index.html" ||
    pathname === "/login.html" ||
    pathname === "/footer.js" ||
    pathname === "/login.js" ||
    pathname === "/theme-init.js" ||
    pathname === "/styles/longtail-forge.css"
  );
}

export {
  ensureDatabase,
  getRequestSession,
  handleUnauthenticatedRequest,
};

export const handleLogin = authService.login;
export const handleLogout = authService.logout;
export const handlePasswordChange = authService.changePassword;
export const handleSessionRead = authService.readSession;
export const handleClientProjectsRead = clientsService.readClientProjects;
export const handleClientProjectsSave = clientsService.saveClientProjects;
export const handleSettingsRead = settingsService.read;
export const handleSettingsSave = settingsService.save;
export { serveStaticFile };
export const handleTimeEntriesRead = timeEntriesService.list;
export const handleTimeEntry = timeEntriesService.create;
export const handleTimeEntryUpdate = timeEntriesService.update;
export const handleUsersRead = usersService.list;
export const handleUserCreate = usersService.create;
export const handleUserAction = usersService.action;
export const handleUserDelete = usersService.delete;
export const handleUserSettingsRead = usersService.readSettings;
export const handleUserSettingsSave = usersService.saveSettings;
