import { auditService } from "./audit.service.js";
import { permissionsService } from "./permissions.service.js";
import { modulesService } from "../core/modules/modules.service.js";
import { querySql, sqlText } from "../db/index.js";
import { tagsRepository } from "../repositories/tags.repo.js";
import { AppError } from "../utils/app-error.js";

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TAGS_MODULE_ID = "tags";

async function list(session, query = {}) {
  await assertTaggingReadEnabled(session);
  await permissionsService.assertCan(session, "tags.view", {
    workspace_id: session.workspace_id,
    operation: "read",
  });

  return {
    tags: await tagsRepository.listTags(session.workspace_id, {
      search: query.search,
      status: query.status === "all" ? "" : query.status || "active",
    }),
  };
}

async function create(session, payload = {}) {
  await assertTaggingWriteEnabled(session);
  await permissionsService.assertCan(session, "tags.manage", {
    workspace_id: session.workspace_id,
    operation: "create",
  });

  const normalized = await normalizeTagPayload(session.workspace_id, payload);
  const tag = await tagsRepository.createTag(session.workspace_id, {
    ...normalized,
    created_by_user_id: session.user_id,
  });

  await recordTagAudit(session, "tag.created", "create", tag, null, tag);
  return { tag };
}

async function update(session, tagId, payload = {}) {
  await assertTaggingWriteEnabled(session);
  await permissionsService.assertCan(session, "tags.manage", {
    workspace_id: session.workspace_id,
    operation: "update",
  });

  const previousTag = await readExistingTag(session.workspace_id, tagId);
  const normalized = await normalizeTagPayload(session.workspace_id, payload, previousTag);
  const tag = await tagsRepository.updateTag(session.workspace_id, tagId, normalized);

  await recordTagAudit(session, "tag.updated", "update", tag, previousTag, tag);
  return { tag };
}

async function archive(session, tagId) {
  await assertTaggingWriteEnabled(session);
  await permissionsService.assertCan(session, "tags.manage", {
    workspace_id: session.workspace_id,
    operation: "archive",
  });

  const previousTag = await readExistingTag(session.workspace_id, tagId);
  const tag = await tagsRepository.setTagStatus(session.workspace_id, tagId, "archived");

  await recordTagAudit(session, "tag.archived", "archive", tag, previousTag, tag);
  return { tag };
}

async function restore(session, tagId) {
  await assertTaggingWriteEnabled(session);
  await permissionsService.assertCan(session, "tags.manage", {
    workspace_id: session.workspace_id,
    operation: "restore",
  });

  const previousTag = await readExistingTag(session.workspace_id, tagId);
  const tag = await tagsRepository.setTagStatus(session.workspace_id, tagId, "active");

  await recordTagAudit(session, "tag.restored", "restore", tag, previousTag, tag);
  return { tag };
}

async function listAssignments(session, query = {}) {
  await assertTaggingReadEnabled(session);
  await permissionsService.assertCan(session, "tags.view", {
    workspace_id: session.workspace_id,
    operation: "read",
  });

  const target = await readTargetForSession(session, query.targetType || query.target_type, query.targetId || query.target_id, "read");

  return {
    assignments: await tagsRepository.listAssignmentsForTarget(session.workspace_id, target.targetType, target.targetId),
    target: target.publicTarget,
  };
}

async function assign(session, payload = {}) {
  await assertTaggingWriteEnabled(session);
  const target = await readTargetForSession(session, payload.targetType || payload.target_type, payload.targetId || payload.target_id, "assign");
  const tag = await readAssignableTag(session.workspace_id, payload.tagId || payload.tag_id);
  const existing = await tagsRepository.listAssignmentsForTarget(session.workspace_id, target.targetType, target.targetId);

  if (existing.some((assignment) => assignment.tag_id === tag.tag_id)) {
    return {
      assignments: existing,
      target: target.publicTarget,
    };
  }

  await tagsRepository.addAssignment(session.workspace_id, {
    created_by_user_id: session.user_id,
    source: "manual",
    tag_id: tag.tag_id,
    target_id: target.targetId,
    target_type: target.targetType,
  });

  const assignments = await tagsRepository.listAssignmentsForTarget(session.workspace_id, target.targetType, target.targetId);
  await recordAssignmentAudit(session, "tag.assigned", "create", target, tag, null, tag);

  return { assignments, target: target.publicTarget };
}

