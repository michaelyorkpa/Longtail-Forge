const PUBLIC_DEMO_BUDGET_LIMITS = Object.freeze({
  accountMutationUnits: 120,
  workspaceMutationUnits: 600,
  maxArrayItems: 50,
  maxFieldBytes: 8 * 1024,
  maxRichTextBytes: 32 * 1024,
  maxObjectDepth: 8,
  maxObjectFields: 100,
  maxPayloadNodes: 2000,
  maxQueryBytes: 2048,
  maxQueryFields: 32,
  maxQueryListItems: 20,
  maxPageSize: 100,
  maxOffset: 1000,
  maxPage: 40,
  maxQueryTextBytes: 512,
  maxSearchTextBytes: 200,
});

const PUBLIC_DEMO_BUDGET_ERRORS = Object.freeze({
  budget: Object.freeze({
    code: "public_demo_budget_exceeded",
    message: "This public demo limit has been reached. Try again after the next hourly reset.",
    statusCode: 429,
  }),
  input: Object.freeze({
    code: "public_demo_input_limit",
    message: "This public demo input is too large.",
    statusCode: 400,
  }),
  query: Object.freeze({
    code: "public_demo_query_limit",
    message: "This public demo query is too large.",
    statusCode: 400,
  }),
  undeclared: Object.freeze({
    code: "public_demo_budget_undeclared",
    message: "This operation is unavailable in the public demo.",
    statusCode: 403,
  }),
});

const COMMON_MUTATION_COLLECTION_KEYS = Object.freeze([
  "assignee_user_ids", "assignments", "checklist", "checklist_items", "children",
  "clients", "itemIds", "items", "noteIds", "notes", "projects", "recordIds",
  "relationships", "tag_ids", "tags", "taskIds", "tasks",
]);

