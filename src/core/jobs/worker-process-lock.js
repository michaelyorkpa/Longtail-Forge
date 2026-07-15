import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { clearInterval, setInterval } from "node:timers";
import { config } from "../../config.js";

const WORKER_LOCK_FILE = ".longtail-forge-worker.lock";
const MIN_HEARTBEAT_INTERVAL_MS = 5_000;
const MAX_HEARTBEAT_INTERVAL_MS = 30_000;

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
      ready: false,
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
  const heartbeatIntervalMs = resolveWorkerHeartbeatIntervalMs();
  let heartbeatTimer = null;

  return {
    heartbeatIntervalMs,
    lockPath,
    async markReady() {
      if (released || heartbeatTimer) {
        return;
      }

      await fs.writeFile(lockPath, JSON.stringify({
        hostname: os.hostname(),
        pid: process.pid,
        ready: true,
        readyAt: new Date().toISOString(),
        workerId: config.worker.id,
      }, null, 2));
      heartbeatTimer = setInterval(() => {
        const now = new Date();
        void fs.utimes(lockPath, now, now).catch(() => {});
      }, heartbeatIntervalMs);
      heartbeatTimer.unref();
    },
    async release() {
      if (released) {
        return;
      }

      released = true;
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }
      await fs.rm(lockPath, { force: true });
    },
  };
}

async function readSeparateWorkerReadiness(options = {}) {
  const lockPath = options.lockPath || getWorkerProcessLockPath();
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const staleAfterMs = options.staleAfterMs || resolveWorkerHeartbeatStaleAfterMs();

  try {
    const heartbeat = JSON.parse(await fs.readFile(lockPath, "utf8"));
    if (heartbeat?.ready !== true) {
      return false;
    }
    const stats = await fs.stat(lockPath);
    return stats.isFile() && nowMs - stats.mtimeMs <= staleAfterMs;
  } catch {
    return false;
  }
}

function resolveWorkerHeartbeatIntervalMs() {
  return Math.min(
    MAX_HEARTBEAT_INTERVAL_MS,
    Math.max(MIN_HEARTBEAT_INTERVAL_MS, config.worker.pollIntervalMs),
  );
}

function resolveWorkerHeartbeatStaleAfterMs() {
  return resolveWorkerHeartbeatIntervalMs() * 3;
}

function getWorkerProcessLockPath() {
  return path.join(path.dirname(config.databaseFile), WORKER_LOCK_FILE);
}

export {
  acquireWorkerProcessLock,
  getWorkerProcessLockPath,
  readSeparateWorkerReadiness,
  resolveWorkerHeartbeatStaleAfterMs,
};
