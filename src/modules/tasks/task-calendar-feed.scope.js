const TASK_CALENDAR_FEED_SCOPE_TYPES = new Set(["workspace", "client", "project"]);

/**
 * @param {Partial<import("../../types/task-recurrence-contracts.d.ts").TaskCalendarFeedScope> | null | undefined} value
 * @returns {Readonly<import("../../types/task-recurrence-contracts.d.ts").TaskCalendarFeedScope>}
 */
function normalizeTaskCalendarFeedScope(value) {
  const type = String(value?.type || "workspace").trim().toLowerCase();
  if (!TASK_CALENDAR_FEED_SCOPE_TYPES.has(type)) {
    throw new TypeError("Task calendar feed scope must be workspace, client, or project.");
  }

  const clientId = normalizeIdentity(value?.clientId);
  const projectId = normalizeIdentity(value?.projectId);
  if (type === "client" && !clientId) {
    throw new TypeError("Client-scoped Task calendar feeds require a client.");
  }
  if (type === "project" && !projectId) {
    throw new TypeError("Project-scoped Task calendar feeds require a project.");
  }

  const normalizedType = /** @type {import("../../types/task-recurrence-contracts.d.ts").TaskCalendarFeedScope["type"]} */ (type);
  return Object.freeze({
    clientId: type === "workspace" ? null : clientId,
    projectId: type === "project" ? projectId : null,
    type: normalizedType,
  });
}

/**
 * @param {Partial<import("../../types/task-recurrence-contracts.d.ts").TaskCalendarFeedScope> | null | undefined} scope
 * @param {import("../../types/task-recurrence-contracts.d.ts").TaskCalendarScopeSqlOptions} [aliases]
 * @returns {import("../../types/task-recurrence-contracts.d.ts").TaskCalendarScopeSql}
 */
function taskCalendarFeedScopeSql(scope, {
  projectAlias = "projects",
  recordAlias,
} = {}) {
  const normalized = normalizeTaskCalendarFeedScope(scope);
  if (!recordAlias) {
    throw new TypeError("Task calendar feed SQL scope requires a record alias.");
  }
  if (normalized.type === "workspace") {
    return {
      params: {},
      sql: "1 = 1",
    };
  }
  if (normalized.type === "project") {
    return {
      params: { feedScopeProjectId: normalized.projectId },
      sql: `${recordAlias}.project_id = :feedScopeProjectId`,
    };
  }
  return {
    params: { feedScopeClientId: normalized.clientId },
    sql: `(
    (
      (${recordAlias}.project_id IS NULL OR ${recordAlias}.project_id = '')
      AND ${recordAlias}.client_id = :feedScopeClientId
    )
    OR ${projectAlias}.client_id = :feedScopeClientId
  )`,
  };
}

/**
 * @param {import("../../types/task-recurrence-contracts.d.ts").TaskCalendarSubscription} subscription
 */
function taskCalendarSubscriptionResource(subscription) {
  const scope = normalizeTaskCalendarFeedScope(subscription?.scope);
  return {
    client_id: scope.clientId || undefined,
    operation: "read",
    project_id: scope.projectId || undefined,
    workspace_id: subscription?.workspaceId || "",
  };
}

/** @param {unknown} value */
function normalizeIdentity(value) {
  const identity = String(value || "").trim();
  return identity || null;
}

export {
  normalizeTaskCalendarFeedScope,
  taskCalendarFeedScopeSql,
  taskCalendarSubscriptionResource,
};
