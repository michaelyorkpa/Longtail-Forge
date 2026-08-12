// @ts-check

import { db } from "../core/database.js";
import { createRecordId } from "../core/identifiers.js";

/** @typedef {import("../types/database-contracts.js").DatabaseRow} DatabaseRow */
/** @typedef {DatabaseRow & { tag_id: string, workspace_id: string, name: string, slug: string, description: string | null, color: string | null, status: string, usage_count?: unknown, direct_usage_count?: unknown, propagated_usage_count?: unknown, system_usage_count?: unknown, created_by_user_id: string | null, created_at: string, updated_at: string }} TagRow */
/** @typedef {DatabaseRow & { tag_assignment_id: string, workspace_id: string, tag_id: string, target_type: string, target_id: string, created_by_user_id: string | null, source: string, source_assignment_id: string | null, source_target_type: string | null, source_target_id: string | null, propagation_rule_id: string | null, created_at: string, name: string, slug: string, description: string | null, color: string | null, status: string }} TagAssignmentRow */
/** @typedef {DatabaseRow & { tag_assignment_suppression_id: string, workspace_id: string, tag_id: string, target_type: string, target_id: string, source_target_type: string, source_target_id: string, propagation_rule_id: string | null, suppressed_by_user_id: string | null, created_at: string }} TagSuppressionRow */

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

const TAG_ASSIGNMENT_INSERT_COLUMNS = [
  "tag_assignment_id",
  "workspace_id",
  "tag_id",
  "target_type",
  "target_id",
  "created_by_user_id",
  "source",
  "source_assignment_id",
  "source_target_type",
  "source_target_id",
  "propagation_rule_id",
  "created_at",
];

const TAG_ASSIGNMENT_VALUE_EXPRESSIONS = {
  created_at: ":createdAt",
  created_by_user_id: ":createdByUserId",
  propagation_rule_id: ":propagationRuleId",
  source: ":source",
  source_assignment_id: ":sourceAssignmentId",
  source_target_id: ":sourceTargetId",
  source_target_type: ":sourceTargetType",
  tag_assignment_id: ":assignmentId",
  tag_id: ":tagId",
  target_id: ":targetId",
  target_type: ":targetType",
  workspace_id: ":workspaceId",
};

const TAG_SUPPRESSION_INSERT_COLUMNS = [
  "tag_assignment_suppression_id",
  "workspace_id",
  "tag_id",
  "target_type",
  "target_id",
  "source_target_type",
  "source_target_id",
  "propagation_rule_id",
  "suppressed_by_user_id",
  "created_at",
];

const TAG_SUPPRESSION_VALUE_EXPRESSIONS = {
  created_at: ":createdAt",
  propagation_rule_id: ":propagationRuleId",
  source_target_id: ":sourceTargetId",
  source_target_type: ":sourceTargetType",
  suppressed_by_user_id: ":suppressedByUserId",
  tag_assignment_suppression_id: ":suppressionId",
  tag_id: ":tagId",
  target_id: ":targetId",
  target_type: ":targetType",
  workspace_id: ":workspaceId",
};

async function createTag(workspaceId, tag) {
  const now = new Date().toISOString();
  const tagId = tag.tag_id || createRecordId();

  await db.run(`
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
  :tagId,
  :workspaceId,
  :name,
  :slug,
  :description,
  :color,
  :status,
  :createdByUserId,
  :createdAt,
  :updatedAt
);
`, {
    color: nullableText(tag.color),
    createdAt: text(now),
    createdByUserId: nullableText(tag.created_by_user_id),
    description: text(tag.description || ""),
    name: text(tag.name),
    slug: text(tag.slug),
    status: text(tag.status || "active"),
    tagId: text(tagId),
    updatedAt: text(now),
    workspaceId: text(workspaceId),
  });

  return readTagById(workspaceId, tagId);
}

async function updateTag(workspaceId, tagId, updates) {
  const now = new Date().toISOString();

  await db.run(`
UPDATE tags
SET name = :name,
    slug = :slug,
    description = :description,
    color = :color,
    updated_at = :updatedAt
WHERE tags.workspace_id = :workspaceId
  AND tag_id = :tagId;
`, {
    color: nullableText(updates.color),
    description: text(updates.description || ""),
    name: text(updates.name),
    slug: text(updates.slug),
    tagId: text(tagId),
    updatedAt: text(now),
    workspaceId: text(workspaceId),
  });

  return readTagById(workspaceId, tagId);
}

