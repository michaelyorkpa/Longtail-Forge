// @ts-check
import { getRequestContext } from "../core/request-context.js";
import { sendApiError, sendBrowserError } from "../core/http-error-contract.js";
import { operationalLogger } from "../core/operational-logger.js";
import { supportViewService } from "../services/support-view.service.js";

/** @typedef {import("../types/http-contracts.js").HttpIdentityRequest} HttpIdentityRequest */
/** @typedef {import("../types/http-contracts.js").SupportViewGateOutcome} SupportViewGateOutcome */
/** @typedef {import("../types/http-contracts.js").SupportViewGateReasonClass} SupportViewGateReasonClass */
/** @typedef {import("../types/http-contracts.js").SupportViewRequestSession} SupportViewRequestSession */

/** @typedef {{ id: string, path: string, pattern: RegExp }} SupportViewRouteDefinition */

const SUPPORT_VIEW_SENSITIVE_READ_ROUTES = Object.freeze([
  route("framework.account-export", "/api/user/portable-account-export"),
  route("framework.api-keys", "/api/api-keys"),
  route("framework.audit-logs", "/api/audit-logs"),
  route("framework.audit-export", "/api/audit-logs/export.csv"),
  route("framework.security-events", "/api/security-events"),
  route("framework.security-events-export", "/api/security-events/export.csv"),
  route("framework.file-content", "/api/files/attachments/:fileAttachmentId/preview/content"),
  route("framework.file-preview", "/api/files/attachments/:fileAttachmentId/preview"),
  route("framework.file-download", "/api/files/:fileId/download"),
  route("framework.file-storage-accounting", "/api/files/storage/accounting"),
  route("framework.file-settings", "/api/files/settings"),
  route("framework.jobs-status", "/api/jobs/status"),
  route("framework.permissions-roles", "/api/roles"),
  route("framework.permissions-assignments", "/api/users/:userId/role-assignments"),
  route("framework.private-feeds", "/api/private-feeds/calendar-subscriptions"),
  route("framework.runtime-diagnostics", "/api/runtime-diagnostics"),
  route("framework.settings-catalog", "/api/settings/catalog"),
  route("framework.settings", "/api/settings"),
  route("framework.support-view-targets", "/api/support-view/targets"),
  route("framework.support-view-audit", "/api/support-view/audit"),
  route("framework.support-view-audit-export", "/api/support-view/audit/export.csv"),
  route("framework.workspace-backup", "/api/settings/workspace-backups/latest"),
  route("framework.workspace-deletion", "/api/settings/workspace-deletion"),
  route("framework.users", "/api/users"),
  route("framework.user-permission-resources", "/api/users/permission-resources"),
  route("framework.user-add-options", "/api/users/add-options"),
  route("framework.workspaces", "/api/workspaces"),
  route("framework.user-sessions", "/api/users/:userId/sessions"),
  route("framework.user-settings", "/api/user/settings"),
  route("notes.catalog-settings", "/api/notes/settings/catalogs"),
  route("notes.secure-health", "/api/notes/secure/health"),
  route("notes.catalog-security-preflight", "/api/notes/collections/:collectionId/security/preflight"),
]);

