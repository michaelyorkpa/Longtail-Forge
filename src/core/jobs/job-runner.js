import { clearInterval, setInterval } from "node:timers";
import { config } from "../../config.js";
import { db } from "../database.js";
import { getJobHandler, listRegisteredJobTypes } from "./job-handlers.js";

const ACTIVE_JOB_STATUSES = Object.freeze(["pending", "failed"]);
const DEFAULT_CLAIM_LIMIT = 1;
const MAX_CLAIM_LIMIT = 25;
const MAX_ERROR_LENGTH = 1000;
const MIN_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 60 * 1000;
const RUNNER_MODES = new Set(["inline", "separate", "disabled"]);

let pollTimer = null;
let activeRun = null;
let shutdownRequested = false;
let workerStatus = createInitialStatus();

function createInitialStatus() {
  return {
    mode: config.worker.mode,
    workerId: config.worker.id,
    state: config.worker.mode === "disabled" ? "disabled" : "stopped",
    running: false,
    timerActive: false,
    pollIntervalMs: config.worker.pollIntervalMs,
    startedAt: null,
    stoppedAt: null,
    lastPollAt: null,
    lastRunAt: null,
    lastSuccessAt: null,
    lastErrorAt: null,
    lastClaimedCount: 0,
    lockTtlSeconds: config.worker.lockTtlSeconds,
    claimedCount: 0,
    completedCount: 0,
    failedCount: 0,
    deadCount: 0,
  };
}

async function startJobWorker(options = {}) {
  const mode = normalizeWorkerMode(options.mode ?? config.worker.mode);
  const logger = options.logger || console;

  if (mode === "disabled") {
    await stopJobWorker({ logger });
    workerStatus = {
      ...workerStatus,
      mode,
      state: "disabled",
      running: false,
      timerActive: false,
      pollIntervalMs: normalizePollInterval(options.pollIntervalMs ?? config.worker.pollIntervalMs),
      workerId: normalizeWorkerId(options.workerId ?? config.worker.id),
      lockTtlSeconds: normalizeLockTtlSeconds(options.lockTtlSeconds ?? config.worker.lockTtlSeconds),
      stoppedAt: new Date().toISOString(),
    };
    return getJobWorkerStatus();
  }

  if (pollTimer) {
    return getJobWorkerStatus();
  }

  const workerId = normalizeWorkerId(options.workerId ?? config.worker.id);
  const pollIntervalMs = normalizePollInterval(options.pollIntervalMs ?? config.worker.pollIntervalMs);
  const claimLimit = normalizeClaimLimit(options.claimLimit ?? DEFAULT_CLAIM_LIMIT);
  const lockTtlSeconds = normalizeLockTtlSeconds(options.lockTtlSeconds ?? config.worker.lockTtlSeconds);
  const startedAt = new Date().toISOString();
  shutdownRequested = false;
  workerStatus = {
    ...workerStatus,
    mode,
    workerId,
    state: "idle",
    running: false,
    timerActive: true,
    pollIntervalMs,
    lockTtlSeconds,
    startedAt,
    stoppedAt: null,
    lastClaimedCount: 0,
  };

  pollTimer = setInterval(() => {
    scheduleWorkerPoll({ claimLimit, lockTtlSeconds, logger, mode, workerId });
  }, pollIntervalMs);

  scheduleWorkerPoll({ claimLimit, lockTtlSeconds, logger, mode, workerId });
  return getJobWorkerStatus();
}

async function stopJobWorker(options = {}) {
  const logger = options.logger || console;
  shutdownRequested = true;

  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  if (activeRun) {
    try {
      await activeRun;
    } catch (error) {
      logger.warn?.("[job-worker] Active run failed during shutdown.");
      logger.warn?.(error.message || error);
    }
  }

  workerStatus = {
    ...workerStatus,
    state: workerStatus.mode === "disabled" ? "disabled" : "stopped",
    running: false,
    timerActive: false,
    stoppedAt: new Date().toISOString(),
  };

  return getJobWorkerStatus();
}

function scheduleWorkerPoll(context) {
  if (shutdownRequested || activeRun) {
    return;
  }

  activeRun = runJobWorkerOnce(context)
    .catch((error) => {
      workerStatus = {
        ...workerStatus,
        lastErrorAt: new Date().toISOString(),
        state: pollTimer ? "idle" : "stopped",
        running: false,
      };
      context.logger.warn?.("[job-worker] Poll failed.");
      context.logger.warn?.(error.message || error);
    })
    .finally(() => {
      activeRun = null;
    });
}

