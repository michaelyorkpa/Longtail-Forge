import { querySql, runSql, sqlInteger, sqlText } from "../../core/database.js";
import { normalizeTimeEntry } from "../../utils/normalizers.js";

async function readAll(organizationId) {
  const rows = await querySql(`
SELECT
  entry_id,
  organization_id,
  user_id,
  client_id,
  client_name,
  project_id,
  project_name,
  description,
  start_time,
  end_time,
  duration_seconds,
  duration_hours,
  billable,
  invoice_status
FROM time_entries
WHERE organization_id = ${sqlText(organizationId)}
ORDER BY end_time;
`);

  return rows.map(timeEntryRowToAppValue);
}

async function readById(organizationId, entryId) {
  const rows = await querySql(`
SELECT
  entry_id,
  organization_id,
  user_id,
  client_id,
  client_name,
  project_id,
  project_name,
  description,
  start_time,
  end_time,
  duration_seconds,
  duration_hours,
  billable,
  invoice_status
FROM time_entries
WHERE organization_id = ${sqlText(organizationId)}
  AND entry_id = ${sqlText(entryId)}
LIMIT 1;
`);

  return rows[0] ? timeEntryRowToAppValue(rows[0]) : null;
}

async function create(entry) {
  const now = new Date().toISOString();
  await runSql(createTimeEntryInsertSql(entry, now));
}

async function update(entry) {
  const now = new Date().toISOString();
  await runSql(`
UPDATE time_entries
SET
  user_id = ${sqlText(entry.user_id)},
  client_id = ${sqlText(entry.client_id)},
  client_name = ${sqlText(entry.client_name)},
  project_id = ${sqlText(entry.project_id)},
  project_name = ${sqlText(entry.project_name)},
  description = ${sqlText(entry.description)},
  start_time = ${sqlText(entry.start_time)},
  end_time = ${sqlText(entry.end_time)},
  duration_seconds = ${sqlInteger(entry.duration_seconds)},
  duration_hours = ${sqlText(entry.duration_hours)},
  billable = ${sqlText(entry.billable)},
  invoice_status = ${sqlText(entry.invoice_status)},
  updated_at = ${sqlText(now)}
WHERE organization_id = ${sqlText(entry.organization_id)}
  AND entry_id = ${sqlText(entry.entry_id)};
`);
}

async function remove(organizationId, entryId) {
  await runSql(`
DELETE FROM time_entries
WHERE organization_id = ${sqlText(organizationId)}
  AND entry_id = ${sqlText(entryId)};
`);
}

function createTimeEntryInsertSql(entry, now) {
  return `
INSERT INTO time_entries (
  entry_id,
  organization_id,
  user_id,
  client_id,
  client_name,
  project_id,
  project_name,
  description,
  start_time,
  end_time,
  duration_seconds,
  duration_hours,
  billable,
  invoice_status,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(entry.entry_id)},
  ${sqlText(entry.organization_id)},
  ${sqlText(entry.user_id)},
  ${sqlText(entry.client_id)},
  ${sqlText(entry.client_name)},
  ${sqlText(entry.project_id)},
  ${sqlText(entry.project_name)},
  ${sqlText(entry.description)},
  ${sqlText(entry.start_time)},
  ${sqlText(entry.end_time)},
  ${sqlInteger(entry.duration_seconds)},
  ${sqlText(entry.duration_hours)},
  ${sqlText(entry.billable)},
  ${sqlText(entry.invoice_status)},
  ${sqlText(now)},
  ${sqlText(now)}
);`;
}

function timeEntryRowToAppValue(row) {
  return normalizeTimeEntry({
    entry_id: row.entry_id,
    organization_id: row.organization_id,
    user_id: row.user_id,
    client_id: row.client_id,
    client_name: row.client_name,
    project_id: row.project_id,
    project_name: row.project_name,
    description: row.description,
    start_time: row.start_time,
    end_time: row.end_time,
    duration_seconds: row.duration_seconds,
    duration_hours: row.duration_hours,
    billable: row.billable,
    invoice_status: row.invoice_status,
  });
}

export const timeEntriesRepository = {
  create,
  remove,
  readAll,
  readById,
  update,
};
