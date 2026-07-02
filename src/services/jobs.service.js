import { boundedPaginationEnvelope, normalizeBoundedPagination } from "../core/bounded-pagination.js";
import { db } from "../core/database.js";
import { permissionsService } from "./permissions.service.js";

const REQUIRED_PERMISSION = "workspace_settings.manage";
const RECENT_FAILURE_DEFAULT_PAGE_SIZE = 10;
const RECENT_FAILURE_MAX_PAGE_SIZE = 50;

async function readAdminReadout(session, query = {}) {
  await permissionsService.assertCan(session, REQUIRED_PERMISSION, {
    operation: "read",
    workspace_id: session.workspace_id,
  });

  const pagination = normalizeBoundedPagination(query, {
    defaultLimit: RECENT_FAILURE_DEFAULT_PAGE_SIZE,
    maxLimit: RECENT_FAILURE_MAX_PAGE_SIZE,
  });
  const [countRows, failureRows, totalRow] = await Promise.all([
    readStatusCounts(session.workspace_id),
    readRecentFailures(session.workspace_id, pagination),
    countRecentFailures(session.workspace_id),
  ]);
  const total = Number(totalRow?.total || 0);

  return {
    counts: shapeStatusCounts(countRows),
    recentFailures: {
      items: failureRows.map(shapeFailureSummary),
      pagination: boundedPaginationEnvelope({
        ...pagination,
        hasMore: pagination.offset + failureRows.length < total,
        returned: failureRows.length,
        total,
      }),
    },
  };
}

function readStatusCounts(workspaceId) {
  return db.query(`
SELECT status, COUNT(*) AS count
FROM jobs
WHERE workspace_id = :workspaceId
  AND status IN ('pending', 'running', 'failed', 'dead')
GROUP BY status;
`, { workspaceId });
}

function readRecentFailures(workspaceId, pagination) {
  return db.query(`
SELECT
  job_id,
  job_type,
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
  AND status IN ('failed', 'dead')
  AND last_error IS NOT NULL
ORDER BY updated_at DESC, job_id DESC
LIMIT :limit OFFSET :offset;
`, {
    limit: pagination.limit,
    offset: pagination.offset,
    workspaceId,
  });
}

function countRecentFailures(workspaceId) {
  return db.get(`
SELECT COUNT(*) AS total
FROM jobs
WHERE workspace_id = :workspaceId
  AND status IN ('failed', 'dead')
  AND last_error IS NOT NULL;
`, { workspaceId });
}

function shapeStatusCounts(rows) {
  const counts = {
    dead: 0,
    failed: 0,
    pending: 0,
    running: 0,
  };

  for (const row of rows) {
    if (Object.hasOwn(counts, row.status)) {
      counts[row.status] = Number(row.count || 0);
    }
  }

  return counts;
}

function shapeFailureSummary(row) {
  return {
    availableAt: row.available_at || null,
    completedAt: row.completed_at || null,
    createdAt: row.created_at || null,
    deadAt: row.dead_at || null,
    jobId: row.job_id,
    jobType: row.job_type,
    lastError: safeText(row.last_error),
    lockedAt: row.locked_at || null,
    lockedBy: row.locked_by || null,
    attemptCount: Number(row.attempt_count || 0),
    maxAttempts: Number(row.max_attempts || 0),
    priority: Number(row.priority || 0),
    status: row.status,
    updatedAt: row.updated_at || null,
  };
}

function safeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export const jobsService = {
  readAdminReadout,
};