const MUTATION_OPERATIONS = defineOperations([
  ["api-keys.manage", ["POST", "PUT"], ["/api/api-keys", "/api/api-keys/:apiKeyId/revoke"], { reserve: false }],
  ["files.ingress", ["POST"], ["/api/files", "/api/files/upload", "/api/files/upload/batch", "/api/files/batch"], { reserve: false }],
  ["files.settings", ["PUT"], ["/api/files/settings"], { reserve: false }],
  ["files.attach-ingress", ["POST"], ["/api/files/attachments"], { reserve: false }],
  ["files.attachment-context", ["POST", "PATCH"], ["/api/files/attachments/:fileAttachmentId/remove", "/api/files/attachments/:fileAttachmentId/context"]],
  ["files.lifecycle", ["POST"], ["/api/files/:fileId/delete", "/api/files/:fileId/restore", "/api/files/:fileId/report", "/api/files/:fileId/quarantine"]],
  ["notifications.preferences", ["PUT"], ["/api/notifications/preferences", "/api/notifications/workspace-defaults"]],
  ["notifications.subscriptions", ["POST", "DELETE"], ["/api/notifications/subscriptions"]],
  ["notifications.state", ["POST"], ["/api/notifications/:notificationId/read", "/api/notifications/read-all", "/api/notifications/dismiss-all", "/api/notifications/:notificationId/dismiss"]],
  ["private-feeds.manage", ["POST", "DELETE"], ["/api/private-feeds/calendar-subscriptions", "/api/private-feeds/calendar-subscriptions/:subscriptionId/rotate", "/api/private-feeds/calendar-subscriptions/:subscriptionId"], { reserve: false }],
  ["permissions.lookup", ["POST"], ["/api/role-assignments/lookup"], { reserve: false }],
  ["permissions.assign", ["PUT"], ["/api/users/:userId/role-assignments"], { reserve: false }],
  ["search.rebuild", ["POST"], ["/api/search-index/rebuild"], { baseUnits: 25 }],
  ["settings.update", ["PUT"], ["/api/settings"], { reserve: false }],
  ["settings.backup-delete", ["POST"], ["/api/settings/workspace-backups", "/api/settings/workspace-deletion/request", "/api/settings/workspace-deletion/cancel"], { reserve: false }],
  ["support-view.start", ["POST"], ["/api/support-view/start"], { reserve: false }],
  ["work-resume.dismiss", ["POST"], ["/api/work-resume/:resumeStateId/dismiss"]],
  ["workbench.timers", ["PUT"], ["/api/workbench/timers/:timerSlot/status"]],
  ["client-projects.bulk", ["PUT"], ["/api/client-projects"], { collectionKeys: ["clients", "projects"] }],
  ["clients.create", ["POST"], ["/api/clients"]],
  ["clients.update", ["PUT", "DELETE"], ["/api/clients/:clientId"]],
  ["projects.create", ["POST"], ["/api/projects", "/api/clients/:clientId/projects"]],
  ["projects.update", ["PUT", "DELETE"], ["/api/projects/:projectId"]],
  ["lists.create", ["POST"], ["/api/lists"]],
  ["lists.catalog", ["POST", "PUT"], ["/api/lists/catalog-items", "/api/lists/catalog-items/:catalogItemId", "/api/lists/item-catalog", "/api/lists/item-catalog/:catalogItemId"]],
  ["lists.update", ["PUT", "DELETE"], ["/api/lists/:listId"]],
  ["lists.lifecycle", ["POST"], ["/api/lists/:listId/complete", "/api/lists/:listId/finalize", "/api/lists/:listId/reopen", "/api/lists/:listId/mark-reusable", "/api/lists/:listId/unmark-reusable", "/api/lists/:listId/archive", "/api/lists/:listId/restore", "/api/lists/:listId/delete"]],
  ["lists.duplicate", ["POST"], ["/api/lists/:listId/duplicate"]],
  ["lists.items", ["POST", "PUT", "DELETE"], ["/api/lists/:listId/items", "/api/lists/:listId/items/reorder", "/api/lists/:listId/items/:itemId", "/api/lists/:listId/items/:itemId/check", "/api/lists/:listId/items/:itemId/uncheck", "/api/lists/:listId/items/:itemId/complete", "/api/lists/:listId/items/:itemId/delete"], { collectionKeys: ["itemIds", "items"] }],
  ["lists.links", ["POST"], ["/api/lists/:listId/links", "/api/lists/:listId/links/:linkId/remove"]],
  ["notes.create", ["POST"], ["/api/notes"]],
  ["notes.bulk", ["POST"], ["/api/notes/bulk"], { collectionKeys: ["noteIds", "notes"] }],
  ["notes.preview", ["POST"], ["/api/notes/preview"], { baseUnits: 0 }],
  ["notes.catalog", ["POST"], ["/api/notes/settings/catalogs/bulk"], { reserve: false }],
  ["notes.collections", ["POST", "PUT"], ["/api/notes/collections", "/api/notes/collections/import-path", "/api/notes/collections/:collectionId", "/api/notes/collections/:collectionId/move", "/api/notes/collections/:collectionId/archive", "/api/notes/collections/:collectionId/restore", "/api/notes/collections/:collectionId/delete-empty"]],
  ["notes.security", ["POST"], ["/api/notes/collections/:collectionId/security/enable", "/api/notes/collections/:collectionId/security/remove", "/api/notes/collections/:collectionId/security/retry"], { reserve: false }],
  ["notes.update", ["PUT"], ["/api/notes/:noteId"]],
  ["notes.lifecycle", ["POST"], ["/api/notes/:noteId/library", "/api/notes/:noteId/collection", "/api/notes/:noteId/archive", "/api/notes/:noteId/restore", "/api/notes/:noteId/delete", "/api/notes/:noteId/revisions/:revisionId/restore"]],
  ["notes.links", ["POST"], ["/api/notes/:noteId/links", "/api/notes/:noteId/links/:noteLinkId/remove"]],
  ["tasks.create", ["POST"], ["/api/tasks"]],
  ["tasks.bulk", ["POST"], ["/api/tasks/bulk"], { collectionKeys: ["taskIds", "tasks"] }],
  ["tasks.materialize", ["POST"], ["/api/tasks/recurrence-instances/materialize"], { baseUnits: 25 }],
  ["tasks.children", ["POST", "PUT", "DELETE"], ["/api/tasks/:taskId/children", "/api/tasks/:taskId/children/:childTaskId"]],
  ["tasks.checklist", ["POST", "PUT", "DELETE"], ["/api/tasks/:taskId/checklist", "/api/tasks/:taskId/checklist/reorder", "/api/tasks/:taskId/checklist/:itemId", "/api/tasks/:taskId/checklist/:itemId/check", "/api/tasks/:taskId/checklist/:itemId/uncheck"], { collectionKeys: ["itemIds", "items"] }],
  ["tasks.update", ["PUT"], ["/api/tasks/:taskId"]],
  ["tasks.lifecycle", ["POST"], ["/api/tasks/:taskId/complete", "/api/tasks/:taskId/skip-to-current", "/api/tasks/:taskId/reopen", "/api/tasks/:taskId/archive", "/api/tasks/:taskId/restore"]],
  ["tasks.timers", ["POST", "PUT", "DELETE"], ["/api/tasks/:taskId/timer", "/api/tasks/:taskId/timer/link", "/api/tasks/:taskId/timer/finalize"]],
  ["time-entries", ["POST", "PUT", "DELETE"], ["/api/time-entries", "/api/time-entries/:entryId"]],
  ["active-timers", ["POST", "PUT", "DELETE"], ["/api/active-timers/:timerSlot", "/api/active-timers/:timerSlot/start", "/api/active-timers/:timerSlot/pause", "/api/active-timers/:timerSlot/finalize"]],
  ["tags.manage", ["POST", "PUT"], ["/api/tags", "/api/tags/:tagId", "/api/tags/:tagId/archive", "/api/tags/:tagId/restore"]],
  ["tags.assign", ["POST", "PUT"], ["/api/tags/assignments", "/api/tags/bulk-assignments", "/api/tags/assignments/:assignmentId/suppress"], { collectionKeys: ["assignments", "recordIds"] }],
  ["users.lookup", ["POST"], ["/api/users/lookup"], { reserve: false }],
  ["users.admin", ["POST", "PUT", "DELETE"], ["/api/workspaces", "/api/user/workspaces/:workspaceId", "/api/user/account", "/api/users", "/api/users/:userId/sessions/:sessionReference", "/api/users/:userId/sessions", "/api/users/:userId/:action", "/api/users/:userId"], { reserve: false }],
  ["users.settings", ["PUT"], ["/api/user/settings", "/api/user/password"], { reserve: false }],
]);

