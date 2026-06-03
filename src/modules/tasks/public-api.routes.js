import { Router } from "express";
import { requireApiKey } from "../../middleware/require-api-key.js";
import { asyncRoute, readJsonBody } from "../../core/http.js";
import { tasksPublicApiService } from "./public-api.service.js";

const tasksPublicApiRoutes = Router();

tasksPublicApiRoutes.get("/api/v1/tasks", requireApiKey("tasks:read"), asyncRoute(async (request, response) => {
  response.status(200).json(publicApiList(await tasksPublicApiService.listTasks(request.apiSession, request.query), request.apiSession));
}));

tasksPublicApiRoutes.post("/api/v1/tasks", requireApiKey("tasks:write"), asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  response.status(201).json(publicApiData(await tasksPublicApiService.createTask(request.apiSession, payload), request.apiSession));
}));

tasksPublicApiRoutes.get("/api/v1/tasks/:taskId", requireApiKey("tasks:read"), asyncRoute(async (request, response) => {
  response.status(200).json(publicApiData(await tasksPublicApiService.readTask(request.apiSession, request.params.taskId), request.apiSession));
}));

tasksPublicApiRoutes.put("/api/v1/tasks/:taskId", requireApiKey("tasks:write"), asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  response.status(200).json(publicApiData(await tasksPublicApiService.updateTask(request.apiSession, request.params.taskId, payload), request.apiSession));
}));

tasksPublicApiRoutes.post("/api/v1/tasks/:taskId/complete", requireApiKey("tasks:write"), asyncRoute(async (request, response) => {
  response.status(200).json(publicApiData(await tasksPublicApiService.completeTask(request.apiSession, request.params.taskId), request.apiSession));
}));

tasksPublicApiRoutes.post("/api/v1/tasks/:taskId/reopen", requireApiKey("tasks:write"), asyncRoute(async (request, response) => {
  response.status(200).json(publicApiData(await tasksPublicApiService.reopenTask(request.apiSession, request.params.taskId), request.apiSession));
}));

tasksPublicApiRoutes.post("/api/v1/tasks/:taskId/archive", requireApiKey("tasks:write"), asyncRoute(async (request, response) => {
  response.status(200).json(publicApiData(await tasksPublicApiService.archiveTask(request.apiSession, request.params.taskId), request.apiSession));
}));

tasksPublicApiRoutes.post("/api/v1/tasks/:taskId/restore", requireApiKey("tasks:write"), asyncRoute(async (request, response) => {
  response.status(200).json(publicApiData(await tasksPublicApiService.restoreTask(request.apiSession, request.params.taskId), request.apiSession));
}));

function publicApiData(data, context) {
  return {
    apiVersion: "v1",
    workspace_id: context.workspace_id,
    data,
  };
}

function publicApiList(result, context) {
  return {
    apiVersion: "v1",
    workspace_id: context.workspace_id,
    data: result.data,
    pagination: result.pagination,
  };
}

export { tasksPublicApiRoutes };
