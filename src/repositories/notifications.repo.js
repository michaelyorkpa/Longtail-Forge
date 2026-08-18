import { db } from "../core/database.js";
import { createRecordId } from "../core/identifiers.js";

/** @typedef {import("../types/database-contracts.js").DatabaseRow} DatabaseRow */
/** @typedef {import("../types/database-contracts.js").DatabaseNamedParameterInput} DatabaseNamedParameterInput */
/** @typedef {{ notification_id?: string, workspace_id: string, module_id?: string | null, event_type: string, recipient_user_id: string, actor_user_id?: string | null, record_type?: string | null, record_id?: string | null, title: string, body?: string | null, url?: string | null, status?: string, priority?: string, created_at?: string, read_at?: string | null, dismissed_at?: string | null, metadata_json?: string | null }} NotificationCreateInput */
/** @typedef {{ limit?: unknown, offset?: unknown, status?: unknown, moduleId?: unknown, module_id?: unknown, module?: unknown, eventType?: unknown, event_type?: unknown, priority?: unknown }} NotificationListOptions */
/** @typedef {{ notification_subscription_id?: string, module_id?: string, target_type?: string, target_id?: string, event_type?: string | null }} NotificationSubscriptionTarget */
/** @typedef {{ now?: unknown, status?: unknown, subscriptionId?: unknown }} NotificationSubscriptionWriteOptions */
/** @typedef {{ event_type?: unknown, enabled?: boolean }} NotificationUserPreferenceInput */
/** @typedef {{ event_type?: unknown, enabled?: boolean, priority?: unknown }} NotificationWorkspaceDefaultInput */
/** @typedef {{ grouping_mode?: unknown }} NotificationDisplayPreferenceInput */
/** @typedef {DatabaseRow & { total: unknown }} NotificationTotalRow */
/** @typedef {DatabaseRow & { count: unknown }} NotificationCountRow */
/** @typedef {DatabaseRow & { module_id: string | null }} NotificationModuleOptionRow */
/** @typedef {DatabaseRow & { event_type: string | null }} NotificationEventOptionRow */
/** @typedef {DatabaseRow & { unread_count: unknown, badge_count: unknown, low_unread_count: unknown, urgent_priority_count: unknown, high_priority_count: unknown }} NotificationBellSummaryRow */
/** @typedef {DatabaseRow & { user_id: string }} NotificationUserIdRow */
/** @typedef {DatabaseRow & { workspace_id: string, user_id: string, event_type: string, enabled: unknown, created_at: string, updated_at: string }} NotificationUserPreferenceRow */
/** @typedef {DatabaseRow & { workspace_id: string, event_type: string, enabled: unknown, priority: string, created_at: string, updated_at: string }} NotificationWorkspaceDefaultRow */
/** @typedef {DatabaseRow & { notification_id: string, workspace_id: string, module_id: string | null, event_type: string, recipient_user_id: string, actor_user_id: string | null, record_type: string | null, record_id: string | null, title: string, body: string | null, url: string | null, status: string, priority: string, created_at: string, read_at: string | null, dismissed_at: string | null, metadata_json: string | null }} NotificationRow */
/** @typedef {DatabaseRow & { workspace_id: string, user_id: string, grouping_mode: string, created_at: string, updated_at: string }} NotificationDisplayPreferenceRow */
/** @typedef {DatabaseRow & { notification_subscription_id: string, workspace_id: string, user_id: string, module_id: string, target_type: string, target_id: string, event_type: string | null, status: string, created_at: string, updated_at: string }} NotificationSubscriptionRow */

const NOTIFICATION_COLUMNS = `
  notification_id,
  workspace_id,
  module_id,
  event_type,
  recipient_user_id,
  actor_user_id,
  record_type,
  record_id,
  title,
  body,
  url,
  status,
  priority,
  created_at,
  read_at,
  dismissed_at,
  metadata_json
`;

const NOTIFICATION_SUBSCRIPTION_COLUMNS = [
  "notification_subscription_id",
  "workspace_id",
  "user_id",
  "module_id",
  "target_type",
  "target_id",
  "event_type",
  "status",
  "created_at",
  "updated_at",
];

const NOTIFICATION_SUBSCRIPTION_VALUE_EXPRESSIONS = {
  created_at: ":createdAt",
  event_type: ":eventType",
  module_id: ":moduleId",
  notification_subscription_id: ":subscriptionId",
  status: ":subscriptionStatus",
  target_id: ":targetId",
  target_type: ":targetType",
  updated_at: ":updatedAt",
  user_id: ":userId",
  workspace_id: ":workspaceId",
};

