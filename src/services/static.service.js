import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { modulesService } from "../core/modules/modules.service.js";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const frameworkProtectedViews = new Map([
  ["api-keys.html", { id: "api-keys", file: "api-keys.html" }],
  ["audit-log.html", { id: "audit-log", file: "audit-log.html" }],
  ["dashboard.html", { id: "dashboard", file: "dashboard.html" }],
  ["files.html", { id: "files", file: "files.html" }],
  ["files-settings.html", { id: "files-settings", file: "files-settings.html" }],
  ["help.html", { id: "help", file: "help.html" }],
  ["notifications.html", { id: "notifications", file: "notifications.html" }],
  ["reporting.html", { id: "reporting", file: "reporting.html" }],
  ["search.html", { id: "search", file: "search.html" }],
  ["user-settings.html", { id: "user-settings", file: "user-settings.html" }],
  ["workbench.html", { id: "workbench", file: "workbench.html" }],
  ["workspace-settings.html", { id: "workspace-settings", file: "workspace-settings.html" }],
]);
const publicPages = new Set(["index.html", "login.html"]);

async function read(requestUrl, session = null) {
  const requestPath = new URL(requestUrl, `http://${config.host}:${config.port}`).pathname;
  const resolved = await resolveRequestPath(requestPath, session);

  if (!resolved.filePath) {
    return {
      statusCode: resolved.statusCode || 403,
      contents: resolved.message || "Forbidden",
      contentType: "text/plain; charset=utf-8",
    };
  }

  try {
    const contents = await fs.readFile(resolved.filePath);
    const extension = path.extname(resolved.filePath).toLowerCase();

    return {
      statusCode: 200,
      contents,
      contentType: contentTypes[extension] || "application/octet-stream",
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        statusCode: 404,
        contents: "Not found",
        contentType: "text/plain; charset=utf-8",
      };
    }

    throw error;
  }
}

async function resolveRequestPath(requestPath, session) {
  if (requestPath === "/") {
    return resolveViewPath("public", "index.html");
  }

  if (!requestPath.endsWith(".html")) {
    return { filePath: resolvePublicAssetPath(requestPath) };
  }

  const pageName = path.basename(requestPath);

  if (publicPages.has(pageName)) {
    return resolveViewPath("public", pageName);
  }

  if (!session?.workspace_id) {
    return {
      statusCode: 401,
      message: "Login required.",
    };
  }

  if (frameworkProtectedViews.has(pageName)) {
    return resolveViewPath("protected", frameworkProtectedViews.get(pageName).file);
  }

  const moduleView = await modulesService.resolveProtectedModuleView(session.workspace_id, session, requestPath);

  if (!moduleView) {
    return {
      statusCode: 404,
      message: "Not found",
    };
  }

  if (moduleView.status !== "ok") {
    return {
      statusCode: moduleView.statusCode,
      message: moduleView.message,
    };
  }

  return resolveViewPath("protected", moduleView.view.file);
}

function resolveViewPath(viewGroup, fileName) {
  const filePath = path.resolve(config.viewsDir, viewGroup, fileName);
  const viewRoot = path.resolve(config.viewsDir, viewGroup);

  return {
    filePath: filePath.startsWith(`${viewRoot}${path.sep}`) ? filePath : null,
  };
}

function resolvePublicAssetPath(requestPath) {
  const relativePath = requestPath.startsWith("/") ? requestPath.slice(1) : requestPath;
  const filePath = path.resolve(config.publicDir, relativePath);
  const publicRoot = path.resolve(config.publicDir);

  return filePath.startsWith(`${publicRoot}${path.sep}`) ? filePath : null;
}

export const staticService = {
  read,
};
