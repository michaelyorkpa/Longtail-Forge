import { Router } from "express";
import { asyncRoute } from "../../core/http.js";
import { requireApiKey } from "../../middleware/require-api-key.js";
import { AppError } from "../../core/errors.js";
import { publicApiData, publicApiList } from "../../core/public-api-responses.js";
import { listsPublicApiService } from "./public-api.service.js";

const listsPublicApiRoutes = Router();

listsPublicApiRoutes.get("/api/v1/lists", requireApiKey("lists:read"), asyncRoute(async (request, response) => {
  const session = requireApiSession(request.apiSession);
  response.status(200).json(publicApiList(await listsPublicApiService.listLists(session, request.query), session));
}));

listsPublicApiRoutes.get("/api/v1/lists/:listId", requireApiKey("lists:read"), asyncRoute(async (request, response) => {
  const session = requireApiSession(request.apiSession);
  response.status(200).json(publicApiData(await listsPublicApiService.readList(session, request.params.listId, request.query), session));
}));

export { listsPublicApiRoutes };

/** @param {ApiSession | undefined} session @returns {ApiSession} */
function requireApiSession(session) {
  if (!session) throw new AppError("API authentication is required.", 401);
  return session;
}

/** @typedef {import("../../types/http-contracts.js").ApiSession} ApiSession */
