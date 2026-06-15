import { auditService } from "./audit.service.js";
import { permissionsService } from "./permissions.service.js";
import { modulesService } from "../core/modules/modules.service.js";
import { querySql, sqlText } from "../db/index.js";
import { tagsRepository } from "../repositories/tags.repo.js";
import { AppError } from "../utils/app-error.js";
import { readTagPropagationResolver } from "./tag-propagation-registry.js";
import { searchIndexSyncService } from "./search-index-sync.service.js";

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TAGS_MODULE_ID = "tags";
const propagationFailures = [];

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
  const assignments = await tagsRepository.listAssignmentsForTarget(session.workspace_id, target.targetType, target.targetId);
  const shaped = shapeAssignmentReadModel(assignments);

  return {
    assignments: shaped.directAssignments,
    directAssignments: shaped.directAssignments,
    propagatedAssignments: shaped.propagatedAssignments,
    effectiveAssignments: shaped.effectiveAssignments,
    directTags: shaped.directTags,
    propagatedTags: shaped.propagatedTags,
    effectiveTags: shaped.effectiveTags,
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

  const assignments = await listDirectTagsForTarget(session, target.targetType, target.targetId);
  await recordAssignmentAudit(session, "tag.assigned", "create", target, tag, null, tag);
  await emitTagAssignmentEvent(session, "tag.assignment.manual_added", target, tag, {
    assignment_source: "manual",
  });
  await refreshPropagatedAssignmentsForTarget(session, {
    reason: "tag.assignment.manual_added",
    targetId: target.targetId,
    targetType: target.targetType,
  });

  return { assignments, target: target.publicTarget };
}

async function remove(session, payload = {}) {
  await assertTaggingWriteEnabled(session);
  const target = await readTargetForSession(session, payload.targetType || payload.target_type, payload.targetId || payload.target_id, "remove");
  const tag = await readExistingTag(session.workspace_id, payload.tagId || payload.tag_id);
  const existing = await listDirectTagsForTarget(session, target.targetType, target.targetId);

  if (!existing.some((assignment) => assignment.tag_id === tag.tag_id)) {
    return {
      assignments: existing,
      target: target.publicTarget,
    };
  }

  await tagsRepository.removeAssignment(session.workspace_id, target.targetType, target.targetId, tag.tag_id, { source: "manual" });
  const assignments = await listDirectTagsForTarget(session, target.targetType, target.targetId);
  await recordAssignmentAudit(session, "tag.removed", "delete", target, tag, tag, null);
  await emitTagAssignmentEvent(session, "tag.assignment.manual_removed", target, tag, {
    assignment_source: "manual",
  });
  await refreshPropagatedAssignmentsForTarget(session, {
    reason: "tag.assignment.manual_removed",
    targetId: target.targetId,
    targetType: target.targetType,
  });

  return { assignments, target: target.publicTarget };
}

async function replaceAssignments(session, payload = {}) {
  return replaceManualAssignments(session, payload);
}

async function bulkAssign(session, payload = {}) {
  await assertTaggingWriteEnabled(session);
  const targetType = String(payload.targetType || payload.target_type || "").trim();
  const targetIds = normalizeBulkTargetIds(payload.targetIds || payload.target_ids || payload.ids || []);
  const action = normalizeBulkTagAction(payload.action);
  const tagIds = normalizeTagIds(payload.tagIds || payload.tag_ids || []);
  const results = [];
  const errors = [];

  if (!targetType) {
    throw new AppError("Bulk tag target type is required.", 400);
  }
  if (targetIds.length === 0) {
    throw new AppError("Bulk tag target IDs are required.", 400);
  }
  if (tagIds.length === 0) {
    throw new AppError("Bulk tag changes need at least one tag.", 400);
  }
  await readAssignableTags(session.workspace_id, tagIds);

  for (const targetId of targetIds) {
    try {
      const result = await applyBulkTagAction(session, {
        action,
        tagIds,
        targetId,
        targetType,
      });
      results.push(result);
    } catch (error) {
      errors.push({
        message: error.message || "Tags could not be updated.",
        status: error.status || error.statusCode || 500,
        target_id: targetId,
        target_type: targetType,
      });
    }
  }

  await auditService.record({
    session,
    action: "tag.bulk_assignments_updated",
    changeType: "update",
    recordType: "tag_assignment",
    recordId: `${targetType}:bulk`,
    recordLabel: `${results.length} ${targetType} tag updates`,
    recordUrl: "",
    previousValue: null,
    newValue: {
      action,
      changed_count: results.length,
      skipped_count: errors.length,
      target_type: targetType,
    },
    metadata: {
      action,
      changed_count: results.length,
      skipped_count: errors.length,
      tag_ids: tagIds,
      target_type: targetType,
    },
  });

  return {
    action,
    changed: results,
    changed_count: results.length,
    errors,
    skipped_count: errors.length,
    target_type: targetType,
  };
}

