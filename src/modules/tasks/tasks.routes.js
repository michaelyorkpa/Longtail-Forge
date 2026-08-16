import { Router } from "express";
import { tasksService } from "./tasks.service.js";
import { taskTimersService } from "./task-timers.service.js";
import { asyncRoute, readJsonBody } from "../../core/http.js";
import { AppError } from "../../core/errors.js";

/** @typedef {import("../../types/task-server-contracts.d.ts").TaskServerSession} TaskServerSession */
/** @typedef {import("../../types/task-workflow-contracts.d.ts").TaskTimerLinkPayload} TaskTimerLinkPayload */
/** @typedef {import("../../types/task-workflow-contracts.d.ts").TaskTimerSavePayload} TaskTimerSavePayload */

const tasksRoutes = Router();

tasksRoutes.get("/tasks", asyncRoute(async (request, response) => {
  const result = await tasksService.list(readTaskSession(request), request.query);
  response.status(200).json(result);
}));

tasksRoutes.post("/tasks", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await tasksService.create(payload, readTaskSession(request));
  response.status(201).json(result);
}));

tasksRoutes.post("/tasks/bulk", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await tasksService.bulkUpdate(readObjectPayload(payload), readTaskSession(request));
  response.status(200).json(result);
}));

tasksRoutes.get("/tasks/calendar", asyncRoute(async (request, response) => {
  const result = await tasksService.calendarWindow(readTaskSession(request), request.query);
  response.status(200).json(result);
}));

tasksRoutes.post("/tasks/recurrence-instances/materialize", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await tasksService.materializeRecurrenceInstance(payload, readTaskSession(request));
  response.status(200).json(result);
}));

tasksRoutes.get("/tasks/timers", asyncRoute(async (request, response) => {
  const result = await taskTimersService.list(readTaskSession(request));
  response.status(200).json(result);
}));

tasksRoutes.get("/tasks/workbench-items", asyncRoute(async (request, response) => {
  const result = await tasksService.listWorkbenchItems(readTaskSession(request));
  response.status(200).json(result);
}));

tasksRoutes.get("/tasks/options", asyncRoute(async (request, response) => {
  const result = await tasksService.listOptions(readTaskSession(request));
  response.status(200).json(result);
}));

tasksRoutes.get("/tasks/dashboard-summary", asyncRoute(async (request, response) => {
  const result = await tasksService.summary(readTaskSession(request));
  response.status(200).json(result);
}));

tasksRoutes.get("/tasks/:taskId/recurrence-continuity", asyncRoute(async (request, response) => {
  const result = await tasksService.readRecurrenceContinuity(request.params.taskId, readTaskSession(request));
  response.status(200).json(result);
}));

tasksRoutes.get("/tasks/:taskId", asyncRoute(async (request, response) => {
  const result = await tasksService.read(request.params.taskId, readTaskSession(request));
  response.status(200).json(result);
}));

tasksRoutes.get("/tasks/:taskId/checklist", asyncRoute(async (request, response) => {
  const result = await tasksService.listChecklistItems(request.params.taskId, readTaskSession(request));
  response.status(200).json(result);
}));

tasksRoutes.get("/tasks/:taskId/relationships", asyncRoute(async (request, response) => {
  const result = await tasksService.listRelationships(request.params.taskId, readTaskSession(request));
  response.status(200).json(result);
}));

tasksRoutes.post("/tasks/:taskId/children", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await tasksService.addChildTask(request.params.taskId, payload, readTaskSession(request));
  response.status(201).json(result);
}));

tasksRoutes.post("/tasks/:taskId/checklist", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await tasksService.addChecklistItem(request.params.taskId, payload, readTaskSession(request));
  response.status(201).json(result);
}));

tasksRoutes.post("/tasks/:taskId/checklist/reorder", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await tasksService.reorderChecklistItems(request.params.taskId, payload, readTaskSession(request));
  response.status(200).json(result);
}));

tasksRoutes.put("/tasks/:taskId", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await tasksService.update(request.params.taskId, payload, readTaskSession(request));
  response.status(200).json(result);
}));

