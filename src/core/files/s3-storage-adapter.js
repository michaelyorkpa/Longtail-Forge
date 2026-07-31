import path from "node:path";
import { Readable } from "node:stream";
import { createOpaqueId } from "../identifiers.js";
import { AppError } from "../../utils/app-error.js";

const S3_PROVIDER_ID = "s3";

function createS3FileStorageAdapter(options = {}) {
  const settings = normalizeS3Settings(options);
  const client = options.client || null;

  return {
    id: S3_PROVIDER_ID,
    async delete(storageKey) {
      await callS3Client(client, settings, "deleteObject", {
        bucket: settings.bucket,
        key: normalizeStorageKey(storageKey),
      });
    },
    async health() {
      const missing = missingS3Settings(settings);
      if (missing.length > 0) {
        return { ok: false, provider: S3_PROVIDER_ID, status: "not_configured" };
      }

      if (!client || typeof client.health !== "function") {
        return { ok: false, provider: S3_PROVIDER_ID, status: "client_unavailable" };
      }

      try {
        const health = await client.health({ bucket: settings.bucket });
        const ok = health?.ok !== false;
        return { ok, provider: S3_PROVIDER_ID, status: ok ? "ok" : "unavailable" };
      } catch {
        return { ok: false, provider: S3_PROVIDER_ID, status: "unavailable" };
      }
    },
    async metadata(storageKey) {
      const result = await callS3Client(client, settings, "headObject", {
        bucket: settings.bucket,
        key: normalizeStorageKey(storageKey),
      });

      return {
        size: normalizeSize(result?.contentLength ?? result?.size ?? result?.ContentLength),
        updatedAt: normalizeUpdatedAt(result?.lastModified ?? result?.updatedAt ?? result?.LastModified),
      };
    },
    async read(storageKey) {
      const result = await callS3Client(client, settings, "getObject", {
        bucket: settings.bucket,
        key: normalizeStorageKey(storageKey),
      });

      return toReadable(result?.body ?? result?.Body ?? result);
    },
    async save(buffer, options = {}) {
      if (!Buffer.isBuffer(buffer)) {
        throw new TypeError("A buffer is required.");
      }

      const target = createWriteTarget(options);
      await callS3Client(client, settings, "putObject", {
        body: buffer,
        bucket: settings.bucket,
        contentLength: buffer.length,
        key: target.storageKey,
      });

      return target;
    },
    async saveStream(readable, options = {}) {
      if (!readable || typeof readable.pipe !== "function") {
        throw new TypeError("A readable stream is required.");
      }

      const target = createWriteTarget(options);
      await callS3Client(client, settings, "putObject", {
        body: readable,
        bucket: settings.bucket,
        key: target.storageKey,
      });

      return target;
    },
  };
}

async function callS3Client(client, settings, methodName, payload) {
  const missing = missingS3Settings(settings);
  if (missing.length > 0) {
    throw new AppError(`S3 file storage provider is not configured. Missing: ${missing.join(", ")}.`, 500);
  }

  if (!client || typeof client[methodName] !== "function") {
    throw new AppError("S3 file storage client is not configured.", 500);
  }

  try {
    return await client[methodName](payload);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    if (isS3ObjectNotFoundError(error)) {
      throw new AppError("S3 file storage object was not found.", 404);
    }

    throw new AppError("S3 file storage operation failed.", 502);
  }
}

function isS3ObjectNotFoundError(error) {
  const statusCode = Number(error?.statusCode || error?.status || error?.$metadata?.httpStatusCode);
  if (statusCode === 404) {
    return true;
  }

  const code = String(error?.code || error?.name || error?.Code || "").toLowerCase();
  if (["nosuchkey", "notfound", "notfounderror", "notfoundexception"].includes(code)) {
    return true;
  }

  return /not found|no such key|object missing|missing object/i.test(String(error?.message || ""));
}

function createWriteTarget(options = {}) {
  const storageKey = createStorageKey(options.workspaceId);
  return {
    storageKey,
    storedFilename: path.posix.basename(storageKey),
  };
}

function createStorageKey(prefix) {
  const safePrefix = normalizePathSegment(prefix || "workspace");
  return `${safePrefix}/${new Date().toISOString().slice(0, 10)}/${createOpaqueId()}`;
}

function normalizeS3Settings(options = {}) {
  return {
    accessKeyId: normalizeText(options.accessKeyId),
    bucket: normalizeText(options.bucket),
    endpoint: normalizeText(options.endpoint),
    region: normalizeText(options.region),
    secretAccessKey: normalizeText(options.secretAccessKey),
  };
}

function missingS3Settings(settings = {}) {
  return [
    ["LONGTAIL_S3_BUCKET", settings.bucket],
    ["LONGTAIL_S3_REGION", settings.region],
    ["LONGTAIL_S3_ACCESS_KEY_ID", settings.accessKeyId],
    ["LONGTAIL_S3_SECRET_ACCESS_KEY", settings.secretAccessKey],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);
}

function normalizeStorageKey(value) {
  const storageKey = String(value || "").replaceAll("\\", "/").trim();
  if (!storageKey || storageKey.startsWith("/") || storageKey.split("/").includes("..")) {
    throw new AppError("Invalid file storage key.", 400);
  }

  return storageKey;
}

function normalizePathSegment(value) {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "workspace";
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeSize(value) {
  const size = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(size) && size >= 0 ? size : 0;
}

function normalizeUpdatedAt(value) {
  if (!value) {
    return new Date(0).toISOString();
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function toReadable(body) {
  if (body && typeof body.pipe === "function") {
    return body;
  }

  if (body && typeof body.getReader === "function" && typeof Readable.fromWeb === "function") {
    return Readable.fromWeb(body);
  }

  if (Buffer.isBuffer(body) || body instanceof Uint8Array || typeof body === "string") {
    return Readable.from([body]);
  }

  throw new AppError("S3 file storage object body is unavailable.", 502);
}

export {
  S3_PROVIDER_ID,
  createS3FileStorageAdapter,
  missingS3Settings,
};
