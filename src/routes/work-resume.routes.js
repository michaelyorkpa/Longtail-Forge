import { Router } from "express";
import { workCandidateService } from "../services/work-candidate.service.js";
import { workResumeStateService } from "../services/work-resume-state.service.js";
import { asyncRoute } from "../utils/http.js";

const workResumeRoutes = Router();

workResumeRoutes.get("/work-resume", asyncRoute(async (request, response) => {
  const result = await workCandidateService.listResumeCandidates(request.session, request.query);

  response.status(200).json(shapeWorkResumeResponse(result, request.query));
}));

workResumeRoutes.post("/work-resume/:resumeStateId/dismiss", asyncRoute(async (request, response) => {
  const result = await workResumeStateService.dismissResumeState(request.session, request.params.resumeStateId);

  response.status(200).json({
    dismissed: true,
    dismissedAt: result.dismissed_at || "",
    resumeStateId: result.resume_state_id,
  });
}));

function shapeWorkResumeResponse(result = {}, query = {}) {
  const items = Array.isArray(result.items) ? result.items.map(shapeWorkResumeItem) : [];

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
    mode: result.mode || "left_off",
  };
}

function shapeWorkResumeItem(item = {}) {
  return {
    blockedReason: firstString(item.blockedReason, item.blocked_reason),
    candidateId: firstString(item.candidateId, item.candidate_id),
    clientId: firstString(item.clientId, item.client_id),
    contextLabel: firstString(item.contextLabel, item.context_label_snapshot),
    createdAt: firstString(item.createdAt, item.created_at),
    dismissedAt: firstString(item.dismissedAt, item.dismissed_at),
    dueAt: firstString(item.dueAt, item.due_at_snapshot),
    handoffNote: firstString(item.handoffNote, item.handoff_note),
    lastActionLabel: firstString(item.lastActionLabel, item.last_action_label),
    lastActionType: firstString(item.lastActionType, item.last_action_type),
    lastWorkedAt: firstString(item.lastWorkedAt, item.last_worked_at),
    metadata: item.metadata || {},
    moduleId: firstString(item.moduleId, item.module_id),
    nextAction: firstString(item.nextAction, item.next_action),
    primaryAction: item.primaryAction || {},
    priority: firstString(item.priority, item.priority_snapshot),
    projectId: firstString(item.projectId, item.project_id),
    reason: firstString(item.reason),
    recordId: firstString(item.recordId, item.record_id),
    recordType: firstString(item.recordType, item.record_type),
    resumeRankHint: item.rankHint ?? item.resumeRankHint ?? item.resume_rank_hint ?? 0,
    resumeStateId: firstString(item.resumeStateId, item.resume_state_id),
    sourceUrl: firstString(item.sourceUrl, item.source_url),
    status: firstString(item.status, item.status_snapshot),
    title: firstString(item.title, item.title_snapshot),
    updatedAt: firstString(item.updatedAt, item.updated_at),
  };
}

function firstString(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) {
      return text;
    }
  }

  return "";
}

export { workResumeRoutes };
