import { db } from "../core/database.js";

async function create(entry) {
  await db.run(`
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
  :auditId,
  :workspaceId,
  :createdAt,
  :actorUserId,
  :actorUserName,
  :action,
  :changeType,
  :recordType,
  :recordId,
  :recordLabel,
  :recordUrl,
  :ipAddress,
  :previousValueJson,
  :newValueJson,
  :metadataJson
);
`, auditInsertParams(entry));
}

async function readRecent(workspaceId, limit = 50) {
  const rows = await db.query(`
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
WHERE workspace_id = :workspaceId
ORDER BY created_at DESC
LIMIT :limit;
`, {
    limit: boundedInteger(limit, 1, 200, 50),
    workspaceId: text(workspaceId),
  });

  return rows;
}

async function search(workspaceId, filters = {}) {
  const { clauses, params } = buildSearchClauses(createWorkspaceScope(workspaceId), filters);
  const limit = normalizeLimit(filters.limit);
  const offset = normalizeOffset(filters.offset);

  const rows = await db.query(`
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
LIMIT :limit
OFFSET :offset;
`, {
    ...params,
    limit,
    offset,
  });

  return rows;
}

async function countSearch(workspaceId, filters = {}) {
  const { clauses, params } = buildSearchClauses(createWorkspaceScope(workspaceId), filters);
  const rows = await db.query(`
SELECT COUNT(*) AS total
FROM audit_logs
WHERE ${clauses.join("\n  AND ")};
`, params);

  return Number.parseInt(rows[0]?.total, 10) || 0;
}

async function searchForScope(workspaceScope, filters = {}) {
  const { clauses, params } = buildSearchClauses(workspaceScope, filters);
  const limit = normalizeLimit(filters.limit);
  const offset = normalizeOffset(filters.offset);

  const rows = await db.query(`
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
LIMIT :limit
OFFSET :offset;
`, {
    ...params,
    limit,
    offset,
  });

  return rows;
}

async function countSearchForScope(workspaceScope, filters = {}) {
  const { clauses, params } = buildSearchClauses(workspaceScope, filters);
  const rows = await db.query(`
SELECT COUNT(*) AS total
FROM audit_logs
WHERE ${clauses.join("\n  AND ")};
`, params);

  return Number.parseInt(rows[0]?.total, 10) || 0;
}

async function readFilterOptions(workspaceId) {
  return readFilterOptionsForScope(createWorkspaceScope(workspaceId));
}

async function readFilterOptionsForScope(workspaceScope) {
  const { clauses, params } = buildSearchClauses(workspaceScope, {});
  const [users, recordTypes, changeTypes] = await Promise.all([
    db.query(`
SELECT actor_user_id, actor_user_name
FROM audit_logs
WHERE ${clauses.join("\n  AND ")}
  AND actor_user_id IS NOT NULL
  AND actor_user_id != ''
GROUP BY actor_user_id, actor_user_name
ORDER BY ${db.dialect.comparison.orderByNoCase("actor_user_name", "ASC")}, ${db.dialect.comparison.orderByNoCase("actor_user_id", "ASC")};
`, params),
    db.query(`
SELECT DISTINCT record_type
FROM audit_logs
WHERE ${clauses.join("\n  AND ")}
  AND record_type IS NOT NULL
  AND record_type != ''
ORDER BY ${db.dialect.comparison.orderByNoCase("record_type", "ASC")};
`, params),
    db.query(`
SELECT DISTINCT change_type
FROM audit_logs
WHERE ${clauses.join("\n  AND ")}
  AND change_type IS NOT NULL
  AND change_type != ''
ORDER BY ${db.dialect.comparison.orderByNoCase("change_type", "ASC")};
`, params),
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
  await db.run(`
DELETE FROM audit_logs
WHERE workspace_id = :workspaceId
  AND created_at < :cutoffIso;
`, {
    cutoffIso: text(cutoffIso),
    workspaceId: text(workspaceId),
  });
}

function buildSearchClauses(workspaceScope, filters = {}) {
  const visibility = createWorkspaceVisibilityClause(workspaceScope);
  const clauses = [visibility.sql];
  const params = { ...visibility.params };

  if (filters.dateFrom) {
    clauses.push("created_at >= :dateFrom");
    params.dateFrom = text(filters.dateFrom);
  }

  if (filters.dateTo) {
    clauses.push("created_at <= :dateTo");
    params.dateTo = text(filters.dateTo);
  }

  if (filters.actorUserId) {
    clauses.push("actor_user_id = :actorUserId");
    params.actorUserId = text(filters.actorUserId);
  }

  if (filters.recordType) {
    clauses.push("record_type = :recordType");
    params.recordType = text(filters.recordType);
  }

  if (filters.clientId) {
    params.clientId = text(filters.clientId);
    params.clientIdMetadataPattern = createMetadataLikePattern("client_id", filters.clientId);
    clauses.push(`(
      record_id = :clientId
      OR ${db.dialect.comparison.likeNoCase("metadata_json", ":clientIdMetadataPattern", { escape: true })}
    )`);
  }

  if (filters.projectId) {
    params.projectId = text(filters.projectId);
    params.projectIdMetadataPattern = createMetadataLikePattern("project_id", filters.projectId);
    clauses.push(`(
      record_id = :projectId
      OR ${db.dialect.comparison.likeNoCase("metadata_json", ":projectIdMetadataPattern", { escape: true })}
    )`);
  }

  if (filters.changeType) {
    clauses.push("change_type = :changeType");
    params.changeType = text(filters.changeType);
  }

  return { clauses, params };
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
    return {
      params: {},
      sql: "1 = 0",
    };
  }

  return {
    params: {
      workspaceIds: normalizeIdList(workspaceIds),
    },
    sql: `(
    workspace_id IN (:workspaceIds)
    OR (
      change_type IN ('login', 'logout')
      AND actor_user_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM user_workspaces
        WHERE user_workspaces.user_id = audit_logs.actor_user_id
          AND user_workspaces.workspace_id IN (:workspaceIds)
          AND user_workspaces.status = 'active'
      )
    )
  )`,
  };
}

function createMetadataLikePattern(fieldName, value) {
  return `%"${fieldName}":"${db.dialect.comparison.escapeLikePattern(value)}"%`;
}

function normalizeLimit(value) {
  return boundedInteger(value, 1, 1000, 500);
}

function normalizeOffset(value) {
  return Math.max(0, Number.parseInt(value, 10) || 0);
}

function auditInsertParams(entry) {
  return {
    action: text(entry.action),
    actorUserId: nullableText(entry.actor_user_id),
    actorUserName: nullableText(entry.actor_user_name),
    auditId: text(entry.audit_id),
    changeType: text(entry.change_type),
    createdAt: text(entry.created_at),
    ipAddress: nullableText(entry.ip_address),
    metadataJson: nullableText(entry.metadata_json),
    newValueJson: nullableText(entry.new_value_json),
    previousValueJson: nullableText(entry.previous_value_json),
    recordId: nullableText(entry.record_id),
    recordLabel: nullableText(entry.record_label),
    recordType: text(entry.record_type),
    recordUrl: nullableText(entry.record_url),
    workspaceId: text(entry.workspace_id),
  };
}

function boundedInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  const numberValue = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(min, Math.min(max, numberValue));
}

function normalizeIdList(ids) {
  return [...new Set((Array.isArray(ids) ? ids : [])
    .map((id) => text(id).trim())
    .filter(Boolean))];
}

function nullableText(value) {
  return value === null || value === undefined || String(value).trim() === ""
    ? null
    : String(value);
}

function text(value) {
  return String(value ?? "");
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
