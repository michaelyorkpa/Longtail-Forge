import { Router } from "express";
import { requireApiKey } from "../../middleware/require-api-key.js";
import { asyncRoute, readJsonBody } from "../../core/http.js";
import { timeTrackingPublicApiService } from "./public-api.service.js";

const timeTrackingPublicApiRoutes = Router();

timeTrackingPublicApiRoutes.get("/api/v1/time-entries", requireApiKey("time_entries:read"), asyncRoute(async (request, response) => {
  response.status(200).json(publicApiList(await timeTrackingPublicApiService.listTimeEntries(request.apiSession, request.query), request.apiSession));
}));

timeTrackingPublicApiRoutes.post("/api/v1/time-entries", requireApiKey("time_entries:write"), asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  response.status(201).json(publicApiData(await timeTrackingPublicApiService.createTimeEntry(request.apiSession, payload), request.apiSession));
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

export { timeTrackingPublicApiRoutes };