async function applyBulkTagAction(session, payload = {}) {
  const target = await readTargetForSession(session, payload.targetType, payload.targetId, "replace");
  const currentDirectAssignments = await listDirectTagsForTarget(session, target.targetType, target.targetId);
  const currentDirectIds = new Set(currentDirectAssignments.map((assignment) => assignment.tag_id));
  const tagIds = payload.tagIds || [];
  let nextTagIds = [];

  if (payload.action === "replace") {
    nextTagIds = tagIds;
  } else if (payload.action === "add") {
    nextTagIds = [...new Set([...currentDirectIds, ...tagIds])];
  } else if (payload.action === "remove") {
    nextTagIds = [...currentDirectIds].filter((tagId) => !tagIds.includes(tagId));
  }

  const result = await replaceManualAssignments(session, {
    tagIds: nextTagIds,
    targetId: target.targetId,
    targetType: target.targetType,
  });
  const effectiveAssignments = await listEffectiveTagsForTarget(session, target.targetType, target.targetId);
  const shaped = shapeAssignmentReadModel(effectiveAssignments);

  return {
    assignments: result.assignments,
    directTags: result.assignments.map((assignment) => assignment.tag),
    effectiveTags: shaped.effectiveTags,
    target: result.target,
    target_id: target.targetId,
    target_type: target.targetType,
  };
}

async function replaceManualAssignments(session, payload = {}) {
  await assertTaggingWriteEnabled(session);
  const target = await readTargetForSession(session, payload.targetType || payload.target_type, payload.targetId || payload.target_id, "replace");
  const tagIds = normalizeTagIds(payload.tagIds || payload.tag_ids);
  const nextTags = await readAssignableTags(session.workspace_id, tagIds);
  const previousAssignments = await listDirectTagsForTarget(session, target.targetType, target.targetId);
  const previousEffectiveAssignments = await tagsRepository.listAssignmentsForTarget(session.workspace_id, target.targetType, target.targetId);
  const previousEffectiveTagIds = new Set(previousEffectiveAssignments.map((assignment) => assignment.tag_id));
  const nextTagIds = new Set(nextTags.map((tag) => tag.tag_id));
  const addedTags = nextTags.filter((tag) => !previousEffectiveTagIds.has(tag.tag_id));
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
    await emitTagAssignmentEvent(session, "tag.assignment.manual_added", target, tag, {
      assignment_source: "manual",
    });
  }

  for (const assignment of removedAssignments) {
    await tagsRepository.removeAssignment(session.workspace_id, target.targetType, target.targetId, assignment.tag_id, { source: "manual" });
    await recordAssignmentAudit(session, "tag.removed", "delete", target, assignment.tag, assignment.tag, null);
    await emitTagAssignmentEvent(session, "tag.assignment.manual_removed", target, assignment.tag, {
      assignment_source: "manual",
    });
  }

  const assignments = await listDirectTagsForTarget(session, target.targetType, target.targetId);

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
  if (addedTags.length > 0 || removedAssignments.length > 0) {
    await refreshPropagatedAssignmentsForTarget(session, {
      reason: "tag.assignments_replaced",
      targetId: target.targetId,
      targetType: target.targetType,
    });
  }

  return { assignments, target: target.publicTarget };
}

async function addPropagatedAssignment(session, payload = {}) {
  await assertTaggingWriteEnabled(session);
  const target = await readTargetForSession(session, payload.targetType || payload.target_type, payload.targetId || payload.target_id, "assign");
  const tag = await readAssignableTag(session.workspace_id, payload.tagId || payload.tag_id);
  const sourceTargetType = String(payload.sourceTargetType || payload.source_target_type || "").trim();
  const sourceTargetId = String(payload.sourceTargetId || payload.source_target_id || "").trim();
  const propagationRuleId = String(payload.propagationRuleId || payload.propagation_rule_id || "").trim();

  if (!sourceTargetType || !sourceTargetId || !propagationRuleId) {
    throw new AppError("Propagated tag assignments require source target and propagation rule metadata.", 400);
  }

  const existing = await tagsRepository.listAssignmentsForTarget(session.workspace_id, target.targetType, target.targetId);
  const suppressed = await tagsRepository.hasSuppression(session.workspace_id, {
    propagation_rule_id: propagationRuleId,
    source_target_id: sourceTargetId,
    source_target_type: sourceTargetType,
    tag_id: tag.tag_id,
    target_id: target.targetId,
    target_type: target.targetType,
  });

  if (!suppressed && !existing.some((assignment) => assignment.tag_id === tag.tag_id)) {
    await tagsRepository.addAssignment(session.workspace_id, {
      created_by_user_id: session.user_id,
      propagation_rule_id: propagationRuleId,
      source: "propagated",
      source_assignment_id: payload.sourceAssignmentId || payload.source_assignment_id || "",
      source_target_id: sourceTargetId,
      source_target_type: sourceTargetType,
      tag_id: tag.tag_id,
      target_id: target.targetId,
      target_type: target.targetType,
    });
    await emitTagAssignmentEvent(session, "tag.assignment.propagated_added", target, tag, {
      assignment_source: "propagated",
      propagation_rule_id: propagationRuleId,
      source_target_id: sourceTargetId,
      source_target_type: sourceTargetType,
    });
  }

  return {
    assignments: await listEffectiveTagsForTarget(session, target.targetType, target.targetId),
    target: target.publicTarget,
  };
}