const SUPPORT_VIEW_READ_ROUTES = Object.freeze([
  route("framework.session", "/api/session"),
  route("framework.app-shell", "/api/app-shell/bootstrap"),
  route("framework.dashboard", "/api/dashboard"),
  route("framework.file-attachments", "/api/files/attachments"),
  route("framework.file-attachment-counts", "/api/files/attachments/counts"),
  route("framework.file-attachable-targets", "/api/files/attachable-targets"),
  route("framework.file-metadata", "/api/files/:fileId"),
  route("framework.help", "/api/help"),
  route("framework.help-article", "/api/help/articles/:articleIdOrSlug"),
  route("framework.notifications", "/api/notifications"),
  route("framework.notification-count", "/api/notifications/unread-count"),
  route("framework.notification-preferences", "/api/notifications/preferences"),
  route("framework.notification-subscriptions", "/api/notifications/subscriptions"),
  route("framework.reporting-catalog", "/api/reporting/catalog"),
  route("framework.reporting-run", "/api/reporting/reports/:reportKey/run"),
  route("framework.search", "/api/search"),
  route("framework.tags", "/api/tags"),
  route("framework.tag-assignments", "/api/tags/assignments"),
  route("framework.work-resume", "/api/work-resume"),
  route("framework.workbench", "/api/workbench/bootstrap"),
  route("framework.workbench-focus-modes", "/api/workbench/focus-modes"),
  route("framework.workbench-focus-candidates", "/api/workbench/focus-candidates"),
  route("framework.workbench-task-context", "/api/workbench/task-focus/:taskId/related-context"),
  route("client-projects.combined", "/api/client-projects"),
  route("client-projects.clients", "/api/clients"),
  route("client-projects.client", "/api/clients/:clientId"),
  route("client-projects.projects", "/api/projects"),
  route("client-projects.client-projects", "/api/clients/:clientId/projects"),
  route("client-projects.project", "/api/projects/:projectId"),
  route("developer-example.status", "/api/developer-example/status"),
  route("lists.list", "/api/lists"),
  route("lists.item-suggestions", "/api/lists/item-suggestions"),
  route("lists.catalog-items", "/api/lists/catalog-items"),
  route("lists.link-targets", "/api/lists/link-targets"),
  route("lists.detail", "/api/lists/:listId"),
  route("lists.items", "/api/lists/:listId/items"),
  route("lists.links", "/api/lists/:listId/links"),
  route("notes.list", "/api/notes"),
  route("notes.library", "/api/notes/library"),
  route("notes.library-bucket", "/api/notes/library/:libraryBucket"),
  route("notes.archive", "/api/notes/archive"),
  route("notes.for-target", "/api/notes/for-target"),
  route("notes.link-targets", "/api/notes/link-targets"),
  route("notes.collections", "/api/notes/collections"),
  route("notes.detail", "/api/notes/:noteId"),
  route("notes.revisions", "/api/notes/:noteId/revisions"),
  route("notes.revision", "/api/notes/:noteId/revisions/:revisionId"),
  route("notes.links", "/api/notes/:noteId/links"),
  route("tasks.list", "/api/tasks"),
  route("tasks.calendar", "/api/tasks/calendar"),
  route("tasks.timers", "/api/tasks/timers"),
  route("tasks.workbench-items", "/api/tasks/workbench-items"),
  route("tasks.options", "/api/tasks/options"),
  route("tasks.dashboard-summary", "/api/tasks/dashboard-summary"),
  route("tasks.recurrence-continuity", "/api/tasks/:taskId/recurrence-continuity"),
  route("tasks.detail", "/api/tasks/:taskId"),
  route("tasks.checklist", "/api/tasks/:taskId/checklist"),
  route("tasks.relationships", "/api/tasks/:taskId/relationships"),
  route("time-tracking.reporting-bootstrap", "/api/reporting/bootstrap"),
  route("time-tracking.project-summary", "/api/reporting/project-summary"),
  route("time-tracking.billing-summary", "/api/time-tracking/dashboard/billing-summary"),
  route("time-tracking.effort-summary", "/api/time-tracking/dashboard/effort-summary"),
  route("time-tracking.entries", "/api/time-entries"),
  route("time-tracking.active-timers", "/api/active-timers"),
  route("time-tracking.all-active-timers", "/api/active-timers/all"),
  route("framework.static", "/{*staticPath}"),
]);

/** @param {HttpIdentityRequest} request */
async function supportViewRequestGate(request, response, next) {
  if (!request.session?.support_view) {
    next();
    return;
  }

  if (await enforceSupportViewRequest(request, response)) {
    next();
  }
}

