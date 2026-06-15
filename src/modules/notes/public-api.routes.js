import { Router } from "express";
import { asyncRoute } from "../../core/http.js";
import { requireApiKey } from "../../middleware/require-api-key.js";
import { notesPublicApiService } from "./public-api.service.js";

const notesPublicApiRoutes = Router();

notesPublicApiRoutes.get("/api/v1/notes", requireApiKey("notes:read"), asyncRoute(async (request, response) => {
  response.status(200).json(publicApiList(await notesPublicApiService.listNotes(request.apiSession, request.query), request.apiSession));
}));

notesPublicApiRoutes.get("/api/v1/notes/:noteId", requireApiKey("notes:read"), asyncRoute(async (request, response) => {
  response.status(200).json(publicApiData(await notesPublicApiService.readNote(request.apiSession, request.params.noteId), request.apiSession));
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

export { notesPublicApiRoutes };
