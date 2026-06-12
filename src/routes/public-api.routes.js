import { Router } from "express";
import { requireApiKey } from "../middleware/require-api-key.js";
import { publicApiService } from "../services/public-api.service.js";
import { asyncRoute, readJsonBody } from "../utils/http.js";

const publicApiRoutes = Router();

publicApiRoutes.get("/api/v1/clients", requireApiKey("clients:read"), asyncRoute(async (request, response) => {
  response.status(200).json(publicApiList(await publicApiService.listClients(request.apiSession, request.query), request.apiSession));
}));

publicApiRoutes.post("/api/v1/clients", requireApiKey("clients:write"), asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  response.status(201).json(publicApiData(await publicApiService.createClient(request.apiSession, payload), request.apiSession));
}));

publicApiRoutes.get("/api/v1/clients/:clientId", requireApiKey("clients:read"), asyncRoute(async (request, response) => {
  response.status(200).json(publicApiData(await publicApiService.readClient(request.apiSession, request.params.clientId), request.apiSession));
}));

publicApiRoutes.put("/api/v1/clients/:clientId", requireApiKey("clients:write"), asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  response.status(200).json(publicApiData(await publicApiService.updateClient(request.apiSession, request.params.clientId, payload), request.apiSession));
}));

publicApiRoutes.delete("/api/v1/clients/:clientId", requireApiKey("clients:write"), asyncRoute(async (request, response) => {
  response.status(200).json(publicApiData(await publicApiService.archiveClient(request.apiSession, request.params.clientId), request.apiSession));
}));

publicApiRoutes.get("/api/v1/projects", requireApiKey("projects:read"), asyncRoute(async (request, response) => {
  response.status(200).json(publicApiList(await publicApiService.listProjects(request.apiSession, request.query), request.apiSession));
}));

publicApiRoutes.post("/api/v1/projects", requireApiKey("projects:write"), asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  response.status(201).json(publicApiData(await publicApiService.createProject(request.apiSession, payload), request.apiSession));
}));

publicApiRoutes.post("/api/v1/clients/:clientId/projects", requireApiKey("projects:write"), asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  response.status(201).json(publicApiData(await publicApiService.createProject(request.apiSession, payload, request.params.clientId), request.apiSession));
}));

publicApiRoutes.get("/api/v1/projects/:projectId", requireApiKey("projects:read"), asyncRoute(async (request, response) => {
  response.status(200).json(publicApiData(await publicApiService.readProject(request.apiSession, request.params.projectId), request.apiSession));
}));

publicApiRoutes.put("/api/v1/projects/:projectId", requireApiKey("projects:write"), asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  response.status(200).json(publicApiData(await publicApiService.updateProject(request.apiSession, request.params.projectId, payload), request.apiSession));
}));

publicApiRoutes.delete("/api/v1/projects/:projectId", requireApiKey("projects:write"), asyncRoute(async (request, response) => {
  response.status(200).json(publicApiData(await publicApiService.archiveProject(request.apiSession, request.params.projectId), request.apiSession));
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

export { publicApiRoutes };