async function setTagStatus(workspaceId, tagId, status) {
  await db.run(`
UPDATE tags
SET status = :status,
    updated_at = :updatedAt
WHERE workspace_id = :workspaceId
  AND tag_id = :tagId;
`, {
    status: text(status),
    tagId: text(tagId),
    updatedAt: text(new Date().toISOString()),
    workspaceId: text(workspaceId),
  });

  return readTagById(workspaceId, tagId);
}

async function listTags(workspaceId, options = {}) {
  const statusFilter = tagStatusFilter(options.status);
  const search = String(options.search || "").trim().toLowerCase();
  const clauses = ["tags.workspace_id = :workspaceId"];
  const params = {
    workspaceId: text(workspaceId),
  };

  if (statusFilter) {
    clauses.push("tags.status = :status");
    params.status = text(statusFilter);
  }
  if (search) {
    clauses.push(`(${db.dialect.comparison.likeNoCase("tags.name", ":searchPattern")} OR ${db.dialect.comparison.likeNoCase("tags.slug", ":searchPattern")})`);
    params.searchPattern = `%${search}%`;
  }

  const rows = await db.query(`
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
WHERE ${clauses.join("\n  AND ")}
ORDER BY
  CASE tags.status WHEN 'active' THEN 0 WHEN 'disabled' THEN 1 ELSE 2 END,
  ${db.dialect.comparison.orderByNoCase("tags.name", "ASC")},
  tags.tag_id;
`, params);

  return rows.map(tagRowToAppValue);
}

async function readTagById(workspaceId, tagId) {
  const row = await db.get(`
SELECT
${TAG_COLUMNS}
FROM tags
WHERE workspace_id = :workspaceId
  AND tag_id = :tagId
LIMIT 1;
`, {
    tagId: text(tagId),
    workspaceId: text(workspaceId),
  });

  return row ? tagRowToAppValue(row) : null;
}

async function readTagBySlug(workspaceId, slug) {
  const row = await db.get(`
SELECT
${TAG_COLUMNS}
FROM tags
WHERE workspace_id = :workspaceId
  AND slug = :slug
LIMIT 1;
`, {
    slug: text(slug),
    workspaceId: text(workspaceId),
  });

  return row ? tagRowToAppValue(row) : null;
}

async function readTagsByIds(workspaceId, tagIds) {
  const normalizedIds = normalizeIdList(tagIds);

  if (normalizedIds.length === 0) {
    return [];
  }

  const rows = await db.query(`
SELECT
${TAG_COLUMNS}
FROM tags
WHERE workspace_id = :workspaceId
  AND tag_id IN (:tagIds)
ORDER BY ${db.dialect.comparison.orderByNoCase("name", "ASC")}, tag_id;
`, {
    tagIds: normalizedIds,
    workspaceId: text(workspaceId),
  });

  return rows.map(tagRowToAppValue);
}

async function listAssignmentsForTarget(workspaceId, targetType, targetId, options = {}) {
  const { clauses, params } = assignmentWhereClauses(workspaceId, {
    source: options.source,
    targetId,
    targetType,
  });
  const rows = await db.query(`
SELECT
${ASSIGNMENT_COLUMNS}
FROM tag_assignments
INNER JOIN tags
  ON tags.workspace_id = tag_assignments.workspace_id
  AND tags.tag_id = tag_assignments.tag_id
WHERE ${clauses.join("\n  AND ")}
ORDER BY ${db.dialect.comparison.orderByNoCase("tags.name", "ASC")}, tags.tag_id;
`, params);

  return rows.map(assignmentRowToAppValue);
}