const NOTIFICATION_USER_PREFERENCE_COLUMNS = [
  "workspace_id",
  "user_id",
  "event_type",
  "enabled",
  "created_at",
  "updated_at",
];

const NOTIFICATION_USER_PREFERENCE_VALUE_EXPRESSIONS = {
  created_at: ":createdAt",
  enabled: ":enabled",
  event_type: ":eventType",
  updated_at: ":updatedAt",
  user_id: ":userId",
  workspace_id: ":workspaceId",
};

const NOTIFICATION_WORKSPACE_DEFAULT_COLUMNS = [
  "workspace_id",
  "event_type",
  "enabled",
  "priority",
  "created_at",
  "updated_at",
];

const NOTIFICATION_WORKSPACE_DEFAULT_VALUE_EXPRESSIONS = {
  created_at: ":createdAt",
  enabled: ":enabled",
  event_type: ":eventType",
  priority: ":priority",
  updated_at: ":updatedAt",
  workspace_id: ":workspaceId",
};

const NOTIFICATION_DISPLAY_PREFERENCE_COLUMNS = [
  "workspace_id",
  "user_id",
  "grouping_mode",
  "created_at",
  "updated_at",
];

const NOTIFICATION_DISPLAY_PREFERENCE_VALUE_EXPRESSIONS = {
  created_at: ":createdAt",
  grouping_mode: ":groupingMode",
  updated_at: ":updatedAt",
  user_id: ":userId",
  workspace_id: ":workspaceId",
};

/** @param {NotificationCreateInput} notification */
async function create(notification) {
  const notificationId = notification.notification_id || createRecordId();
  const now = notification.created_at || new Date().toISOString();

  if (notification.notification_id) {
    const existing = await readById(notification.workspace_id, notificationId);
    if (existing) {
      return existing;
    }
  }

  try {
    await db.run(`
INSERT INTO notifications (
  notification_id,
  workspace_id,
  module_id,
  event_type,
  recipient_user_id,
  actor_user_id,
  record_type,
  record_id,
  title,
  body,
  url,
  status,
  priority,
  created_at,
  read_at,
  dismissed_at,
  metadata_json
)
VALUES (
  :notificationId,
  :workspaceId,
  :moduleId,
  :eventType,
  :recipientUserId,
  :actorUserId,
  :recordType,
  :recordId,
  :title,
  :body,
  :url,
  :notificationStatus,
  :priority,
  :createdAt,
  :readAt,
  :dismissedAt,
  :metadataJson
);
`, notificationCreateParams(notification, notificationId, now));
  } catch (error) {
    if (notification.notification_id && isDuplicateNotificationIdError(error)) {
      const existing = await readById(notification.workspace_id, notificationId);
      if (existing) {
        return existing;
      }
    }
    throw error;
  }

  return readById(notification.workspace_id, notificationId);
}

/** @param {string} workspaceId @param {string} recipientUserId @param {NotificationListOptions} [options] */
async function listForRecipient(workspaceId, recipientUserId, options = {}) {
  const limit = clampLimit(options.limit);
  const offset = clampOffset(options.offset);
  const { clauses, params } = notificationListWhereClauses(workspaceId, recipientUserId, options);
  const rows = /** @type {NotificationRow[]} */ (await db.query(`
SELECT
${NOTIFICATION_COLUMNS}
FROM notifications
WHERE ${clauses.join("\n  AND ")}
ORDER BY created_at DESC, notification_id DESC
LIMIT :limit
OFFSET :offset;
`, {
    ...params,
    limit: integerParam(limit),
    offset: integerParam(offset),
  }));

  return rows.map(notificationRowToAppValue);
}

/** @param {string} workspaceId @param {string} recipientUserId @param {NotificationListOptions} [options] */
async function countForRecipient(workspaceId, recipientUserId, options = {}) {
  const { clauses, params } = notificationListWhereClauses(workspaceId, recipientUserId, options);
  const row = /** @type {NotificationTotalRow | null} */ (await db.get(`
SELECT COUNT(*) AS total
FROM notifications
WHERE ${clauses.join("\n  AND ")};
`, params));

  return Number(row?.total || 0);
}

