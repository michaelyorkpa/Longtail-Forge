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

export const auditLogsRepository = {
  create,
  readRecent,
};
