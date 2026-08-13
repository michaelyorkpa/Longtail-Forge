// @ts-check

import { db } from "../core/database.js";

/** @typedef {import("../types/database-contracts.js").DatabaseRow} DatabaseRow */
/** @typedef {import("../types/database-contracts.js").TransactionClient} TransactionClient */
/** @typedef {import("../types/support-view-contracts.js").NormalizedSupportViewAuditFilters} NormalizedSupportViewAuditFilters */
/** @typedef {import("../types/support-view-contracts.js").SupportViewAuditFilterOptions} SupportViewAuditFilterOptions */
/** @typedef {import("../types/support-view-contracts.js").SupportViewAuditFilters} SupportViewAuditFilters */
/** @typedef {import("../types/support-view-contracts.js").SupportViewAuditOption} SupportViewAuditOptionContract */
/** @typedef {import("../types/support-view-contracts.js").SupportViewAuditRow} SupportViewAuditRowContract */
/** @typedef {import("../types/support-view-contracts.js").SupportViewCreateInput} SupportViewCreateInput */
/** @typedef {import("../types/support-view-contracts.js").SupportViewEligibilityRow} SupportViewEligibilityRowContract */
/** @typedef {import("../types/support-view-contracts.js").SupportViewEndInput} SupportViewEndInput */
/** @typedef {import("../types/support-view-contracts.js").SupportViewEventInput} SupportViewEventInput */
/** @typedef {import("../types/support-view-contracts.js").SupportViewStoredSessionRow} SupportViewStoredSessionRowContract */
/** @typedef {import("../types/support-view-contracts.js").SupportViewTargetRow} SupportViewTargetRowContract */
/** @typedef {DatabaseRow & SupportViewAuditOptionContract} SupportViewAuditOption */
/** @typedef {DatabaseRow & SupportViewAuditRowContract} SupportViewAuditRow */
/** @typedef {DatabaseRow & SupportViewEligibilityRowContract} SupportViewEligibilityRow */
/** @typedef {DatabaseRow & SupportViewStoredSessionRowContract} SupportViewStoredSessionRow */
/** @typedef {DatabaseRow & SupportViewTargetRowContract} SupportViewTargetRow */
/** @typedef {DatabaseRow & { ended_at: string | null }} SupportViewEndStateRow */
/** @typedef {DatabaseRow & { total: unknown }} SupportViewCountRow */
/** @typedef {DatabaseRow & { support_session_id: string }} SupportSessionCandidateRow */
/** @typedef {DatabaseRow & { event_id: string, support_session_id: string, actor_user_id: string, effective_user_id: string, workspace_id: string, event_type: string, outcome: string, request_id: string, route_id: string | null, action_id: string | null, reason_class: string | null, metadata_json: string, occurred_at: string }} SupportViewEventRow */

/** @param {string} actorUserId @returns {Promise<SupportViewTargetRow[]>} */
async function listEligibleTargets(actorUserId) {
  const rows = /** @type {SupportViewTargetRow[]} */ (await db.query(`
SELECT
  users.user_id,
  users.username,
  users.display_name,
  user_workspaces.workspace_id,
  workspaces.name AS workspace_name
FROM users
INNER JOIN user_workspaces
  ON user_workspaces.user_id = users.user_id
  AND LOWER(user_workspaces.status) = 'active'
INNER JOIN workspaces
  ON workspaces.workspace_id = user_workspaces.workspace_id
  AND LOWER(workspaces.status) = 'active'
WHERE LOWER(users.user_status) = 'active'
  AND users.user_id != :actorUserId;
`, { actorUserId }));
  return rows.sort(compareTargetRows);
}

/**
 * @param {string} actorUserId
 * @param {string} effectiveUserId
 * @param {string} workspaceId
 * @param {TransactionClient} [database]
 * @returns {Promise<SupportViewEligibilityRow | null>}
 */
