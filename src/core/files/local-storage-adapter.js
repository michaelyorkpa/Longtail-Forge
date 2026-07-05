import fs from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { AppError } from "../../utils/app-error.js";
import { config } from "../../config.js";

const LOCAL_FILE_STORAGE_ROOT = config.storage.localRoot;

function createLocalFileStorageAdapter(options = {}) {
  const rootDir = path.resolve(options.rootDir || LOCAL_FILE_STORAGE_ROOT);

  return {
    id: "local",
    rootDir,
    async delete(storageKey) {
      const filePath = resolveStoragePath(rootDir, storageKey);
      await fs.rm(filePath, { force: true });
    },
    async health() {
      await fs.mkdir(rootDir, { recursive: true });
      return { ok: true, provider: "local", rootDir };
    },
    async metadata(storageKey) {
      const filePath = resolveStoragePath(rootDir, storageKey);
      const stats = await fs.stat(filePath);
      return { size: stats.size, updatedAt: stats.mtime.toISOString() };
    },
    async read(storageKey) {
      const filePath = resolveStoragePath(rootDir, storageKey);
      return createReadStream(filePath);
    },
    async save(buffer, options = {}) {
      const target = createWriteTarget(rootDir, options);
      await fs.mkdir(path.dirname(target.filePath), { recursive: true });
      await fs.writeFile(target.filePath, buffer);
      return { storageKey: target.storageKey, storedFilename: target.storedFilename };
    },
    async saveStream(readable, options = {}) {
      if (!readable || typeof readable.pipe !== "function") {
        throw new TypeError("A readable stream is required.");
      }

      const target = createWriteTarget(rootDir, options);

      await fs.mkdir(path.dirname(target.filePath), { recursive: true });
      try {
        await pipeline(readable, createWriteStream(target.filePath));
      } catch (error) {
        await fs.rm(target.filePath, { force: true }).catch(() => {});
        throw error;
      }

      return { storageKey: target.storageKey, storedFilename: target.storedFilename };
    },
    resolveStoragePath(storageKey) {
      return resolveStoragePath(rootDir, storageKey);
    },
  };
}

function createWriteTarget(rootDir, options = {}) {
  const workspaceId = normalizePathSegment(options.workspaceId || "workspace");
  const storageKey = createStorageKey(workspaceId);
  const filePath = resolveStoragePath(rootDir, storageKey);

  return {
    filePath,
    storageKey,
    storedFilename: path.basename(storageKey),
  };
}

function createStorageKey(prefix) {
  const safePrefix = normalizePathSegment(prefix || "workspace");
  return `${safePrefix}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}`;
}

function resolveStoragePath(rootDir, storageKey) {
  const normalizedKey = String(storageKey || "").replaceAll("\\", "/").trim();

  if (!normalizedKey || normalizedKey.startsWith("/") || normalizedKey.split("/").includes("..")) {
    throw new AppError("Invalid file storage key.", 400);
  }

  const resolvedPath = path.resolve(rootDir, normalizedKey);
  const relativePath = path.relative(rootDir, resolvedPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new AppError("File storage key escapes the configured storage root.", 400);
  }

  return resolvedPath;
}

function normalizePathSegment(value) {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "workspace";
}

export {
  LOCAL_FILE_STORAGE_ROOT,
  createLocalFileStorageAdapter,
  resolveStoragePath,
};
