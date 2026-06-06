import { Router } from "express";
import { tasksService } from "./tasks.service.js";
import { taskTimersService } from "./task-timers.service.js";
import { workbenchService } from "../../services/workbench.service.js";
import { asyncRoute, readJsonBody } from "../../core/http.js";

const tasksRoutes = Router();

tasksRoutes.get("/tasks", asyncRoute(async (request, response) => {
  const result = await tasksService.list(request.session, request.query);
  response.status(200).json(result);
}));

tasksRoutes.post("/tasks", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await tasksService.create(payload, request.session);
  response.status(201).json(result);
}));

tasksRoutes.post("/tasks/bulk", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await tasksService.bulkUpdate(payload, request.session);
  response.status(200).json(result);
}));

tasksRoutes.get("/tasks/calendar", asyncRoute(async (request, response) => {
  const result = await tasksService.calendarWindow(request.session, request.query);
  response.status(200).json(result);
}));

tasksRoutes.get("/tasks/timers", asyncRoute(async (request, response) => {
  const result = await taskTimersService.list(request.session);
  response.status(200).json(result);
}));

tasksRoutes.get("/tasks/workbench-items", asyncRoute(async (request, response) => {
  const result = await workbenchService.listTaskWorkItems(request.session);
  response.status(200).json(result);
}));

tasksRoutes.get("/tasks/:taskId", asyncRoute(async (request, response) => {
  const result = await tasksService.read(request.params.taskId, request.session);
  response.status(200).json(result);
}));

tasksRoutes.put("/tasks/:taskId", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await tasksService.update(request.params.taskId, payload, request.session);
  response.status(200).json(result);
}));

tasksRoutes.post("/tasks/:taskId/complete", asyncRoute(async (request, response) => {
  const result = await tasksService.complete(request.params.taskId, request.session);
  response.status(200).json(result);
}));

tasksRoutes.post("/tasks/:taskId/reopen", asyncRoute(async (request, response) => {
  const result = await tasksService.reopen(request.params.taskId, request.session);
  response.status(200).json(result);
}));

tasksRoutes.post("/tasks/:taskId/archive", asyncRoute(async (request, response) => {
  const result = await tasksService.archive(request.params.taskId, request.session);
  response.status(200).json(result);
}));

tasksRoutes.post("/tasks/:taskId/restore", asyncRoute(async (request, response) => {
  const result = await tasksService.restore(request.params.taskId, request.session);
  response.status(200).json(result);
}));

tasksRoutes.put("/tasks/:taskId/timer", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await taskTimersService.save(request.params.taskId, payload, request.session);
  response.status(200).json(result);
}));

tasksRoutes.post("/tasks/:taskId/timer/finalize", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await taskTimersService.finalize(request.params.taskId, payload, request.session);
  response.status(201).json(result);
}));

tasksRoutes.delete("/tasks/:taskId/timer", asyncRoute(async (request, response) => {
  const result = await taskTimersService.remove(request.params.taskId, request.session);
  response.status(200).json(result);
}));

export { tasksRoutes };
