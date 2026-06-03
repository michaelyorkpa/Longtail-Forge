import { randomUUID } from "node:crypto";
import {
  querySql,
  runSql,
  sqlNullableText,
  sqlText,
} from "../../core/database.js";

async function createTemplate(workspaceId, template) {
  const now = new Date().toISOString();
  const templateId = template.recurrence_template_id || randomUUID();

  await runSql(`
INSERT INTO task_recurrence_templates (
  recurrence_template_id,
  workspace_id,
  client_id,
  project_id,
  title,
  description,
  status,
  priority,
  recurrence_anchor_date,
  due_time,
  due_timezone,
  due_at_utc,
  rrule,
  recurrence_end_date,
  template_status,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(templateId)},
  ${sqlText(workspaceId)},
  ${sqlNullableText(template.client_id)},
  ${sqlNullableText(template.project_id)},
  ${sqlText(template.title)},
  ${sqlText(template.description)},
  ${sqlText(template.status || "open")},
  ${sqlText(template.priority || "normal")},
  ${sqlText(template.recurrence_anchor_date)},
  ${sqlNullableText(template.due_time)},
  ${sqlNullableText(template.due_timezone)},
  ${sqlNullableText(template.due_at_utc)},
  ${sqlText(template.rrule)},
  ${sqlNullableText(template.recurrence_end_date)},
  ${sqlText(template.template_status || "active")},
  ${sqlNullableText(template.created_by_user_id)},
  ${sqlNullableText(template.updated_by_user_id)},
  ${sqlText(now)},
  ${sqlText(now)}
);
`);

  await replaceTemplateAssignees(workspaceId, templateId, template.assignee_ids || [], template.updated_by_user_id || template.created_by_user_id);
  return readTemplateById(workspaceId, templateId);
}

async function updateTemplate(workspaceId, template) {
  const now = new Date().toISOString();

  await runSql(`
UPDATE task_recurrence_templates
SET
  client_id = ${sqlNullableText(template.client_id)},
  project_id = ${sqlNullableText(template.project_id)},
  title = ${sqlText(template.title)},
  description = ${sqlText(template.description)},
  status = ${sqlText(template.status || "open")},
  priority = ${sqlText(template.priority || "normal")},
  recurrence_anchor_date = ${sqlText(template.recurrence_anchor_date)},
  due_time = ${sqlNullableText(template.due_time)},
  due_timezone = ${sqlNullableText(template.due_timezone)},
  due_at_utc = ${sqlNullableText(template.due_at_utc)},
  rrule = ${sqlText(template.rrule)},
  recurrence_end_date = ${sqlNullableText(template.recurrence_end_date)},
  template_status = ${sqlText(template.template_status || "active")},
  updated_by_user_id = ${sqlNullableText(template.updated_by_user_id)},
  updated_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND recurrence_template_id = ${sqlText(template.recurrence_template_id)};
`);

  if (Array.isArray(template.assignee_ids)) {
    await replaceTemplateAssignees(workspaceId, template.recurrence_template_id, template.assignee_ids, template.updated_by_user_id);
  }

  return readTemplateById(workspaceId, template.recurrence_template_id);
}

async function readTemplateById(workspaceId, templateId) {
  const rows = await querySql(templateSelectSql(`
WHERE task_recurrence_templates.workspace_id = ${sqlText(workspaceId)}
  AND task_recurrence_templates.recurrence_template_id = ${sqlText(templateId)}
LIMIT 1;
`));

  if (!rows[0]) {
    return null;
  }

  const assignees = await readTemplateAssignees(workspaceId, templateId);
  return attachTemplateAssignees([templateRowToAppValue(rows[0])], assignees)[0];
}

async function replaceTemplateAssignees(workspaceId, templateId, assigneeIds, assignedByUserId) {
  const now = new Date().toISOString();
  const uniqueAssigneeIds = [...new Set((assigneeIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  const inserts = uniqueAssigneeIds.map((userId) => `
INSERT INTO task_recurrence_assignees (
  recurrence_assignee_id,
  workspace_id,
  recurrence_template_id,
  assignee_type,
  user_id,
  role_id,
  assigned_by_user_id,
  assigned_at,
  removed_at
)
VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(workspaceId)},
  ${sqlText(templateId)},
  'user',
  ${sqlText(userId)},
  NULL,
  ${sqlNullableText(assignedByUserId)},
  ${sqlText(now)},
  NULL
);
`).join("\n");

  await runSql(`
BEGIN TRANSACTION;
UPDATE task_recurrence_assignees
SET removed_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND recurrence_template_id = ${sqlText(templateId)}
  AND removed_at IS NULL;
${inserts}
COMMIT;
`);
}

async function readTemplateAssignees(workspaceId, templateId) {
  return querySql(`
SELECT recurrence_template_id, user_id
FROM task_recurrence_assignees
WHERE workspace_id = ${sqlText(workspaceId)}
  AND recurrence_template_id = ${sqlText(templateId)}
  AND removed_at IS NULL
ORDER BY assigned_at;
`);
}

function templateSelectSql(whereSql) {
  return `
SELECT
  recurrence_template_id,
  workspace_id,
  client_id,
  project_id,
  title,
  description,
  status,
  priority,
  recurrence_anchor_date,
  due_time,
  due_timezone,
  due_at_utc,
  rrule,
  recurrence_end_date,
  template_status,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at
FROM task_recurrence_templates
${whereSql}`;
}

function attachTemplateAssignees(templates, assignees) {
  const assigneesByTemplate = assignees.reduce((map, assignee) => {
    if (!map.has(assignee.recurrence_template_id)) {
      map.set(assignee.recurrence_template_id, []);
    }

    map.get(assignee.recurrence_template_id).push(assignee.user_id);
    return map;
  }, new Map());

  return templates.map((template) => ({
    ...template,
    assignee_ids: assigneesByTemplate.get(template.recurrence_template_id) || [],
  }));
}

function templateRowToAppValue(row) {
  return {
    recurrence_template_id: row.recurrence_template_id,
    workspace_id: row.workspace_id,
    client_id: row.client_id || "",
    project_id: row.project_id || "",
    title: row.title,
    description: row.description || "",
    status: row.status || "open",
    priority: row.priority || "normal",
    recurrence_anchor_date: row.recurrence_anchor_date || "",
    due_time: row.due_time || "",
    due_timezone: row.due_timezone || "",
    due_at_utc: row.due_at_utc || "",
    rrule: row.rrule || "",
    recurrence_end_date: row.recurrence_end_date || "",
    template_status: row.template_status || "active",
    created_by_user_id: row.created_by_user_id || "",
    updated_by_user_id: row.updated_by_user_id || "",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export const taskRecurrenceRepository = {
  createTemplate,
  readTemplateById,
  updateTemplate,
};