async function readEligibility(actorUserId, effectiveUserId, workspaceId, database = db) {
  return /** @type {Promise<SupportViewEligibilityRow | null>} */ (database.get(`
SELECT
  actor.user_id AS actor_user_id,
  actor.username AS actor_username,
  actor.display_name AS actor_display_name,
  actor.home_workspace_id AS actor_home_workspace_id,
  actor.active_workspace_id AS actor_active_workspace_id,
  actor.user_status AS actor_status,
  actor.protected_user AS actor_protected,
  effective.user_id AS effective_user_id,
  effective.username AS effective_username,
  effective.display_name AS effective_display_name,
  effective.user_status AS effective_status,
  effective.home_workspace_id AS effective_home_workspace_id,
  effective.timezone AS effective_timezone,
  effective.password_change_required AS effective_password_change_required,
  user_workspaces.status AS effective_membership_status,
  workspaces.status AS workspace_status,
  workspaces.name AS workspace_name,
  CASE WHEN actor.protected_user = 'yes' OR EXISTS (
    SELECT 1
    FROM user_role_assignments
    INNER JOIN role_permissions
      ON role_permissions.role_id = user_role_assignments.role_id
    WHERE user_role_assignments.user_id = actor.user_id
      AND user_role_assignments.role_id = 'super_admin'
      AND user_role_assignments.scope_type = 'all'
      AND role_permissions.permission_id = 'support_view.enter'
  ) THEN 1 ELSE 0 END AS actor_has_support_permission
FROM users AS actor
INNER JOIN users AS effective
  ON effective.user_id = :effectiveUserId
INNER JOIN user_workspaces
  ON user_workspaces.user_id = effective.user_id
  AND user_workspaces.workspace_id = :workspaceId
INNER JOIN workspaces
  ON workspaces.workspace_id = user_workspaces.workspace_id
WHERE actor.user_id = :actorUserId
LIMIT 1;
`, { actorUserId, effectiveUserId, workspaceId }));
}

/** @param {string} supportSessionId @returns {Promise<SupportViewStoredSessionRow | null>} */
async function readById(supportSessionId) {
  return /** @type {Promise<SupportViewStoredSessionRow | null>} */ (db.get(`
SELECT
  support_sessions.*,
  actor.display_name AS actor_display_name,
  actor.user_status AS actor_status,
  actor.protected_user AS actor_protected,
  effective.user_status AS effective_status,
  effective.display_name AS effective_display_name,
  effective.home_workspace_id AS effective_home_workspace_id,
  effective.timezone AS effective_timezone,
  effective.password_change_required AS effective_password_change_required,
  user_workspaces.status AS effective_membership_status,
  workspaces.status AS workspace_status,
  workspaces.name AS workspace_name,
  CASE WHEN actor.protected_user = 'yes' OR EXISTS (
    SELECT 1
    FROM user_role_assignments
    INNER JOIN role_permissions
      ON role_permissions.role_id = user_role_assignments.role_id
    WHERE user_role_assignments.user_id = actor.user_id
      AND user_role_assignments.role_id = 'super_admin'
      AND user_role_assignments.scope_type = 'all'
      AND role_permissions.permission_id = 'support_view.enter'
  ) THEN 1 ELSE 0 END AS actor_has_support_permission
FROM support_sessions
INNER JOIN users AS actor
  ON actor.user_id = support_sessions.actor_user_id
INNER JOIN users AS effective
  ON effective.user_id = support_sessions.effective_user_id
LEFT JOIN user_workspaces
  ON user_workspaces.user_id = effective.user_id
  AND user_workspaces.workspace_id = support_sessions.workspace_id
LEFT JOIN workspaces
  ON workspaces.workspace_id = support_sessions.workspace_id
WHERE support_sessions.support_session_id = :supportSessionId
LIMIT 1;
`, { supportSessionId }));
}

