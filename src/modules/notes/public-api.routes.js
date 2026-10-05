import { Router } from "express";
import { asyncRoute } from "../../core/http.js";
import { requireApiKey } from "../../middleware/require-api-key.js";
import { AppError } from "../../core/errors.js";
import { publicApiData, publicApiList } from "../../core/public-api-responses.js";
import { notesPublicApiService } from "./public-api.service.js";

const notesPublicApiRoutes = Router();

notesPublicApiRoutes.get("/api/v1/notes", requireApiKey("notes:read"), asyncRoute(async (request, response) => {
  const session = requireApiSession(request.apiSession);
  response.status(200).json(publicApiList(await notesPublicApiService.listNotes(session, request.query), session));
}));

notesPublicApiRoutes.get("/api/v1/notes/:noteId", requireApiKey("notes:read"), asyncRoute(async (request, response) => {
  const session = requireApiSession(request.apiSession);
  response.status(200).json(publicApiData(await notesPublicApiService.readNote(session, request.params.noteId), session));
}));

export { notesPublicApiRoutes };

/** @param {ApiSession | undefined} session @returns {ApiSession} */
function requireApiSession(session) {
  if (!session) throw new AppError("API authentication is required.", 401);
  return session;
}
/** @typedef {import("../../types/http-contracts.js").ApiSession} ApiSession */