async function listDirectTagsForTarget(session, targetType, targetId) {
  if (!(await tagsModuleReadable(session))) {
    return [];
  }

  return tagsRepository.listAssignmentsForTarget(session.workspace_id, targetType, targetId, { source: "manual" });
}

async function listPropagatedTagsForTarget(session, targetType, targetId) {
  if (!(await tagsModuleReadable(session))) {
    return [];
  }

  return tagsRepository.listAssignmentsForTarget(session.workspace_id, targetType, targetId, { source: "propagated" });
}

async function listEffectiveTagsForTarget(session, targetType, targetId) {
  if (!(await tagsModuleReadable(session))) {
    return [];
  }

  return tagsRepository.listAssignmentsForTarget(session.workspace_id, targetType, targetId);
}

async function decorateRecordsWithEffectiveTags(session, targetType, records, options = {}) {
  return decorateRecordsForTarget(session, targetType, records, options);
}

async function suppressPropagatedAssignment(session, payload = {}) {
  await assertTaggingWriteEnabled(session);
  const assignmentId = String(payload.assignmentId || payload.assignment_id || "").trim();

  if (!assignmentId) {
    throw new AppError("Tag assignment ID is required.", 400);
  }

  const assignment = await tagsRepository.readAssignmentById(session.workspace_id, assignmentId);
  if (!assignment) {
    throw new AppError("Tag assignment was not found.", 404);
  }

  if (assignment.source !== "propagated") {
    throw new AppError("Only propagated tag assignments can be suppressed.", 400);
  }

  if (!assignment.source_target_type || !assignment.source_target_id) {
    throw new AppError("Propagated tag assignments require source target metadata before they can be suppressed.", 400);
  }

  const target = await readTargetForSession(session, assignment.target_type, assignment.target_id, "remove");

  await tagsRepository.addSuppression(session.workspace_id, {
    propagation_rule_id: assignment.propagation_rule_id || "",
    source_target_id: assignment.source_target_id,
    source_target_type: assignment.source_target_type,
    suppressed_by_user_id: session.user_id,
    tag_id: assignment.tag_id,
    target_id: assignment.target_id,
    target_type: assignment.target_type,
  });
  await tagsRepository.removeAssignment(
    session.workspace_id,
    assignment.target_type,
    assignment.target_id,
    assignment.tag_id,
    { source: "propagated" },
  );
  await recordAssignmentAudit(session, "tag.propagated_suppressed", "delete", target, assignment.tag, assignment.tag, null);
  await emitTagAssignmentEvent(session, "tag.assignment.propagated_removed", target, assignment.tag, {
    assignment_source: "propagated",
    propagation_rule_id: assignment.propagation_rule_id || "",
    source_target_id: assignment.source_target_id,
    source_target_type: assignment.source_target_type,
  });
  await emitTagAssignmentEvent(session, "tag.assignment.propagated_suppressed", target, assignment.tag, {
    assignment_source: "propagated",
    propagation_rule_id: assignment.propagation_rule_id || "",
    source_target_id: assignment.source_target_id,
    source_target_type: assignment.source_target_type,
  });
  await refreshPropagatedAssignmentsForTarget(session, {
    reason: "tag.assignment.propagated_suppressed",
    targetId: assignment.target_id,
    targetType: assignment.target_type,
  });

  return {
    assignments: await listEffectiveTagsForTarget(session, assignment.target_type, assignment.target_id),
    target: target.publicTarget,
  };
}