/** @param {SupportViewCreateInput} session @param {SupportViewEventInput} event @param {TransactionClient} [database] */
async function create(session, event, database = db) {
  await database.run(`
INSERT INTO support_sessions (
  support_session_id,
  actor_user_id,
  actor_username,
  actor_home_workspace_id,
  actor_workspace_id,
  effective_user_id,
  effective_username,
  workspace_id,
  reason_reference,
  start_request_id,
  started_at,
  expires_at,
  outcome,
  created_at,
  updated_at
)
VALUES (
  :supportSessionId,
  :actorUserId,
  :actorUsername,
  :actorHomeWorkspaceId,
  :actorWorkspaceId,
  :effectiveUserId,
  :effectiveUsername,
  :workspaceId,
  :reasonReference,
  :startRequestId,
  :startedAt,
  :expiresAt,
  'active',
  :createdAt,
  :updatedAt
);
`, { ...session });
  await appendEvent(event, database);
}

/** @param {SupportViewEndInput} session @param {SupportViewEventInput} event @param {TransactionClient} [database] */
async function end(session, event, database = db) {
  const current = /** @type {SupportViewEndStateRow | null} */ (await database.get(`
SELECT ended_at
FROM support_sessions
WHERE support_session_id = :supportSessionId
LIMIT 1;
`, { supportSessionId: session.supportSessionId }));
  if (!current || current.ended_at) {
    return false;
  }
  await database.run(`
UPDATE support_sessions
SET ended_at = :endedAt,
    end_request_id = :endRequestId,
    outcome = :outcome,
    updated_at = :updatedAt
WHERE support_session_id = :supportSessionId
  AND ended_at IS NULL;
`, { ...session });
  await appendEvent(event, database);
  return true;
}

/** @param {SupportViewEventInput} event @param {TransactionClient} [database] */
async function appendEvent(event, database = db) {
  await database.run(`
INSERT INTO support_view_events (
  event_id,
  support_session_id,
  actor_user_id,
  effective_user_id,
  workspace_id,
  event_type,
  outcome,
  request_id,
  route_id,
  action_id,
  reason_class,
  metadata_json,
  occurred_at
)
VALUES (
  :eventId,
  :supportSessionId,
  :actorUserId,
  :effectiveUserId,
  :workspaceId,
  :eventType,
  :outcome,
  :requestId,
  :routeId,
  :actionId,
  :reasonClass,
  :metadataJson,
  :occurredAt
);
`, { ...event });
}

/** @param {string} supportSessionId @returns {Promise<SupportViewEventRow[]>} */
async function listEvents(supportSessionId) {
  return /** @type {Promise<SupportViewEventRow[]>} */ (db.query(`
SELECT *
FROM support_view_events
WHERE support_session_id = :supportSessionId
ORDER BY occurred_at, event_id;
`, { supportSessionId }));
}

/** @param {SupportViewAuditFilters} [filters] @returns {Promise<SupportViewAuditRow[]>} */
async function searchAudit(filters = {}) {
  return /** @type {Promise<SupportViewAuditRow[]>} */ (db.query(`
SELECT
  support_view_events.event_id,
  support_view_events.occurred_at,
  support_view_events.event_type,
  support_view_events.outcome,
  support_view_events.route_id,
  support_view_events.action_id,
  support_view_events.reason_class,
  support_sessions.reason_reference,
  support_sessions.started_at,
  support_sessions.expires_at,
  support_sessions.ended_at,
  support_sessions.outcome AS session_outcome,
  support_sessions.actor_user_id,
  support_sessions.actor_username,
  COALESCE(NULLIF(actor.display_name, ''), support_sessions.actor_username) AS actor_display_name,
  support_sessions.effective_user_id,
  support_sessions.effective_username,
  COALESCE(NULLIF(effective.display_name, ''), support_sessions.effective_username) AS effective_display_name,
  support_sessions.workspace_id,
  workspaces.name AS workspace_name
FROM support_view_events
INNER JOIN support_sessions
  ON support_sessions.support_session_id = support_view_events.support_session_id
INNER JOIN users AS actor
  ON actor.user_id = support_sessions.actor_user_id
INNER JOIN users AS effective
  ON effective.user_id = support_sessions.effective_user_id
INNER JOIN workspaces
  ON workspaces.workspace_id = support_sessions.workspace_id
WHERE support_view_events.occurred_at >= :cutoffIso
  AND (:dateFrom = '' OR support_view_events.occurred_at >= :dateFrom)
  AND (:dateTo = '' OR support_view_events.occurred_at <= :dateTo)
  AND (:actorUserId = '' OR support_sessions.actor_user_id = :actorUserId)
  AND (:effectiveUserId = '' OR support_sessions.effective_user_id = :effectiveUserId)
  AND (:workspaceId = '' OR support_sessions.workspace_id = :workspaceId)
  AND (:eventType = '' OR support_view_events.event_type = :eventType)
  AND (:outcome = '' OR support_view_events.outcome = :outcome)
ORDER BY support_view_events.occurred_at DESC, support_view_events.event_id DESC
LIMIT :limit
OFFSET :offset;
`, {
    ...buildAuditParams(filters),
    limit: boundedInteger(filters.limit, 1, 1000, 50),
    offset: Math.max(0, Number.parseInt(String(filters.offset ?? ""), 10) || 0),
  }));
}

