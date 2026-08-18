import { Router } from "express";
import { requireApiKey } from "../../middleware/require-api-key.js";
import { asyncRoute, readJsonBody } from "../../core/http.js";
import { timeTrackingPublicApiService } from "./public-api.service.js";

const timeTrackingPublicApiRoutes = Router();

timeTrackingPublicApiRoutes.get("/api/v1/time-entries", requireApiKey("time_entries:read"), asyncRoute(async (request, response) => {
  const context = readPublicApiContext(request);
  response.status(200).json(publicApiList(await timeTrackingPublicApiService.listTimeEntries(context, request.query), context));
}));

timeTrackingPublicApiRoutes.post("/api/v1/time-entries", requireApiKey("time_entries:write"), asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const context = readPublicApiContext(request);
  response.status(201).json(publicApiData(await timeTrackingPublicApiService.createTimeEntry(context, payload), context));
}));

/** @param {Express.Request} request @returns {import("../../types/time-tracking-contracts.d.ts").PublicApiContext} */
function readPublicApiContext(request) {
  return /** @type {import("../../types/time-tracking-contracts.d.ts").PublicApiContext} */ (request.apiSession);
}

/** @param {unknown} data @param {import("../../types/time-tracking-contracts.d.ts").PublicApiContext} context */
function publicApiData(data, context) {
  return {
    apiVersion: "v1",
    workspace_id: context.workspace_id,
    data,
  };
}

/** @param {import("../../types/time-tracking-contracts.d.ts").PublicApiPage<unknown>} result @param {import("../../types/time-tracking-contracts.d.ts").PublicApiContext} context */
function publicApiList(result, context) {
  return {
    apiVersion: "v1",
    workspace_id: context.workspace_id,
    data: result.data,
    pagination: result.pagination,
  };
}

export { timeTrackingPublicApiRoutes };