async function refreshPropagatedAssignmentsForTarget(session, payload = {}) {
  await assertTaggingWriteEnabled(session);
  const target = await readTargetForSession(session, payload.targetType || payload.target_type, payload.targetId || payload.target_id, "read");
  const rules = await modulesService.listActiveTagPropagationRules(session.workspace_id);
  const relatedPairs = await readRelatedPropagationPairs(session, target, rules);
  let repairedRecords = await removeStalePropagatedAssignmentsForTarget(session, target, rules, relatedPairs);
  let skippedRecords = 0;
  let failedRecords = 0;

  for (const { rule, pair } of relatedPairs) {
    try {
      const result = await refreshPropagationPair(session, rule, pair, {
        depth: Number(payload.propagationDepth || payload.propagation_depth || 0),
        dryRun: false,
        reason: payload.reason || payload.refreshReason || "refresh_requested",
      });
      repairedRecords += result.changed ? 1 : 0;
      skippedRecords += result.skipped ? 1 : 0;
    } catch (error) {
      console.error(`[tags] Tag propagation refresh failed for ${rule.id}:`, error);
      failedRecords += 1;
      propagationFailures.push({
        error: error?.message || String(error),
        event: "tag.effective_tags.refreshed",
        hook_id: "tag-propagation.refresh",
        module_id: TAGS_MODULE_ID,
        operation: "refresh_target",
        target_id: target.targetId,
        target_type: target.targetType,
        workspace_id: session.workspace_id,
        created_at: new Date().toISOString(),
      });
    }
  }

  const eventResult = await modulesService.emitInternalEvent("tag.effective_tags.refreshed", {
    session,
    moduleId: TAGS_MODULE_ID,
    recordType: target.targetType,
    recordId: target.targetId,
    source: "system",
    metadata: {
      failed_records: failedRecords,
      reason: payload.reason || payload.refreshReason || "refresh_requested",
      refreshed: repairedRecords > 0,
      repaired_records: repairedRecords,
      scanned_records: relatedPairs.length,
      skipped_records: skippedRecords,
      target_type: target.targetType,
    },
  });
  recordFailedTagEventHooks(eventResult, {
    operation: "refresh_target",
    target_id: target.targetId,
    target_type: target.targetType,
  });

  return {
    failed_records: failedRecords,
    hookResults: eventResult.results,
    refreshed: repairedRecords > 0,
    repaired_records: repairedRecords,
    scanned_records: relatedPairs.length,
    skipped_records: skippedRecords,
    target: target.publicTarget,
  };
}

async function refreshPropagatedAssignmentsForWorkspace(session) {
  await assertTaggingWriteEnabled(session);
  const repair = await repairTagPropagation(session, {
    dryRun: false,
  });

  return {
    ...repair,
    refreshed: repair.repaired_records > 0,
    workspace_id: session.workspace_id,
  };
}

async function repairTagPropagation(session, options = {}) {
  await assertTaggingWriteEnabled(session);
  const dryRun = options.dryRun !== false && options.dry_run !== false;
  const rules = await modulesService.listActiveTagPropagationRules(session.workspace_id);
  const counts = await readTagPropagationCounts(session.workspace_id);
  let scannedRecords = 0;
  let skippedRecords = 0;
  let failedRecords = propagationFailures.filter((failure) => failure.workspace_id === session.workspace_id).length;
  let repairedRecords = 0;

  for (const rule of rules) {
    const resolver = readTagPropagationResolver(rule.relationshipResolver);

    if (!resolver) {
      skippedRecords += 1;
      continue;
    }

    try {
      const pairs = await resolver({
        rule,
        workspaceId: session.workspace_id,
      });
      scannedRecords += pairs.length;
      for (const pair of pairs) {
        const result = await refreshPropagationPair(session, rule, pair, {
          dryRun,
          reason: "tag_propagation_repair",
        });
        repairedRecords += result.changed ? 1 : 0;
        skippedRecords += result.skipped ? 1 : 0;
      }
    } catch {
      failedRecords += 1;
    }
  }

  return {
    dryRun,
    workspace_id: session.workspace_id,
    rules_scanned: rules.length,
    scanned_records: scannedRecords,
    direct_assignments: counts.directAssignments,
    propagated_assignments: counts.propagatedAssignments,
    suppressed_propagated_assignments: counts.suppressedAssignments,
    skipped_records: skippedRecords,
    repaired_records: repairedRecords,
    failed_records: failedRecords,
    failures: listTagPropagationFailures(session.workspace_id),
  };
}

