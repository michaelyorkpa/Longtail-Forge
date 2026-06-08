import { randomUUID } from "node:crypto";
import { querySql, runSql, sqlText, sqlNullableText } from "../db/index.js";

const TAG_COLUMNS = `
  tag_id,
  workspace_id,
  name,
  slug,
  description,
  color,
  status,
  created_by_user_id,
  created_at,
  updated_at
`;

const QUALIFIED_TAG_COLUMNS = `
  tags.tag_id,
  tags.workspace_id,
  tags.name,
  tags.slug,
  tags.description,
  tags.color,
  tags.status,
  tags.created_by_user_id,
  tags.created_at,
  tags.updated_at
`;

const ASSIGNMENT_COLUMNS = `
  tag_assignments.tag_assignment_id,
  tag_assignments.workspace_id,
  tag_assignments.tag_id,
  tag_assignments.target_type,
  tag_assignments.target_id,
  tag_assignments.created_by_user_id,
  tag_assignments.source,
  tag_assignments.created_at,
  tags.name,
  tags.slug,
  tags.description,
  tags.color,
  tags.status
`;

async function createTag(workspaceId, tag) {
  const now = new Date().toISOString();
  const tagId = tag.tag_id || randomUUID();

  await runSql(`
INSERT INTO tags (
  tag_id,
  workspace_id,
  name,
  slug,
  description,
  color,
  status,
  created_by_user_id,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(tagId)},
  ${sqlText(workspaceId)},
  ${sqlText(tag.name)},
  ${sqlText(tag.slug)},
  ${sqlText(tag.description || "")},
  ${sqlNullableText(tag.color)},
  ${sqlText(tag.status || "active")},
  ${sqlNullableText(tag.created_by_user_id)},
  ${sqlText(now)},
  ${sqlText(now)}
);
`);

  return readTagById(workspaceId, tagId);
}

async function updateTag(workspaceId, tagId, updates) {
  const now = new Date().toISOString();

  await runSql(`
UPDATE tags
SET name = ${sqlText(updates.name)},
    slug = ${sqlText(updates.slug)},
    description = ${sqlText(updates.description || "")},
    color = ${sqlNullableText(updates.color)},
    updated_at = ${sqlText(now)}
WHERE tags.workspace_id = ${sqlText(workspaceId)}
  AND tag_id = ${sqlText(tagId)};
`);

  return readTagById(workspaceId, tagId);
}

async function setTagStatus(workspaceId, tagId, status) {
  await runSql(`
UPDATE tags
SET status = ${sqlText(status)},
    updated_at = ${sqlText(new Date().toISOString())}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND tag_id = ${sqlText(tagId)};
`);

  return readTagById(workspaceId, tagId);
}

async function listTags(workspaceId, options = {}) {
  const statusFilter = tagStatusFilter(options.status);
  const search = String(options.search || "").trim().toLowerCase();

  const rows = await querySql(`
SELECT
${QUALIFIED_TAG_COLUMNS},
COALESCE(tag_usage.usage_count, 0) AS usage_count
FROM tags
LEFT JOIN (
  SELECT workspace_id, tag_id, COUNT(*) AS usage_count
  FROM tag_assignments
  GROUP BY workspace_id, tag_id
) tag_usage
  ON tag_usage.workspace_id = tags.workspace_id
  AND tag_usage.tag_id = tags.tag_id
WHERE tags.workspace_id = ${sqlText(workspaceId)}
  ${statusFilter ? `AND tags.status = ${sqlText(statusFilter)}` : ""}
  ${search ? `AND (LOWER(tags.name) LIKE ${sqlText(`%${search}%`)} OR LOWER(tags.slug) LIKE ${sqlText(`%${search}%`)})` : ""}
ORDER BY
  CASE tags.status WHEN 'active' THEN 0 WHEN 'disabled' THEN 1 ELSE 2 END,
  LOWER(tags.name),
  tags.tag_id;
`);

  return rows.map(tagRowToAppValue);
}

async function readTagById(workspaceId, tagId) {
  const rows = await querySql(`
SELECT
${TAG_COLUMNS}
FROM tags
WHERE workspace_id = ${sqlText(workspaceId)}
  AND tag_id = ${sqlText(tagId)}
LIMIT 1;
`);

  return rows[0] ? tagRowToAppValue(rows[0]) : null;
}

async function readTagBySlug(workspaceId, slug) {
  const rows = await querySql(`
SELECT
${TAG_COLUMNS}
FROM tags
WHERE workspace_id = ${sqlText(workspaceId)}
  AND slug = ${sqlText(slug)}
LIMIT 1;
`);

  return rows[0] ? tagRowToAppValue(rows[0]) : null;
}

