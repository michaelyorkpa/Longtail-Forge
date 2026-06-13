import { Router } from "express";
import { workResumeStateService } from "../services/work-resume-state.service.js";
import { asyncRoute } from "../utils/http.js";

const workResumeRoutes = Router();

workResumeRoutes.get("/work-resume", asyncRoute(async (request, response) => {
  const result = await workResumeStateService.listResumeState(request.session, request.query);

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
    blockedReason: item.blocked_reason || "",
    clientId: item.client_id || "",
    contextLabel: item.context_label_snapshot || "",
    createdAt: item.created_at || "",
    dismissedAt: item.dismissed_at || "",
    dueAt: item.due_at_snapshot || "",
    handoffNote: item.handoff_note || "",
    lastActionLabel: item.last_action_label || "",
    lastActionType: item.last_action_type || "",
    lastWorkedAt: item.last_worked_at || "",
    metadata: item.metadata || {},
    moduleId: item.module_id || "",
    nextAction: item.next_action || "",
    priority: item.priority_snapshot || "",
    projectId: item.project_id || "",
    recordId: item.record_id || "",
    recordType: item.record_type || "",
    resumeRankHint: item.resume_rank_hint || 0,
    resumeStateId: item.resume_state_id || "",
    sourceUrl: item.source_url || "",
    status: item.status_snapshot || "",
    title: item.title_snapshot || "",
    updatedAt: item.updated_at || "",
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