async function runJobWorkerOnce(options = {}) {
  const mode = normalizeWorkerMode(options.mode ?? workerStatus.mode ?? config.worker.mode);

  if (mode === "disabled") {
    workerStatus = {
      ...workerStatus,
      mode,
      state: "disabled",
      running: false,
      timerActive: Boolean(pollTimer),
    };
    return {
      claimed: 0,
      completed: 0,
      dead: 0,
      failed: 0,
      skipped: true,
    };
  }

  const workerId = normalizeWorkerId(options.workerId ?? workerStatus.workerId ?? config.worker.id);
  const claimLimit = normalizeClaimLimit(options.claimLimit ?? DEFAULT_CLAIM_LIMIT);
  const lockTtlSeconds = normalizeLockTtlSeconds(options.lockTtlSeconds ?? workerStatus.lockTtlSeconds ?? config.worker.lockTtlSeconds);
  const pollStartedAt = new Date().toISOString();
  workerStatus = {
    ...workerStatus,
    mode,
    workerId,
    state: "running",
    running: true,
    timerActive: Boolean(pollTimer),
    lastPollAt: pollStartedAt,
    lastRunAt: pollStartedAt,
    lockTtlSeconds,
  };

  const claimedJobs = await claimAvailableJobs({
    limit: claimLimit,
    lockTtlSeconds,
    now: pollStartedAt,
    workerId,
  });
  const summary = {
    claimed: claimedJobs.length,
    completed: 0,
    dead: 0,
    failed: 0,
    skipped: false,
  };
  workerStatus = {
    ...workerStatus,
    claimedCount: workerStatus.claimedCount + claimedJobs.length,
    lastClaimedCount: claimedJobs.length,
  };

  for (const job of claimedJobs) {
    try {
      await runClaimedJob(job);
      summary.completed += 1;
    } catch (error) {
      const failedState = await markJobFailed(job, error);
      if (failedState === "dead") {
        summary.dead += 1;
      } else {
        summary.failed += 1;
      }
    }
  }

  const completedAt = new Date().toISOString();
  workerStatus = {
    ...workerStatus,
    completedCount: workerStatus.completedCount + summary.completed,
    deadCount: workerStatus.deadCount + summary.dead,
    failedCount: workerStatus.failedCount + summary.failed,
    lastSuccessAt: completedAt,
    running: false,
    state: pollTimer ? "idle" : "stopped",
    timerActive: Boolean(pollTimer),
  };

  return summary;
}

async function claimAvailableJobs(options = {}) {
  const workerId = normalizeWorkerId(options.workerId ?? config.worker.id);
  const limit = normalizeClaimLimit(options.limit ?? DEFAULT_CLAIM_LIMIT);
  const lockTtlSeconds = normalizeLockTtlSeconds(options.lockTtlSeconds ?? config.worker.lockTtlSeconds);
  const now = normalizeIso(options.now ?? new Date());
  const expiredBefore = subtractSeconds(now, lockTtlSeconds);

  return db.transaction(async (transaction) => {
    const claimedJobs = [];

    for (let index = 0; index < limit; index += 1) {
      const claimedRows = await transaction.query(`
UPDATE jobs
SET
  status = 'running',
  locked_at = :now,
  locked_by = :workerId,
  attempt_count = attempt_count + 1,
  updated_at = :now
WHERE job_id = (
  SELECT job_id
  FROM jobs
  WHERE (
      status IN ('pending', 'failed')
      AND available_at <= :now
    )
    OR (
      status = 'running'
      AND locked_at IS NOT NULL
      AND locked_at <= :expiredBefore
    )
  ORDER BY
    CASE WHEN status = 'running' THEN 0 ELSE 1 END,
    priority DESC,
    available_at ASC,
    created_at ASC,
    job_id ASC
  LIMIT 1
)
RETURNING
  job_id,
  workspace_id,
  job_type,
  dedupe_key,
  payload_json,
  status,
  priority,
  available_at,
  attempt_count,
  max_attempts,
  locked_at,
  locked_by,
  last_error,
  created_at,
  updated_at,
  completed_at,
  dead_at;
`, {
        expiredBefore,
        now,
        workerId,
      });

      if (claimedRows.length === 0) {
        break;
      }

      claimedJobs.push(claimedRows[0]);
    }

    return claimedJobs;
  });
}

async function runClaimedJob(job) {
  const handler = getJobHandler(job.job_type);

  if (!handler) {
    throw new Error(`No handler registered for job type "${job.job_type}".`);
  }

  const payload = parseJobPayload(job);
  await handler({
    job: {
      attemptCount: Number(job.attempt_count || 0),
      dedupeKey: job.dedupe_key || null,
      id: job.job_id,
      jobId: job.job_id,
      jobType: job.job_type,
      maxAttempts: Number(job.max_attempts || 0),
      payload,
      priority: Number(job.priority || 0),
      type: job.job_type,
      workspaceId: job.workspace_id,
    },
    payload,
  });
  await markJobCompleted(job.job_id);
}