const QUERY_OPERATIONS = defineOperations([
  ["framework.read", ["GET", "HEAD"], [
    "/api/user/portable-account-export", "/api/app-shell/bootstrap", "/api/api-keys", "/api/audit-logs", "/api/audit-logs/export.csv", "/api/security-events", "/api/security-events/export.csv", "/api/dashboard", "/api/help", "/api/help/articles/:articleIdOrSlug", "/api/jobs/status", "/api/notifications", "/api/notifications/unread-count", "/api/notifications/preferences", "/api/notifications/subscriptions", "/api/private-feeds/calendar-subscriptions", "/api/roles", "/api/users/:userId/role-assignments", "/api/reporting/catalog", "/api/runtime-diagnostics", "/api/settings/catalog", "/api/settings", "/api/settings/workspace-backups/latest", "/api/settings/workspace-deletion", "/api/support-view/targets", "/api/support-view/audit", "/api/support-view/audit/export.csv", "/api/tags", "/api/tags/assignments", "/api/users", "/api/users/permission-resources", "/api/users/add-options", "/api/workspaces", "/api/users/:userId/sessions", "/api/user/settings", "/api/work-resume", "/api/workbench/bootstrap", "/api/workbench/focus-modes", "/api/workbench/focus-candidates", "/api/workbench/task-focus/:taskId/related-context",
  ]],
  ["files.read", ["GET", "HEAD"], ["/api/files/attachments", "/api/files/attachments/counts", "/api/files/attachments/:fileAttachmentId/preview/content", "/api/files/attachments/:fileAttachmentId/preview", "/api/files/storage/accounting", "/api/files/settings", "/api/files/attachable-targets", "/api/files/:fileId", "/api/files/:fileId/download"]],
  ["search.query", ["GET", "HEAD"], ["/api/search"]],
  ["reporting.query", ["GET", "HEAD"], ["/api/reporting/reports/:reportKey/run", "/api/reporting/bootstrap", "/api/reporting/project-summary", "/api/time-tracking/dashboard/billing-summary", "/api/time-tracking/dashboard/effort-summary"]],
  ["client-projects.read", ["GET", "HEAD"], ["/api/client-projects", "/api/clients", "/api/clients/:clientId", "/api/projects", "/api/clients/:clientId/projects", "/api/projects/:projectId"]],
  ["lists.read", ["GET", "HEAD"], ["/api/lists", "/api/lists/item-suggestions", "/api/lists/catalog-items", "/api/lists/link-targets", "/api/lists/:listId", "/api/lists/:listId/items", "/api/lists/:listId/links"]],
  ["notes.read", ["GET", "HEAD"], ["/api/notes", "/api/notes/library", "/api/notes/library/:libraryBucket", "/api/notes/archive", "/api/notes/for-target", "/api/notes/link-targets", "/api/notes/collections", "/api/notes/settings/catalogs", "/api/notes/secure/health", "/api/notes/collections/:collectionId/security/preflight", "/api/notes/:noteId", "/api/notes/:noteId/revisions", "/api/notes/:noteId/revisions/:revisionId", "/api/notes/:noteId/links"]],
  ["tasks.read", ["GET", "HEAD"], ["/api/tasks", "/api/tasks/calendar", "/api/tasks/timers", "/api/tasks/workbench-items", "/api/tasks/options", "/api/tasks/dashboard-summary", "/api/tasks/:taskId/recurrence-continuity", "/api/tasks/:taskId", "/api/tasks/:taskId/checklist", "/api/tasks/:taskId/relationships"]],
  ["time.read", ["GET", "HEAD"], ["/api/time-entries", "/api/active-timers", "/api/active-timers/all"]],
]);

