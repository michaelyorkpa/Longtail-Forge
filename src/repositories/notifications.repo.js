import { randomUUID } from "node:crypto";
import { querySql, runSql, sqlInteger, sqlNullableText, sqlText } from "../db/index.js";

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

async function create(notification) {
  const notificationId = notification.notification_id || randomUUID();
  const now = notification.created_at || new Date().toISOString();

  await runSql(`
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
  ${sqlText(notificationId)},
  ${sqlText(notification.workspace_id)},
  ${sqlNullableText(notification.module_id)},
  ${sqlText(notification.event_type)},
  ${sqlText(notification.recipient_user_id)},
  ${sqlNullableText(notification.actor_user_id)},
  ${sqlNullableText(notification.record_type)},
  ${sqlNullableText(notification.record_id)},
  ${sqlText(notification.title)},
  ${sqlText(notification.body || "")},
  ${sqlNullableText(notification.url)},
  ${sqlText(notification.status || "unread")},
  ${sqlText(notification.priority || "normal")},
  ${sqlText(now)},
  ${sqlNullableText(notification.read_at)},
  ${sqlNullableText(notification.dismissed_at)},
  ${sqlText(notification.metadata_json || "{}")}
);
`);

  return readById(notification.workspace_id, notificationId);
}

async function listForRecipient(workspaceId, recipientUserId, options = {}) {
  const status = normalizeStatusFilter(options.status);
  const statusClause = status === "active"
    ? "AND status IN ('unread', 'read')"
    : status ? `AND status = ${sqlText(status)}` : "";
  const limit = clampLimit(options.limit);
  const offset = clampOffset(options.offset);
  const rows = await querySql(`
SELECT
${NOTIFICATION_COLUMNS}
FROM notifications
WHERE workspace_id = ${sqlText(workspaceId)}
  AND recipient_user_id = ${sqlText(recipientUserId)}
  ${statusClause}
ORDER BY created_at DESC, notification_id DESC
LIMIT ${sqlInteger(limit)}
OFFSET ${sqlInteger(offset)};
`);

  return rows.map(notificationRowToAppValue);
}

async function countUnreadForRecipient(workspaceId, recipientUserId) {
  const rows = await querySql(`
SELECT COUNT(*) AS count
FROM notifications
WHERE workspace_id = ${sqlText(workspaceId)}
  AND recipient_user_id = ${sqlText(recipientUserId)}
  AND status = 'unread';
`);

  return Number(rows[0]?.count || 0);
}

async function readBellSummaryForRecipient(workspaceId, recipientUserId) {
  const rows = await querySql(`
SELECT
  SUM(CASE WHEN status = 'unread' THEN 1 ELSE 0 END) AS unread_count,
  SUM(CASE WHEN status = 'unread' AND priority != 'low' THEN 1 ELSE 0 END) AS badge_count,
  SUM(CASE WHEN status = 'unread' AND priority = 'low' THEN 1 ELSE 0 END) AS low_unread_count,
  SUM(CASE WHEN status IN ('unread', 'read') AND priority = 'urgent' THEN 1 ELSE 0 END) AS urgent_priority_count,
  SUM(CASE WHEN status IN ('unread', 'read') AND priority = 'high' THEN 1 ELSE 0 END) AS high_priority_count
FROM notifications
WHERE workspace_id = ${sqlText(workspaceId)}
  AND recipient_user_id = ${sqlText(recipientUserId)};
`);
  const summary = rows[0] || {};
  const urgentPriorityCount = Number(summary.urgent_priority_count || 0);
  const highPriorityCount = Number(summary.high_priority_count || 0);

  return {
    count: Number(summary.badge_count || 0),
    unreadCount: Number(summary.badge_count || 0),
    totalUnreadCount: Number(summary.unread_count || 0),
    lowPriorityUnreadCount: Number(summary.low_unread_count || 0),
    urgentPriorityCount,
    highPriorityCount,
    hasUrgentPriority: urgentPriorityCount > 0,
    hasHighPriority: highPriorityCount > 0,
    hasPriorityAlert: urgentPriorityCount > 0 || highPriorityCount > 0,
  };
}

async function readByIdForRecipient(workspaceId, recipientUserId, notificationId) {
  const rows = await querySql(`
SELECT
${NOTIFICATION_COLUMNS}
FROM notifications
WHERE workspace_id = ${sqlText(workspaceId)}
  AND recipient_user_id = ${sqlText(recipientUserId)}
  AND notification_id = ${sqlText(notificationId)}
LIMIT 1;
`);

  return rows[0] ? notificationRowToAppValue(rows[0]) : null;
}