async function remove(session, payload = {}) {
  await assertTaggingWriteEnabled(session);
  const target = await readTargetForSession(session, payload.targetType || payload.target_type, payload.targetId || payload.target_id, "remove");
  const tag = await readExistingTag(session.workspace_id, payload.tagId || payload.tag_id);
  const existing = await tagsRepository.listAssignmentsForTarget(session.workspace_id, target.targetType, target.targetId);

  if (!existing.some((assignment) => assignment.tag_id === tag.tag_id)) {
    return {
      assignments: existing,
      target: target.publicTarget,
    };
  }

  await tagsRepository.removeAssignment(session.workspace_id, target.targetType, target.targetId, tag.tag_id);
  const assignments = await tagsRepository.listAssignmentsForTarget(session.workspace_id, target.targetType, target.targetId);
  await recordAssignmentAudit(session, "tag.removed", "delete", target, tag, tag, null);

  return { assignments, target: target.publicTarget };
}

async function replaceAssignments(session, payload = {}) {
  await assertTaggingWriteEnabled(session);
  const target = await readTargetForSession(session, payload.targetType || payload.target_type, payload.targetId || payload.target_id, "replace");
  const tagIds = normalizeTagIds(payload.tagIds || payload.tag_ids);
  const nextTags = await readAssignableTags(session.workspace_id, tagIds);
  const previousAssignments = await tagsRepository.listAssignmentsForTarget(session.workspace_id, target.targetType, target.targetId);
  const previousTagIds = new Set(previousAssignments.map((assignment) => assignment.tag_id));
  const nextTagIds = new Set(nextTags.map((tag) => tag.tag_id));
  const addedTags = nextTags.filter((tag) => !previousTagIds.has(tag.tag_id));
  const removedAssignments = previousAssignments.filter((assignment) => !nextTagIds.has(assignment.tag_id));

  if (addedTags.length > 0) {
    await assertCanMutateTargetTags(session, target, "assign");
  }

  if (removedAssignments.length > 0) {
    await assertCanMutateTargetTags(session, target, "remove");
  }

  for (const tag of addedTags) {
    await tagsRepository.addAssignment(session.workspace_id, {
      created_by_user_id: session.user_id,
      source: "manual",
      tag_id: tag.tag_id,
      target_id: target.targetId,
      target_type: target.targetType,
    });
    await recordAssignmentAudit(session, "tag.assigned", "create", target, tag, null, tag);
  }

  for (const assignment of removedAssignments) {
    await tagsRepository.removeAssignment(session.workspace_id, target.targetType, target.targetId, assignment.tag_id);
    await recordAssignmentAudit(session, "tag.removed", "delete", target, assignment.tag, assignment.tag, null);
  }

  const assignments = await tagsRepository.listAssignmentsForTarget(session.workspace_id, target.targetType, target.targetId);

  await auditService.record({
    session,
    action: "tag.assignments_replaced",
    changeType: "update",
    recordType: "tag_assignment",
    recordId: `${target.targetType}:${target.targetId}`,
    recordLabel: target.publicTarget.label,
    recordUrl: target.publicTarget.url,
    previousValue: previousAssignments.map((assignment) => assignment.tag),
    newValue: assignments.map((assignment) => assignment.tag),
    metadata: {
      added_tag_ids: addedTags.map((tag) => tag.tag_id),
      removed_tag_ids: removedAssignments.map((assignment) => assignment.tag_id),
      target_id: target.targetId,
      target_type: target.targetType,
    },
  });

  return { assignments, target: target.publicTarget };
}

async function decorateRecordsForTarget(session, targetType, records, options = {}) {
  if (!Array.isArray(records) || records.length === 0 || !(await tagsModuleReadable(session))) {
    return Array.isArray(records) ? records : [];
  }

  const idField = options.idField || defaultTargetIdField(targetType);
  const recordIds = records.map((record) => String(record?.[idField] || record?.id || "").trim()).filter(Boolean);
  const assignments = await tagsRepository.listAssignmentsForTargets(session.workspace_id, targetType, recordIds);
  const assignmentsByTarget = groupAssignmentsByTarget(assignments);

  return records.map((record) => ({
    ...record,
    tags: (assignmentsByTarget.get(String(record?.[idField] || record?.id || "").trim()) || [])
      .map((assignment) => assignment.tag)
      .filter((tag) => tag.status === "active"),
  }));
}

async function filterRecordsByTags(session, targetType, records, tagIds, options = {}) {
  const normalizedTagIds = normalizeOptionalTagIds(tagIds);

  if (normalizedTagIds.length === 0) {
    return records;
  }

  if (!(await tagsModuleReadable(session))) {
    return [];
  }

  const decorated = await decorateRecordsForTarget(session, targetType, records, options);
  const requiredIds = new Set(normalizedTagIds);

  return decorated.filter((record) => {
    const recordTagIds = new Set((record.tags || []).map((tag) => tag.tag_id));
    return options.match === "all"
      ? normalizedTagIds.every((tagId) => recordTagIds.has(tagId))
      : normalizedTagIds.some((tagId) => recordTagIds.has(tagId));
  }).map((record) => ({
    ...record,
    tagFilterMatchedIds: [...requiredIds].filter((tagId) => (record.tags || []).some((tag) => tag.tag_id === tagId)),
  }));
}