async function markJobCompleted(jobId) {
  const now = new Date().toISOString();
  await db.run(`
UPDATE jobs
SET
  status = 'completed',
  locked_at = NULL,
  locked_by = NULL,
  last_error = NULL,
  completed_at = :now,
  updated_at = :now
WHERE job_id = :jobId;
`, {
    jobId,
    now,
  });
}

async function markJobFailed(job, error) {
  const now = new Date();
  const nowIso = now.toISOString();
  const attemptCount = Number(job.attempt_count || 0);
  const maxAttempts = Number(job.max_attempts || 1);
  const lastError = summarizeJobError(error);

  if (attemptCount >= maxAttempts) {
    await db.run(`
UPDATE jobs
SET
  status = 'dead',
  locked_at = NULL,
  locked_by = NULL,
  last_error = :lastError,
  dead_at = :now,
  updated_at = :now
WHERE job_id = :jobId;
`, {
      jobId: job.job_id,
      lastError,
      now: nowIso,
    });
    return "dead";
  }

  const retryAt = new Date(now.getTime() + calculateRetryDelayMs(attemptCount)).toISOString();
  await db.run(`
UPDATE jobs
SET
  status = 'failed',
  locked_at = NULL,
  locked_by = NULL,
  last_error = :lastError,
  available_at = :retryAt,
  updated_at = :now
WHERE job_id = :jobId;
`, {
    jobId: job.job_id,
    lastError,
    now: nowIso,
    retryAt,
  });
  return "failed";
}

function getJobWorkerStatus() {
  return {
    ...workerStatus,
    registeredJobTypes: listRegisteredJobTypes(),
  };
}

function formatJobWorkerStatus(status = getJobWorkerStatus()) {
  return [
    "[job-worker]",
    `mode=${status.mode}`,
    `state=${status.state}`,
    `worker_id=${status.workerId}`,
    `timer=${status.timerActive ? "on" : "off"}`,
    `poll_interval_ms=${status.pollIntervalMs}`,
    `lock_ttl_seconds=${status.lockTtlSeconds}`,
    `last_claimed=${status.lastClaimedCount}`,
    `completed=${status.completedCount}`,
    `failed=${status.failedCount}`,
    `dead=${status.deadCount}`,
  ].join(" ");
}

function resetJobWorkerStatusForTests() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  activeRun = null;
  shutdownRequested = false;
  workerStatus = createInitialStatus();
}

function parseJobPayload(job) {
  try {
    return JSON.parse(job.payload_json || "{}");
  } catch {
    throw new Error(`Job "${job.job_id}" has invalid payload JSON.`);
  }
}

function summarizeJobError(error) {
  const message = String(error?.message || error || "Job failed.").replace(/\s+/g, " ").trim();
  return message.slice(0, MAX_ERROR_LENGTH) || "Job failed.";
}

function calculateRetryDelayMs(attemptCount) {
  const exponent = Math.max(0, Number(attemptCount || 0) - 1);
  return Math.min(MAX_RETRY_DELAY_MS, MIN_RETRY_DELAY_MS * (2 ** exponent));
}

function normalizeWorkerMode(value) {
  const mode = String(value || "").trim();

  if (!RUNNER_MODES.has(mode)) {
    throw new Error("Worker mode must be inline, separate, or disabled.");
  }

  return mode;
}

function normalizeWorkerId(value) {
  return String(value || "").trim() || "default";
}

function normalizePollInterval(value) {
  const interval = Number(value);

  if (!Number.isInteger(interval) || interval < 1000) {
    return config.worker.pollIntervalMs;
  }

  return interval;
}

function normalizeClaimLimit(value) {
  const limit = Number(value);

  if (!Number.isInteger(limit) || limit < 1) {
    return DEFAULT_CLAIM_LIMIT;
  }

  return Math.min(limit, MAX_CLAIM_LIMIT);
}

function normalizeLockTtlSeconds(value) {
  const seconds = Number(value);

  if (!Number.isInteger(seconds) || seconds < 1) {
    return config.worker.lockTtlSeconds;
  }

  return seconds;
}

function normalizeIso(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  const text = String(value || "").trim();
  return text || new Date().toISOString();
}

function subtractSeconds(isoValue, seconds) {
  const timestamp = Date.parse(isoValue);
  const baseTimestamp = Number.isFinite(timestamp) ? timestamp : Date.now();

  return new Date(baseTimestamp - (seconds * 1000)).toISOString();
}

export {
  ACTIVE_JOB_STATUSES,
  claimAvailableJobs,
  formatJobWorkerStatus,
  getJobWorkerStatus,
  resetJobWorkerStatusForTests,
  runJobWorkerOnce,
  startJobWorker,
  stopJobWorker,
};
