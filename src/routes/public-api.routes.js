import { Router } from "express";
import { requireApiKey } from "../middleware/require-api-key.js";
import { publicApiService } from "../services/public-api.service.js";
import { asyncRoute } from "../utils/http.js";

const publicApiRoutes = Router();

publicApiRoutes.get("/api/v1/clients", requireApiKey("clients:read"), asyncRoute(async (request, response) => {
  response.status(200).json(publicApiList(await publicApiService.listClients(request.apiSession, request.query), request.apiSession));
}));

publicApiRoutes.get("/api/v1/clients/:clientId", requireApiKey("clients:read"), asyncRoute(async (request, response) => {
  response.status(200).json(publicApiData(await publicApiService.readClient(request.apiSession, request.params.clientId), request.apiSession));
}));

publicApiRoutes.get("/api/v1/projects", requireApiKey("projects:read"), asyncRoute(async (request, response) => {
  response.status(200).json(publicApiList(await publicApiService.listProjects(request.apiSession, request.query), request.apiSession));
}));

publicApiRoutes.get("/api/v1/projects/:projectId", requireApiKey("projects:read"), asyncRoute(async (request, response) => {
  response.status(200).json(publicApiData(await publicApiService.readProject(request.apiSession, request.params.projectId), request.apiSession));
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