async function readById(workspaceId, notificationId) {
  const rows = await querySql(`
SELECT
${NOTIFICATION_COLUMNS}
FROM notifications
WHERE workspace_id = ${sqlText(workspaceId)}
  AND notification_id = ${sqlText(notificationId)}
LIMIT 1;
`);

  return rows[0] ? notificationRowToAppValue(rows[0]) : null;
}

async function markRead(workspaceId, recipientUserId, notificationId) {
  const now = new Date().toISOString();

  await runSql(`
UPDATE notifications
SET status = CASE WHEN status = 'dismissed' THEN status ELSE 'read' END,
    read_at = COALESCE(read_at, ${sqlText(now)})
WHERE workspace_id = ${sqlText(workspaceId)}
  AND recipient_user_id = ${sqlText(recipientUserId)}
  AND notification_id = ${sqlText(notificationId)};
`);

  return readByIdForRecipient(workspaceId, recipientUserId, notificationId);
}

async function markAllRead(workspaceId, recipientUserId) {
  const now = new Date().toISOString();

  await runSql(`
UPDATE notifications
SET status = 'read',
    read_at = COALESCE(read_at, ${sqlText(now)})
WHERE workspace_id = ${sqlText(workspaceId)}
  AND recipient_user_id = ${sqlText(recipientUserId)}
  AND status = 'unread';
`);
}

async function dismiss(workspaceId, recipientUserId, notificationId) {
  const now = new Date().toISOString();

  await runSql(`
UPDATE notifications
SET status = 'dismissed',
    dismissed_at = COALESCE(dismissed_at, ${sqlText(now)})
WHERE workspace_id = ${sqlText(workspaceId)}
  AND recipient_user_id = ${sqlText(recipientUserId)}
  AND notification_id = ${sqlText(notificationId)};
`);

  return readByIdForRecipient(workspaceId, recipientUserId, notificationId);
}

async function dismissAll(workspaceId, recipientUserId) {
  const now = new Date().toISOString();

  await runSql(`
UPDATE notifications
SET status = 'dismissed',
    dismissed_at = COALESCE(dismissed_at, ${sqlText(now)})
WHERE workspace_id = ${sqlText(workspaceId)}
  AND recipient_user_id = ${sqlText(recipientUserId)}
  AND status IN ('unread', 'read');
`);
}

async function archiveOlderThan(cutoffIso) {
  await runSql(`
UPDATE notifications
SET status = 'archived'
WHERE created_at < ${sqlText(cutoffIso)}
  AND status IN ('read', 'dismissed');
`);
}

async function readWorkspaceAdminUserIds(workspaceId) {
  const rows = await querySql(`
SELECT DISTINCT user_id
FROM user_role_assignments
WHERE workspace_id = ${sqlText(workspaceId)}
  AND role_id = 'workspace_admin';
`);

  return rows.map((row) => row.user_id).filter(Boolean);
}

async function readUserPreferences(workspaceId, userId) {
  return querySql(`
SELECT workspace_id, user_id, event_type, enabled, created_at, updated_at
FROM notification_user_preferences
WHERE workspace_id = ${sqlText(workspaceId)}
  AND user_id = ${sqlText(userId)}
ORDER BY event_type;
`);
}

async function readWorkspaceDefaults(workspaceId) {
  return querySql(`
SELECT workspace_id, event_type, enabled, priority, created_at, updated_at
FROM notification_workspace_defaults
WHERE workspace_id = ${sqlText(workspaceId)}
ORDER BY event_type;
`);
}

async function readSubscription(workspaceId, userId, target) {
  const rows = await querySql(`
SELECT notification_subscription_id, workspace_id, user_id, module_id, target_type, target_id, event_type, status, created_at, updated_at
FROM notification_subscriptions
WHERE workspace_id = ${sqlText(workspaceId)}
  AND user_id = ${sqlText(userId)}
  AND module_id = ${sqlText(target.module_id)}
  AND target_type = ${sqlText(target.target_type)}
  AND target_id = ${sqlText(target.target_id)}
  AND COALESCE(event_type, '') = ${sqlText(target.event_type || "")}
LIMIT 1;
`);

  return rows[0] ? subscriptionRowToAppValue(rows[0]) : null;
}

