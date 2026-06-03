import {
  querySql,
  runSql,
  sqlNullableText,
  sqlText,
} from "../db/index.js";

async function create(entry) {
  await runSql(`
INSERT INTO audit_logs (
  audit_id,
  workspace_id,
  created_at,
  actor_user_id,
  actor_user_name,
  action,
  change_type,
  record_type,
  record_id,
  record_label,
  record_url,
  ip_address,
  previous_value_json,
  new_value_json,
  metadata_json
)
VALUES (
  ${sqlText(entry.audit_id)},
  ${sqlText(entry.workspace_id)},
  ${sqlText(entry.created_at)},
  ${sqlNullableText(entry.actor_user_id)},
  ${sqlNullableText(entry.actor_user_name)},
  ${sqlText(entry.action)},
  ${sqlText(entry.change_type)},
  ${sqlText(entry.record_type)},
  ${sqlNullableText(entry.record_id)},
  ${sqlNullableText(entry.record_label)},
  ${sqlNullableText(entry.record_url)},
  ${sqlNullableText(entry.ip_address)},
  ${sqlNullableText(entry.previous_value_json)},
  ${sqlNullableText(entry.new_value_json)},
  ${sqlNullableText(entry.metadata_json)}
);
`);
}

async function readRecent(workspaceId, limit = 50) {
  const rows = await querySql(`
SELECT
  audit_id,
  workspace_id,
  created_at,
  actor_user_id,
  actor_user_name,
  action,
  change_type,
  record_type,
  record_id,
  record_label,
  record_url,
  ip_address,
  previous_value_json,
  new_value_json,
  metadata_json
FROM audit_logs
WHERE workspace_id = ${sqlText(workspaceId)}
ORDER BY created_at DESC
LIMIT ${Math.max(1, Math.min(200, Number.parseInt(limit, 10) || 50))};
`);

  return rows;
}

async function search(workspaceId, filters = {}) {
  const clauses = buildSearchClauses(createWorkspaceScope(workspaceId), filters);
  const limit = normalizeLimit(filters.limit);
  const offset = normalizeOffset(filters.offset);

  const rows = await querySql(`
SELECT
  audit_id,
  workspace_id,
  created_at,
  actor_user_id,
  actor_user_name,
  action,
  change_type,
  record_type,
  record_id,
  record_label,
  record_url,
  ip_address,
  previous_value_json,
  new_value_json,
  metadata_json
FROM audit_logs
WHERE ${clauses.join("\n  AND ")}
ORDER BY created_at DESC
LIMIT ${limit}
OFFSET ${offset};
`);

  return rows;
}

async function countSearch(workspaceId, filters = {}) {
  const clauses = buildSearchClauses(createWorkspaceScope(workspaceId), filters);
  const rows = await querySql(`
SELECT COUNT(*) AS total
FROM audit_logs
WHERE ${clauses.join("\n  AND ")};
`);

  return Number.parseInt(rows[0]?.total, 10) || 0;
}

async function searchForScope(workspaceScope, filters = {}) {
  const clauses = buildSearchClauses(workspaceScope, filters);
  const limit = normalizeLimit(filters.limit);
  const offset = normalizeOffset(filters.offset);

  const rows = await querySql(`
SELECT
  audit_id,
  workspace_id,
  created_at,
  actor_user_id,
  actor_user_name,
  action,
  change_type,
  record_type,
  record_id,
  record_label,
  record_url,
  ip_address,
  previous_value_json,
  new_value_json,
  metadata_json
FROM audit_logs
WHERE ${clauses.join("\n  AND ")}
ORDER BY created_at DESC
LIMIT ${limit}
OFFSET ${offset};
`);

  return rows;
}

async function countSearchForScope(workspaceScope, filters = {}) {
  const clauses = buildSearchClauses(workspaceScope, filters);
  const rows = await querySql(`
SELECT COUNT(*) AS total
FROM audit_logs
WHERE ${clauses.join("\n  AND ")};
`);

  return Number.parseInt(rows[0]?.total, 10) || 0;
}

async function readFilterOptions(workspaceId) {
  return readFilterOptionsForScope(createWorkspaceScope(workspaceId));
}

