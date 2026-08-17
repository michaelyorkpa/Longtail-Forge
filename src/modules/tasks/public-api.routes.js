import { Router } from "express";
import { requireApiKey } from "../../middleware/require-api-key.js";
import { asyncRoute, readJsonBody } from "../../core/http.js";
import { AppError } from "../../core/errors.js";
import { tasksPublicApiService } from "./public-api.service.js";

/** @typedef {import("../../types/http-contracts.d.ts").ApiSession} ApiSession */

const tasksPublicApiRoutes = Router();

tasksPublicApiRoutes.get("/api/v1/tasks", requireApiKey("tasks:read"), asyncRoute(async (request, response) => {
  const session = readApiSession(request);
  response.status(200).json(publicApiList(await tasksPublicApiService.listTasks(session, request.query), session));
}));

tasksPublicApiRoutes.post("/api/v1/tasks", requireApiKey("tasks:write"), asyncRoute(async (request, response) => {
  const session = readApiSession(request);
  const payload = await readJsonBody(request);
  response.status(201).json(publicApiData(await tasksPublicApiService.createTask(session, payload), session));
}));

tasksPublicApiRoutes.get("/api/v1/tasks/:taskId", requireApiKey("tasks:read"), asyncRoute(async (request, response) => {
  const session = readApiSession(request);
  response.status(200).json(publicApiData(await tasksPublicApiService.readTask(session, request.params.taskId), session));
}));

tasksPublicApiRoutes.put("/api/v1/tasks/:taskId", requireApiKey("tasks:write"), asyncRoute(async (request, response) => {
  const session = readApiSession(request);
  const payload = await readJsonBody(request);
  response.status(200).json(publicApiData(await tasksPublicApiService.updateTask(session, request.params.taskId, payload), session));
}));

tasksPublicApiRoutes.post("/api/v1/tasks/:taskId/complete", requireApiKey("tasks:write"), asyncRoute(async (request, response) => {
  const session = readApiSession(request);
  response.status(200).json(publicApiData(await tasksPublicApiService.completeTask(session, request.params.taskId), session));
}));

tasksPublicApiRoutes.post("/api/v1/tasks/:taskId/reopen", requireApiKey("tasks:write"), asyncRoute(async (request, response) => {
  const session = readApiSession(request);
  response.status(200).json(publicApiData(await tasksPublicApiService.reopenTask(session, request.params.taskId), session));
}));

tasksPublicApiRoutes.post("/api/v1/tasks/:taskId/archive", requireApiKey("tasks:write"), asyncRoute(async (request, response) => {
  const session = readApiSession(request);
  response.status(200).json(publicApiData(await tasksPublicApiService.archiveTask(session, request.params.taskId), session));
}));

tasksPublicApiRoutes.post("/api/v1/tasks/:taskId/restore", requireApiKey("tasks:write"), asyncRoute(async (request, response) => {
  const session = readApiSession(request);
  response.status(200).json(publicApiData(await tasksPublicApiService.restoreTask(session, request.params.taskId), session));
}));

/** @param {Express.Request} request @returns {ApiSession} */
function readApiSession(request) {
  if (!request.apiSession) {
    throw new AppError("API key middleware did not provide a Tasks API session.", 401);
  }
  return request.apiSession;
}

/** @param {unknown} data @param {ApiSession} context */
function publicApiData(data, context) {
  return {
    apiVersion: "v1",
    workspace_id: context.workspace_id,
    data,
  };
}

/** @param {{ data: unknown[], pagination: Record<string, unknown> }} result @param {ApiSession} context */
function publicApiList(result, context) {
  return {
    apiVersion: "v1",
    workspace_id: context.workspace_id,
    data: result.data,
    pagination: result.pagination,
  };
}

export { tasksPublicApiRoutes };
