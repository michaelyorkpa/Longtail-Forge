import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import {
  decorateHtmlAssetUrls,
  injectAssetVersionBootstrap,
} from "../core/asset-version.js";
import { modulesService } from "../core/modules/modules.service.js";
import { usersRepository } from "../repositories/users.repo.js";
import { normalizeThemeAutoSource, normalizeThemeMode } from "../utils/normalizers.js";
import { permissionsService } from "./permissions.service.js";
import { legalContentService } from "./legal-content.service.js";

/** @typedef {import("../types/help-static-contracts.js").FrameworkProtectedView} FrameworkProtectedView */
/** @typedef {import("../types/help-static-contracts.js").InitialTheme} InitialTheme */
/** @typedef {import("../types/help-static-contracts.js").ProtectedModuleViewResolution} ProtectedModuleViewResolution */
/** @typedef {import("../types/help-static-contracts.js").StaticPathResolution} StaticPathResolution */
/** @typedef {import("../types/help-static-contracts.js").StaticReadResponse} StaticReadResponse */
/** @typedef {import("../types/help-static-contracts.js").StaticRequestSession} StaticRequestSession */
/** @typedef {import("../types/help-static-contracts.js").StaticResolvedPath} StaticResolvedPath */
/** @typedef {import("../types/help-static-contracts.js").StaticResolutionOptions} StaticResolutionOptions */
/** @typedef {import("../types/help-static-contracts.js").StaticThemeSession} StaticThemeSession */

/** @type {Record<string, string>} */
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

/** @type {Map<string, FrameworkProtectedView>} */
const frameworkProtectedViews = new Map([
  ["api-keys.html", { id: "api-keys", file: "api-keys.html" }],
  ["account-recovery.html", { id: "account-recovery", file: "account-recovery.html" }],
  ["audit-log.html", { id: "audit-log", file: "audit-log.html" }],
  ["calendar.html", { id: "calendar", file: "calendar.html" }],
  ["calendar-settings.html", {
    id: "calendar-settings",
    file: "calendar-settings.html",
    requiredPermission: "workspace_settings.manage",
  }],
  ["dashboard.html", { id: "dashboard", file: "dashboard.html" }],
  ["files.html", { id: "files", file: "files.html" }],
  ["files-settings.html", { id: "files-settings", file: "files-settings.html" }],
  ["help.html", { id: "help", file: "help.html" }],
  ["notifications.html", { id: "notifications", file: "notifications.html" }],
  ["reporting.html", { id: "reporting", file: "reporting.html" }],
  ["search.html", { id: "search", file: "search.html" }],
  ["support-view.html", {
    id: "support-view",
    file: "support-view.html",
    requiredPermission: "support_view.enter",
    supportViewOperatorOnly: true,
  }],
  ["support-view-audit.html", {
    id: "support-view-audit",
    file: "support-view-audit.html",
    requiredPermission: "support_view.enter",
    supportViewOperatorOnly: true,
  }],
  ["user-settings.html", { id: "user-settings", file: "user-settings.html" }],
  ["workbench.html", { id: "workbench", file: "workbench.html" }],
  ["workbench-settings.html", { id: "workbench-settings", file: "workbench-settings.html" }],
  ["workspace-settings.html", { id: "workspace-settings", file: "workspace-settings.html" }],
]);
/** @type {Map<string, string | null>} */
const publicPages = new Map([
  ["index.html", null],
  ["login.html", null],
  ["terms.html", "terms"],
  ["privacy.html", "privacy"],
]);

/** @param {string} requestUrl @param {StaticRequestSession} [session] @returns {Promise<StaticReadResponse>} */
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
    /** @type {string | Buffer} */
    let contents = await fs.readFile(resolved.filePath);
    const extension = path.extname(resolved.filePath).toLowerCase();

    if (extension === ".html") {
      contents = await decorateHtml(contents.toString("utf8"), resolved, session);
    }

    return {
      statusCode: 200,
      contents,
      contentType: contentTypes[extension] || "application/octet-stream",
      headers: resolved.headers || {},
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return {
        statusCode: 404,
        contents: "Not found",
        contentType: "text/plain; charset=utf-8",
      };
    }

    throw error;
  }
}