async function snapshotEffectiveTagsForTarget(session, payload = {}) {
  await assertTaggingWriteEnabled(session);
  const sourceTargetType = String(payload.sourceTargetType || payload.source_target_type || "").trim();
  const sourceTargetId = String(payload.sourceTargetId || payload.source_target_id || "").trim();
  const target = await readTargetForSession(session, payload.targetType || payload.target_type, payload.targetId || payload.target_id, "assign");

  if (!sourceTargetType || !sourceTargetId) {
    throw new AppError("Effective tag snapshots require a source target.", 400);
  }

  const sourceAssignments = await listEffectiveTagsForTarget(session, sourceTargetType, sourceTargetId);
  const targetAssignments = await tagsRepository.listAssignmentsForTarget(session.workspace_id, target.targetType, target.targetId);
  let existingAssignments = targetAssignments;

  if (payload.replaceSnapshot === true || payload.replace_snapshot === true) {
    for (const assignment of targetAssignments.filter((item) => (
      item.source === "system" &&
      String(item.propagation_rule_id || "").startsWith("time-entry.")
    ))) {
      await tagsRepository.removeAssignmentById(session.workspace_id, assignment.tag_assignment_id);
    }
    existingAssignments = await tagsRepository.listAssignmentsForTarget(session.workspace_id, target.targetType, target.targetId);
  }

  const existingTagIds = new Set(existingAssignments.map((assignment) => assignment.tag_id));
  let added = 0;

  for (const assignment of sourceAssignments.filter((item) => item.tag?.status === "active")) {
    if (existingTagIds.has(assignment.tag_id)) {
      continue;
    }

    await tagsRepository.addAssignment(session.workspace_id, {
      created_by_user_id: session.user_id,
      propagation_rule_id: payload.propagationRuleId || payload.propagation_rule_id || "time-entry-effective-tag-snapshot",
      source: "system",
      source_assignment_id: assignment.tag_assignment_id,
      source_target_id: sourceTargetId,
      source_target_type: sourceTargetType,
      tag_id: assignment.tag_id,
      target_id: target.targetId,
      target_type: target.targetType,
    });
    existingTagIds.add(assignment.tag_id);
    added += 1;
  }

  if (added > 0) {
    await syncSearchForTarget(session.workspace_id, target.targetType, target.targetId, "tag.snapshot_effective_tags");
  }

  return {
    added,
    assignments: await listEffectiveTagsForTarget(session, target.targetType, target.targetId),
    target: target.publicTarget,
  };
}

async function suppressAssignment(session, payload = {}) {
  return suppressPropagatedAssignment(session, payload);
}

function listTagPropagationFailures(workspaceId = "") {
  return propagationFailures
    .filter((failure) => !workspaceId || failure.workspace_id === workspaceId)
    .map((failure) => ({ ...failure }));
}

async function decorateRecordsForTarget(session, targetType, records, options = {}) {
  if (!Array.isArray(records) || records.length === 0 || !(await tagsModuleReadable(session))) {
    return Array.isArray(records) ? records : [];
  }

  const idField = options.idField || defaultTargetIdField(targetType);
  const recordIds = records.map((record) => String(record?.[idField] || record?.id || "").trim()).filter(Boolean);
  const assignments = await tagsRepository.listAssignmentsForTargets(session.workspace_id, targetType, recordIds);
  const assignmentsByTarget = groupAssignmentsByTarget(assignments);

  return records.map((record) => {
    const targetId = String(record?.[idField] || record?.id || "").trim();
    const shaped = shapeAssignmentReadModel(assignmentsByTarget.get(targetId) || []);

    return {
      ...record,
      tagAssignments: shaped.effectiveAssignments,
      directTags: shaped.directTags,
      propagatedTags: shaped.propagatedTags,
      effectiveTags: shaped.effectiveTags,
      tags: shaped.effectiveTags,
    };
  });
}

async function filterRecordsByTags(session, targetType, records, tagIds, options = {}) {
  const normalizedFilters = normalizeTagFilterIntent(tagIds);
  const normalizedTagIds = normalizedFilters.tagIds;
  const noTagsMode = normalizedFilters.noTagsMode;

  if (normalizedTagIds.length === 0 && !noTagsMode) {
    return records;
  }

  if (!(await tagsModuleReadable(session))) {
    return [];
  }

  const decorated = await decorateRecordsForTarget(session, targetType, records, options);
  const requiredIds = new Set(normalizedTagIds);

  return decorated.filter((record) => {
    const tagsForMode = noTagsMode === "direct" ? record.directTags || [] : record.tags || [];
    const recordTagIds = new Set(tagsForMode.map((tag) => tag.tag_id));
    if (noTagsMode) {
      return recordTagIds.size === 0;
    }
    return options.match === "all"
      ? normalizedTagIds.every((tagId) => recordTagIds.has(tagId))
      : normalizedTagIds.some((tagId) => recordTagIds.has(tagId));
  }).map((record) => ({
    ...record,
    tagFilterMatchedIds: [...requiredIds].filter((tagId) => (record.tags || []).some((tag) => tag.tag_id === tagId)),
  }));
}

