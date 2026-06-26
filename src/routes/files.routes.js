import { Router } from "express";
import { filesService } from "../services/files.service.js";
import { asyncRoute, readJsonBody } from "../utils/http.js";

const filesRoutes = Router();
const MAX_FILE_JSON_BODY_BYTES = 8 * 1024 * 1024;

filesRoutes.post("/files", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request, { maxBytes: MAX_FILE_JSON_BODY_BYTES });
  const result = await filesService.uploadAndAttach(request.session, payload);
  response.status(201).json(result);
}));

filesRoutes.post("/files/batch", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request, { maxBytes: MAX_FILE_JSON_BODY_BYTES });
  const result = await filesService.uploadBatchAndAttach(request.session, payload);
  response.status(result.failed > 0 ? 207 : 201).json(result);
}));

filesRoutes.get("/files/attachments", asyncRoute(async (request, response) => {
  const result = await filesService.listAttachments(request.session, request.query);
  response.status(200).json(result);
}));

filesRoutes.get("/files/attachments/counts", asyncRoute(async (request, response) => {
  const result = await filesService.countAttachmentsForTargets(request.session, request.query);
  response.status(200).json(result);
}));

filesRoutes.get("/files/storage/accounting", asyncRoute(async (request, response) => {
  const result = await filesService.readStorageAccounting(request.session, request.query);
  response.status(200).json(result);
}));

filesRoutes.get("/files/settings", asyncRoute(async (request, response) => {
  const result = await filesService.readWorkspaceFileSettings(request.session);
  response.status(200).json(result);
}));

filesRoutes.put("/files/settings", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await filesService.saveWorkspaceFileSettings(request.session, payload);
  response.status(200).json(result);
}));

filesRoutes.post("/files/attachments", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await filesService.attachExistingFile(request.session, payload);
  response.status(201).json(result);
}));

filesRoutes.post("/files/attachments/:fileAttachmentId/remove", asyncRoute(async (request, response) => {
  const result = await filesService.removeAttachment(request.session, request.params.fileAttachmentId);
  response.status(200).json(result);
}));

filesRoutes.patch("/files/attachments/:fileAttachmentId/context", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await filesService.updateAttachmentContext(request.session, request.params.fileAttachmentId, payload);
  response.status(200).json(result);
}));

filesRoutes.get("/files/attachable-targets", asyncRoute(async (request, response) => {
  const result = await filesService.listAttachableTargetOptions(request.session, request.query);
  response.status(200).json(result);
}));

filesRoutes.get("/files/:fileId", asyncRoute(async (request, response) => {
  const file = await filesService.readFileForSession(request.session, request.params.fileId);
  response.status(200).json({ file });
}));

filesRoutes.get("/files/:fileId/download", asyncRoute(async (request, response) => {
  const result = await filesService.downloadFile(request.session, request.params.fileId);

  for (const [header, value] of Object.entries(result.headers)) {
    response.setHeader(header, value);
  }

  result.stream.on("error", (error) => {
    response.destroy(error);
  });
  result.stream.pipe(response);
}));

filesRoutes.post("/files/:fileId/delete", asyncRoute(async (request, response) => {
  const result = await filesService.deleteFile(request.session, request.params.fileId);
  response.status(200).json(result);
}));

filesRoutes.post("/files/:fileId/restore", asyncRoute(async (request, response) => {
  const result = await filesService.restoreFile(request.session, request.params.fileId);
  response.status(200).json(result);
}));

filesRoutes.post("/files/:fileId/report", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await filesService.reportFile(request.session, request.params.fileId, payload);
  response.status(200).json(result);
}));

filesRoutes.post("/files/:fileId/quarantine", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await filesService.quarantineFile(request.session, request.params.fileId, payload);
  response.status(200).json(result);
}));

export { filesRoutes };