/** @param {string} requestPath @param {StaticRequestSession} session @returns {Promise<StaticPathResolution>} */
async function resolveRequestPath(requestPath, session) {
  if (requestPath === "/") {
    return resolveViewPath("public", "index.html");
  }

  if (!requestPath.endsWith(".html")) {
    return {
      filePath: resolvePublicAssetPath(requestPath),
      headers: {},
      legalDocumentId: "",
      protectedHtml: false,
    };
  }

  const pageName = path.basename(requestPath);

  if (publicPages.has(pageName)) {
    return resolveViewPath("public", pageName, { legalDocumentId: publicPages.get(pageName) });
  }

  if (pageName === "account-recovery.html") {
    if (session?.session_mode !== "account_export_recovery") {
      return { statusCode: 404, message: "Not found" };
    }
    return resolveViewPath("protected", pageName, { protectedHtml: true });
  }

  if (!session?.workspace_id) {
    return {
      statusCode: 401,
      message: "Login required.",
    };
  }

  if (frameworkProtectedViews.has(pageName)) {
    const view = /** @type {FrameworkProtectedView} */ (frameworkProtectedViews.get(pageName));
    if (
      view.supportViewOperatorOnly
      && (!config.supportView.enabled || session.support_view || !(await permissionsService.isSuperAdmin(session)))
    ) {
      return { statusCode: 404, message: "Not found" };
    }
    if (
      view.requiredPermission
      && !(await permissionsService.can(session, view.requiredPermission, {
        operation: view.supportViewOperatorOnly ? "read" : "update",
        workspace_id: session.workspace_id,
      }))
    ) {
      return { statusCode: 403, message: "Forbidden" };
    }
    return resolveViewPath("protected", view.file, { protectedHtml: true });
  }

  const moduleView = /** @type {ProtectedModuleViewResolution} */ (
    await modulesService.resolveProtectedModuleView(session.workspace_id, session, requestPath)
  );

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

  return resolveViewPath("protected", moduleView.view.file, { protectedHtml: true });
}

/** @param {"public" | "protected"} viewGroup @param {string} fileName @param {StaticResolutionOptions} [options] @returns {StaticResolvedPath} */
function resolveViewPath(viewGroup, fileName, options = {}) {
  const filePath = path.resolve(config.viewsDir, viewGroup, fileName);
  const viewRoot = path.resolve(config.viewsDir, viewGroup);

  return {
    filePath: filePath.startsWith(`${viewRoot}${path.sep}`) ? filePath : null,
    headers: options.protectedHtml ? { "Cache-Control": "no-store" } : {},
    legalDocumentId: options.legalDocumentId || "",
    protectedHtml: options.protectedHtml === true,
  };
}

/** @param {string} requestPath @returns {string | null} */
function resolvePublicAssetPath(requestPath) {
  const relativePath = requestPath.startsWith("/") ? requestPath.slice(1) : requestPath;
  const filePath = path.resolve(config.publicDir, relativePath);
  const publicRoot = path.resolve(config.publicDir);

  return filePath.startsWith(`${publicRoot}${path.sep}`) ? filePath : null;
}

/** @param {string} contents @param {StaticResolvedPath} resolved @param {StaticRequestSession} session @returns {Promise<string>} */
async function decorateHtml(contents, resolved, session) {
  const withErrorBoundary = injectErrorBoundaryScripts(contents);
  const withLegalDocument = resolved.legalDocumentId
    ? await injectLegalDocument(withErrorBoundary, resolved.legalDocumentId)
    : withErrorBoundary;
  const assetDecoratedContents = decorateHtmlAssetUrls(injectAssetVersionBootstrap(withLegalDocument));

  if (!resolved.protectedHtml || !session?.user_id) {
    return assetDecoratedContents;
  }

  const theme = await readInitialTheme(/** @type {StaticThemeSession} */ (session));
  return injectCriticalThemeStyle(injectThemeAttributes(assetDecoratedContents, theme));
}

