// @ts-check
import { Router } from "express";
import { asyncRoute } from "../../core/http.js";
import { requireApiKey } from "../../middleware/require-api-key.js";
import { AppError } from "../../core/errors.js";
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

/** @param {ListsPublicApiReadResult} data @param {ApiSession} context */
function publicApiData(data, context) {
  return {
    apiVersion: "v1",
    workspace_id: context.workspace_id,
    data,
  };
}

/** @param {ListsPublicApiListResult} result @param {ApiSession} context */
function publicApiList(result, context) {
  return {
    apiVersion: "v1",
    workspace_id: context.workspace_id,
    data: result.data,
    pagination: result.pagination,
  };
}

export { listsPublicApiRoutes };

/** @param {ApiSession | undefined} session @returns {ApiSession} */
function requireApiSession(session) {
  if (!session) throw new AppError("API authentication is required.", 401);
  return session;
}

/** @typedef {import("../../types/http-contracts.js").ApiSession} ApiSession */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsPublicApiListResult} ListsPublicApiListResult */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsPublicApiReadResult} ListsPublicApiReadResult */
