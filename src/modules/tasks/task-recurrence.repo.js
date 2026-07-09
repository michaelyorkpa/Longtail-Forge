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

  const [assignees, checklistItems, noteLinks] = await Promise.all([
    readTemplateAssignees(workspaceId, templateId),
    readTemplateChecklist(workspaceId, templateId),
    readTemplateNoteLinks(workspaceId, templateId),
  ]);
  return {
    ...attachTemplateAssignees([templateRowToAppValue(row)], assignees)[0],
    checklistItems,
    noteLinks,
  };
}

async function readActiveTemplates(workspaceId) {
  const rows = await db.query(templateSelectSql(`
WHERE task_recurrence_templates.workspace_id = :workspaceId
  AND task_recurrence_templates.template_status = 'active'
ORDER BY task_recurrence_templates.created_at, task_recurrence_templates.recurrence_template_id;
`), {
    workspaceId: textParam(workspaceId),
  });

  if (rows.length === 0) {
    return [];
  }

  const templates = rows.map(templateRowToAppValue);
  const assignees = await Promise.all(
    templates.map((template) => readTemplateAssignees(workspaceId, template.recurrence_template_id)),
  );
  return templates.map((template, index) => attachTemplateAssignees([template], assignees[index])[0]);
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

async function readTemplateChecklist(workspaceId, templateId) {
  const rows = await db.query(`
SELECT
  recurrence_checklist_item_id,
  workspace_id,
  recurrence_template_id,
  label,
  sort_order,
  deleted_at,
  deleted_by_user_id,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at
FROM task_recurrence_checklist_items
WHERE workspace_id = :workspaceId
  AND recurrence_template_id = :templateId
  AND deleted_at IS NULL
ORDER BY sort_order, created_at;
`, {
    templateId: textParam(templateId),
    workspaceId: textParam(workspaceId),
  });

  return rows.map(templateChecklistRowToAppValue);
}

async function replaceTemplateChecklist(workspaceId, templateId, items, updatedByUserId) {
  const now = new Date().toISOString();
  const normalizedItems = normalizeTemplateChecklistItems(items);

  await db.transaction(async (transaction) => {
    await transaction.run(`
UPDATE task_recurrence_checklist_items
SET deleted_at = :now,
    deleted_by_user_id = :updatedByUserId,
    updated_by_user_id = :updatedByUserId,
    updated_at = :now
WHERE workspace_id = :workspaceId
  AND recurrence_template_id = :templateId
  AND deleted_at IS NULL;
`, {
      now,
      templateId: textParam(templateId),
      updatedByUserId: nullableTextParam(updatedByUserId),
      workspaceId: textParam(workspaceId),
    });

    for (const [index, item] of normalizedItems.entries()) {
      await transaction.run(`
INSERT INTO task_recurrence_checklist_items (
  recurrence_checklist_item_id,
  workspace_id,
  recurrence_template_id,
  label,
  sort_order,
  deleted_at,
  deleted_by_user_id,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at
)
VALUES (
  :itemId,
  :workspaceId,
  :templateId,
  :label,
  :sortOrder,
  NULL,
  NULL,
  :createdByUserId,
  :updatedByUserId,
  :now,
  :now
);
`, {
        createdByUserId: nullableTextParam(item.created_by_user_id || updatedByUserId),
        itemId: textParam(item.recurrence_checklist_item_id || randomUUID()),
        label: textParam(item.label),
        now,
        sortOrder: integerParam(item.sort_order || ((index + 1) * 1000)),
        templateId: textParam(templateId),
        updatedByUserId: nullableTextParam(updatedByUserId),
        workspaceId: textParam(workspaceId),
      });
    }
  });

  return readTemplateChecklist(workspaceId, templateId);
}

async function readTemplateNoteLinks(workspaceId, templateId) {
  const rows = await db.query(`
SELECT
  recurrence_note_link_id,
  workspace_id,
  recurrence_template_id,
  note_id,
  link_role,
  scope_role,
  sort_order,
  deleted_at,
  deleted_by_user_id,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at
FROM task_recurrence_note_links
WHERE workspace_id = :workspaceId
  AND recurrence_template_id = :templateId
  AND deleted_at IS NULL
ORDER BY sort_order, created_at;
`, {
    templateId: textParam(templateId),
    workspaceId: textParam(workspaceId),
  });

  return rows.map(templateNoteLinkRowToAppValue);
}

async function replaceTemplateNoteLinks(workspaceId, templateId, links, updatedByUserId) {
  const now = new Date().toISOString();
  const normalizedLinks = normalizeTemplateNoteLinks(links);

  await db.transaction(async (transaction) => {
    await transaction.run(`
UPDATE task_recurrence_note_links
SET deleted_at = :now,
    deleted_by_user_id = :updatedByUserId,
    updated_by_user_id = :updatedByUserId,
    updated_at = :now
WHERE workspace_id = :workspaceId
  AND recurrence_template_id = :templateId
  AND deleted_at IS NULL;
`, {
      now,
      templateId: textParam(templateId),
      updatedByUserId: nullableTextParam(updatedByUserId),
      workspaceId: textParam(workspaceId),
    });

    for (const [index, link] of normalizedLinks.entries()) {
      await transaction.run(`
INSERT INTO task_recurrence_note_links (
  recurrence_note_link_id,
  workspace_id,
  recurrence_template_id,
  note_id,
  link_role,
  scope_role,
  sort_order,
  deleted_at,
  deleted_by_user_id,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at
)
VALUES (
  :linkId,
  :workspaceId,
  :templateId,
  :noteId,
  :linkRole,
  :scopeRole,
  :sortOrder,
  NULL,
  NULL,
  :createdByUserId,
  :updatedByUserId,
  :now,
  :now
);
`, {
        createdByUserId: nullableTextParam(link.created_by_user_id || updatedByUserId),
        linkId: textParam(link.recurrence_note_link_id || randomUUID()),
        linkRole: textParam(link.link_role || "related"),
        noteId: textParam(link.note_id),
        now,
        scopeRole: textParam(link.scope_role || "related"),
        sortOrder: integerParam(link.sort_order || ((index + 1) * 1000)),
        templateId: textParam(templateId),
        updatedByUserId: nullableTextParam(updatedByUserId),
        workspaceId: textParam(workspaceId),
      });
    }
  });

  return readTemplateNoteLinks(workspaceId, templateId);
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

function templateChecklistRowToAppValue(row) {
  return {
    created_at: row.created_at || "",
    created_by_user_id: row.created_by_user_id || "",
    deleted_at: row.deleted_at || "",
    deleted_by_user_id: row.deleted_by_user_id || "",
    label: row.label || "",
    recurrence_checklist_item_id: row.recurrence_checklist_item_id,
    recurrence_template_id: row.recurrence_template_id,
    sort_order: Number.parseInt(row.sort_order, 10) || 0,
    updated_at: row.updated_at || "",
    updated_by_user_id: row.updated_by_user_id || "",
    workspace_id: row.workspace_id,
  };
}

function templateNoteLinkRowToAppValue(row) {
  return {
    created_at: row.created_at || "",
    created_by_user_id: row.created_by_user_id || "",
    deleted_at: row.deleted_at || "",
    deleted_by_user_id: row.deleted_by_user_id || "",
    link_role: row.link_role || "related",
    note_id: row.note_id || "",
    recurrence_note_link_id: row.recurrence_note_link_id,
    recurrence_template_id: row.recurrence_template_id,
    scope_role: row.scope_role || "related",
    sort_order: Number.parseInt(row.sort_order, 10) || 0,
    updated_at: row.updated_at || "",
    updated_by_user_id: row.updated_by_user_id || "",
    workspace_id: row.workspace_id,
  };
}

function normalizeTemplateChecklistItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => ({
      ...item,
      label: String(item?.label || "").trim(),
      sort_order: integerParam(item?.sort_order || ((index + 1) * 1000)),
    }))
    .filter((item) => item.label);
}

function normalizeTemplateNoteLinks(links = []) {
  const seen = new Set();
  return (Array.isArray(links) ? links : [])
    .map((link, index) => ({
      ...link,
      link_role: String(link?.link_role || link?.linkRole || "related").trim() || "related",
      note_id: String(link?.note_id || link?.noteId || "").trim(),
      scope_role: String(link?.scope_role || link?.scopeRole || "related").trim() || "related",
      sort_order: integerParam(link?.sort_order || link?.sortOrder || ((index + 1) * 1000)),
    }))
    .filter((link) => {
      if (!link.note_id) {
        return false;
      }
      const key = [link.note_id, link.link_role, link.scope_role].join(":");
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
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

function integerParam(value) {
  const integer = Number.parseInt(value, 10);
  return Number.isFinite(integer) ? integer : 0;
}

export const taskRecurrenceRepository = {
  createTemplate,
  readActiveTemplates,
  readTemplateChecklist,
  readTemplateNoteLinks,
  readTemplateById,
  replaceTemplateChecklist,
  replaceTemplateNoteLinks,
  updateTemplate,
};