async function readTargetForSession(session, rawTargetType, rawTargetId, operation) {
  const targetType = String(rawTargetType || "").trim();
  const targetId = String(rawTargetId || "").trim();

  if (!targetType || !targetId) {
    throw new AppError("Tag target type and target ID are required.", 400);
  }

  const descriptor = modulesService.listTaggableTypes().find((type) => type.targetType === targetType);

  if (!descriptor) {
    throw new AppError("That target type is not registered for tagging.", 400);
  }

  if (operation !== "read" && !(await modulesService.canWriteModule(session.workspace_id, descriptor.moduleId))) {
    throw new AppError("That module is disabled for new tag assignments.", 403);
  }

  if (operation === "read" && !(await modulesService.canReadModule(session.workspace_id, descriptor.moduleId))) {
    throw new AppError("That module is disabled for tag assignment reads.", 403);
  }

  const target = await readTargetRecord(session.workspace_id, descriptor, targetId);
  if (!target) {
    throw new AppError("Tag target was not found.", 404);
  }

  const resource = {
    workspace_id: session.workspace_id,
    client_id: target.client_id || "",
    project_id: target.project_id || "",
    operation: operation === "read" ? "read" : "update",
  };

  await permissionsService.assertCan(session, "tags.view", {
    ...resource,
    operation: "read",
  });
  await permissionsService.assertCan(session, descriptor.requiredReadPermission, {
    ...resource,
    operation: "read",
  });

  if (operation === "assign" || operation === "remove") {
    await assertCanMutateTargetTags(session, {
      descriptor,
      resource,
      targetId,
      targetType,
    }, operation);
  }

  return {
    descriptor,
    publicTarget: {
      id: targetId,
      label: target.label || targetId,
      moduleId: descriptor.moduleId,
      targetType,
      url: target.url || "",
    },
    resource,
    targetId,
    targetType,
  };
}

async function tagsModuleReadable(session) {
  return modulesService.canReadModule(session?.workspace_id, TAGS_MODULE_ID);
}

async function assertTaggingReadEnabled(session) {
  if (await modulesService.canReadModule(session?.workspace_id, TAGS_MODULE_ID)) {
    return;
  }

  throw new AppError("Tagging is disabled for this workspace.", 403);
}

async function assertTaggingWriteEnabled(session) {
  if (await modulesService.canWriteModule(session?.workspace_id, TAGS_MODULE_ID)) {
    return;
  }

  throw new AppError("Tagging is disabled for this workspace.", 403);
}

async function assertCanMutateTargetTags(session, target, operation) {
  const permissions = operation === "remove"
    ? ["tags.remove", target.descriptor.requiredTagPermission]
    : ["tags.assign", target.descriptor.requiredTagPermission];
  const uniquePermissions = [...new Set(permissions.filter(Boolean))];

  for (const permission of uniquePermissions) {
    await permissionsService.assertCan(session, permission, {
      ...target.resource,
      operation: operation === "remove" ? "delete" : "update",
    });
  }
}

async function readTargetRecord(workspaceId, descriptor, targetId) {
  const tableName = assertIdentifier(descriptor.tableName, "taggable tableName");
  const idField = assertIdentifier(descriptor.idField, "taggable idField");
  const labelField = assertIdentifier(descriptor.labelField, "taggable labelField");
  const workspaceField = assertIdentifier(descriptor.workspaceField, "taggable workspaceField");
  const clientField = optionalIdentifier(descriptor.clientField, "taggable clientField");
  const projectField = optionalIdentifier(descriptor.projectField, "taggable projectField");
  const columns = [
    `${labelField} AS label`,
    clientField ? `${clientField} AS client_id` : "NULL AS client_id",
    projectField ? `${projectField} AS project_id` : "NULL AS project_id",
  ];

  const rows = await querySql(`
SELECT ${columns.join(", ")}
FROM ${tableName}
WHERE ${workspaceField} = ${sqlText(workspaceId)}
  AND ${idField} = ${sqlText(targetId)}
LIMIT 1;
`);

  return rows[0] || null;
}