/** @param {string} workspaceId @param {string} recipientUserId @param {NotificationListOptions} [options] */
async function readFilterOptionsForRecipient(workspaceId, recipientUserId, options = {}) {
  const { clauses, params } = notificationListWhereClauses(workspaceId, recipientUserId, {
    status: options.status,
  });
  const [modules, events] = await Promise.all([
    /** @type {Promise<NotificationModuleOptionRow[]>} */ (db.query(`
SELECT DISTINCT module_id
FROM notifications
WHERE ${clauses.join("\n  AND ")}
  AND module_id IS NOT NULL
  AND module_id != ''
ORDER BY ${db.dialect.comparison.orderByNoCase("module_id", "ASC")};
`, { ...params })),
    /** @type {Promise<NotificationEventOptionRow[]>} */ (db.query(`
SELECT DISTINCT event_type
FROM notifications
WHERE ${clauses.join("\n  AND ")}
  AND event_type IS NOT NULL
  AND event_type != ''
ORDER BY ${db.dialect.comparison.orderByNoCase("event_type", "ASC")};
`, { ...params })),
  ]);

  return {
    events: events.map((row) => row.event_type).filter(Boolean),
    modules: modules.map((row) => row.module_id).filter(Boolean),
  };
}

/** @param {string} workspaceId @param {string} recipientUserId */
async function countUnreadForRecipient(workspaceId, recipientUserId) {
  const row = /** @type {NotificationCountRow | null} */ (await db.get(`
SELECT COUNT(*) AS count
FROM notifications
WHERE workspace_id = :workspaceId
  AND recipient_user_id = :recipientUserId
  AND status = :unreadStatus;
`, {
    recipientUserId: textParam(recipientUserId),
    unreadStatus: "unread",
    workspaceId: textParam(workspaceId),
  }));

  return Number(row?.count || 0);
}

/** @param {string} workspaceId @param {string} recipientUserId */
async function readBellSummaryForRecipient(workspaceId, recipientUserId) {
  const row = /** @type {NotificationBellSummaryRow | null} */ (await db.get(`
SELECT
  SUM(CASE WHEN status = :unreadStatus THEN 1 ELSE 0 END) AS unread_count,
  SUM(CASE WHEN status = :unreadStatus AND priority != :lowPriority THEN 1 ELSE 0 END) AS badge_count,
  SUM(CASE WHEN status = :unreadStatus AND priority = :lowPriority THEN 1 ELSE 0 END) AS low_unread_count,
  SUM(CASE WHEN status IN (:activeStatuses) AND priority = :urgentPriority THEN 1 ELSE 0 END) AS urgent_priority_count,
  SUM(CASE WHEN status IN (:activeStatuses) AND priority = :highPriority THEN 1 ELSE 0 END) AS high_priority_count
FROM notifications
WHERE workspace_id = :workspaceId
  AND recipient_user_id = :recipientUserId;
`, {
    activeStatuses: ["unread", "read"],
    highPriority: "high",
    lowPriority: "low",
    recipientUserId: textParam(recipientUserId),
    unreadStatus: "unread",
    urgentPriority: "urgent",
    workspaceId: textParam(workspaceId),
  }));
  const summary = row;
  const urgentPriorityCount = Number(summary?.urgent_priority_count || 0);
  const highPriorityCount = Number(summary?.high_priority_count || 0);

  return {
    count: Number(summary?.badge_count || 0),
    unreadCount: Number(summary?.badge_count || 0),
    totalUnreadCount: Number(summary?.unread_count || 0),
    lowPriorityUnreadCount: Number(summary?.low_unread_count || 0),
    urgentPriorityCount,
    highPriorityCount,
    hasUrgentPriority: urgentPriorityCount > 0,
    hasHighPriority: highPriorityCount > 0,
    hasPriorityAlert: urgentPriorityCount > 0 || highPriorityCount > 0,
  };
}

/** @param {string} workspaceId @param {string} recipientUserId @param {string} notificationId */
async function readByIdForRecipient(workspaceId, recipientUserId, notificationId) {
  const row = /** @type {NotificationRow | null} */ (await db.get(`
SELECT
${NOTIFICATION_COLUMNS}
FROM notifications
WHERE workspace_id = :workspaceId
  AND recipient_user_id = :recipientUserId
  AND notification_id = :notificationId
LIMIT 1;
`, {
    notificationId: textParam(notificationId),
    recipientUserId: textParam(recipientUserId),
    workspaceId: textParam(workspaceId),
  }));

  return row ? notificationRowToAppValue(row) : null;
}