/** @param {string} contents @param {string} documentId @returns {Promise<string>} */
async function injectLegalDocument(contents, documentId) {
  const document = await legalContentService.read(documentId);
  if (!document) {
    return contents;
  }
  return contents.replace('<div data-legal-document-body></div>', document.bodyHtml);
}

/** @param {string} contents @returns {string} */
function injectErrorBoundaryScripts(contents) {
  if (
    contents.includes('src="/js/shared/error-contract.js"')
    && contents.includes('src="/js/shared/browser-recovery.js"')
    && contents.includes('src="/js/shared/app-shell-bootstrap.js"')
    && contents.includes('src="/js/shared/view-surface-descriptor.js"')
    && contents.includes('src="/js/shared/view-response-records.js"')
    && contents.includes('src="/js/shared/view-action-security.js"')
    && contents.includes('src="/js/shared/view-search-options.js"')
    && contents.includes('src="/js/shared/view-data-binding.js"')
  ) {
    return contents;
  }

  return contents.replace(
    /(<head\b[^>]*>)/i,
    '$1\n    <script src="/js/shared/error-contract.js"></script>\n    <script src="/js/shared/browser-recovery.js"></script>\n    <script src="/js/shared/app-shell-bootstrap.js"></script>\n    <script src="/js/shared/view-surface-descriptor.js"></script>\n    <script src="/js/shared/view-response-records.js"></script>\n    <script src="/js/shared/view-action-security.js"></script>\n    <script src="/js/shared/view-search-options.js"></script>\n    <script src="/js/shared/view-data-binding.js"></script>',
  );
}

/** @param {StaticThemeSession} session @returns {Promise<InitialTheme>} */
async function readInitialTheme(session) {
  const user = session.session_mode === "account_export_recovery"
    ? await usersRepository.readFirstByUserId(session.user_id)
    : await usersRepository.readById(session.home_workspace_id || session.workspace_id, session.user_id);
  const themeMode = normalizeThemeMode(user?.theme_mode);
  const themeAutoSource = normalizeThemeAutoSource(user?.theme_auto_source);

  return {
    theme: themeMode === "dark" ? "dark" : "light",
    themeAutoSource,
    themeMode,
  };
}

/** @param {string} contents @param {InitialTheme} theme @returns {string} */
function injectThemeAttributes(contents, theme) {
  return contents.replace(/<html\b([^>]*)>/i, (match, attributes) => {
    if (/\sdata-theme=/.test(attributes)) {
      return match;
    }

    return `<html${attributes} data-theme-mode="${escapeHtmlAttribute(theme.themeMode)}" data-theme-auto-source="${escapeHtmlAttribute(theme.themeAutoSource)}" data-theme="${escapeHtmlAttribute(theme.theme)}">`;
  });
}

/** @param {string} contents @returns {string} */
function injectCriticalThemeStyle(contents) {
  if (contents.includes("data-theme-critical")) {
    return contents;
  }

  const criticalStyle = [
    "<style data-theme-critical>",
    'html[data-theme="dark"] { color-scheme: dark; background: #000000; }',
    'html[data-theme="light"] { color-scheme: light; background: #f5f7fb; }',
    '@media (prefers-color-scheme: dark) { html[data-theme-mode="auto"][data-theme-auto-source="system"] { color-scheme: dark; background: #000000; } }',
    "</style>",
  ].join("");

  return contents.replace(/(<head\b[^>]*>)/i, `$1\n    ${criticalStyle}`);
}

/** @param {unknown} value @returns {string} */
function escapeHtmlAttribute(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export const staticService = {
  read,
};
