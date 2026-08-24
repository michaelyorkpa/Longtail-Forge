import Busboy from "busboy";
import { Router } from "express";
import { filesService } from "../services/files.service.js";
import { AppError } from "../utils/app-error.js";
import {
  readJsonBody,
  readJsonObjectBody,
  workspaceAsyncRoute as asyncRoute,
} from "../utils/http.js";

/** @typedef {Awaited<ReturnType<typeof filesService.uploadStreamAndAttach>>} FileUploadResult */
/** @typedef {import("node:stream").Readable} MultipartFileStream */
/** @typedef {import("busboy").BusboyParser} BusboyParser */
/** @typedef {{ filename?: string, mimeType?: string, valueTruncated?: boolean }} MultipartPartInfo */
/** @typedef {{ destroyParser?: boolean }} MultipartFailureOptions */
/** @typedef {Map<string, string>} MultipartFields */
/** @typedef {{ attachmentMetadata: Record<string, unknown>, attachmentRole: string, caption: string, displayName: string, fileStream: MultipartFileStream, filename: string, mimeType: string, moduleId: string, originalFilename: string, sortOrder: string, targetId: string, targetType: string, visibility: string }} MultipartUploadPayload */
/** @typedef {{ attachment: FileUploadResult["attachment"], file: FileUploadResult["file"], index: number, ok: true, originalFilename: string } | { error: string, index: number, ok: false, originalFilename: string, status: number }} MultipartBatchEntry */
/** @typedef {{ failed: number, ok: boolean, results: MultipartBatchEntry[], succeeded: number, total: number }} MultipartBatchResult */

const filesRoutes = Router();
const MAX_FILE_JSON_BODY_BYTES = 8 * 1024 * 1024;
const MAX_MULTIPART_BATCH_FILES = 50;
const MAX_MULTIPART_FIELD_BYTES = 64 * 1024;
const MAX_MULTIPART_FIELDS = 20;

filesRoutes.post("/files", asyncRoute(async (request, response) => {
  filesService.assertFileIngressAllowed();
  const payload = await readJsonBody(request, { maxBytes: MAX_FILE_JSON_BODY_BYTES });
  const result = await filesService.uploadAndAttach(request.session, payload);
  response.status(201).json(result);
}));

filesRoutes.post("/files/upload", asyncRoute(async (request, response) => {
  filesService.assertFileIngressAllowed();
  const result = await readMultipartUpload(request);
  response.status(201).json(result);
}));

filesRoutes.post("/files/upload/batch", asyncRoute(async (request, response) => {
  filesService.assertFileIngressAllowed();
  const result = await readMultipartBatchUpload(request);
  response.status(result.failed > 0 ? 207 : 201).json(result);
}));

filesRoutes.post("/files/batch", asyncRoute(async (request, response) => {
  filesService.assertFileIngressAllowed();
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
  const payload = await readJsonObjectBody(request);
  const result = await filesService.saveWorkspaceFileSettings(request.session, payload);
  response.status(200).json(result);
}));

filesRoutes.post("/files/attachments", asyncRoute(async (request, response) => {
  filesService.assertFileIngressAllowed();
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
  const payload = await readJsonObjectBody(request);
  const result = await filesService.reportFile(request.session, request.params.fileId, payload);
  response.status(200).json(result);
}));

filesRoutes.post("/files/:fileId/quarantine", asyncRoute(async (request, response) => {
  const payload = await readJsonObjectBody(request);
  const result = await filesService.quarantineFile(request.session, request.params.fileId, payload);
  response.status(200).json(result);
}));

/**
 * @param {import("../types/route-contracts.js").WorkspaceRouteRequest} request
 * @returns {Promise<FileUploadResult>}
 */