/** @param {HttpIdentityRequest} request */
async function enforceSupportViewRequest(request, response) {
  const session = /** @type {SupportViewRequestSession} */ (request.session);
  const method = String(request.method || "").toUpperCase();
  const pathname = requestPath(request);
  let matched = findRoute(SUPPORT_VIEW_SENSITIVE_READ_ROUTES, pathname)
    || findRoute(SUPPORT_VIEW_READ_ROUTES, pathname);
  /** @type {SupportViewGateOutcome} */
  let outcome = "denied";
  /** @type {SupportViewGateReasonClass} */
  let reasonClass = "mutation_denied";

  if (["GET", "HEAD"].includes(method)) {
    const sensitiveMatch = findRoute(SUPPORT_VIEW_SENSITIVE_READ_ROUTES, pathname);
    if (sensitiveMatch) {
      matched = sensitiveMatch;
      reasonClass = "sensitive_read_excluded";
    } else {
      matched = findRoute(SUPPORT_VIEW_READ_ROUTES, pathname);
      if (matched) {
        outcome = "allowed";
        reasonClass = "declared_read_safe";
      } else {
        reasonClass = "undeclared_read_denied";
      }
    }
  }

  const routeId = matched?.id || "framework.undeclared";
  const actionId = method.toLowerCase() + ":" + routeId;
  const requestId = getRequestContext(request).requestId;
  await supportViewService.recordAction(session, {
    actionId,
    outcome,
    reasonClass,
    routeId,
  }, { requestId });
  operationalLogger.info("support_view.action_attempt", {
    actionId,
    actorUserId: session.actor_user_id,
    effectiveUserId: session.effective_user_id,
    outcome,
    reasonClass,
    requestId,
    routeId,
    supportSessionId: session.support_view.supportSessionId,
    workspaceId: session.effective_workspace_id,
  });

  if (outcome === "allowed") {
    return true;
  }

  if (reasonClass === "sensitive_read_excluded" || reasonClass === "undeclared_read_denied") {
    denyNotFound(request, response);
    return false;
  }

  sendApiError(request, response, {
    code: "support_view_read_only",
    message: "Support View is read-only.",
    statusCode: 403,
  });
  return false;
}

function denyNotFound(request, response) {
  if (request.path?.startsWith("/api/") || request.originalUrl?.startsWith("/api/")) {
    sendApiError(request, response, { statusCode: 404 });
    return;
  }
  sendBrowserError(request, response, { code: "not_found", statusCode: 404 });
}

/** @param {readonly SupportViewRouteDefinition[]} routes */
function findRoute(routes, pathname) {
  return routes.find((entry) => entry.pattern.test(pathname)) || null;
}

/** @returns {Readonly<SupportViewRouteDefinition>} */
function route(id, path) {
  return Object.freeze({ id, path, pattern: compilePath(path) });
}

function compilePath(path) {
  if (path === "/{*staticPath}") {
    return /^\/(?!api(?:\/|$)).*/;
  }
  const pattern = path
    .split("/")
    .map((part) => part.startsWith(":") ? "[^/]+" : escapeRouteLiteral(part))
    .join("/");
  return new RegExp("^" + pattern + "/?$");
}

/*
function escapeRegExp(value) {
  const special = "\\^$.*+?()[]{}|";
  return [...String(value)].map((character) => (
    special.includes(character) ? "\" + character : character
  )).join("");
}
*/

function escapeRouteLiteral(value) {
  const special = new Set([92, 94, 36, 46, 42, 43, 63, 40, 41, 91, 93, 123, 125, 124]);
  return [...String(value)].map((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && special.has(codePoint)
      ? String.fromCharCode(92) + character
      : character;
  }).join("");
}

function requestPath(request) {
  try {
    return new URL(request.originalUrl || request.url || request.path || "/", "http://localhost").pathname;
  } catch {
    return String(request.path || "/");
  }
}

export {
  SUPPORT_VIEW_READ_ROUTES,
  SUPPORT_VIEW_SENSITIVE_READ_ROUTES,
  enforceSupportViewRequest,
  supportViewRequestGate,
};
