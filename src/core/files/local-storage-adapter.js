import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../../config.js";
import { AppError } from "../../utils/app-error.js";

const LOCAL_FILE_STORAGE_ROOT = path.join(config.dataDir, "files");

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
    async quarantine(storageKey) {
      const currentPath = resolveStoragePath(rootDir, storageKey);
      const quarantineKey = createStorageKey("quarantine");
      const quarantinePath = resolveStoragePath(rootDir, quarantineKey);
      await fs.mkdir(path.dirname(quarantinePath), { recursive: true });
      await fs.rename(currentPath, quarantinePath);
      return { storageKey: quarantineKey };
    },
    async read(storageKey) {
      const filePath = resolveStoragePath(rootDir, storageKey);
      return createReadStream(filePath);
    },
    async save(buffer, options = {}) {
      const workspaceId = normalizePathSegment(options.workspaceId || "workspace");
      const storageKey = createStorageKey(workspaceId);
      const filePath = resolveStoragePath(rootDir, storageKey);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, buffer);
      return { storageKey, storedFilename: path.basename(storageKey) };
    },
    resolveStoragePath(storageKey) {
      return resolveStoragePath(rootDir, storageKey);
    },
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