/** @param {SupportViewAuditFilters} [filters] */
async function countAudit(filters = {}) {
  const row = /** @type {SupportViewCountRow | null} */ (await db.get(`
SELECT COUNT(*) AS total
FROM support_view_events
INNER JOIN support_sessions
  ON support_sessions.support_session_id = support_view_events.support_session_id
WHERE support_view_events.occurred_at >= :cutoffIso
  AND (:dateFrom = '' OR support_view_events.occurred_at >= :dateFrom)
  AND (:dateTo = '' OR support_view_events.occurred_at <= :dateTo)
  AND (:actorUserId = '' OR support_sessions.actor_user_id = :actorUserId)
  AND (:effectiveUserId = '' OR support_sessions.effective_user_id = :effectiveUserId)
  AND (:workspaceId = '' OR support_sessions.workspace_id = :workspaceId)
  AND (:eventType = '' OR support_view_events.event_type = :eventType)
  AND (:outcome = '' OR support_view_events.outcome = :outcome);
`, { ...buildAuditParams(filters) }));
  return Number.parseInt(String(row?.total ?? ""), 10) || 0;
}

/** @param {string} cutoffIso @returns {Promise<SupportViewAuditFilterOptions>} */
async function readAuditFilterOptions(cutoffIso) {
  const [actors, effectiveUsers, workspaces, eventTypes, outcomes] = await Promise.all([
    /** @type {Promise<SupportViewAuditOption[]>} */ (db.query(`
SELECT
  support_sessions.actor_user_id AS value,
  COALESCE(NULLIF(users.display_name, ''), support_sessions.actor_username) AS label
FROM support_sessions
INNER JOIN users ON users.user_id = support_sessions.actor_user_id
WHERE support_sessions.started_at >= :cutoffIso
GROUP BY support_sessions.actor_user_id, users.display_name, support_sessions.actor_username
;
`, { cutoffIso })),
    /** @type {Promise<SupportViewAuditOption[]>} */ (db.query(`
SELECT
  support_sessions.effective_user_id AS value,
  COALESCE(NULLIF(users.display_name, ''), support_sessions.effective_username) AS label
FROM support_sessions
INNER JOIN users ON users.user_id = support_sessions.effective_user_id
WHERE support_sessions.started_at >= :cutoffIso
GROUP BY support_sessions.effective_user_id, users.display_name, support_sessions.effective_username
;
`, { cutoffIso })),
    /** @type {Promise<SupportViewAuditOption[]>} */ (db.query(`
SELECT support_sessions.workspace_id AS value, workspaces.name AS label
FROM support_sessions
INNER JOIN workspaces ON workspaces.workspace_id = support_sessions.workspace_id
WHERE support_sessions.started_at >= :cutoffIso
GROUP BY support_sessions.workspace_id, workspaces.name
;
`, { cutoffIso })),
    /** @type {Promise<SupportViewAuditOption[]>} */ (db.query(`
SELECT DISTINCT event_type AS value
FROM support_view_events
WHERE occurred_at >= :cutoffIso
ORDER BY event_type;
`, { cutoffIso })),
    /** @type {Promise<SupportViewAuditOption[]>} */ (db.query(`
SELECT DISTINCT outcome AS value
FROM support_view_events
WHERE occurred_at >= :cutoffIso
ORDER BY outcome;
`, { cutoffIso })),
  ]);
  return {
    actors: actors.sort(compareAuditOptions),
    effectiveUsers: effectiveUsers.sort(compareAuditOptions),
    eventTypes,
    outcomes,
    workspaces: workspaces.sort(compareAuditOptions),
  };
}

