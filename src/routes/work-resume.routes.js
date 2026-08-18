import { Router } from "express";
import { workCandidateService } from "../services/work-candidate.service.js";
import { workResumeStateService } from "../services/work-resume-state.service.js";
import { workspaceAsyncRoute as asyncRoute } from "../utils/http.js";

/** @typedef {Record<string, unknown>} WorkResumeRecord */
/** @typedef {{ dismissed_at: string | null, resume_state_id: string }} WorkResumeDismissResult */
/** @typedef {{ dismissed: true, dismissedAt: string, resumeStateId: string }} WorkResumeDismissResponse */
/**
 * @typedef {Object} WorkResumeListResponse
 * @property {{ message: string }} emptyState
 * @property {{ clientId: string, moduleId: string, projectId: string, recordType: string }} filters
 * @property {WorkResumeItemResponse[]} items
 * @property {unknown} mode
 */
/**
 * @typedef {Object} WorkResumeItemResponse
 * @property {string} blockedReason
 * @property {string} candidateId
 * @property {string} clientId
 * @property {string} contextLabel
 * @property {string} createdAt
 * @property {string} dismissedAt
 * @property {string} dueAt
 * @property {string} handoffNote
 * @property {string} lastActionLabel
 * @property {string} lastActionType
 * @property {string} lastWorkedAt
 * @property {unknown} metadata
 * @property {string} moduleId
 * @property {string} nextAction
 * @property {unknown} primaryAction
 * @property {string} priority
 * @property {string} projectId
 * @property {string} reason
 * @property {string} recordId
 * @property {string} recordType
 * @property {unknown} resumeRankHint
 * @property {string} resumeStateId
 * @property {string} sourceUrl
 * @property {string} status
 * @property {string} title
 * @property {string} updatedAt
 */

const workResumeRoutes = Router();

workResumeRoutes.get("/work-resume", asyncRoute(async (request, response) => {
  const result = await workCandidateService.listResumeCandidates(request.session, request.query);

  response.status(200).json(shapeWorkResumeResponse(result, request.query));
}));

workResumeRoutes.post("/work-resume/:resumeStateId/dismiss", asyncRoute(async (request, response) => {
  const result = await workResumeStateService.dismissResumeState(request.session, request.params.resumeStateId);

  response.status(200).json(shapeDismissResponse(result));
}));

/**
 * @param {WorkResumeDismissResult} result
 * @returns {WorkResumeDismissResponse}
 */
function shapeDismissResponse(result) {
  return {
    dismissed: true,
    dismissedAt: result.dismissed_at || "",
    resumeStateId: result.resume_state_id,
  };
}

/**
 * @param {unknown} result
 * @param {Record<string, unknown>} query
 * @returns {WorkResumeListResponse}
 */
function shapeWorkResumeResponse(result, query) {
  const resultRecord = readRecord(result);
  const items = Array.isArray(resultRecord.items) ? resultRecord.items.map(shapeWorkResumeItem) : [];

  return {
    emptyState: {
      message: "No resumable work found.",
    },
    filters: {
      clientId: firstString(query.clientId, query.client_id),
      moduleId: firstString(query.moduleId, query.module_id),
      projectId: firstString(query.projectId, query.project_id),
      recordType: firstString(query.recordType, query.record_type),
    },
    items,
    mode: resultRecord.mode || "left_off",
  };
}

/**
 * @param {unknown} item
 * @returns {WorkResumeItemResponse}
 */
function shapeWorkResumeItem(item) {
  const itemRecord = readRecord(item);

  return {
    blockedReason: firstString(itemRecord.blockedReason, itemRecord.blocked_reason),
    candidateId: firstString(itemRecord.candidateId, itemRecord.candidate_id),
    clientId: firstString(itemRecord.clientId, itemRecord.client_id),
    contextLabel: firstString(itemRecord.contextLabel, itemRecord.context_label_snapshot),
    createdAt: firstString(itemRecord.createdAt, itemRecord.created_at),
    dismissedAt: firstString(itemRecord.dismissedAt, itemRecord.dismissed_at),
    dueAt: firstString(itemRecord.dueAt, itemRecord.due_at_snapshot),
    handoffNote: firstString(itemRecord.handoffNote, itemRecord.handoff_note),
    lastActionLabel: firstString(itemRecord.lastActionLabel, itemRecord.last_action_label),
    lastActionType: firstString(itemRecord.lastActionType, itemRecord.last_action_type),
    lastWorkedAt: firstString(itemRecord.lastWorkedAt, itemRecord.last_worked_at),
    metadata: itemRecord.metadata || {},
    moduleId: firstString(itemRecord.moduleId, itemRecord.module_id),
    nextAction: firstString(itemRecord.nextAction, itemRecord.next_action),
    primaryAction: itemRecord.primaryAction || {},
    priority: firstString(itemRecord.priority, itemRecord.priority_snapshot),
    projectId: firstString(itemRecord.projectId, itemRecord.project_id),
    reason: firstString(itemRecord.reason),
    recordId: firstString(itemRecord.recordId, itemRecord.record_id),
    recordType: firstString(itemRecord.recordType, itemRecord.record_type),
    resumeRankHint: itemRecord.rankHint ?? itemRecord.resumeRankHint ?? itemRecord.resume_rank_hint ?? 0,
    resumeStateId: firstString(itemRecord.resumeStateId, itemRecord.resume_state_id),
    sourceUrl: firstString(itemRecord.sourceUrl, itemRecord.source_url),
    status: firstString(itemRecord.status, itemRecord.status_snapshot),
    title: firstString(itemRecord.title, itemRecord.title_snapshot),
    updatedAt: firstString(itemRecord.updatedAt, itemRecord.updated_at),
  };
}

/** @param {...unknown} values */
function firstString(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) {
      return text;
    }
  }

  return "";
}

/**
 * @param {unknown} value
 * @returns {WorkResumeRecord}
 */
function readRecord(value) {
  return isWorkResumeRecord(value) ? value : {};
}

/**
 * @param {unknown} value
 * @returns {value is WorkResumeRecord}
 */
function isWorkResumeRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export { workResumeRoutes };
