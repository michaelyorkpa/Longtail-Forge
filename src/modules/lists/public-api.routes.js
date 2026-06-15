import { Router } from "express";
import { asyncRoute } from "../../core/http.js";
import { requireApiKey } from "../../middleware/require-api-key.js";
import { listsPublicApiService } from "./public-api.service.js";

const listsPublicApiRoutes = Router();

listsPublicApiRoutes.get("/api/v1/lists", requireApiKey("lists:read"), asyncRoute(async (request, response) => {
  response.status(200).json(publicApiList(await listsPublicApiService.listLists(request.apiSession, request.query), request.apiSession));
}));

listsPublicApiRoutes.get("/api/v1/lists/:listId", requireApiKey("lists:read"), asyncRoute(async (request, response) => {
  response.status(200).json(publicApiData(await listsPublicApiService.readList(request.apiSession, request.params.listId, request.query), request.apiSession));
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

export { listsPublicApiRoutes };
