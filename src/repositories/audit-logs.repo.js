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
  const clauses = [`organization_id = ${sqlText(organizationId)}`];
  const limit = Math.max(1, Math.min(1000, Number.parseInt(filters.limit, 10) || 500));

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
LIMIT ${limit};
`);

  return rows;
}

async function removeBefore(organizationId, cutoffIso) {
  await runSql(`
DELETE FROM audit_logs
WHERE organization_id = ${sqlText(organizationId)}
  AND created_at < ${sqlText(cutoffIso)};
`);
}

export const auditLogsRepository = {
  create,
  readRecent,
  removeBefore,
  search,
};
