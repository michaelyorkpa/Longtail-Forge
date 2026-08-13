// @ts-check
import fs from "node:fs/promises";

/** @typedef {import("node:fs/promises").FileHandle} FileHandle */
/** @typedef {{ acquiredAt?: string, databaseFile?: string, hostname?: string, ownerId?: string, pid?: number, provider?: string }} MigrationLockMetadata */
/** @typedef {{ handle: FileHandle, lockPath: string, ownerId: string }} MigrationLock */
import os from "node:os";
import path from "node:path";
import { config } from "../config.js";
import { createOpaqueId } from "../core/identifiers.js";

const MIGRATION_LOCK_FILE_NAME = ".longtail-forge-migrations.lock";

function migrationLockPath() {
  return path.join(path.dirname(config.databaseFile), MIGRATION_LOCK_FILE_NAME);
}

/** @template T @param {(lock: MigrationLock) => Promise<T> | T} callback @returns {Promise<T>} */
async function withMigrationLock(callback) {
  if (typeof callback !== "function") {
    throw new Error("Migration lock requires a callback.");
  }

  const lock = await acquireMigrationLock();

  try {
    return await callback(lock);
  } finally {
    await releaseMigrationLock(lock);
  }
}

async function acquireMigrationLock() {
  const lockPath = migrationLockPath();
  await fs.mkdir(path.dirname(lockPath), { recursive: true });

  let handle;
  try {
    handle = await fs.open(lockPath, "wx");
  } catch (error) {
    if (errorCode(error) === "EEXIST") {
      throw await createHeldMigrationLockError(lockPath);
    }

    throw new Error(`Could not acquire SQLite migration lock at ${lockPath}: ${errorMessage(error)}`);
  }

  const metadata = {
    acquiredAt: new Date().toISOString(),
    databaseFile: config.databaseFile,
    hostname: os.hostname(),
    ownerId: createOpaqueId(),
    pid: process.pid,
    provider: config.databaseProvider,
  };

  try {
    await handle.writeFile(`${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  } catch (error) {
    await handle.close().catch(() => {});
    await fs.rm(lockPath, { force: true }).catch(() => {});
    throw new Error(`Could not write SQLite migration lock metadata at ${lockPath}: ${errorMessage(error)}`);
  }

  return Object.freeze({
    handle,
    lockPath,
    ownerId: metadata.ownerId,
  });
}

/** @param {MigrationLock} lock */
async function releaseMigrationLock(lock) {
  await lock.handle.close();

  const metadata = await readMigrationLockMetadata(lock.lockPath);
  if (metadata?.ownerId && metadata.ownerId !== lock.ownerId) {
    return;
  }

  try {
    await fs.unlink(lock.lockPath);
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      throw error;
    }
  }
}

/** @param {string} lockPath */
async function createHeldMigrationLockError(lockPath) {
  const metadata = await readMigrationLockMetadata(lockPath);
  const owner = formatMigrationLockOwner(metadata);

  return new Error(
    `SQLite migration lock is already held at ${lockPath}. ${owner} ` +
    "Another Longtail Forge startup or maintenance process is running migrations or schema repairs. " +
    "Wait for that process to finish, or if it crashed, remove the stale lock file and restart.",
  );
}

/** @param {string} lockPath @returns {Promise<MigrationLockMetadata | null>} */
async function readMigrationLockMetadata(lockPath) {
  try {
    return JSON.parse(await fs.readFile(lockPath, "utf8"));
  } catch {
    return null;
  }
}

/** @param {unknown} error @returns {string} */
function errorCode(error) {
  return error && typeof error === "object" && "code" in error ? String(error.code || "") : "";
}

/** @param {unknown} error @returns {string} */
function errorMessage(error) {
  return error && typeof error === "object" && "message" in error ? String(error.message || error) : String(error);
}

/** @param {MigrationLockMetadata | null} metadata */
function formatMigrationLockOwner(metadata) {
  if (!metadata) {
    return "The lock owner could not be read.";
  }

  const parts = [];
  if (metadata.pid) {
    parts.push(`pid=${metadata.pid}`);
  }

  if (metadata.hostname) {
    parts.push(`host=${metadata.hostname}`);
  }

  if (metadata.acquiredAt) {
    parts.push(`acquiredAt=${metadata.acquiredAt}`);
  }

  return parts.length > 0 ? `Lock owner ${parts.join(" ")}.` : "The lock owner did not include process metadata.";
}

export {
  acquireMigrationLock,
  migrationLockPath,
  withMigrationLock,
};