async function listAssignmentsForTargets(workspaceId, targetType, targetIds, options = {}) {
  const normalizedIds = normalizeIdList(targetIds);
  const sourceFilter = assignmentSourceFilter(options.source);

  if (normalizedIds.length === 0) {
    return [];
  }

  const clauses = [
    "tag_assignments.workspace_id = :workspaceId",
    "tag_assignments.target_type = :targetType",
    "tag_assignments.target_id IN (:targetIds)",
  ];
  const params = {
    targetIds: normalizedIds,
    targetType: text(targetType),
    workspaceId: text(workspaceId),
  };

  if (sourceFilter) {
    clauses.push("tag_assignments.source = :source");
    params.source = text(sourceFilter);
  }

  const rows = await db.query(`
SELECT
${ASSIGNMENT_COLUMNS}
FROM tag_assignments
INNER JOIN tags
  ON tags.workspace_id = tag_assignments.workspace_id
  AND tags.tag_id = tag_assignments.tag_id
WHERE ${clauses.join("\n  AND ")}
ORDER BY tag_assignments.target_id, ${db.dialect.comparison.orderByNoCase("tags.name", "ASC")}, tags.tag_id;
`, params);

  return rows.map(assignmentRowToAppValue);
}

async function addAssignment(workspaceId, assignment) {
  const assignmentId = createRecordId();
  const now = new Date().toISOString();
  const source = normalizeAssignmentSource(assignment.source);

  await db.run(`${db.dialect.conflict.buildInsertOrIgnore({
    columns: TAG_ASSIGNMENT_INSERT_COLUMNS,
    tableName: "tag_assignments",
    valueExpressions: TAG_ASSIGNMENT_VALUE_EXPRESSIONS,
  })};`, assignmentInsertParams(workspaceId, assignment, assignmentId, source, now));
}

async function removeAssignment(workspaceId, targetType, targetId, tagId, options = {}) {
  const sourceFilter = assignmentSourceFilter(options.source);
  const clauses = [
    "workspace_id = :workspaceId",
    "target_type = :targetType",
    "target_id = :targetId",
    "tag_id = :tagId",
  ];
  const params = {
    tagId: text(tagId),
    targetId: text(targetId),
    targetType: text(targetType),
    workspaceId: text(workspaceId),
  };

  if (sourceFilter) {
    clauses.push("source = :source");
    params.source = text(sourceFilter);
  }

  await db.run(`
DELETE FROM tag_assignments
WHERE ${clauses.join("\n  AND ")};
`, params);
}

async function removeAssignmentById(workspaceId, assignmentId) {
  await db.run(`
DELETE FROM tag_assignments
WHERE workspace_id = :workspaceId
  AND tag_assignment_id = :assignmentId;
`, {
    assignmentId: text(assignmentId),
    workspaceId: text(workspaceId),
  });
}

async function readAssignmentById(workspaceId, assignmentId) {
  const row = await db.get(`
SELECT
${ASSIGNMENT_COLUMNS}
FROM tag_assignments
INNER JOIN tags
  ON tags.workspace_id = tag_assignments.workspace_id
  AND tags.tag_id = tag_assignments.tag_id
WHERE tag_assignments.workspace_id = :workspaceId
  AND tag_assignments.tag_assignment_id = :assignmentId
LIMIT 1;
`, {
    assignmentId: text(assignmentId),
    workspaceId: text(workspaceId),
  });

  return row ? assignmentRowToAppValue(row) : null;
}

async function listAssignmentsForPropagationContext(workspaceId, context = {}) {
  const rows = await db.query(`
SELECT
${ASSIGNMENT_COLUMNS}
FROM tag_assignments
INNER JOIN tags
  ON tags.workspace_id = tag_assignments.workspace_id
  AND tags.tag_id = tag_assignments.tag_id
WHERE tag_assignments.workspace_id = :workspaceId
  AND tag_assignments.source = :source
  AND tag_assignments.target_type = :targetType
  AND tag_assignments.target_id = :targetId
  AND tag_assignments.source_target_type = :sourceTargetType
  AND tag_assignments.source_target_id = :sourceTargetId
  AND COALESCE(tag_assignments.propagation_rule_id, '') = :propagationRuleId
ORDER BY ${db.dialect.comparison.orderByNoCase("tags.name", "ASC")}, tags.tag_id;
`, {
    propagationRuleId: text(context.propagation_rule_id || ""),
    source: "propagated",
    sourceTargetId: text(context.source_target_id),
    sourceTargetType: text(context.source_target_type),
    targetId: text(context.target_id),
    targetType: text(context.target_type),
    workspaceId: text(workspaceId),
  });

  return rows.map(assignmentRowToAppValue);
}

