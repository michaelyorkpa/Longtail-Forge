import { db } from "../core/database.js";

async function readEligibility(actorUserId, effectiveUserId, workspaceId, database = db) {
  return database.get(`
SELECT
  actor.user_id AS actor_user_id,
  actor.username AS actor_username,
  actor.home_workspace_id AS actor_home_workspace_id,
  actor.active_workspace_id AS actor_active_workspace_id,
  actor.user_status AS actor_status,
  actor.protected_user AS actor_protected,
  effective.user_id AS effective_user_id,
  effective.username AS effective_username,
  effective.user_status AS effective_status,
  user_workspaces.status AS effective_membership_status,
  workspaces.status AS workspace_status,
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
`, { actorUserId, effectiveUserId, workspaceId });
}

async function readById(supportSessionId) {
  return db.get(`
SELECT
  support_sessions.*,
  actor.user_status AS actor_status,
  actor.protected_user AS actor_protected,
  effective.user_status AS effective_status,
  user_workspaces.status AS effective_membership_status,
  workspaces.status AS workspace_status,
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
`, { supportSessionId });
}

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
`, session);
  await appendEvent(event, database);
}

async function end(session, event, database = db) {
  const current = await database.get(`
SELECT ended_at
FROM support_sessions
WHERE support_session_id = :supportSessionId
LIMIT 1;
`, { supportSessionId: session.supportSessionId });
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
`, session);
  await appendEvent(event, database);
  return true;
}

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
  :metadataJson,
  :occurredAt
);
`, event);
}

async function listEvents(supportSessionId) {
  return db.query(`
SELECT *
FROM support_view_events
WHERE support_session_id = :supportSessionId
ORDER BY occurred_at, event_id;
`, { supportSessionId });
}

export const supportSessionsRepository = {
  create,
  end,
  listEvents,
  readById,
  readEligibility,
};