function readMultipartUpload(request) {
  const contentType = String(request.headers["content-type"] || "").toLowerCase();

  if (!contentType.includes("multipart/form-data")) {
    throw new AppError("Multipart file uploads require multipart/form-data.", 415);
  }

  return new Promise((resolve, reject) => {
    /** @type {BusboyParser} */
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

    /** @type {MultipartFields} */
    const fields = new Map();
    /** @type {Set<MultipartFileStream>} */
    const activeFileStreams = new Set();
    let fileSeen = false;
    /** @type {unknown} */
    let uploadError = null;
    /** @type {Promise<void> | null} */
    let uploadPromise = null;
    /** @type {FileUploadResult | null} */
    let uploadResult = null;
    let settled = false;

    const cleanupRequestListeners = () => {
      request.off("aborted", handleRequestAborted);
      request.off("error", handleRequestError);
    };
    /** @param {unknown} error @param {MultipartFailureOptions} [options] */
    const fail = (error, options = {}) => {
      if (settled) {
        return;
      }
      settled = true;
      const normalizedError = normalizeMultipartUploadError(error);
      cleanupRequestListeners();
      destroyMultipartFileStreams(activeFileStreams, normalizedError);
      if (options.destroyParser !== false) {
        destroyMultipartParser(parser, normalizedError);
      }
      reject(normalizedError);
    };
    const handleRequestAborted = () => {
      fail(new AppError("Multipart upload was cancelled before it finished.", 400));
    };
    const handleRequestError = () => {
      fail(new AppError("Multipart upload could not be read.", 400));
    };

    request.on("aborted", handleRequestAborted);
    request.on("error", handleRequestError);

    parser.on("field", (name, value, info) => {
      if (settled) {
        return;
      }
      if (info.valueTruncated) {
        fail(new AppError("Multipart upload metadata field is too large.", 413));
        return;
      }
      fields.set(name, value);
    });

    parser.on("file", (fieldName, file, info) => {
      if (settled) {
        file.resume();
        return;
      }
      trackMultipartFileStream(file, activeFileStreams);
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
      fail(new AppError("Multipart upload could not be parsed.", 400), { destroyParser: false });
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
        fail(uploadError, { destroyParser: false });
        return;
      }

      if (!uploadResult) {
        fail(new AppError("Multipart upload could not be completed.", 400), { destroyParser: false });
        return;
      }
      settled = true;
      cleanupRequestListeners();
      resolve(uploadResult);
    });

    request.pipe(parser);
  });
}

/**
 * @param {import("../types/route-contracts.js").WorkspaceRouteRequest} request
 * @returns {Promise<MultipartBatchResult>}
 */
function readMultipartBatchUpload(request) {
  const contentType = String(request.headers["content-type"] || "").toLowerCase();

  if (!contentType.includes("multipart/form-data")) {
    throw new AppError("Multipart file uploads require multipart/form-data.", 415);
  }

  return new Promise((resolve, reject) => {
    /** @type {BusboyParser} */
    let parser;

    try {
      parser = Busboy({
        headers: request.headers,
        limits: {
          fields: MAX_MULTIPART_FIELDS,
          fieldSize: MAX_MULTIPART_FIELD_BYTES,
          files: MAX_MULTIPART_BATCH_FILES,
        },
      });
    } catch {
      reject(new AppError("Multipart upload could not be parsed.", 400));
      return;
    }

    /** @type {MultipartFields} */
    const fields = new Map();
    /** @type {Set<MultipartFileStream>} */
    const activeFileStreams = new Set();
    /** @type {Promise<MultipartBatchEntry>[]} */
    const uploadPromises = [];
    let settled = false;
    let uploadCount = 0;

    const cleanupRequestListeners = () => {
      request.off("aborted", handleRequestAborted);
      request.off("error", handleRequestError);
    };
    /** @param {unknown} error @param {MultipartFailureOptions} [options] */
    const fail = (error, options = {}) => {
      if (settled) {
        return;
      }
      settled = true;
      const normalizedError = normalizeMultipartUploadError(error);
      cleanupRequestListeners();
      destroyMultipartFileStreams(activeFileStreams, normalizedError);
      if (options.destroyParser !== false) {
        destroyMultipartParser(parser, normalizedError);
      }
      reject(normalizedError);
    };
    const handleRequestAborted = () => {
      fail(new AppError("Multipart upload was cancelled before it finished.", 400));
    };
    const handleRequestError = () => {
      fail(new AppError("Multipart upload could not be read.", 400));
    };

    request.on("aborted", handleRequestAborted);
    request.on("error", handleRequestError);

    parser.on("field", (name, value, info) => {
      if (settled) {
        return;
      }
      if (info.valueTruncated) {
        fail(new AppError("Multipart upload metadata field is too large.", 413));
        return;
      }
      fields.set(name, value);
    });

    parser.on("file", (fieldName, file, info) => {
      if (settled) {
        file.resume();
        return;
      }
      trackMultipartFileStream(file, activeFileStreams);
      if (!["file", "files"].includes(fieldName)) {
        file.resume();
        uploadPromises.push(Promise.resolve(multipartBatchFailureResult({
          error: new AppError("Multipart batch upload expects file fields named 'files'.", 400),
          index: uploadCount,
          info,
        })));
        uploadCount += 1;
        return;
      }

      let payload;
      const index = uploadCount;
      uploadCount += 1;

      try {
        payload = buildMultipartUploadPayload(fields, file, info, index);
      } catch (error) {
        file.resume();
        uploadPromises.push(Promise.resolve(multipartBatchFailureResult({
          error,
          index,
          info,
        })));
        return;
      }

      uploadPromises.push(
        filesService.uploadStreamAndAttach(request.session, payload)
          .then((result) => {
            /** @type {MultipartBatchEntry} */
            const entry = {
              attachment: result.attachment,
              file: result.file,
              index,
              ok: true,
              originalFilename: payload.originalFilename || payload.filename || "",
            };
            return entry;
          })
          .catch((error) => {
            /** @type {MultipartBatchEntry} */
            const entry = {
              error: multipartBatchErrorMessage(error),
              index,
              ok: false,
              originalFilename: payload.originalFilename || payload.filename || "",
              status: multipartBatchErrorStatus(error),
            };
            file.resume();
            return entry;
          }),
      );
    });

    parser.on("fieldsLimit", () => {
      fail(new AppError("Multipart upload has too many metadata fields.", 400));
    });
    parser.on("filesLimit", () => {
      fail(new AppError("Multipart batch upload accepts up to 50 files.", 400));
    });
    parser.on("error", () => {
      fail(new AppError("Multipart upload could not be parsed.", 400), { destroyParser: false });
    });
    parser.on("finish", async () => {
      if (settled) {
        return;
      }
      if (uploadPromises.length === 0) {
        fail(new AppError("Multipart batch upload requires at least one file.", 400));
        return;
      }

      const results = (await Promise.all(uploadPromises)).sort((left, right) => left.index - right.index);
      const succeeded = results.filter((result) => result.ok).length;
      const failed = results.length - succeeded;

      settled = true;
      cleanupRequestListeners();
      resolve({
        failed,
        ok: failed === 0,
        results,
        succeeded,
        total: results.length,
      });
    });

    request.pipe(parser);
  });
}