function shapeAssignmentReadModel(assignments = []) {
  const activeAssignments = (Array.isArray(assignments) ? assignments : [])
    .filter((assignment) => assignment?.tag?.status === "active")
    .map((assignment) => ({
      ...assignment,
      origin_label: assignmentOriginLabel(assignment),
    }));
  const directAssignments = activeAssignments.filter((assignment) => assignment.source === "manual");
  const propagatedAssignments = activeAssignments.filter((assignment) => assignment.source === "propagated");
  const systemAssignments = activeAssignments.filter((assignment) => assignment.source === "system");

  return {
    directAssignments,
    propagatedAssignments,
    systemAssignments,
    effectiveAssignments: activeAssignments,
    directTags: directAssignments.map(tagForAssignment),
    propagatedTags: propagatedAssignments.map(tagForAssignment),
    systemTags: systemAssignments.map(tagForAssignment),
    effectiveTags: activeAssignments.map(tagForAssignment),
  };
}

function tagForAssignment(assignment) {
  return {
    ...assignment.tag,
    assignment_source: assignment.source || "manual",
    origin: assignment.source || "manual",
    origin_label: assignment.origin_label || assignmentOriginLabel(assignment),
    source: assignment.source || "manual",
    source_assignment_id: assignment.source_assignment_id || "",
    source_target_type: assignment.source_target_type || "",
    source_target_id: assignment.source_target_id || "",
    propagation_rule_id: assignment.propagation_rule_id || "",
    tag_assignment_id: assignment.tag_assignment_id || "",
  };
}

function assignmentOriginLabel(assignment = {}) {
  if (assignment.source === "propagated") {
    const sourceType = String(assignment.source_target_type || "").replace(/_/g, " ");
    return sourceType ? `Propagated from ${sourceType}` : "Propagated";
  }
  if (assignment.source === "system") {
    return "System";
  }
  return "Direct";
}

async function readTagPropagationCounts(workspaceId) {
  const rows = await querySql(`
SELECT
  SUM(CASE WHEN source = 'manual' THEN 1 ELSE 0 END) AS direct_assignments,
  SUM(CASE WHEN source = 'propagated' THEN 1 ELSE 0 END) AS propagated_assignments
FROM tag_assignments
WHERE workspace_id = ${sqlText(workspaceId)};
`);
  const suppressionRows = await querySql(`
SELECT COUNT(*) AS count
FROM tag_assignment_suppressions
WHERE workspace_id = ${sqlText(workspaceId)};
`);

  return {
    directAssignments: Number(rows[0]?.direct_assignments || 0),
    propagatedAssignments: Number(rows[0]?.propagated_assignments || 0),
    suppressedAssignments: Number(suppressionRows[0]?.count || 0),
  };
}

async function readRelatedPropagationPairs(session, target, rules) {
  const pairs = [];

  for (const rule of rules) {
    const resolver = readTagPropagationResolver(rule.relationshipResolver);
    if (!resolver) {
      continue;
    }

    if (rule.targetType === target.targetType) {
      const inboundPairs = await resolver({
        rule,
        targetId: target.targetId,
        workspaceId: session.workspace_id,
      });
      inboundPairs.forEach((pair) => pairs.push({ rule, pair }));
    }

    if (rule.sourceTargetType === target.targetType) {
      const outboundPairs = await resolver({
        rule,
        sourceTargetId: target.targetId,
        workspaceId: session.workspace_id,
      });
      outboundPairs.forEach((pair) => pairs.push({ rule, pair }));
    }
  }

  return uniquePropagationPairs(pairs);
}