/** @param {string} workspaceId @param {string} notificationId */
async function readById(workspaceId, notificationId) {
  const row = /** @type {NotificationRow | null} */ (await db.get(`
SELECT
${NOTIFICATION_COLUMNS}
FROM notifications
WHERE workspace_id = :workspaceId
  AND notification_id = :notificationId
LIMIT 1;
`, {
    notificationId: textParam(notificationId),
    workspaceId: textParam(workspaceId),
  }));

  return row ? notificationRowToAppValue(row) : null;
}

/** @param {string} workspaceId @param {string} recipientUserId @param {string} notificationId */
async function markRead(workspaceId, recipientUserId, notificationId) {
  const now = new Date().toISOString();

  await db.run(`
UPDATE notifications
SET status = CASE WHEN status = :dismissedStatus THEN status ELSE :readStatus END,
    read_at = COALESCE(read_at, :readAt)
WHERE workspace_id = :workspaceId
  AND recipient_user_id = :recipientUserId
  AND notification_id = :notificationId;
`, {
    dismissedStatus: "dismissed",
    notificationId: textParam(notificationId),
    readAt: now,
    readStatus: "read",
    recipientUserId: textParam(recipientUserId),
    workspaceId: textParam(workspaceId),
  });

  return readByIdForRecipient(workspaceId, recipientUserId, notificationId);
}

/** @param {string} workspaceId @param {string} recipientUserId */
async function markAllRead(workspaceId, recipientUserId) {
  const now = new Date().toISOString();

  await db.run(`
UPDATE notifications
SET status = :readStatus,
    read_at = COALESCE(read_at, :readAt)
WHERE workspace_id = :workspaceId
  AND recipient_user_id = :recipientUserId
  AND status = :unreadStatus;
`, {
    readAt: now,
    readStatus: "read",
    recipientUserId: textParam(recipientUserId),
    unreadStatus: "unread",
    workspaceId: textParam(workspaceId),
  });
}

/** @param {string} workspaceId @param {string} recipientUserId @param {string} notificationId */
async function dismiss(workspaceId, recipientUserId, notificationId) {
  const now = new Date().toISOString();

  await db.run(`
UPDATE notifications
SET status = :dismissedStatus,
    dismissed_at = COALESCE(dismissed_at, :dismissedAt)
WHERE workspace_id = :workspaceId
  AND recipient_user_id = :recipientUserId
  AND notification_id = :notificationId;
`, {
    dismissedAt: now,
    dismissedStatus: "dismissed",
    notificationId: textParam(notificationId),
    recipientUserId: textParam(recipientUserId),
    workspaceId: textParam(workspaceId),
  });

  return readByIdForRecipient(workspaceId, recipientUserId, notificationId);
}

/** @param {string} workspaceId @param {string} recipientUserId */
async function dismissAll(workspaceId, recipientUserId) {
  const now = new Date().toISOString();

  await db.run(`
UPDATE notifications
SET status = :dismissedStatus,
    dismissed_at = COALESCE(dismissed_at, :dismissedAt)
WHERE workspace_id = :workspaceId
  AND recipient_user_id = :recipientUserId
  AND status IN (:activeStatuses);
`, {
    activeStatuses: ["unread", "read"],
    dismissedAt: now,
    dismissedStatus: "dismissed",
    recipientUserId: textParam(recipientUserId),
    workspaceId: textParam(workspaceId),
  });
}

/** @param {string} cutoffIso */
async function archiveOlderThan(cutoffIso) {
  await db.run(`
UPDATE notifications
SET status = :archivedStatus
WHERE created_at < :cutoffIso
  AND status IN (:archivableStatuses);
`, {
    archivableStatuses: ["read", "dismissed"],
    archivedStatus: "archived",
    cutoffIso: textParam(cutoffIso),
  });
}