tasksRoutes.post("/tasks/:taskId/complete", asyncRoute(async (request, response) => {
  const result = await tasksService.complete(request.params.taskId, readTaskSession(request));
  response.status(200).json(result);
}));

tasksRoutes.post("/tasks/:taskId/skip-to-current", asyncRoute(async (request, response) => {
  const result = await tasksService.skipToCurrent(request.params.taskId, readTaskSession(request));
  response.status(200).json(result);
}));

tasksRoutes.post("/tasks/:taskId/reopen", asyncRoute(async (request, response) => {
  const result = await tasksService.reopen(request.params.taskId, readTaskSession(request));
  response.status(200).json(result);
}));

tasksRoutes.post("/tasks/:taskId/archive", asyncRoute(async (request, response) => {
  const result = await tasksService.archive(request.params.taskId, readTaskSession(request));
  response.status(200).json(result);
}));

tasksRoutes.post("/tasks/:taskId/restore", asyncRoute(async (request, response) => {
  const result = await tasksService.restore(request.params.taskId, readTaskSession(request));
  response.status(200).json(result);
}));

tasksRoutes.put("/tasks/:taskId/children/:childTaskId", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await tasksService.updateChildTaskRelationship(
    request.params.taskId,
    request.params.childTaskId,
    payload,
    readTaskSession(request),
  );
  response.status(200).json(result);
}));

tasksRoutes.delete("/tasks/:taskId/children/:childTaskId", asyncRoute(async (request, response) => {
  const result = await tasksService.removeChildTaskRelationship(
    request.params.taskId,
    request.params.childTaskId,
    readTaskSession(request),
  );
  response.status(200).json(result);
}));

tasksRoutes.put("/tasks/:taskId/checklist/:itemId", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await tasksService.updateChecklistItem(request.params.taskId, request.params.itemId, payload, readTaskSession(request));
  response.status(200).json(result);
}));

tasksRoutes.post("/tasks/:taskId/checklist/:itemId/check", asyncRoute(async (request, response) => {
  const result = await tasksService.checkChecklistItem(request.params.taskId, request.params.itemId, readTaskSession(request));
  response.status(200).json(result);
}));

tasksRoutes.post("/tasks/:taskId/checklist/:itemId/uncheck", asyncRoute(async (request, response) => {
  const result = await tasksService.uncheckChecklistItem(request.params.taskId, request.params.itemId, readTaskSession(request));
  response.status(200).json(result);
}));

tasksRoutes.delete("/tasks/:taskId/checklist/:itemId", asyncRoute(async (request, response) => {
  const result = await tasksService.deleteChecklistItem(request.params.taskId, request.params.itemId, readTaskSession(request));
  response.status(200).json(result);
}));

tasksRoutes.put("/tasks/:taskId/timer", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await taskTimersService.save(request.params.taskId, /** @type {TaskTimerSavePayload} */ (payload), readTaskSession(request));
  response.status(200).json(result);
}));

tasksRoutes.post("/tasks/:taskId/timer/link", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await taskTimersService.linkManualTimer(request.params.taskId, /** @type {TaskTimerLinkPayload} */ (payload), readTaskSession(request));
  response.status(200).json(result);
}));

tasksRoutes.post("/tasks/:taskId/timer/finalize", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await taskTimersService.finalize(request.params.taskId, payload, readTaskSession(request));
  response.status(201).json(result);
}));

tasksRoutes.delete("/tasks/:taskId/timer", asyncRoute(async (request, response) => {
  const result = await taskTimersService.remove(request.params.taskId, readTaskSession(request));
  response.status(200).json(result);
}));

/** @param {Express.Request} request @returns {TaskServerSession} */
function readTaskSession(request) {
  if (!request.session?.workspace_id) {
    throw new AppError("Tasks route requires an active workspace session.", 401);
  }
  return /** @type {TaskServerSession} */ (request.session);
}

/** @param {unknown} payload @returns {Record<string, unknown>} */
function readObjectPayload(payload) {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? /** @type {Record<string, unknown>} */ (payload)
    : {};
}

export { tasksRoutes };