async function readFilterOptionsForScope(workspaceScope) {
  const clauses = buildSearchClauses(workspaceScope, {});
  const [users, recordTypes, changeTypes] = await Promise.all([
    querySql(`
SELECT actor_user_id, actor_user_name
FROM audit_logs
WHERE ${clauses.join("\n  AND ")}
  AND actor_user_id IS NOT NULL
  AND actor_user_id != ''
GROUP BY actor_user_id, actor_user_name
ORDER BY actor_user_name COLLATE NOCASE, actor_user_id COLLATE NOCASE;
`),
    querySql(`
SELECT DISTINCT record_type
FROM audit_logs
WHERE ${clauses.join("\n  AND ")}
  AND record_type IS NOT NULL
  AND record_type != ''
ORDER BY record_type COLLATE NOCASE;
`),
    querySql(`
SELECT DISTINCT change_type
FROM audit_logs
WHERE ${clauses.join("\n  AND ")}
  AND change_type IS NOT NULL
  AND change_type != ''
ORDER BY change_type COLLATE NOCASE;
`),
  ]);

  return {
    changeTypes: changeTypes.map((row) => row.change_type),
    recordTypes: recordTypes.map((row) => row.record_type),
    users: users.map((row) => ({
      label: row.actor_user_name || row.actor_user_id,
      value: row.actor_user_id,
    })),
  };
}

async function removeBefore(workspaceId, cutoffIso) {
  await runSql(`
DELETE FROM audit_logs
WHERE workspace_id = ${sqlText(workspaceId)}
  AND created_at < ${sqlText(cutoffIso)};
`);
}

function buildSearchClauses(workspaceScope, filters = {}) {
  const clauses = [createWorkspaceVisibilityClause(workspaceScope)];

  if (filters.dateFrom) {
    clauses.push(`created_at >= ${sqlText(filters.dateFrom)}`);
  }

  if (filters.dateTo) {
    clauses.push(`created_at <= ${sqlText(filters.dateTo)}`);
  }

  if (filters.actorUserId) {
    clauses.push(`actor_user_id = ${sqlText(filters.actorUserId)}`);
  }

  if (filters.recordType) {
    clauses.push(`record_type = ${sqlText(filters.recordType)}`);
  }

  if (filters.clientId) {
    clauses.push(`(
      record_id = ${sqlText(filters.clientId)}
      OR metadata_json LIKE ${sqlText(createMetadataLikePattern("client_id", filters.clientId))}
    )`);
  }

  if (filters.projectId) {
    clauses.push(`(
      record_id = ${sqlText(filters.projectId)}
      OR metadata_json LIKE ${sqlText(createMetadataLikePattern("project_id", filters.projectId))}
    )`);
  }

  if (filters.changeType) {
    clauses.push(`change_type = ${sqlText(filters.changeType)}`);
  }

  return clauses;
}

function createWorkspaceScope(workspaceId) {
  return {
    workspaceIds: [workspaceId],
  };
}

function createWorkspaceVisibilityClause(workspaceScope) {
  const workspaceIds = Array.isArray(workspaceScope?.workspaceIds)
    ? workspaceScope.workspaceIds.filter(Boolean)
    : [];

  if (workspaceIds.length === 0) {
    return "1 = 0";
  }

  const workspaceListSql = workspaceIds.map((workspaceId) => sqlText(workspaceId)).join(", ");

  return `(
    workspace_id IN (${workspaceListSql})
    OR (
      change_type IN ('login', 'logout')
      AND actor_user_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM user_workspaces
        WHERE user_workspaces.user_id = audit_logs.actor_user_id
          AND user_workspaces.workspace_id IN (${workspaceListSql})
          AND user_workspaces.status = 'active'
      )
    )
  )`;
}

function createMetadataLikePattern(fieldName, value) {
  return `%"${fieldName}":"${String(value || "").replaceAll("%", "\\%").replaceAll("_", "\\_")}"%`;
}

function normalizeLimit(value) {
  return Math.max(1, Math.min(1000, Number.parseInt(value, 10) || 500));
}

function normalizeOffset(value) {
  return Math.max(0, Number.parseInt(value, 10) || 0);
}

export const auditLogsRepository = {
  countSearch,
  countSearchForScope,
  create,
  readRecent,
  readFilterOptions,
  readFilterOptionsForScope,
  removeBefore,
  search,
  searchForScope,
};
