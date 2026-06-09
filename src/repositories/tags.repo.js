import { randomUUID } from "node:crypto";
import { querySql, runSql, sqlText, sqlNullableText } from "../db/index.js";

const ASSIGNMENT_SOURCES = new Set(["manual", "propagated", "system"]);

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
  tag_assignments.source_assignment_id,
  tag_assignments.source_target_type,
  tag_assignments.source_target_id,
  tag_assignments.propagation_rule_id,
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
COALESCE(tag_usage.usage_count, 0) AS usage_count,
COALESCE(tag_usage.direct_usage_count, 0) AS direct_usage_count,
COALESCE(tag_usage.propagated_usage_count, 0) AS propagated_usage_count,
COALESCE(tag_usage.system_usage_count, 0) AS system_usage_count
FROM tags
LEFT JOIN (
  SELECT
    workspace_id,
    tag_id,
    COUNT(*) AS usage_count,
    SUM(CASE WHEN source = 'manual' THEN 1 ELSE 0 END) AS direct_usage_count,
    SUM(CASE WHEN source = 'propagated' THEN 1 ELSE 0 END) AS propagated_usage_count,
    SUM(CASE WHEN source = 'system' THEN 1 ELSE 0 END) AS system_usage_count
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

async function listAssignmentsForTarget(workspaceId, targetType, targetId, options = {}) {
  const sourceFilter = assignmentSourceFilter(options.source);
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
  ${sourceFilter ? `AND tag_assignments.source = ${sqlText(sourceFilter)}` : ""}
ORDER BY LOWER(tags.name), tags.tag_id;
`);

  return rows.map(assignmentRowToAppValue);
}

async function listAssignmentsForTargets(workspaceId, targetType, targetIds, options = {}) {
  const normalizedIds = [...new Set((targetIds || []).map((targetId) => String(targetId || "").trim()).filter(Boolean))];
  const sourceFilter = assignmentSourceFilter(options.source);

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
  ${sourceFilter ? `AND tag_assignments.source = ${sqlText(sourceFilter)}` : ""}
ORDER BY tag_assignments.target_id, LOWER(tags.name), tags.tag_id;
`);

  return rows.map(assignmentRowToAppValue);
}

async function addAssignment(workspaceId, assignment) {
  const assignmentId = randomUUID();
  const now = new Date().toISOString();
  const source = normalizeAssignmentSource(assignment.source);

  await runSql(`
INSERT OR IGNORE INTO tag_assignments (
  tag_assignment_id,
  workspace_id,
  tag_id,
  target_type,
  target_id,
  created_by_user_id,
  source,
  source_assignment_id,
  source_target_type,
  source_target_id,
  propagation_rule_id,
  created_at
)
VALUES (
  ${sqlText(assignmentId)},
  ${sqlText(workspaceId)},
  ${sqlText(assignment.tag_id)},
  ${sqlText(assignment.target_type)},
  ${sqlText(assignment.target_id)},
  ${sqlNullableText(assignment.created_by_user_id)},
  ${sqlText(source)},
  ${sqlNullableText(assignment.source_assignment_id)},
  ${sqlNullableText(assignment.source_target_type)},
  ${sqlNullableText(assignment.source_target_id)},
  ${sqlNullableText(assignment.propagation_rule_id)},
  ${sqlText(now)}
);
`);
}

async function removeAssignment(workspaceId, targetType, targetId, tagId, options = {}) {
  const sourceFilter = assignmentSourceFilter(options.source);
  await runSql(`
DELETE FROM tag_assignments
WHERE workspace_id = ${sqlText(workspaceId)}
  AND target_type = ${sqlText(targetType)}
  AND target_id = ${sqlText(targetId)}
  AND tag_id = ${sqlText(tagId)}
  ${sourceFilter ? `AND source = ${sqlText(sourceFilter)}` : ""};
`);
}

async function removeAssignmentById(workspaceId, assignmentId) {
  await runSql(`
DELETE FROM tag_assignments
WHERE workspace_id = ${sqlText(workspaceId)}
  AND tag_assignment_id = ${sqlText(assignmentId)};
`);
}

async function readAssignmentById(workspaceId, assignmentId) {
  const rows = await querySql(`
SELECT
${ASSIGNMENT_COLUMNS}
FROM tag_assignments
INNER JOIN tags
  ON tags.workspace_id = tag_assignments.workspace_id
  AND tags.tag_id = tag_assignments.tag_id
WHERE tag_assignments.workspace_id = ${sqlText(workspaceId)}
  AND tag_assignments.tag_assignment_id = ${sqlText(assignmentId)}
LIMIT 1;
`);

  return rows[0] ? assignmentRowToAppValue(rows[0]) : null;
}

