import { Router } from "express";
import { notesService } from "./notes.service.js";
import { catalogSecurityService } from "./catalog-security.service.js";
import { asyncRoute, readJsonBody } from "../../core/http.js";
import { AppError } from "../../core/errors.js";

/** @typedef {import("../../types/http-contracts.js").RequestSession} RequestSession */
/** @typedef {import("../../types/http-contracts.js").WorkspaceRequestSession} WorkspaceRequestSession */

const notesRoutes = Router();

notesRoutes.get("/notes", asyncRoute(async (request, response) => {
  const result = await notesService.list(requireWorkspaceSession(request.session), request.query);
  response.status(200).json(result);
}));

notesRoutes.post("/notes", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await notesService.create(payload, requireWorkspaceSession(request.session));
  response.status(201).json(result);
}));

notesRoutes.post("/notes/bulk", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await notesService.bulkUpdate(payload, requireWorkspaceSession(request.session));
  response.status(200).json(result);
}));

notesRoutes.get("/notes/library", asyncRoute(async (request, response) => {
  const result = await notesService.listLibrary(requireWorkspaceSession(request.session));
  response.status(200).json(result);
}));

notesRoutes.get("/notes/library/:libraryBucket", asyncRoute(async (request, response) => {
  const result = await notesService.listByLibraryBucket(
    requireWorkspaceSession(request.session),
    request.params.libraryBucket,
    request.query,
  );
  response.status(200).json(result);
}));

notesRoutes.get("/notes/archive", asyncRoute(async (request, response) => {
  const result = await notesService.listArchived(requireWorkspaceSession(request.session), request.query);
  response.status(200).json(result);
}));

notesRoutes.get("/notes/for-target", asyncRoute(async (request, response) => {
  const result = await notesService.listForTarget(requireWorkspaceSession(request.session), request.query);
  response.status(200).json(result);
}));

notesRoutes.get("/notes/link-targets", asyncRoute(async (request, response) => {
  const result = await notesService.listLinkTargets(requireWorkspaceSession(request.session), request.query);
  response.status(200).json(result);
}));

notesRoutes.post("/notes/preview", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await notesService.previewMarkdown(payload, requireWorkspaceSession(request.session));
  response.status(200).json(result);
}));

notesRoutes.get("/notes/collections", asyncRoute(async (request, response) => {
  const result = await notesService.listCollections(requireWorkspaceSession(request.session), request.query);
  response.status(200).json(result);
}));

notesRoutes.get("/notes/settings/catalogs", asyncRoute(async (request, response) => {
  const result = await notesService.listCatalogSettings(requireWorkspaceSession(request.session));
  response.status(200).json(result);
}));

notesRoutes.post("/notes/settings/catalogs/bulk", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await notesService.bulkManageCatalogs(payload, requireWorkspaceSession(request.session));
  response.status(200).json(result);
}));

notesRoutes.get("/notes/secure/health", asyncRoute(async (request, response) => {
  const result = await notesService.secureHealth(requireWorkspaceSession(request.session));
  response.status(200).json(result);
}));

notesRoutes.post("/notes/collections", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await notesService.createCollection(payload, requireWorkspaceSession(request.session));
  response.status(201).json(result);
}));

notesRoutes.post("/notes/collections/import-path", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await notesService.ensureCollectionsForImportPath(requireWorkspaceSession(request.session), payload);
  response.status(200).json(result);
}));

notesRoutes.put("/notes/collections/:collectionId", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await notesService.updateCollection(request.params.collectionId, payload, requireWorkspaceSession(request.session));
  response.status(200).json(result);
}));

notesRoutes.post("/notes/collections/:collectionId/move", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await notesService.moveCollection(request.params.collectionId, payload, requireWorkspaceSession(request.session));
  response.status(200).json(result);
}));

notesRoutes.get("/notes/collections/:collectionId/security/preflight", asyncRoute(async (request, response) => {
  const result = await catalogSecurityService.preflight(request.params.collectionId, request.query, requireWorkspaceSession(request.session));
  response.status(200).json(result);
}));

notesRoutes.post("/notes/collections/:collectionId/security/enable", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await catalogSecurityService.enable(request.params.collectionId, payload, requireWorkspaceSession(request.session));
  response.status(result.execution === "job" ? 202 : 200).json(result);
}));

notesRoutes.post("/notes/collections/:collectionId/security/remove", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await catalogSecurityService.remove(request.params.collectionId, payload, requireWorkspaceSession(request.session));
  response.status(result.execution === "job" ? 202 : 200).json(result);
}));