async function normalizeTagPayload(workspaceId, payload, existingTag = null) {
  const name = String(payload.name ?? existingTag?.name ?? "").trim().replace(/\s+/g, " ");
  const description = String(payload.description ?? existingTag?.description ?? "").trim();
  const color = normalizeColor(payload.color ?? existingTag?.color ?? "");
  const slug = normalizeSlug(payload.slug || name);

  if (!name) {
    throw new AppError("Tag name is required.", 400);
  }

  if (!slug) {
    throw new AppError("Tag slug is required.", 400);
  }

  const slugOwner = await tagsRepository.readTagBySlug(workspaceId, slug);
  if (slugOwner && slugOwner.tag_id !== existingTag?.tag_id) {
    throw new AppError("A tag with that name or slug already exists.", 409);
  }

  return {
    color,
    description,
    name,
    slug,
  };
}

async function readExistingTag(workspaceId, tagId) {
  const normalizedTagId = String(tagId || "").trim();

  if (!normalizedTagId) {
    throw new AppError("Tag ID is required.", 400);
  }

  const tag = await tagsRepository.readTagById(workspaceId, normalizedTagId);
  if (!tag) {
    throw new AppError("Tag was not found.", 404);
  }

  return tag;
}

async function readAssignableTag(workspaceId, tagId) {
  const tag = await readExistingTag(workspaceId, tagId);

  if (tag.status !== "active") {
    throw new AppError("Only active tags can be assigned.", 400);
  }

  return tag;
}

async function readAssignableTags(workspaceId, tagIds) {
  const tags = await tagsRepository.readTagsByIds(workspaceId, tagIds);
  const foundIds = new Set(tags.map((tag) => tag.tag_id));
  const missingIds = tagIds.filter((tagId) => !foundIds.has(tagId));

  if (missingIds.length > 0) {
    throw new AppError("One or more tags were not found.", 404);
  }

  const inactiveTags = tags.filter((tag) => tag.status !== "active");
  if (inactiveTags.length > 0) {
    throw new AppError("Only active tags can be assigned.", 400);
  }

  return tags;
}

function normalizeTagIds(value) {
  if (!Array.isArray(value)) {
    throw new AppError("Tag IDs must be an array.", 400);
  }

  return [...new Set(value.map((tagId) => String(tagId || "").trim()).filter(Boolean))];
}

function normalizeOptionalTagIds(value) {
  if (value === undefined || value === null || value === "") {
    return [];
  }

  if (Array.isArray(value)) {
    return [...new Set(value.map((tagId) => String(tagId || "").trim()).filter(Boolean))];
  }

  return [...new Set(String(value || "")
    .split(",")
    .map((tagId) => tagId.trim())
    .filter(Boolean))];
}

function groupAssignmentsByTarget(assignments) {
  return assignments.reduce((groups, assignment) => {
    if (!groups.has(assignment.target_id)) {
      groups.set(assignment.target_id, []);
    }

    groups.get(assignment.target_id).push(assignment);
    return groups;
  }, new Map());
}

function defaultTargetIdField(targetType) {
  return modulesService.listTaggableTypes().find((type) => type.targetType === targetType)?.idField || "id";
}

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeColor(value) {
  const color = String(value || "").trim();

  if (!color) {
    return "";
  }

  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
    throw new AppError("Tag color must be a hex color such as #2f6fed.", 400);
  }

  return color.toLowerCase();
}

function assertIdentifier(value, label) {
  const normalized = String(value || "").trim();

  if (!IDENTIFIER_PATTERN.test(normalized)) {
    throw new AppError(`Invalid ${label}.`, 500);
  }

  return normalized;
}

function optionalIdentifier(value, label) {
  return value ? assertIdentifier(value, label) : "";
}

async function recordTagAudit(session, action, changeType, tag, previousValue, newValue) {
  await auditService.record({
    session,
    action,
    changeType,
    recordType: "tag",
    recordId: tag.tag_id,
    recordLabel: tag.name,
    recordUrl: "tags.html",
    previousValue,
    newValue,
    metadata: {
      slug: tag.slug,
      status: tag.status,
      tag_id: tag.tag_id,
    },
  });
}

async function recordAssignmentAudit(session, action, changeType, target, tag, previousValue, newValue) {
  await auditService.record({
    session,
    action,
    changeType,
    recordType: "tag_assignment",
    recordId: `${target.targetType}:${target.targetId}:${tag.tag_id}`,
    recordLabel: `${tag.name} on ${target.publicTarget.label}`,
    recordUrl: target.publicTarget.url,
    previousValue,
    newValue,
    metadata: {
      tag_id: tag.tag_id,
      target_id: target.targetId,
      target_type: target.targetType,
    },
  });
}

export const tagsService = {
  archive,
  assign,
  create,
  decorateRecordsForTarget,
  filterRecordsByTags,
  list,
  listAssignments,
  remove,
  replaceAssignments,
  restore,
  update,
};
