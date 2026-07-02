import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { config } from "../../config.js";

const WORKER_LOCK_FILE = ".longtail-forge-worker.lock";

async function acquireWorkerProcessLock() {
  const lockPath = getWorkerProcessLockPath();
  await fs.mkdir(path.dirname(lockPath), { recursive: true });

  let handle = null;

  try {
    handle = await fs.open(lockPath, "wx");
    await handle.writeFile(JSON.stringify({
      acquiredAt: new Date().toISOString(),
      hostname: os.hostname(),
      pid: process.pid,
      workerId: config.worker.id,
    }, null, 2));
  } catch (error) {
    if (handle) {
      await handle.close().catch(() => {});
      await fs.rm(lockPath, { force: true }).catch(() => {});
    }

    if (error?.code === "EEXIST") {
      throw new Error(
        `A Longtail Forge worker lock already exists at ${lockPath}. SQLite separate mode supports at most one local worker process for this install. Stop the existing worker, or remove the stale lock only after confirming no worker is running.`,
      );
    }

    throw error;
  }

  await handle.close();
  let released = false;

  return {
    lockPath,
    async release() {
      if (released) {
        return;
      }

      released = true;
      await fs.rm(lockPath, { force: true });
    },
  };
}

function getWorkerProcessLockPath() {
  return path.join(path.dirname(config.databaseFile), WORKER_LOCK_FILE);
}

export {
  acquireWorkerProcessLock,
  getWorkerProcessLockPath,
};