/** @param {string} workspaceId @param {string} moduleId @param {string} recordType @param {unknown[]} [recordIds] */
async function removeForTargets(workspaceId, moduleId, recordType, recordIds = []) {
  const ids = [...new Set((Array.isArray(recordIds) ? recordIds : [recordIds])
    .map((recordId) => textParam(recordId).trim())
    .filter(Boolean))];
  if (ids.length === 0) {
    return { removed: true, targetCount: 0 };
  }

  const params = {
    moduleId: textParam(moduleId),
    recordIds: ids,
    recordType: textParam(recordType),
    workspaceId: textParam(workspaceId),
  };
  await db.transaction(async (transaction) => {
    await transaction.run(`
DELETE FROM notifications
WHERE workspace_id = :workspaceId
  AND module_id = :moduleId
  AND record_type = :recordType
  AND record_id IN (:recordIds);
`, params);
    await transaction.run(`
DELETE FROM notification_subscriptions
WHERE workspace_id = :workspaceId
  AND module_id = :moduleId
  AND target_type = :recordType
  AND target_id IN (:recordIds);
`, params);
  });

  return { removed: true, targetCount: ids.length };
}

/** @param {string} workspaceId */
async function readWorkspaceAdminUserIds(workspaceId) {
  const rows = /** @type {NotificationUserIdRow[]} */ (await db.query(`
SELECT DISTINCT user_id
FROM user_role_assignments
WHERE workspace_id = :workspaceId
  AND role_id = :roleId;
`, {
    roleId: "workspace_admin",
    workspaceId: textParam(workspaceId),
  }));

  return rows.map((row) => row.user_id).filter(Boolean);
}

/** @param {string} workspaceId @param {string} userId */
async function readUserPreferences(workspaceId, userId) {
  return /** @type {Promise<NotificationUserPreferenceRow[]>} */ (db.query(`
SELECT workspace_id, user_id, event_type, enabled, created_at, updated_at
FROM notification_user_preferences
WHERE workspace_id = :workspaceId
  AND user_id = :userId
ORDER BY event_type;
`, {
    userId: textParam(userId),
    workspaceId: textParam(workspaceId),
  }));
}

/** @param {string} workspaceId @param {string} userId */
async function readUserDisplayPreferences(workspaceId, userId) {
  const row = /** @type {NotificationDisplayPreferenceRow | null} */ (await db.get(`
SELECT workspace_id, user_id, grouping_mode, created_at, updated_at
FROM notification_user_display_preferences
WHERE workspace_id = :workspaceId
  AND user_id = :userId
LIMIT 1;
`, {
    userId: textParam(userId),
    workspaceId: textParam(workspaceId),
  }));

  return row ? displayPreferenceRowToAppValue(row) : null;
}

/** @param {string} workspaceId */
async function readWorkspaceDefaults(workspaceId) {
  return /** @type {Promise<NotificationWorkspaceDefaultRow[]>} */ (db.query(`
SELECT workspace_id, event_type, enabled, priority, created_at, updated_at
FROM notification_workspace_defaults
WHERE workspace_id = :workspaceId
ORDER BY event_type;
`, {
    workspaceId: textParam(workspaceId),
  }));
}

/** @param {string} workspaceId @param {string} userId @param {NotificationSubscriptionTarget} target */
async function readSubscription(workspaceId, userId, target) {
  const row = /** @type {NotificationSubscriptionRow | null} */ (await db.get(`
SELECT notification_subscription_id, workspace_id, user_id, module_id, target_type, target_id, event_type, status, created_at, updated_at
FROM notification_subscriptions
WHERE workspace_id = :workspaceId
  AND user_id = :userId
  AND module_id = :moduleId
  AND target_type = :targetType
  AND target_id = :targetId
  AND COALESCE(event_type, '') = :eventType
LIMIT 1;
`, subscriptionTargetParams(workspaceId, userId, target)));

  return row ? subscriptionRowToAppValue(row) : null;
}

/** @param {string} workspaceId @param {NotificationSubscriptionTarget} target */
async function readSubscriptionsForTarget(workspaceId, target) {
  const rows = /** @type {NotificationSubscriptionRow[]} */ (await db.query(`
SELECT notification_subscription_id, workspace_id, user_id, module_id, target_type, target_id, event_type, status, created_at, updated_at
FROM notification_subscriptions
WHERE workspace_id = :workspaceId
  AND module_id = :moduleId
  AND target_type = :targetType
  AND target_id = :targetId
  AND status = :activeStatus
  AND (event_type IS NULL OR event_type = '' OR event_type = :eventType)
ORDER BY created_at;
`, {
    activeStatus: "active",
    eventType: textParam(target.event_type || ""),
    moduleId: textParam(target.module_id),
    targetId: textParam(target.target_id),
    targetType: textParam(target.target_type),
    workspaceId: textParam(workspaceId),
  }));

  return rows.map(subscriptionRowToAppValue);
}

