import { randomUUID } from "node:crypto";
import { db } from "../../core/database.js";

async function createTemplate(workspaceId, template) {
  const now = new Date().toISOString();
  const templateId = template.recurrence_template_id || randomUUID();

  await db.run(`
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
  :templateId,
  :workspaceId,
  :clientId,
  :projectId,
  :title,
  :description,
  :status,
  :priority,
  :recurrenceAnchorDate,
  :dueTime,
  :dueTimezone,
  :dueAtUtc,
  :rrule,
  :recurrenceEndDate,
  :templateStatus,
  :createdByUserId,
  :updatedByUserId,
  :now,
  :now
);
`, templateWriteParams({
    includeCreatedByUserId: true,
    now,
    template,
    templateId,
    workspaceId,
  }));

  await replaceTemplateAssignees(workspaceId, templateId, template.assignee_ids || [], template.updated_by_user_id || template.created_by_user_id);
  return readTemplateById(workspaceId, templateId);
}

async function updateTemplate(workspaceId, template) {
  const now = new Date().toISOString();

  await db.run(`
UPDATE task_recurrence_templates
SET
  client_id = :clientId,
  project_id = :projectId,
  title = :title,
  description = :description,
  status = :status,
  priority = :priority,
  recurrence_anchor_date = :recurrenceAnchorDate,
  due_time = :dueTime,
  due_timezone = :dueTimezone,
  due_at_utc = :dueAtUtc,
  rrule = :rrule,
  recurrence_end_date = :recurrenceEndDate,
  template_status = :templateStatus,
  updated_by_user_id = :updatedByUserId,
  updated_at = :now
WHERE workspace_id = :workspaceId
  AND recurrence_template_id = :templateId;
`, templateWriteParams({
    now,
    template,
    templateId: template.recurrence_template_id,
    workspaceId,
  }));

  if (Array.isArray(template.assignee_ids)) {
    await replaceTemplateAssignees(workspaceId, template.recurrence_template_id, template.assignee_ids, template.updated_by_user_id);
  }

  return readTemplateById(workspaceId, template.recurrence_template_id);
}

async function readTemplateById(workspaceId, templateId) {
  const row = await db.get(templateSelectSql(`
WHERE task_recurrence_templates.workspace_id = :workspaceId
  AND task_recurrence_templates.recurrence_template_id = :templateId
LIMIT 1;
`), {
    templateId: textParam(templateId),
    workspaceId: textParam(workspaceId),
  });

  if (!row) {
    return null;
  }

  const assignees = await readTemplateAssignees(workspaceId, templateId);
  return attachTemplateAssignees([templateRowToAppValue(row)], assignees)[0];
}

async function replaceTemplateAssignees(workspaceId, templateId, assigneeIds, assignedByUserId) {
  const now = new Date().toISOString();
  const uniqueAssigneeIds = [...new Set((assigneeIds || []).map((id) => String(id || "").trim()).filter(Boolean))];

  await db.transaction(async (transaction) => {
    await transaction.run(`
UPDATE task_recurrence_assignees
SET removed_at = :removedAt
WHERE workspace_id = :workspaceId
  AND recurrence_template_id = :templateId
  AND removed_at IS NULL;
`, {
      removedAt: now,
      templateId: textParam(templateId),
      workspaceId: textParam(workspaceId),
    });

    for (const userId of uniqueAssigneeIds) {
      await transaction.run(`
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
  :recurrenceAssigneeId,
  :workspaceId,
  :templateId,
  'user',
  :userId,
  NULL,
  :assignedByUserId,
  :assignedAt,
  NULL
);
`, {
        assignedAt: now,
        assignedByUserId: nullableTextParam(assignedByUserId),
        recurrenceAssigneeId: randomUUID(),
        templateId: textParam(templateId),
        userId: textParam(userId),
        workspaceId: textParam(workspaceId),
      });
    }
  });
}

async function readTemplateAssignees(workspaceId, templateId) {
  return db.query(`
SELECT recurrence_template_id, user_id
FROM task_recurrence_assignees
WHERE workspace_id = :workspaceId
  AND recurrence_template_id = :templateId
  AND removed_at IS NULL
ORDER BY assigned_at;
`, {
    templateId: textParam(templateId),
    workspaceId: textParam(workspaceId),
  });
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

function templateWriteParams({ includeCreatedByUserId = false, now, template, templateId, workspaceId }) {
  const params = {
    clientId: nullableTextParam(template.client_id),
    description: textParam(template.description),
    dueAtUtc: nullableTextParam(template.due_at_utc),
    dueTime: nullableTextParam(template.due_time),
    dueTimezone: nullableTextParam(template.due_timezone),
    priority: textParam(template.priority || "normal"),
    projectId: nullableTextParam(template.project_id),
    recurrenceAnchorDate: textParam(template.recurrence_anchor_date),
    recurrenceEndDate: nullableTextParam(template.recurrence_end_date),
    rrule: textParam(template.rrule),
    status: textParam(template.status || "open"),
    templateId: textParam(templateId),
    templateStatus: textParam(template.template_status || "active"),
    title: textParam(template.title),
    updatedByUserId: nullableTextParam(template.updated_by_user_id),
    workspaceId: textParam(workspaceId),
    now,
  };

  if (includeCreatedByUserId) {
    params.createdByUserId = nullableTextParam(template.created_by_user_id);
  }

  return params;
}

function textParam(value) {
  return String(value ?? "");
}

function nullableTextParam(value) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

export const taskRecurrenceRepository = {
  createTemplate,
  readTemplateById,
  updateTemplate,
};
