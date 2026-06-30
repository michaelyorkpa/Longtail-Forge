import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { config } from "../config.js";

const MIGRATION_LOCK_FILE_NAME = ".longtail-forge-migrations.lock";

function migrationLockPath() {
  return path.join(path.dirname(config.databaseFile), MIGRATION_LOCK_FILE_NAME);
}

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
    if (error.code === "EEXIST") {
      throw await createHeldMigrationLockError(lockPath);
    }

    throw new Error(`Could not acquire SQLite migration lock at ${lockPath}: ${error.message || error}`);
  }

  const metadata = {
    acquiredAt: new Date().toISOString(),
    databaseFile: config.databaseFile,
    hostname: os.hostname(),
    ownerId: randomUUID(),
    pid: process.pid,
    provider: config.databaseProvider,
  };

  try {
    await handle.writeFile(`${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  } catch (error) {
    await handle.close().catch(() => {});
    await fs.rm(lockPath, { force: true }).catch(() => {});
    throw new Error(`Could not write SQLite migration lock metadata at ${lockPath}: ${error.message || error}`);
  }

  return Object.freeze({
    handle,
    lockPath,
    ownerId: metadata.ownerId,
  });
}

async function releaseMigrationLock(lock) {
  await lock.handle.close();

  const metadata = await readMigrationLockMetadata(lock.lockPath);
  if (metadata?.ownerId && metadata.ownerId !== lock.ownerId) {
    return;
  }

  try {
    await fs.unlink(lock.lockPath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

async function createHeldMigrationLockError(lockPath) {
  const metadata = await readMigrationLockMetadata(lockPath);
  const owner = formatMigrationLockOwner(metadata);

  return new Error(
    `SQLite migration lock is already held at ${lockPath}. ${owner} ` +
    "Another Longtail Forge startup or maintenance process is running migrations or schema repairs. " +
    "Wait for that process to finish, or if it crashed, remove the stale lock file and restart.",
  );
}

async function readMigrationLockMetadata(lockPath) {
  try {
    return JSON.parse(await fs.readFile(lockPath, "utf8"));
  } catch {
    return null;
  }
}

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
