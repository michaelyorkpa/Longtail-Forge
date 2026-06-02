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
  organization_id,
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
  previous_value_json,
  new_value_json,
  metadata_json
)
VALUES (
  ${sqlText(entry.audit_id)},
  ${sqlText(entry.organization_id)},
  ${sqlText(entry.workspace_id || entry.organization_id)},
  ${sqlText(entry.created_at)},
  ${sqlNullableText(entry.actor_user_id)},
  ${sqlNullableText(entry.actor_user_name)},
  ${sqlText(entry.action)},
  ${sqlText(entry.change_type)},
  ${sqlText(entry.record_type)},
  ${sqlNullableText(entry.record_id)},
  ${sqlNullableText(entry.record_label)},
  ${sqlNullableText(entry.record_url)},
  ${sqlNullableText(entry.previous_value_json)},
  ${sqlNullableText(entry.new_value_json)},
  ${sqlNullableText(entry.metadata_json)}
);
`);
}

async function readRecent(organizationId, limit = 50) {
  const rows = await querySql(`
SELECT
  audit_id,
  organization_id,
  created_at,
  actor_user_id,
  actor_user_name,
  action,
  change_type,
  record_type,
  record_id,
  record_label,
  record_url,
  previous_value_json,
  new_value_json,
  metadata_json
FROM audit_logs
WHERE organization_id = ${sqlText(organizationId)}
ORDER BY created_at DESC
LIMIT ${Math.max(1, Math.min(200, Number.parseInt(limit, 10) || 50))};
`);

  return rows;
}

async function search(organizationId, filters = {}) {
  const clauses = buildSearchClauses(organizationId, filters);
  const limit = normalizeLimit(filters.limit);
  const offset = normalizeOffset(filters.offset);

  const rows = await querySql(`
SELECT
  audit_id,
  organization_id,
  created_at,
  actor_user_id,
  actor_user_name,
  action,
  change_type,
  record_type,
  record_id,
  record_label,
  record_url,
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

async function countSearch(organizationId, filters = {}) {
  const clauses = buildSearchClauses(organizationId, filters);
  const rows = await querySql(`
SELECT COUNT(*) AS total
FROM audit_logs
WHERE ${clauses.join("\n  AND ")};
`);

  return Number.parseInt(rows[0]?.total, 10) || 0;
}

async function readFilterOptions(organizationId) {
  const [users, recordTypes, changeTypes] = await Promise.all([
    querySql(`
SELECT actor_user_id, actor_user_name
FROM audit_logs
WHERE organization_id = ${sqlText(organizationId)}
  AND actor_user_id IS NOT NULL
  AND actor_user_id != ''
GROUP BY actor_user_id, actor_user_name
ORDER BY actor_user_name COLLATE NOCASE, actor_user_id COLLATE NOCASE;
`),
    querySql(`
SELECT DISTINCT record_type
FROM audit_logs
WHERE organization_id = ${sqlText(organizationId)}
  AND record_type IS NOT NULL
  AND record_type != ''
ORDER BY record_type COLLATE NOCASE;
`),
    querySql(`
SELECT DISTINCT change_type
FROM audit_logs
WHERE organization_id = ${sqlText(organizationId)}
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

async function removeBefore(organizationId, cutoffIso) {
  await runSql(`
DELETE FROM audit_logs
WHERE organization_id = ${sqlText(organizationId)}
  AND created_at < ${sqlText(cutoffIso)};
`);
}

function buildSearchClauses(organizationId, filters = {}) {
  const clauses = [`organization_id = ${sqlText(organizationId)}`];

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

  if (filters.changeType) {
    clauses.push(`change_type = ${sqlText(filters.changeType)}`);
  }

  return clauses;
}

function normalizeLimit(value) {
  return Math.max(1, Math.min(1000, Number.parseInt(value, 10) || 500));
}

function normalizeOffset(value) {
  return Math.max(0, Number.parseInt(value, 10) || 0);
}

export const auditLogsRepository = {
  countSearch,
  create,
  readRecent,
  readFilterOptions,
  removeBefore,
  search,
};