async function refreshPropagationPair(session, rule, rawPair, options = {}) {
  const pair = normalizePropagationPair(rule, rawPair);

  if (!pair.sourceTargetId || !pair.targetId || pair.sourceTargetId === pair.targetId && rule.sourceTargetType === rule.targetType) {
    return { changed: false, skipped: true };
  }

  const [sourceAssignments, targetAssignments, existingAssignments] = await Promise.all([
    listEffectiveTagsForTarget(session, rule.sourceTargetType, pair.sourceTargetId),
    tagsRepository.listAssignmentsForTarget(session.workspace_id, rule.targetType, pair.targetId),
    tagsRepository.listAssignmentsForPropagationContext(session.workspace_id, {
      propagation_rule_id: rule.id,
      source_target_id: pair.sourceTargetId,
      source_target_type: rule.sourceTargetType,
      target_id: pair.targetId,
      target_type: rule.targetType,
    }),
  ]);
  const existingContextByTagId = new Map(existingAssignments.map((assignment) => [assignment.tag_id, assignment]));
  const targetAssignmentsByTagId = new Map(targetAssignments.map((assignment) => [assignment.tag_id, assignment]));
  const desiredTagIds = new Set();
  let changed = false;

  for (const assignment of sourceAssignments.filter((item) => item.tag?.status === "active")) {
    const targetAssignment = targetAssignmentsByTagId.get(assignment.tag_id);

    if (targetAssignment && !existingContextByTagId.has(assignment.tag_id)) {
      continue;
    }

    const suppressed = await tagsRepository.hasSuppression(session.workspace_id, {
      propagation_rule_id: rule.id,
      source_target_id: pair.sourceTargetId,
      source_target_type: rule.sourceTargetType,
      tag_id: assignment.tag_id,
      target_id: pair.targetId,
      target_type: rule.targetType,
    });

    if (suppressed) {
      continue;
    }

    desiredTagIds.add(assignment.tag_id);

    if (!existingContextByTagId.has(assignment.tag_id)) {
      changed = true;
      if (!options.dryRun) {
        await tagsRepository.addAssignment(session.workspace_id, {
          created_by_user_id: session.user_id,
          propagation_rule_id: rule.id,
          source: "propagated",
          source_assignment_id: assignment.tag_assignment_id,
          source_target_id: pair.sourceTargetId,
          source_target_type: rule.sourceTargetType,
          tag_id: assignment.tag_id,
          target_id: pair.targetId,
          target_type: rule.targetType,
        });
        await emitPropagationEventForTarget(session, "tag.assignment.propagated_added", rule, pair, assignment.tag);
      }
    }
  }

  for (const assignment of existingAssignments) {
    if (desiredTagIds.has(assignment.tag_id)) {
      continue;
    }

    changed = true;
    if (!options.dryRun) {
      await tagsRepository.removeAssignmentById(session.workspace_id, assignment.tag_assignment_id);
      await emitPropagationEventForTarget(session, "tag.assignment.propagated_removed", rule, pair, assignment.tag);
    }
  }

  if (changed && !options.dryRun) {
    await syncSearchForTarget(session.workspace_id, rule.targetType, pair.targetId, options.reason || "tag.propagation_refreshed");
    if (Number(options.depth || 0) < 4) {
      await refreshPropagatedAssignmentsForTarget(session, {
        propagationDepth: Number(options.depth || 0) + 1,
        reason: options.reason || "tag.propagation_cascade",
        targetId: pair.targetId,
        targetType: rule.targetType,
      });
    }
  }

  return { changed, skipped: false };
}

function normalizePropagationPair(rule, pair = {}) {
  return {
    sourceTargetId: String(pair.sourceTargetId || pair.source_target_id || "").trim(),
    sourceTargetType: String(pair.sourceTargetType || pair.source_target_type || rule.sourceTargetType || "").trim(),
    targetId: String(pair.targetId || pair.target_id || "").trim(),
    targetType: String(pair.targetType || pair.target_type || rule.targetType || "").trim(),
  };
}

function uniquePropagationPairs(pairs) {
  const byKey = new Map();

  for (const entry of pairs) {
    const pair = normalizePropagationPair(entry.rule, entry.pair);
    const key = `${entry.rule.id}:${pair.sourceTargetType}:${pair.sourceTargetId}:${pair.targetType}:${pair.targetId}`;
    if (!byKey.has(key)) {
      byKey.set(key, { rule: entry.rule, pair });
    }
  }

  return [...byKey.values()];
}

async function emitPropagationEventForTarget(session, eventName, rule, pair, tag) {
  await emitTagAssignmentEvent(session, eventName, {
    publicTarget: {
      label: `${rule.targetType}:${pair.targetId}`,
      url: "",
    },
    targetId: pair.targetId,
    targetType: rule.targetType,
  }, tag, {
    assignment_source: "propagated",
    propagation_rule_id: rule.id,
    source_target_id: pair.sourceTargetId,
    source_target_type: rule.sourceTargetType,
  });
}