/**
 * @param {{ error: unknown, index: number, info?: MultipartPartInfo }} options
 * @returns {MultipartBatchEntry}
 */
function multipartBatchFailureResult({ error, index, info = {} }) {
  return {
    error: multipartBatchErrorMessage(error),
    index,
    ok: false,
    originalFilename: info.filename || "",
    status: multipartBatchErrorStatus(error),
  };
}

/** @param {unknown} error @returns {string} */
function multipartBatchErrorMessage(error) {
  return error instanceof AppError ? error.message : "Upload failed.";
}

/** @param {unknown} error @returns {number} */
function multipartBatchErrorStatus(error) {
  return error instanceof AppError ? error.statusCode : 400;
}

/** @param {MultipartFileStream} file @param {Set<MultipartFileStream>} activeFileStreams */
function trackMultipartFileStream(file, activeFileStreams) {
  activeFileStreams.add(file);
  const untrack = () => {
    activeFileStreams.delete(file);
  };

  file.once("close", untrack);
  file.once("end", untrack);
  file.once("error", untrack);
}

/** @param {Set<MultipartFileStream>} activeFileStreams @param {Error} error */
function destroyMultipartFileStreams(activeFileStreams, error) {
  for (const file of activeFileStreams) {
    if (typeof file.destroy === "function" && !file.destroyed) {
      file.destroy(error);
    }
  }
  activeFileStreams.clear();
}

/** @param {import("node:stream").Writable | null} parser @param {Error} error */
function destroyMultipartParser(parser, error) {
  if (parser && typeof parser.destroy === "function" && !parser.destroyed) {
    parser.destroy(error);
  }
}

/** @param {unknown} error @returns {AppError} */
function normalizeMultipartUploadError(error) {
  if (error instanceof AppError) {
    return error;
  }
  return new AppError("Multipart upload could not be parsed.", 400);
}

/**
 * @param {MultipartFields} fields
 * @param {MultipartFileStream} fileStream
 * @param {MultipartPartInfo} [info]
 * @param {number | null} [batchIndex]
 * @returns {MultipartUploadPayload}
 */
function buildMultipartUploadPayload(fields, fileStream, info = {}, batchIndex = null) {
  for (const fieldName of ["moduleId", "targetType", "targetId"]) {
    if (!fieldValue(fields, fieldName)) {
      throw new AppError("Multipart upload metadata fields must be sent before the file field.", 400);
    }
  }

  const attachmentMetadata = parseOptionalJsonObject(fieldValue(fields, "attachmentMetadata"));
  if (batchIndex !== null) {
    attachmentMetadata.batch_index = batchIndex;
  }

  return {
    attachmentMetadata,
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

/** @param {MultipartFields} fields @param {string} camelName @returns {string} */
function fieldValue(fields, camelName) {
  const snakeName = camelName.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  return fields.get(camelName) || fields.get(snakeName) || "";
}

/** @param {unknown} value @returns {Record<string, unknown>} */
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
