import Busboy from "busboy";
import { Router } from "express";
import { filesService } from "../services/files.service.js";
import { AppError } from "../utils/app-error.js";
import { asyncRoute, readJsonBody } from "../utils/http.js";

const filesRoutes = Router();
const MAX_FILE_JSON_BODY_BYTES = 8 * 1024 * 1024;
const MAX_MULTIPART_FIELD_BYTES = 64 * 1024;
const MAX_MULTIPART_FIELDS = 20;

filesRoutes.post("/files", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request, { maxBytes: MAX_FILE_JSON_BODY_BYTES });
  const result = await filesService.uploadAndAttach(request.session, payload);
  response.status(201).json(result);
}));

filesRoutes.post("/files/upload", asyncRoute(async (request, response) => {
  const result = await readMultipartUpload(request);
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

filesRoutes.get("/files/attachments/:fileAttachmentId/preview/content", asyncRoute(async (request, response) => {
  const result = await filesService.readAttachmentPreviewContent(request.session, request.params.fileAttachmentId);

  if (result.stream) {
    for (const [header, value] of Object.entries(result.headers)) {
      response.setHeader(header, value);
    }

    result.stream.on("error", (error) => {
      response.destroy(error);
    });
    result.stream.pipe(response);
    return;
  }

  response.setHeader("Cache-Control", "no-store");
  response.status(200).json(result);
}));

filesRoutes.get("/files/attachments/:fileAttachmentId/preview", asyncRoute(async (request, response) => {
  const result = await filesService.readAttachmentPreviewDescriptor(request.session, request.params.fileAttachmentId);
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

function readMultipartUpload(request) {
  const contentType = String(request.headers["content-type"] || "").toLowerCase();

  if (!contentType.includes("multipart/form-data")) {
    throw new AppError("Multipart file uploads require multipart/form-data.", 415);
  }

  return new Promise((resolve, reject) => {
    let parser;

    try {
      parser = Busboy({
        headers: request.headers,
        limits: {
          fields: MAX_MULTIPART_FIELDS,
          fieldSize: MAX_MULTIPART_FIELD_BYTES,
          files: 1,
        },
      });
    } catch {
      reject(new AppError("Multipart upload could not be parsed.", 400));
      return;
    }

    const fields = new Map();
    let fileSeen = false;
    let uploadError = null;
    let uploadPromise = null;
    let uploadResult = null;
    let settled = false;

    const fail = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error instanceof AppError ? error : new AppError("Multipart upload could not be parsed.", 400));
    };

    parser.on("field", (name, value, info = {}) => {
      if (settled) {
        return;
      }
      if (info.valueTruncated) {
        fail(new AppError("Multipart upload metadata field is too large.", 413));
        return;
      }
      fields.set(name, value);
    });

    parser.on("file", (fieldName, file, info = {}) => {
      if (settled) {
        file.resume();
        return;
      }
      if (fieldName !== "file") {
        file.resume();
        fail(new AppError("Multipart upload expects one file field named 'file'.", 400));
        return;
      }
      if (fileSeen) {
        file.resume();
        fail(new AppError("Multipart upload accepts one file.", 400));
        return;
      }

      fileSeen = true;

      let payload;
      try {
        payload = buildMultipartUploadPayload(fields, file, info);
      } catch (error) {
        file.resume();
        fail(error);
        return;
      }

      uploadPromise = filesService.uploadStreamAndAttach(request.session, payload)
        .then((result) => {
          uploadResult = result;
        })
        .catch((error) => {
          uploadError = error;
          file.resume();
        });
    });

    parser.on("fieldsLimit", () => {
      fail(new AppError("Multipart upload has too many metadata fields.", 400));
    });
    parser.on("filesLimit", () => {
      fail(new AppError("Multipart upload accepts one file.", 400));
    });
    parser.on("error", () => {
      fail(new AppError("Multipart upload could not be parsed.", 400));
    });
    parser.on("finish", async () => {
      if (settled) {
        return;
      }
      if (!fileSeen || !uploadPromise) {
        fail(new AppError("Multipart upload requires one file field named 'file'.", 400));
        return;
      }

      await uploadPromise;
      if (uploadError) {
        fail(uploadError);
        return;
      }

      settled = true;
      resolve(uploadResult);
    });

    request.pipe(parser);
  });
}

function buildMultipartUploadPayload(fields, fileStream, info = {}) {
  for (const fieldName of ["moduleId", "targetType", "targetId"]) {
    if (!fieldValue(fields, fieldName)) {
      throw new AppError("Multipart upload metadata fields must be sent before the file field.", 400);
    }
  }

  return {
    attachmentMetadata: parseOptionalJsonObject(fieldValue(fields, "attachmentMetadata")),
    attachmentRole: fieldValue(fields, "attachmentRole"),
    caption: fieldValue(fields, "caption"),
    displayName: fieldValue(fields, "displayName"),
    fileStream,
    filename: info.filename || "",
    mimeType: info.mimeType || "",
    moduleId: fieldValue(fields, "moduleId"),
    originalFilename: fieldValue(fields, "originalFilename") || info.filename || "",
    sortOrder: fieldValue(fields, "sortOrder"),
    targetId: fieldValue(fields, "targetId"),
    targetType: fieldValue(fields, "targetType"),
    visibility: fieldValue(fields, "visibility"),
  };
}

function fieldValue(fields, camelName) {
  const snakeName = camelName.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  return fields.get(camelName) || fields.get(snakeName) || "";
}

function parseOptionalJsonObject(value) {
  const text = String(value || "").trim();

  if (!text) {
    return {};
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AppError("Multipart attachmentMetadata must be a JSON object.", 400);
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new AppError("Multipart attachmentMetadata must be a JSON object.", 400);
  }

  return parsed;
}

export { filesRoutes };