notesRoutes.post("/notes/collections/:collectionId/security/retry", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await catalogSecurityService.retry(request.params.collectionId, payload, requireWorkspaceSession(request.session));
  response.status(result.execution === "job" ? 202 : 200).json(result);
}));

notesRoutes.post("/notes/collections/:collectionId/archive", asyncRoute(async (request, response) => {
  const result = await notesService.archiveCollection(request.params.collectionId, requireWorkspaceSession(request.session));
  response.status(200).json(result);
}));

notesRoutes.post("/notes/collections/:collectionId/restore", asyncRoute(async (request, response) => {
  const result = await notesService.restoreCollection(request.params.collectionId, requireWorkspaceSession(request.session));
  response.status(200).json(result);
}));

notesRoutes.post("/notes/collections/:collectionId/delete-empty", asyncRoute(async (request, response) => {
  const result = await notesService.deleteEmptyCollection(request.params.collectionId, requireWorkspaceSession(request.session));
  response.status(200).json(result);
}));

notesRoutes.get("/notes/:noteId", asyncRoute(async (request, response) => {
  const result = await notesService.read(request.params.noteId, requireWorkspaceSession(request.session));
  response.status(200).json(result);
}));

notesRoutes.put("/notes/:noteId", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await notesService.update(request.params.noteId, payload, requireWorkspaceSession(request.session));
  response.status(200).json(result);
}));

notesRoutes.post("/notes/:noteId/library", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await notesService.changeLibrary(request.params.noteId, payload, requireWorkspaceSession(request.session));
  response.status(200).json(result);
}));

notesRoutes.post("/notes/:noteId/collection", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await notesService.assignNoteCollection(request.params.noteId, payload, requireWorkspaceSession(request.session));
  response.status(200).json(result);
}));

notesRoutes.post("/notes/:noteId/archive", asyncRoute(async (request, response) => {
  const result = await notesService.archive(request.params.noteId, requireWorkspaceSession(request.session));
  response.status(200).json(result);
}));

notesRoutes.post("/notes/:noteId/restore", asyncRoute(async (request, response) => {
  const result = await notesService.restore(request.params.noteId, requireWorkspaceSession(request.session));
  response.status(200).json(result);
}));

notesRoutes.post("/notes/:noteId/delete", asyncRoute(async (request, response) => {
  const result = await notesService.softDelete(request.params.noteId, requireWorkspaceSession(request.session));
  response.status(200).json(result);
}));

notesRoutes.get("/notes/:noteId/revisions", asyncRoute(async (request, response) => {
  const result = await notesService.listRevisions(request.params.noteId, requireWorkspaceSession(request.session));
  response.status(200).json(result);
}));

notesRoutes.get("/notes/:noteId/revisions/:revisionId", asyncRoute(async (request, response) => {
  const result = await notesService.readRevision(
    request.params.noteId,
    request.params.revisionId,
    requireWorkspaceSession(request.session),
  );
  response.status(200).json(result);
}));

notesRoutes.post("/notes/:noteId/revisions/:revisionId/restore", asyncRoute(async (request, response) => {
  const result = await notesService.restoreRevision(
    request.params.noteId,
    request.params.revisionId,
    requireWorkspaceSession(request.session),
  );
  response.status(200).json(result);
}));

notesRoutes.get("/notes/:noteId/links", asyncRoute(async (request, response) => {
  const result = await notesService.listLinks(request.params.noteId, requireWorkspaceSession(request.session));
  response.status(200).json(result);
}));

notesRoutes.post("/notes/:noteId/links", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await notesService.createLink(request.params.noteId, payload, requireWorkspaceSession(request.session));
  response.status(201).json(result);
}));

notesRoutes.post("/notes/:noteId/links/:noteLinkId/remove", asyncRoute(async (request, response) => {
  const result = await notesService.removeLink(
    request.params.noteId,
    request.params.noteLinkId,
    requireWorkspaceSession(request.session),
  );
  response.status(200).json(result);
}));

export { notesRoutes };

/** @param {RequestSession | null | undefined} session @returns {WorkspaceRequestSession} */
function requireWorkspaceSession(session) {
  if (!hasWorkspaceSession(session)) throw new AppError("Authentication is required.", 401);
  return session;
}

/** @param {RequestSession | null | undefined} session @returns {session is WorkspaceRequestSession} */
function hasWorkspaceSession(session) {
  return Boolean(session?.workspace_id);
}
