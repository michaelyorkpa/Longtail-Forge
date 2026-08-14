import path from "node:path";
import { Readable } from "node:stream";
import { createOpaqueId } from "../identifiers.js";
import { AppError } from "../../utils/app-error.js";

const S3_PROVIDER_ID = "s3";

/** @typedef {{ accessKeyId: string, bucket: string, endpoint: string, region: string, secretAccessKey: string }} S3Settings */
/** @typedef {{ contentLength?: unknown, size?: unknown, ContentLength?: unknown, lastModified?: unknown, updatedAt?: unknown, LastModified?: unknown, body?: unknown, Body?: unknown, ok?: boolean } & Record<string, unknown>} S3ClientResult */
/** @typedef {{ deleteObject?: (payload: Record<string, unknown>) => Promise<S3ClientResult>, headObject?: (payload: Record<string, unknown>) => Promise<S3ClientResult>, getObject?: (payload: Record<string, unknown>) => Promise<S3ClientResult>, putObject?: (payload: Record<string, unknown>) => Promise<S3ClientResult>, health?: (payload: { bucket: string }) => Promise<{ ok?: boolean }> }} S3Client */
/** @typedef {{ client?: S3Client | null, accessKeyId?: unknown, bucket?: unknown, endpoint?: unknown, region?: unknown, secretAccessKey?: unknown }} S3AdapterOptions */
/** @typedef {{ workspaceId?: unknown }} S3WriteOptions */
/** @typedef {"deleteObject" | "headObject" | "getObject" | "putObject"} S3ClientMethod */

/** @param {S3AdapterOptions} [options] */
function createS3FileStorageAdapter(options = {}) {
  const settings = normalizeS3Settings(options);
  const client = options.client || null;

  return {
    id: S3_PROVIDER_ID,
    async delete(/** @type {string} */ storageKey) {
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
    async metadata(/** @type {string} */ storageKey) {
      const result = await callS3Client(client, settings, "headObject", {
        bucket: settings.bucket,
        key: normalizeStorageKey(storageKey),
      });

      return {
        size: normalizeSize(result?.contentLength ?? result?.size ?? result?.ContentLength),
        updatedAt: normalizeUpdatedAt(result?.lastModified ?? result?.updatedAt ?? result?.LastModified),
      };
    },
    async read(/** @type {string} */ storageKey) {
      const result = await callS3Client(client, settings, "getObject", {
        bucket: settings.bucket,
        key: normalizeStorageKey(storageKey),
      });

      return toReadable(result?.body ?? result?.Body ?? result);
    },
    async save(/** @type {Buffer} */ buffer, /** @type {S3WriteOptions} */ options = {}) {
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
    async saveStream(/** @type {NodeJS.ReadableStream} */ readable, /** @type {S3WriteOptions} */ options = {}) {
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

/** @param {S3Client | null} client @param {S3Settings} settings @param {S3ClientMethod} methodName @param {Record<string, unknown>} payload @returns {Promise<S3ClientResult>} */
async function callS3Client(client, settings, methodName, payload) {
  const missing = missingS3Settings(settings);
  if (missing.length > 0) {
    throw new AppError(`S3 file storage provider is not configured. Missing: ${missing.join(", ")}.`, 500);
  }

  const method = client?.[methodName];
  if (typeof method !== "function") {
    throw new AppError("S3 file storage client is not configured.", 500);
  }

  try {
    return await method.call(client, payload);
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

/**
 * @param {unknown} error
 */
function isS3ObjectNotFoundError(error) {
  const details = isRecord(error) ? error : {};
  const metadata = isRecord(details.$metadata) ? details.$metadata : {};
  const statusCode = Number(details.statusCode || details.status || metadata.httpStatusCode);
  if (statusCode === 404) {
    return true;
  }

  const code = String(details.code || details.name || details.Code || "").toLowerCase();
  if (["nosuchkey", "notfound", "notfounderror", "notfoundexception"].includes(code)) {
    return true;
  }

  return /not found|no such key|object missing|missing object/i.test(String(details.message || ""));
}

/** @param {S3WriteOptions} [options] */
function createWriteTarget(options = {}) {
  const storageKey = createStorageKey(options.workspaceId);
  return {
    storageKey,
    storedFilename: path.posix.basename(storageKey),
  };
}

/** @param {unknown} prefix */
function createStorageKey(prefix) {
  const safePrefix = normalizePathSegment(prefix || "workspace");
  return `${safePrefix}/${new Date().toISOString().slice(0, 10)}/${createOpaqueId()}`;
}

/** @param {S3AdapterOptions} [options] @returns {S3Settings} */
function normalizeS3Settings(options = {}) {
  return {
    accessKeyId: normalizeText(options.accessKeyId),
    bucket: normalizeText(options.bucket),
    endpoint: normalizeText(options.endpoint),
    region: normalizeText(options.region),
    secretAccessKey: normalizeText(options.secretAccessKey),
  };
}

/** @param {Partial<S3Settings>} [settings] */
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

/** @param {unknown} value */
function normalizeStorageKey(value) {
  const storageKey = String(value || "").replaceAll("\\", "/").trim();
  if (!storageKey || storageKey.startsWith("/") || storageKey.split("/").includes("..")) {
    throw new AppError("Invalid file storage key.", 400);
  }

  return storageKey;
}

/** @param {unknown} value */
function normalizePathSegment(value) {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "workspace";
}

/** @param {unknown} value */
function normalizeText(value) {
  return String(value || "").trim();
}

/** @param {unknown} value */
function normalizeSize(value) {
  const size = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(size) && size >= 0 ? size : 0;
}

/**
 * @param {unknown} value
 */
function normalizeUpdatedAt(value) {
  if (!value) {
    return new Date(0).toISOString();
  }

  const date = value instanceof Date
    ? value
    : typeof value === "string" || typeof value === "number"
      ? new Date(value)
      : new Date(Number.NaN);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

/** @param {unknown} body @returns {import("node:stream").Readable} */
function toReadable(body) {
  if (isNodeReadable(body)) {
    return body;
  }

  if (isWebReadable(body) && typeof Readable.fromWeb === "function") {
    return Readable.fromWeb(body);
  }

  if (Buffer.isBuffer(body) || body instanceof Uint8Array || typeof body === "string") {
    return Readable.from([body]);
  }

  throw new AppError("S3 file storage object body is unavailable.", 502);
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return Boolean(value) && typeof value === "object";
}

/** @param {unknown} value @returns {value is import("node:stream").Readable} */
function isNodeReadable(value) {
  return value instanceof Readable;
}

/** @param {unknown} value @returns {value is import("node:stream/web").ReadableStream} */
function isWebReadable(value) {
  return isRecord(value) && typeof value.getReader === "function";
}

export {
  S3_PROVIDER_ID,
  createS3FileStorageAdapter,
  missingS3Settings,
};
