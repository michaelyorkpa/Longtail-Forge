import { Router } from "express";
import { notesService } from "./notes.service.js";
import { asyncRoute, readJsonBody } from "../../core/http.js";

const notesRoutes = Router();

notesRoutes.get("/notes", asyncRoute(async (request, response) => {
  const result = await notesService.list(request.session, request.query);
  response.status(200).json(result);
}));

notesRoutes.post("/notes", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await notesService.create(payload, request.session);
  response.status(201).json(result);
}));

notesRoutes.get("/notes/library", asyncRoute(async (request, response) => {
  const result = await notesService.listLibrary(request.session);
  response.status(200).json(result);
}));

notesRoutes.get("/notes/library/:libraryBucket", asyncRoute(async (request, response) => {
  const result = await notesService.listByLibraryBucket(
    request.session,
    request.params.libraryBucket,
    request.query,
  );
  response.status(200).json(result);
}));

notesRoutes.get("/notes/archive", asyncRoute(async (request, response) => {
  const result = await notesService.listArchived(request.session, request.query);
  response.status(200).json(result);
}));

notesRoutes.get("/notes/for-target", asyncRoute(async (request, response) => {
  const result = await notesService.listForTarget(request.session, request.query);
  response.status(200).json(result);
}));

notesRoutes.get("/notes/:noteId", asyncRoute(async (request, response) => {
  const result = await notesService.read(request.params.noteId, request.session);
  response.status(200).json(result);
}));

notesRoutes.put("/notes/:noteId", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await notesService.update(request.params.noteId, payload, request.session);
  response.status(200).json(result);
}));

notesRoutes.post("/notes/:noteId/library", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await notesService.changeLibrary(request.params.noteId, payload, request.session);
  response.status(200).json(result);
}));

notesRoutes.post("/notes/:noteId/archive", asyncRoute(async (request, response) => {
  const result = await notesService.archive(request.params.noteId, request.session);
  response.status(200).json(result);
}));

notesRoutes.post("/notes/:noteId/restore", asyncRoute(async (request, response) => {
  const result = await notesService.restore(request.params.noteId, request.session);
  response.status(200).json(result);
}));

notesRoutes.post("/notes/:noteId/delete", asyncRoute(async (request, response) => {
  const result = await notesService.softDelete(request.params.noteId, request.session);
  response.status(200).json(result);
}));

notesRoutes.get("/notes/:noteId/revisions", asyncRoute(async (request, response) => {
  const result = await notesService.listRevisions(request.params.noteId, request.session);
  response.status(200).json(result);
}));

notesRoutes.get("/notes/:noteId/revisions/:revisionId", asyncRoute(async (request, response) => {
  const result = await notesService.readRevision(
    request.params.noteId,
    request.params.revisionId,
    request.session,
  );
  response.status(200).json(result);
}));

notesRoutes.post("/notes/:noteId/revisions/:revisionId/restore", asyncRoute(async (request, response) => {
  const result = await notesService.restoreRevision(
    request.params.noteId,
    request.params.revisionId,
    request.session,
  );
  response.status(200).json(result);
}));

notesRoutes.get("/notes/:noteId/links", asyncRoute(async (request, response) => {
  const result = await notesService.listLinks(request.params.noteId, request.session);
  response.status(200).json(result);
}));

notesRoutes.post("/notes/:noteId/links", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await notesService.createLink(request.params.noteId, payload, request.session);
  response.status(201).json(result);
}));

notesRoutes.post("/notes/:noteId/links/:noteLinkId/remove", asyncRoute(async (request, response) => {
  const result = await notesService.removeLink(
    request.params.noteId,
    request.params.noteLinkId,
    request.session,
  );
  response.status(200).json(result);
}));

export { notesRoutes };