/** @param {string} workspaceId @param {string} userId @param {NotificationSubscriptionTarget} target */
async function saveSubscription(workspaceId, userId, target) {
  const subscriptionId = target.notification_subscription_id || createRecordId();
  const now = new Date().toISOString();

  await db.run(`${db.dialect.conflict.buildInsertOnAnyConflictDoUpdate({
    columns: NOTIFICATION_SUBSCRIPTION_COLUMNS,
    tableName: "notification_subscriptions",
    updateColumns: [
      "status",
      "updated_at",
    ],
    valueExpressions: NOTIFICATION_SUBSCRIPTION_VALUE_EXPRESSIONS,
  })};`, subscriptionWriteParams(workspaceId, userId, target, {
    now,
    status: "active",
    subscriptionId,
  }));

  return readSubscription(workspaceId, userId, target);
}

/** @param {string} workspaceId @param {string} userId @param {NotificationSubscriptionTarget} target */
async function removeSubscription(workspaceId, userId, target) {
  const now = new Date().toISOString();

  await db.run(`
UPDATE notification_subscriptions
SET status = :inactiveStatus,
    updated_at = :updatedAt
WHERE workspace_id = :workspaceId
  AND user_id = :userId
  AND module_id = :moduleId
  AND target_type = :targetType
  AND target_id = :targetId
  AND COALESCE(event_type, '') = :eventType;
`, {
    ...subscriptionTargetParams(workspaceId, userId, target),
    inactiveStatus: "inactive",
    updatedAt: textParam(now),
  });

  return readSubscription(workspaceId, userId, target);
}

/** @param {string} workspaceId @param {string} userId @param {NotificationUserPreferenceInput[]} preferences */
async function saveUserPreferences(workspaceId, userId, preferences) {
  const now = new Date().toISOString();
  const rows = Array.isArray(preferences) ? preferences : [];

  if (rows.length > 0) {
    await db.transaction(async (transaction) => {
      for (const preference of rows) {
        await transaction.run(`${transaction.dialect.conflict.buildInsertOnConflictDoUpdate({
          columns: NOTIFICATION_USER_PREFERENCE_COLUMNS,
          conflictColumns: ["workspace_id", "user_id", "event_type"],
          tableName: "notification_user_preferences",
          updateColumns: [
            "enabled",
            "updated_at",
          ],
          valueExpressions: NOTIFICATION_USER_PREFERENCE_VALUE_EXPRESSIONS,
        })};`, notificationUserPreferenceParams(workspaceId, userId, preference, now));
      }
    });
  }
}

/** @param {string} workspaceId @param {NotificationWorkspaceDefaultInput[]} defaults */
async function saveWorkspaceDefaults(workspaceId, defaults) {
  const now = new Date().toISOString();
  const rows = Array.isArray(defaults) ? defaults : [];

  if (rows.length > 0) {
    await db.transaction(async (transaction) => {
      for (const preference of rows) {
        await transaction.run(`${transaction.dialect.conflict.buildInsertOnConflictDoUpdate({
          columns: NOTIFICATION_WORKSPACE_DEFAULT_COLUMNS,
          conflictColumns: ["workspace_id", "event_type"],
          tableName: "notification_workspace_defaults",
          updateColumns: [
            "enabled",
            "priority",
            "updated_at",
          ],
          valueExpressions: NOTIFICATION_WORKSPACE_DEFAULT_VALUE_EXPRESSIONS,
        })};`, notificationWorkspaceDefaultParams(workspaceId, preference, now));
      }
    });
  }
}

/** @param {string} workspaceId @param {string} userId @param {NotificationDisplayPreferenceInput} preferences */
async function saveUserDisplayPreferences(workspaceId, userId, preferences) {
  const now = new Date().toISOString();

  await db.run(`${db.dialect.conflict.buildInsertOnConflictDoUpdate({
    columns: NOTIFICATION_DISPLAY_PREFERENCE_COLUMNS,
    conflictColumns: ["workspace_id", "user_id"],
    tableName: "notification_user_display_preferences",
    updateColumns: [
      "grouping_mode",
      "updated_at",
    ],
    valueExpressions: NOTIFICATION_DISPLAY_PREFERENCE_VALUE_EXPRESSIONS,
  })};`, notificationDisplayPreferenceParams(workspaceId, userId, preferences, now));

  return readUserDisplayPreferences(workspaceId, userId);
}

