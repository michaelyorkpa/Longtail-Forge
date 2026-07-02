import { randomUUID } from "node:crypto";
import { db } from "../database.js";

const DEFAULT_JOB_PRIORITY = 0;
const DEFAULT_MAX_ATTEMPTS = 3;
const ACTIVE_DEDUPE_STATUSES = Object.freeze(["pending", "running", "failed"]);

async function enqueueJob(options = {}) {
  const now = new Date().toISOString();
  const workspaceId = normalizeRequiredText(options.workspaceId || options.workspace_id, "Job workspace is required.");
  const jobType = normalizeRequiredText(options.jobType || options.job_type, "Job type is required.");
  const dedupeKey = normalizeNullableText(options.dedupeKey || options.dedupe_key);
  const payloadJson = JSON.stringify(options.payload || {});
  const priority = normalizeInteger(options.priority, DEFAULT_JOB_PRIORITY);
  const maxAttempts = Math.max(1, normalizeInteger(options.maxAttempts || options.max_attempts, DEFAULT_MAX_ATTEMPTS));
  const availableAt = normalizeNullableText(options.availableAt || options.available_at) || now;

  return db.transaction(async (transaction) => {
    if (dedupeKey) {
      const updatedRows = await transaction.query(`
UPDATE jobs
SET
  status = 'pending',
  payload_json = :payloadJson,
  priority = :priority,
  available_at = :availableAt,
  max_attempts = :maxAttempts,
  locked_at = NULL,
  locked_by = NULL,
  last_error = NULL,
  updated_at = :now
WHERE workspace_id = :workspaceId
  AND job_type = :jobType
  AND dedupe_key = :dedupeKey
  AND status IN ('pending', 'failed')
RETURNING
  job_id,
  workspace_id,
  job_type,
  dedupe_key,
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
        availableAt,
        dedupeKey,
        jobType,
        maxAttempts,
        now,
        payloadJson,
        priority,
        workspaceId,
      });

      if (updatedRows.length > 0) {
        return {
          action: "updated",
          job: shapeJob(updatedRows[0]),
        };
      }

      const runningJob = await transaction.get(`
SELECT
  job_id,
  workspace_id,
  job_type,
  dedupe_key,
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
  dead_at
FROM jobs
WHERE workspace_id = :workspaceId
  AND job_type = :jobType
  AND dedupe_key = :dedupeKey
  AND status = 'running'
LIMIT 1;
`, {
        dedupeKey,
        jobType,
        workspaceId,
      });

      if (runningJob) {
        return {
          action: "deduped_running",
          job: shapeJob(runningJob),
        };
      }
    }

    const insertedRows = await transaction.query(`
INSERT INTO jobs (
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
  dead_at
)
VALUES (
  :jobId,
  :workspaceId,
  :jobType,
  :dedupeKey,
  :payloadJson,
  'pending',
  :priority,
  :availableAt,
  0,
  :maxAttempts,
  NULL,
  NULL,
  NULL,
  :now,
  :now,
  NULL,
  NULL
)
RETURNING
  job_id,
  workspace_id,
  job_type,
  dedupe_key,
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
      availableAt,
      dedupeKey,
      jobId: options.jobId || options.job_id || randomUUID(),
      jobType,
      maxAttempts,
      now,
      payloadJson,
      priority,
      workspaceId,
    });

    return {
      action: "inserted",
      job: shapeJob(insertedRows[0]),
    };
  });
}

function shapeJob(row = {}) {
  return {
    availableAt: row.available_at || null,
    completedAt: row.completed_at || null,
    createdAt: row.created_at || null,
    deadAt: row.dead_at || null,
    dedupeKey: row.dedupe_key || null,
    jobId: row.job_id,
    jobType: row.job_type,
    lastError: row.last_error || null,
    lockedAt: row.locked_at || null,
    lockedBy: row.locked_by || null,
    attemptCount: Number(row.attempt_count || 0),
    maxAttempts: Number(row.max_attempts || 0),
    priority: Number(row.priority || 0),
    status: row.status,
    updatedAt: row.updated_at || null,
    workspaceId: row.workspace_id,
  };
}

function normalizeRequiredText(value, message) {
  const text = normalizeNullableText(value);

  if (!text) {
    throw new Error(message);
  }

  return text;
}

function normalizeNullableText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function normalizeInteger(value, fallback) {
  const number = Number(value);

  return Number.isInteger(number) ? number : fallback;
}

export {
  ACTIVE_DEDUPE_STATUSES,
  enqueueJob,
};