async function readSubscriptionsForTarget(workspaceId, target) {
  const rows = await querySql(`
SELECT notification_subscription_id, workspace_id, user_id, module_id, target_type, target_id, event_type, status, created_at, updated_at
FROM notification_subscriptions
WHERE workspace_id = ${sqlText(workspaceId)}
  AND module_id = ${sqlText(target.module_id)}
  AND target_type = ${sqlText(target.target_type)}
  AND target_id = ${sqlText(target.target_id)}
  AND status = 'active'
  AND (event_type IS NULL OR event_type = '' OR event_type = ${sqlText(target.event_type || "")})
ORDER BY created_at;
`);

  return rows.map(subscriptionRowToAppValue);
}

async function saveSubscription(workspaceId, userId, target) {
  const subscriptionId = target.notification_subscription_id || randomUUID();
  const now = new Date().toISOString();

  await runSql(`
INSERT INTO notification_subscriptions (
  notification_subscription_id,
  workspace_id,
  user_id,
  module_id,
  target_type,
  target_id,
  event_type,
  status,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(subscriptionId)},
  ${sqlText(workspaceId)},
  ${sqlText(userId)},
  ${sqlText(target.module_id)},
  ${sqlText(target.target_type)},
  ${sqlText(target.target_id)},
  ${sqlNullableText(target.event_type)},
  'active',
  ${sqlText(now)},
  ${sqlText(now)}
)
ON CONFLICT DO UPDATE SET
  status = 'active',
  updated_at = excluded.updated_at;
`);

  return readSubscription(workspaceId, userId, target);
}

async function removeSubscription(workspaceId, userId, target) {
  const now = new Date().toISOString();

  await runSql(`
UPDATE notification_subscriptions
SET status = 'inactive',
    updated_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND user_id = ${sqlText(userId)}
  AND module_id = ${sqlText(target.module_id)}
  AND target_type = ${sqlText(target.target_type)}
  AND target_id = ${sqlText(target.target_id)}
  AND COALESCE(event_type, '') = ${sqlText(target.event_type || "")};
`);

  return readSubscription(workspaceId, userId, target);
}

async function saveUserPreferences(workspaceId, userId, preferences) {
  const now = new Date().toISOString();
  const statements = (preferences || []).map((preference) => `
INSERT INTO notification_user_preferences (workspace_id, user_id, event_type, enabled, created_at, updated_at)
VALUES (
  ${sqlText(workspaceId)},
  ${sqlText(userId)},
  ${sqlText(preference.event_type)},
  ${sqlInteger(preference.enabled ? 1 : 0)},
  ${sqlText(now)},
  ${sqlText(now)}
)
ON CONFLICT(workspace_id, user_id, event_type) DO UPDATE SET
  enabled = excluded.enabled,
  updated_at = excluded.updated_at;
`).join("\n");

  if (statements) {
    await runSql(statements);
  }
}

async function saveWorkspaceDefaults(workspaceId, defaults) {
  const now = new Date().toISOString();
  const statements = (defaults || []).map((preference) => `
INSERT INTO notification_workspace_defaults (workspace_id, event_type, enabled, priority, created_at, updated_at)
VALUES (
  ${sqlText(workspaceId)},
  ${sqlText(preference.event_type)},
  ${sqlInteger(preference.enabled ? 1 : 0)},
  ${sqlText(preference.priority || "normal")},
  ${sqlText(now)},
  ${sqlText(now)}
)
ON CONFLICT(workspace_id, event_type) DO UPDATE SET
  enabled = excluded.enabled,
  priority = excluded.priority,
  updated_at = excluded.updated_at;
`).join("\n");

  if (statements) {
    await runSql(statements);
  }
}

function notificationRowToAppValue(row) {
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

function subscriptionRowToAppValue(row) {
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

function parseMetadata(metadataJson) {
  try {
    const parsed = JSON.parse(metadataJson || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeStatusFilter(status) {
  const normalizedStatus = String(status || "").trim();
  return ["active", "unread", "read", "dismissed", "archived"].includes(normalizedStatus) ? normalizedStatus : "";
}

function clampLimit(limit) {
  const numericLimit = Number.parseInt(limit, 10);
  if (!Number.isFinite(numericLimit)) {
    return 25;
  }

  return Math.min(Math.max(numericLimit, 1), 100);
}

function clampOffset(offset) {
  const numericOffset = Number.parseInt(offset, 10);
  return Number.isFinite(numericOffset) && numericOffset > 0 ? numericOffset : 0;
}

export const notificationsRepository = {
  archiveOlderThan,
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
  readUserPreferences,
  readSubscription,
  readSubscriptionsForTarget,
  readWorkspaceAdminUserIds,
  readWorkspaceDefaults,
  removeSubscription,
  saveSubscription,
  saveUserPreferences,
  saveWorkspaceDefaults,
};