async function hasSuppression(workspaceId, suppression) {
  const row = await db.get(`
SELECT 1 AS found
FROM tag_assignment_suppressions
WHERE workspace_id = :workspaceId
  AND tag_id = :tagId
  AND target_type = :targetType
  AND target_id = :targetId
  AND source_target_type = :sourceTargetType
  AND source_target_id = :sourceTargetId
  AND propagation_rule_id = :propagationRuleId
LIMIT 1;
`, {
    propagationRuleId: text(suppression.propagation_rule_id || ""),
    sourceTargetId: text(suppression.source_target_id),
    sourceTargetType: text(suppression.source_target_type),
    tagId: text(suppression.tag_id),
    targetId: text(suppression.target_id),
    targetType: text(suppression.target_type),
    workspaceId: text(workspaceId),
  });

  return Boolean(row);
}

async function addSuppression(workspaceId, suppression) {
  const suppressionId = suppression.tag_assignment_suppression_id || createRecordId();
  const now = new Date().toISOString();

  await db.run(`${db.dialect.conflict.buildInsertOrIgnore({
    columns: TAG_SUPPRESSION_INSERT_COLUMNS,
    tableName: "tag_assignment_suppressions",
    valueExpressions: TAG_SUPPRESSION_VALUE_EXPRESSIONS,
  })};`, suppressionInsertParams(workspaceId, suppression, suppressionId, now));
}

async function listSuppressionsForTarget(workspaceId, targetType, targetId) {
  const rows = await db.query(`
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
WHERE workspace_id = :workspaceId
  AND target_type = :targetType
  AND target_id = :targetId
ORDER BY created_at, tag_assignment_suppression_id;
`, {
    targetId: text(targetId),
    targetType: text(targetType),
    workspaceId: text(workspaceId),
  });

  return rows.map(suppressionRowToAppValue);
}

function assignmentWhereClauses(workspaceId, options = {}) {
  const sourceFilter = assignmentSourceFilter(options.source);
  const clauses = [
    "tag_assignments.workspace_id = :workspaceId",
    "tag_assignments.target_type = :targetType",
    "tag_assignments.target_id = :targetId",
  ];
  const params = {
    targetId: text(options.targetId),
    targetType: text(options.targetType),
    workspaceId: text(workspaceId),
  };

  if (sourceFilter) {
    clauses.push("tag_assignments.source = :source");
    params.source = text(sourceFilter);
  }

  return { clauses, params };
}

function assignmentInsertParams(workspaceId, assignment, assignmentId, source, now) {
  return {
    assignmentId: text(assignmentId),
    createdAt: text(now),
    createdByUserId: nullableText(assignment.created_by_user_id),
    propagationRuleId: nullableText(assignment.propagation_rule_id),
    source: text(source),
    sourceAssignmentId: nullableText(assignment.source_assignment_id),
    sourceTargetId: nullableText(assignment.source_target_id),
    sourceTargetType: nullableText(assignment.source_target_type),
    tagId: text(assignment.tag_id),
    targetId: text(assignment.target_id),
    targetType: text(assignment.target_type),
    workspaceId: text(workspaceId),
  };
}

function suppressionInsertParams(workspaceId, suppression, suppressionId, now) {
  return {
    createdAt: text(now),
    propagationRuleId: text(suppression.propagation_rule_id || ""),
    sourceTargetId: text(suppression.source_target_id),
    sourceTargetType: text(suppression.source_target_type),
    suppressedByUserId: nullableText(suppression.suppressed_by_user_id),
    suppressionId: text(suppressionId),
    tagId: text(suppression.tag_id),
    targetId: text(suppression.target_id),
    targetType: text(suppression.target_type),
    workspaceId: text(workspaceId),
  };
}

function text(value) {
  return String(value ?? "");
}

function nullableText(value) {
  return value === null || value === undefined || String(value).trim() === ""
    ? null
    : String(value);
}

function normalizeIdList(ids = []) {
  return [...new Set((Array.isArray(ids) ? ids : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean))];
}

/** @param {DatabaseRow} databaseRow */
function tagRowToAppValue(databaseRow) {
  const row = /** @type {TagRow} */ (databaseRow);
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

/** @param {DatabaseRow} databaseRow */
function assignmentRowToAppValue(databaseRow) {
  const row = /** @type {TagAssignmentRow} */ (databaseRow);
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

/** @param {DatabaseRow} databaseRow */
function suppressionRowToAppValue(databaseRow) {
  const row = /** @type {TagSuppressionRow} */ (databaseRow);
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