async function listAssignmentsForPropagationContext(workspaceId, context = {}) {
  const rows = await querySql(`
SELECT
${ASSIGNMENT_COLUMNS}
FROM tag_assignments
INNER JOIN tags
  ON tags.workspace_id = tag_assignments.workspace_id
  AND tags.tag_id = tag_assignments.tag_id
WHERE tag_assignments.workspace_id = ${sqlText(workspaceId)}
  AND tag_assignments.source = 'propagated'
  AND tag_assignments.target_type = ${sqlText(context.target_type)}
  AND tag_assignments.target_id = ${sqlText(context.target_id)}
  AND tag_assignments.source_target_type = ${sqlText(context.source_target_type)}
  AND tag_assignments.source_target_id = ${sqlText(context.source_target_id)}
  AND COALESCE(tag_assignments.propagation_rule_id, '') = ${sqlText(context.propagation_rule_id || "")}
ORDER BY LOWER(tags.name), tags.tag_id;
`);

  return rows.map(assignmentRowToAppValue);
}

async function hasSuppression(workspaceId, suppression) {
  const rows = await querySql(`
SELECT 1 AS found
FROM tag_assignment_suppressions
WHERE workspace_id = ${sqlText(workspaceId)}
  AND tag_id = ${sqlText(suppression.tag_id)}
  AND target_type = ${sqlText(suppression.target_type)}
  AND target_id = ${sqlText(suppression.target_id)}
  AND source_target_type = ${sqlText(suppression.source_target_type)}
  AND source_target_id = ${sqlText(suppression.source_target_id)}
  AND propagation_rule_id = ${sqlText(suppression.propagation_rule_id || "")}
LIMIT 1;
`);

  return rows.length > 0;
}

async function addSuppression(workspaceId, suppression) {
  const suppressionId = suppression.tag_assignment_suppression_id || randomUUID();
  const now = new Date().toISOString();

  await runSql(`
INSERT OR IGNORE INTO tag_assignment_suppressions (
  tag_assignment_suppression_id,
  workspace_id,
  tag_id,
  target_type,
  target_id,
  source_target_type,
  source_target_id,
  propagation_rule_id,
  suppressed_by_user_id,
  created_at
)
VALUES (
  ${sqlText(suppressionId)},
  ${sqlText(workspaceId)},
  ${sqlText(suppression.tag_id)},
  ${sqlText(suppression.target_type)},
  ${sqlText(suppression.target_id)},
  ${sqlText(suppression.source_target_type)},
  ${sqlText(suppression.source_target_id)},
  ${sqlText(suppression.propagation_rule_id || "")},
  ${sqlNullableText(suppression.suppressed_by_user_id)},
  ${sqlText(now)}
);
`);
}

async function listSuppressionsForTarget(workspaceId, targetType, targetId) {
  const rows = await querySql(`
SELECT
  tag_assignment_suppression_id,
  workspace_id,
  tag_id,
  target_type,
  target_id,
  source_target_type,
  source_target_id,
  propagation_rule_id,
  suppressed_by_user_id,
  created_at
FROM tag_assignment_suppressions
WHERE workspace_id = ${sqlText(workspaceId)}
  AND target_type = ${sqlText(targetType)}
  AND target_id = ${sqlText(targetId)}
ORDER BY created_at, tag_assignment_suppression_id;
`);

  return rows.map(suppressionRowToAppValue);
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
    direct_usage_count: Number(row.direct_usage_count || 0),
    propagated_usage_count: Number(row.propagated_usage_count || 0),
    system_usage_count: Number(row.system_usage_count || 0),
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
    source_assignment_id: row.source_assignment_id || "",
    source_target_type: row.source_target_type || "",
    source_target_id: row.source_target_id || "",
    propagation_rule_id: row.propagation_rule_id || "",
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

function suppressionRowToAppValue(row) {
  return {
    tag_assignment_suppression_id: row.tag_assignment_suppression_id,
    workspace_id: row.workspace_id,
    tag_id: row.tag_id,
    target_type: row.target_type,
    target_id: row.target_id,
    source_target_type: row.source_target_type,
    source_target_id: row.source_target_id,
    propagation_rule_id: row.propagation_rule_id || "",
    suppressed_by_user_id: row.suppressed_by_user_id || "",
    created_at: row.created_at,
  };
}

function tagStatusFilter(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return ["active", "archived", "disabled"].includes(normalized) ? normalized : "";
}

function assignmentSourceFilter(source) {
  const normalized = String(source || "").trim().toLowerCase();
  return ASSIGNMENT_SOURCES.has(normalized) ? normalized : "";
}

function normalizeAssignmentSource(source) {
  const normalized = String(source || "manual").trim().toLowerCase();

  if (!ASSIGNMENT_SOURCES.has(normalized)) {
    throw new Error(`Invalid tag assignment source: ${source}`);
  }

  return normalized;
}

export const tagsRepository = {
  addAssignment,
  addSuppression,
  createTag,
  listAssignmentsForTarget,
  listAssignmentsForTargets,
  listAssignmentsForPropagationContext,
  listSuppressionsForTarget,
  listTags,
  hasSuppression,
  readAssignmentById,
  readTagById,
  readTagBySlug,
  readTagsByIds,
  removeAssignment,
  removeAssignmentById,
  setTagStatus,
  updateTag,
};