/** @param {NotificationRow} databaseRow */
function notificationRowToAppValue(databaseRow) {
  const row = databaseRow;
  return {
    notification_id: row.notification_id,
    workspace_id: row.workspace_id,
    module_id: row.module_id || "",
    event_type: row.event_type,
    recipient_user_id: row.recipient_user_id,
    actor_user_id: row.actor_user_id || "",
    record_type: row.record_type || "",
    record_id: row.record_id || "",
    title: row.title,
    body: row.body || "",
    url: row.url || "",
    status: row.status || "unread",
    priority: row.priority || "normal",
    created_at: row.created_at,
    read_at: row.read_at || "",
    dismissed_at: row.dismissed_at || "",
    metadata: parseMetadata(row.metadata_json),
  };
}

/** @param {NotificationDisplayPreferenceRow} databaseRow */
function displayPreferenceRowToAppValue(databaseRow) {
  const row = databaseRow;
  return {
    workspace_id: row.workspace_id,
    user_id: row.user_id,
    groupingMode: row.grouping_mode || "client_project",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** @param {NotificationSubscriptionRow} databaseRow */
function subscriptionRowToAppValue(databaseRow) {
  const row = databaseRow;
  return {
    notification_subscription_id: row.notification_subscription_id,
    workspace_id: row.workspace_id,
    user_id: row.user_id,
    module_id: row.module_id,
    target_type: row.target_type,
    target_id: row.target_id,
    event_type: row.event_type || "",
    status: row.status || "inactive",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** @param {string | null | undefined} metadataJson */
function parseMetadata(metadataJson) {
  try {
    const parsed = JSON.parse(metadataJson || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** @param {NotificationCreateInput} notification @param {string} notificationId @param {string} now */
function notificationCreateParams(notification, notificationId, now) {
  return {
    actorUserId: nullableTextParam(notification.actor_user_id),
    body: textParam(notification.body || ""),
    createdAt: textParam(now),
    dismissedAt: nullableTextParam(notification.dismissed_at),
    eventType: textParam(notification.event_type),
    metadataJson: textParam(notification.metadata_json || "{}"),
    moduleId: nullableTextParam(notification.module_id),
    notificationId: textParam(notificationId),
    notificationStatus: textParam(notification.status || "unread"),
    priority: textParam(notification.priority || "normal"),
    readAt: nullableTextParam(notification.read_at),
    recipientUserId: textParam(notification.recipient_user_id),
    recordId: nullableTextParam(notification.record_id),
    recordType: nullableTextParam(notification.record_type),
    title: textParam(notification.title),
    url: nullableTextParam(notification.url),
    workspaceId: textParam(notification.workspace_id),
  };
}

/** @param {string} workspaceId @param {string} userId @param {NotificationSubscriptionTarget} [target] */
function subscriptionTargetParams(workspaceId, userId, target = {}) {
  return {
    eventType: textParam(target.event_type || ""),
    moduleId: textParam(target.module_id),
    targetId: textParam(target.target_id),
    targetType: textParam(target.target_type),
    userId: textParam(userId),
    workspaceId: textParam(workspaceId),
  };
}

/** @param {string} workspaceId @param {string} userId @param {NotificationSubscriptionTarget} target @param {NotificationSubscriptionWriteOptions} [options] */
function subscriptionWriteParams(workspaceId, userId, target, options = {}) {
  return {
    createdAt: textParam(options.now),
    eventType: nullableTextParam(target.event_type),
    moduleId: textParam(target.module_id),
    subscriptionId: textParam(options.subscriptionId),
    subscriptionStatus: textParam(options.status || "active"),
    targetId: textParam(target.target_id),
    targetType: textParam(target.target_type),
    updatedAt: textParam(options.now),
    userId: textParam(userId),
    workspaceId: textParam(workspaceId),
  };
}

/** @param {string} workspaceId @param {string} userId @param {NotificationUserPreferenceInput} [preference] @param {string} [now] */
function notificationUserPreferenceParams(workspaceId, userId, preference = {}, now) {
  return {
    createdAt: textParam(now),
    enabled: db.dialect.boolean.bind(preference.enabled === true),
    eventType: textParam(preference.event_type),
    updatedAt: textParam(now),
    userId: textParam(userId),
    workspaceId: textParam(workspaceId),
  };
}

/** @param {string} workspaceId @param {NotificationWorkspaceDefaultInput} [preference] @param {string} [now] */
function notificationWorkspaceDefaultParams(workspaceId, preference = {}, now) {
  return {
    createdAt: textParam(now),
    enabled: db.dialect.boolean.bind(preference.enabled === true),
    eventType: textParam(preference.event_type),
    priority: textParam(preference.priority || "normal"),
    updatedAt: textParam(now),
    workspaceId: textParam(workspaceId),
  };
}

/** @param {string} workspaceId @param {string} userId @param {NotificationDisplayPreferenceInput} [preferences] @param {string} [now] */
function notificationDisplayPreferenceParams(workspaceId, userId, preferences = {}, now) {
  return {
    createdAt: textParam(now),
    groupingMode: textParam(preferences.grouping_mode || "client_project"),
    updatedAt: textParam(now),
    userId: textParam(userId),
    workspaceId: textParam(workspaceId),
  };
}

/** @param {unknown} error */
function isDuplicateNotificationIdError(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("UNIQUE constraint failed: notifications.notification_id") ||
    message.includes("PRIMARY KEY");
}

/** @param {unknown} status */
function normalizeStatusFilter(status) {
  const normalizedStatus = String(status || "").trim();
  return ["active", "unread", "read", "dismissed", "archived"].includes(normalizedStatus) ? normalizedStatus : "";
}

/** @param {string} workspaceId @param {string} recipientUserId @param {NotificationListOptions} [options] */
function notificationListWhereClauses(workspaceId, recipientUserId, options = {}) {
  const status = normalizeStatusFilter(options.status);
  const moduleId = normalizeTextFilter(options.moduleId || options.module_id || options.module);
  const eventType = normalizeTextFilter(options.eventType || options.event_type);
  const priority = normalizePriorityFilter(options.priority);
  const clauses = [
    "workspace_id = :workspaceId",
    "recipient_user_id = :recipientUserId",
  ];
  /** @type {Record<string, DatabaseNamedParameterInput>} */
  const params = {
    recipientUserId: textParam(recipientUserId),
    workspaceId: textParam(workspaceId),
  };

  if (status === "active") {
    clauses.push("status IN (:activeStatuses)");
    params.activeStatuses = ["unread", "read"];
  } else if (status) {
    clauses.push("status = :status");
    params.status = status;
  }
  if (moduleId) {
    clauses.push("module_id = :moduleId");
    params.moduleId = moduleId;
  }
  if (eventType) {
    clauses.push("event_type = :eventType");
    params.eventType = eventType;
  }
  if (priority) {
    clauses.push("priority = :priority");
    params.priority = priority;
  }

  return { clauses, params };
}

/** @param {unknown} value */
function textParam(value) {
  return String(value ?? "");
}

/** @param {unknown} value */
function nullableTextParam(value) {
  return value === null || value === undefined || String(value).trim() === ""
    ? null
    : String(value);
}

/** @param {unknown} value */
function integerParam(value) {
  const numberValue = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

/** @param {unknown} value */
function normalizeTextFilter(value) {
  return String(value || "").trim().slice(0, 120);
}

/** @param {unknown} value */
function normalizePriorityFilter(value) {
  const priority = String(value || "").trim();
  return ["low", "normal", "high", "urgent"].includes(priority) ? priority : "";
}

/** @param {unknown} limit */
function clampLimit(limit) {
  const numericLimit = Number.parseInt(String(limit ?? ""), 10);
  if (!Number.isFinite(numericLimit)) {
    return 25;
  }

  return Math.min(Math.max(numericLimit, 1), 100);
}

/** @param {unknown} offset */
function clampOffset(offset) {
  const numericOffset = Number.parseInt(String(offset ?? ""), 10);
  return Number.isFinite(numericOffset) && numericOffset > 0 ? numericOffset : 0;
}

export const notificationsRepository = {
  archiveOlderThan,
  countForRecipient,
  countUnreadForRecipient,
  create,
  dismiss,
  dismissAll,
  listForRecipient,
  markAllRead,
  markRead,
  readBellSummaryForRecipient,
  readById,
  readByIdForRecipient,
  readFilterOptionsForRecipient,
  readUserDisplayPreferences,
  readUserPreferences,
  readSubscription,
  readSubscriptionsForTarget,
  readWorkspaceAdminUserIds,
  readWorkspaceDefaults,
  removeForTargets,
  removeSubscription,
  saveSubscription,
  saveUserDisplayPreferences,
  saveUserPreferences,
  saveWorkspaceDefaults,
};