function defineOperations(entries) {
  return Object.freeze(entries.flatMap(([id, methods, paths, options = {}]) => paths.flatMap((path) => methods.map((method) => Object.freeze({
    baseUnits: options.baseUnits ?? 1,
    collectionKeys: Object.freeze([...new Set([...COMMON_MUTATION_COLLECTION_KEYS, ...(options.collectionKeys || [])])]),
    id,
    method,
    path,
    regex: compilePathTemplate(path),
    reserve: options.reserve !== false,
  })))));
}

function compilePathTemplate(template) {
  const source = template.split("/").map((segment) => {
    if (segment.startsWith(":")) return "[^/]+";
    return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join("/");
  return new RegExp(`^${source}/?$`);
}

function resolveOperation(catalog, method, pathname) {
  const normalizedMethod = String(method || "").toUpperCase();
  return catalog.find((operation) => operation.method === normalizedMethod && operation.regex.test(pathname)) || null;
}

function resolvePublicDemoMutation(method, pathname) {
  return resolveOperation(MUTATION_OPERATIONS, method, pathname);
}

function resolvePublicDemoQuery(method, pathname) {
  return resolveOperation(QUERY_OPERATIONS, method, pathname);
}

function listPublicDemoBudgetOperations() {
  return Object.freeze([...MUTATION_OPERATIONS, ...QUERY_OPERATIONS].map(({ regex: _regex, ...operation }) => Object.freeze(operation)));
}

export {
  PUBLIC_DEMO_BUDGET_ERRORS,
  PUBLIC_DEMO_BUDGET_LIMITS,
  listPublicDemoBudgetOperations,
  resolvePublicDemoMutation,
  resolvePublicDemoQuery,
};