async function syncSearchForTarget(workspaceId, targetType, targetId, reason) {
  const declaration = modulesService.listSearchableTypes().find((type) => type.recordType === targetType);

  if (!declaration) {
    return null;
  }

  return searchIndexSyncService.reindexRecord({
    moduleId: declaration.moduleId,
    reason,
    recordId: targetId,
    recordType: targetType,
    workspaceId,
  });
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

function normalizeTagFilterIntent(value) {
  const filters = normalizeOptionalTagIds(value);
  let noTagsMode = "";
  const tagIds = [];

  filters.forEach((filter) => {
    const normalized = String(filter || "").trim().toLowerCase();
    if (["__no_tags__", "__no_effective_tags__", "no_tags", "none"].includes(normalized)) {
      noTagsMode = "effective";
      return;
    }
    if (["__no_direct_tags__", "no_direct_tags"].includes(normalized)) {
      noTagsMode = "direct";
      return;
    }
    tagIds.push(filter);
  });

  return {
    noTagsMode,
    tagIds: [...new Set(tagIds)],
  };
}

function normalizeBulkTargetIds(value) {
  if (!Array.isArray(value)) {
    throw new AppError("Bulk tag target IDs must be an array.", 400);
  }

  return [...new Set(value.map((targetId) => String(targetId || "").trim()).filter(Boolean))];
}

function normalizeBulkTagAction(value) {
  const action = String(value || "").trim().toLowerCase();

  if (["add", "remove", "replace"].includes(action)) {
    return action;
  }

  throw new AppError("Bulk tag action must be add, remove, or replace.", 400);
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

async function emitTagAssignmentEvent(session, eventName, target, tag, metadata = {}) {
  const eventResult = await modulesService.emitInternalEvent(eventName, {
    session,
    moduleId: TAGS_MODULE_ID,
    recordType: "tag_assignment",
    recordId: `${target.targetType}:${target.targetId}:${tag.tag_id}`,
    source: metadata.assignment_source || "manual",
    metadata: {
      tag_id: tag.tag_id,
      target_id: target.targetId,
      target_type: target.targetType,
      ...metadata,
    },
  });
  recordFailedTagEventHooks(eventResult, {
    operation: eventName,
    tag_id: tag.tag_id,
    target_id: target.targetId,
    target_type: target.targetType,
  });
  return eventResult;
}

async function removeStalePropagatedAssignmentsForTarget(session, target, rules, relatedPairs) {
  const inboundRuleIds = new Set(rules
    .filter((rule) => rule.targetType === target.targetType)
    .map((rule) => rule.id));

  if (inboundRuleIds.size === 0) {
    return 0;
  }

  const validContexts = new Set(relatedPairs
    .filter(({ rule, pair }) => rule.targetType === target.targetType && pair.targetId === target.targetId)
    .map(({ rule, pair }) => propagationContextKey(rule.id, pair.sourceTargetType || rule.sourceTargetType, pair.sourceTargetId)));
  const propagatedAssignments = await tagsRepository.listAssignmentsForTarget(session.workspace_id, target.targetType, target.targetId, { source: "propagated" });
  let removedCount = 0;

  for (const assignment of propagatedAssignments) {
    if (!inboundRuleIds.has(assignment.propagation_rule_id)) {
      continue;
    }

    const contextKey = propagationContextKey(assignment.propagation_rule_id, assignment.source_target_type, assignment.source_target_id);
    if (validContexts.has(contextKey)) {
      continue;
    }

    await tagsRepository.removeAssignmentById(session.workspace_id, assignment.tag_assignment_id);
    removedCount += 1;
  }

  return removedCount;
}

function propagationContextKey(ruleId, sourceTargetType, sourceTargetId) {
  return [
    String(ruleId || ""),
    String(sourceTargetType || ""),
    String(sourceTargetId || ""),
  ].join(":");
}

function recordFailedTagEventHooks(eventResult, context = {}) {
  for (const failure of (eventResult?.results || []).filter((result) => result.status === "failed")) {
    propagationFailures.push({
      ...context,
      error: failure.error || "",
      event: failure.event || eventResult.event?.name || "",
      hook_id: failure.hookId || "",
      module_id: failure.moduleId || "",
      workspace_id: eventResult.event?.workspace_id || "",
      created_at: new Date().toISOString(),
    });
  }
}

export const tagsService = {
  addPropagatedAssignment,
  archive,
  assign,
  bulkAssign,
  create,
  decorateRecordsForTarget,
  decorateRecordsWithEffectiveTags,
  filterRecordsByTags,
  list,
  listAssignments,
  listDirectTagsForTarget,
  listEffectiveTagsForTarget,
  listPropagatedTagsForTarget,
  listTagPropagationFailures,
  remove,
  repairTagPropagation,
  replaceAssignments,
  replaceManualAssignments,
  normalizeTagFilterIntent,
  refreshPropagatedAssignmentsForTarget,
  refreshPropagatedAssignmentsForWorkspace,
  restore,
  snapshotEffectiveTagsForTarget,
  suppressAssignment,
  suppressPropagatedAssignment,
  update,
};