async function readTagsByIds(workspaceId, tagIds) {
  const normalizedIds = [...new Set((tagIds || []).map((tagId) => String(tagId || "").trim()).filter(Boolean))];

  if (normalizedIds.length === 0) {
    return [];
  }

  const rows = await querySql(`
SELECT
${TAG_COLUMNS}
FROM tags
WHERE workspace_id = ${sqlText(workspaceId)}
  AND tag_id IN (${normalizedIds.map(sqlText).join(", ")})
ORDER BY LOWER(name), tag_id;
`);

  return rows.map(tagRowToAppValue);
}

async function listAssignmentsForTarget(workspaceId, targetType, targetId) {
  const rows = await querySql(`
SELECT
${ASSIGNMENT_COLUMNS}
FROM tag_assignments
INNER JOIN tags
  ON tags.workspace_id = tag_assignments.workspace_id
  AND tags.tag_id = tag_assignments.tag_id
WHERE tag_assignments.workspace_id = ${sqlText(workspaceId)}
  AND tag_assignments.target_type = ${sqlText(targetType)}
  AND tag_assignments.target_id = ${sqlText(targetId)}
ORDER BY LOWER(tags.name), tags.tag_id;
`);

  return rows.map(assignmentRowToAppValue);
}

async function listAssignmentsForTargets(workspaceId, targetType, targetIds) {
  const normalizedIds = [...new Set((targetIds || []).map((targetId) => String(targetId || "").trim()).filter(Boolean))];

  if (normalizedIds.length === 0) {
    return [];
  }

  const rows = await querySql(`
SELECT
${ASSIGNMENT_COLUMNS}
FROM tag_assignments
INNER JOIN tags
  ON tags.workspace_id = tag_assignments.workspace_id
  AND tags.tag_id = tag_assignments.tag_id
WHERE tag_assignments.workspace_id = ${sqlText(workspaceId)}
  AND tag_assignments.target_type = ${sqlText(targetType)}
  AND tag_assignments.target_id IN (${normalizedIds.map(sqlText).join(", ")})
ORDER BY tag_assignments.target_id, LOWER(tags.name), tags.tag_id;
`);

  return rows.map(assignmentRowToAppValue);
}

async function addAssignment(workspaceId, assignment) {
  const assignmentId = randomUUID();
  const now = new Date().toISOString();

  await runSql(`
INSERT OR IGNORE INTO tag_assignments (
  tag_assignment_id,
  workspace_id,
  tag_id,
  target_type,
  target_id,
  created_by_user_id,
  source,
  created_at
)
VALUES (
  ${sqlText(assignmentId)},
  ${sqlText(workspaceId)},
  ${sqlText(assignment.tag_id)},
  ${sqlText(assignment.target_type)},
  ${sqlText(assignment.target_id)},
  ${sqlNullableText(assignment.created_by_user_id)},
  ${sqlText(assignment.source || "manual")},
  ${sqlText(now)}
);
`);
}

async function removeAssignment(workspaceId, targetType, targetId, tagId) {
  await runSql(`
DELETE FROM tag_assignments
WHERE workspace_id = ${sqlText(workspaceId)}
  AND target_type = ${sqlText(targetType)}
  AND target_id = ${sqlText(targetId)}
  AND tag_id = ${sqlText(tagId)};
`);
}

function tagRowToAppValue(row) {
  return {
    tag_id: row.tag_id,
    workspace_id: row.workspace_id,
    name: row.name,
    slug: row.slug,
    description: row.description || "",
    color: row.color || "",
    status: row.status || "active",
    usage_count: Number(row.usage_count || 0),
    created_by_user_id: row.created_by_user_id || "",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function assignmentRowToAppValue(row) {
  return {
    tag_assignment_id: row.tag_assignment_id,
    workspace_id: row.workspace_id,
    tag_id: row.tag_id,
    target_type: row.target_type,
    target_id: row.target_id,
    created_by_user_id: row.created_by_user_id || "",
    source: row.source || "manual",
    created_at: row.created_at,
    tag: {
      tag_id: row.tag_id,
      workspace_id: row.workspace_id,
      name: row.name,
      slug: row.slug,
      description: row.description || "",
      color: row.color || "",
      status: row.status || "active",
    },
  };
}

function tagStatusFilter(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return ["active", "archived", "disabled"].includes(normalized) ? normalized : "";
}

export const tagsRepository = {
  addAssignment,
  createTag,
  listAssignmentsForTarget,
  listAssignmentsForTargets,
  listTags,
  readTagById,
  readTagBySlug,
  readTagsByIds,
  removeAssignment,
  setTagStatus,
  updateTag,
};