/** @param {string} cutoffIso */
async function pruneBefore(cutoffIso) {
  return db.transaction(async (transaction) => {
    const candidates = /** @type {SupportSessionCandidateRow[]} */ (await transaction.query(`
SELECT support_sessions.support_session_id
FROM support_sessions
WHERE COALESCE(support_sessions.ended_at, support_sessions.expires_at) < :cutoffIso
  AND NOT EXISTS (
    SELECT 1
    FROM sessions
    WHERE sessions.support_session_id = support_sessions.support_session_id
  );
`, { cutoffIso }));
    const supportSessionIds = candidates.map((row) => row.support_session_id);
    if (supportSessionIds.length === 0) {
      return { events: 0, sessions: 0 };
    }
    const removedEvents = await transaction.run(`
DELETE FROM support_view_events
WHERE support_session_id IN (:supportSessionIds);
`, { supportSessionIds });
    const removedSessions = await transaction.run(`
DELETE FROM support_sessions
WHERE support_session_id IN (:supportSessionIds);
`, { supportSessionIds });
    return {
      events: readChanges(removedEvents),
      sessions: readChanges(removedSessions),
    };
  });
}

/** @param {SupportViewAuditFilters} filters @returns {NormalizedSupportViewAuditFilters} */
function buildAuditParams(filters) {
  return {
    actorUserId: String(filters.actorUserId || ""),
    cutoffIso: String(filters.cutoffIso || ""),
    dateFrom: String(filters.dateFrom || ""),
    dateTo: String(filters.dateTo || ""),
    effectiveUserId: String(filters.effectiveUserId || ""),
    eventType: String(filters.eventType || ""),
    outcome: String(filters.outcome || ""),
    workspaceId: String(filters.workspaceId || ""),
  };
}

/** @param {SupportViewAuditOption} left @param {SupportViewAuditOption} right */
function compareAuditOptions(left, right) {
  return compareLabels(left.label, right.label) || compareLabels(left.value, right.value);
}

/** @param {SupportViewTargetRow} left @param {SupportViewTargetRow} right */
function compareTargetRows(left, right) {
  return compareLabels(left.display_name || left.username, right.display_name || right.username)
    || compareLabels(left.workspace_name, right.workspace_name)
    || compareLabels(left.user_id, right.user_id)
    || compareLabels(left.workspace_id, right.workspace_id);
}

/** @param {string | null | undefined} left @param {string | null | undefined} right */
function compareLabels(left, right) {
  return String(left || "").localeCompare(String(right || ""), undefined, { sensitivity: "base" });
}

/** @param {unknown} value @param {number} min @param {number} max @param {number} fallback */
function boundedInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Math.max(min, Math.min(max, Number.isFinite(parsed) ? parsed : fallback));
}

/** @param {unknown} result @returns {number} */
function readChanges(result) {
  if (!result || typeof result !== "object" || !("changes" in result)) return 0;
  return Number(result.changes) || 0;
}

export const supportSessionsRepository = {
  appendEvent,
  countAudit,
  create,
  end,
  listEligibleTargets,
  listEvents,
  pruneBefore,
  readAuditFilterOptions,
  readById,
  readEligibility,
  searchAudit,
};
