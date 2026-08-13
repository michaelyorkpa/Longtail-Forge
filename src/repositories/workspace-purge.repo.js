// @ts-check

import { db } from "../core/database.js";
import { accountExportRecoveryRepository } from "./account-export-recovery.repo.js";

/** @typedef {import("../types/database-contracts.js").DatabaseParams} DatabaseParams */
/** @typedef {import("../types/database-contracts.js").DatabaseRow} DatabaseRow */
/** @typedef {import("../types/database-contracts.js").TransactionClient} TransactionClient */
/** @typedef {DatabaseRow & { status: string, purge_started_at: string | null, attempt_count: unknown }} PurgeFenceRow */
/** @typedef {DatabaseRow & { workspace_id: string, requested_at: string, purge_after: string, status: string, purge_started_at: string | null, purge_token: string | null, workspace_name: string }} PurgeLifecycleRow */
/** @typedef {DatabaseRow & { status: string, purge_token: string | null }} PurgeLifecycleFenceRow */
/** @typedef {DatabaseRow & { user_id: string, home_workspace_id: string | null, active_workspace_id: string | null }} PurgeAffectedUserRow */
/** @typedef {DatabaseRow & { workspace_id: string }} PurgeFallbackWorkspaceRow */
/** @typedef {DatabaseRow & { name: string }} DatabaseTableNameRow */
/** @typedef {DatabaseRow & { name: string }} DatabaseColumnRow */
/** @typedef {DatabaseRow & { count: unknown }} PurgeCountRow */
/** @typedef {DatabaseRow & { status: string, purged_at: string | null, attempt_count: unknown, file_object_count: unknown, file_object_bytes: unknown, database_row_count: unknown }} WorkspacePurgeTombstone */
/** @typedef {{ workspaceId: string, workspaceFingerprint: string, now: string, purgeJobId: string, purgeToken: string, purgeTombstoneId: string }} PurgeFenceInput */
/** @typedef {{ workspaceId: string, workspaceFingerprint: string, now: string, purgeToken: string, prepareArtifacts: (transaction: TransactionClient) => Promise<{ fileObjectBytes: number, fileObjectCount: number }> }} PurgeFinalizeInput */

/** @param {string} workspaceFingerprint @returns {Promise<WorkspacePurgeTombstone | null>} */
async function readTombstone(workspaceFingerprint) {
  return /** @type {Promise<WorkspacePurgeTombstone | null>} */ (db.get(`
SELECT
  purge_tombstone_id,
  workspace_fingerprint,
  status,
  requested_at,
  purge_started_at,
  purged_at,
  attempt_count,
  file_object_count,
  file_object_bytes,
  database_row_count,
  last_failure_class,
  created_at,
  updated_at
FROM workspace_purge_tombstones
WHERE workspace_fingerprint = :workspaceFingerprint
LIMIT 1;
  `, { workspaceFingerprint }));
}

/** @param {PurgeFenceInput} value */
async function beginFence(value) {
  return db.transaction(async (transaction) => {
    const tombstone = /** @type {PurgeFenceRow | null} */ (await transaction.get(`
SELECT status, purge_started_at, attempt_count
FROM workspace_purge_tombstones
WHERE workspace_fingerprint = :workspaceFingerprint
LIMIT 1;
`, { workspaceFingerprint: value.workspaceFingerprint }));
    if (tombstone?.status === "complete") {
      return { alreadyComplete: true };
    }

    const lifecycle = /** @type {PurgeLifecycleRow | null} */ (await transaction.get(`
SELECT
  workspace_deletion_lifecycle.workspace_id,
  workspace_deletion_lifecycle.requested_at,
  workspace_deletion_lifecycle.purge_after,
  workspace_deletion_lifecycle.status,
  workspace_deletion_lifecycle.purge_started_at,
  workspace_deletion_lifecycle.purge_token,
  workspaces.name AS workspace_name
FROM workspace_deletion_lifecycle
INNER JOIN workspaces ON workspaces.workspace_id = workspace_deletion_lifecycle.workspace_id
WHERE workspace_deletion_lifecycle.workspace_id = :workspaceId
LIMIT 1;
`, { workspaceId: value.workspaceId }));
    if (!lifecycle) return { missingLifecycle: true };
    if (new Date(value.now).getTime() < new Date(lifecycle.purge_after).getTime()) {
      return { purgeAfter: lifecycle.purge_after, tooEarly: true };
    }

    const purgeStartedAt = lifecycle.purge_started_at || value.now;
    const purgeToken = lifecycle.purge_token || value.purgeToken;
    await transaction.run(`
UPDATE workspace_deletion_lifecycle
SET status = 'purging',
    purge_started_at = :purgeStartedAt,
    purge_token = :purgeToken
WHERE workspace_id = :workspaceId;
`, { purgeStartedAt, purgeToken, workspaceId: value.workspaceId });
    await transaction.run(`
UPDATE workspaces
SET status = 'purging',
    updated_at = :now
WHERE workspace_id = :workspaceId;
`, { now: value.now, workspaceId: value.workspaceId });

    if (tombstone) {
      await transaction.run(`
UPDATE workspace_purge_tombstones
SET status = 'in_progress',
    attempt_count = attempt_count + 1,
    last_failure_class = NULL,
    updated_at = :now
WHERE workspace_fingerprint = :workspaceFingerprint;
`, { now: value.now, workspaceFingerprint: value.workspaceFingerprint });
    } else {
      await transaction.run(`
INSERT INTO workspace_purge_tombstones (
  purge_tombstone_id,
  workspace_fingerprint,
  status,
  requested_at,
  purge_started_at,
  purged_at,
  attempt_count,
  file_object_count,
  file_object_bytes,
  database_row_count,
  last_failure_class,
  created_at,
  updated_at
)
VALUES (
  :purgeTombstoneId,
  :workspaceFingerprint,
  'in_progress',
  :requestedAt,
  :purgeStartedAt,
  NULL,
  1,
  0,
  0,
  0,
  NULL,
  :now,
  :now
);
`, {
        now: value.now,
        purgeStartedAt,
        purgeTombstoneId: value.purgeTombstoneId,
        requestedAt: lifecycle.requested_at,
        workspaceFingerprint: value.workspaceFingerprint,
      });
    }

    await transaction.run(`
DELETE FROM sessions
WHERE home_workspace_id = :workspaceId
   OR active_workspace_id = :workspaceId;
`, { workspaceId: value.workspaceId });
    const runningWorkspaceJobs = await countRows(transaction, `
SELECT COUNT(1) AS count
FROM jobs
WHERE workspace_id = :workspaceId
  AND job_id <> :purgeJobId
  AND status = 'running';
`, { purgeJobId: value.purgeJobId, workspaceId: value.workspaceId });
    await transaction.run(`
DELETE FROM jobs
WHERE workspace_id = :workspaceId
  AND job_id <> :purgeJobId
  AND status <> 'running';
`, { purgeJobId: value.purgeJobId, workspaceId: value.workspaceId });

    return {
      alreadyComplete: false,
      purgeStartedAt,
      purgeToken,
      requestedAt: lifecycle.requested_at,
      runningWorkspaceJobs,
      workspaceName: lifecycle.workspace_name,
    };
  });
}

/** @param {string} workspaceFingerprint @param {string} failureClass @param {string} now @returns {Promise<void>} */
async function markFailure(workspaceFingerprint, failureClass, now) {
  await db.run(`
UPDATE workspace_purge_tombstones
SET last_failure_class = :failureClass,
    updated_at = :now
WHERE workspace_fingerprint = :workspaceFingerprint
  AND status = 'in_progress';
`, { failureClass, now, workspaceFingerprint });
}

/** @param {PurgeFinalizeInput} value */
async function finalize(value) {
  return db.transaction(async (transaction) => {
    const tombstone = /** @type {PurgeFenceRow | null} */ (await transaction.get(`
SELECT status
FROM workspace_purge_tombstones
WHERE workspace_fingerprint = :workspaceFingerprint
LIMIT 1;
`, { workspaceFingerprint: value.workspaceFingerprint }));
    if (tombstone?.status === "complete") return { alreadyComplete: true };

    const lifecycle = /** @type {PurgeLifecycleFenceRow | null} */ (await transaction.get(`
SELECT status, purge_token
FROM workspace_deletion_lifecycle
WHERE workspace_id = :workspaceId
LIMIT 1;
`, { workspaceId: value.workspaceId }));
    if (!lifecycle || lifecycle.status !== "purging" || lifecycle.purge_token !== value.purgeToken) {
      throw new Error("Workspace purge fence is unavailable or no longer owned by this purge.");
    }

    await transaction.run(transaction.dialect.introspection.deferForeignKeys());
    const artifacts = await value.prepareArtifacts(transaction);
    await accountExportRecoveryRepository.prepareWorkspacePurge(value.workspaceId, transaction);
    const affectedUsers = /** @type {PurgeAffectedUserRow[]} */ (await transaction.query(`
SELECT user_id, home_workspace_id, active_workspace_id
FROM users
WHERE home_workspace_id = :workspaceId
   OR active_workspace_id = :workspaceId
ORDER BY user_id;
`, { workspaceId: value.workspaceId }));
    for (const user of affectedUsers) {
      const fallback = /** @type {PurgeFallbackWorkspaceRow | null} */ (await transaction.get(`
SELECT user_workspaces.workspace_id
FROM user_workspaces
INNER JOIN workspaces ON workspaces.workspace_id = user_workspaces.workspace_id
WHERE user_workspaces.user_id = :userId
  AND user_workspaces.workspace_id <> :workspaceId
  AND user_workspaces.status = 'active'
  AND lower(workspaces.status) = 'active'
ORDER BY user_workspaces.created_at, user_workspaces.workspace_id
LIMIT 1;
`, { userId: user.user_id, workspaceId: value.workspaceId }));
      await transaction.run(`
UPDATE users
SET home_workspace_id = CASE
      WHEN home_workspace_id = :workspaceId THEN :fallbackWorkspaceId
      ELSE home_workspace_id
    END,
    active_workspace_id = CASE
      WHEN active_workspace_id = :workspaceId THEN :fallbackWorkspaceId
      ELSE active_workspace_id
    END
WHERE user_id = :userId;
`, {
        fallbackWorkspaceId: fallback?.workspace_id || null,
        userId: user.user_id,
        workspaceId: value.workspaceId,
      });
    }

    let databaseRowCount = await countRows(transaction, `
SELECT COUNT(1) AS count
FROM api_key_scopes
WHERE api_key_id IN (
  SELECT api_key_id FROM api_keys WHERE workspace_id = :workspaceId
);
`, { workspaceId: value.workspaceId });
    await transaction.run(`
DELETE FROM api_key_scopes
WHERE api_key_id IN (
  SELECT api_key_id FROM api_keys WHERE workspace_id = :workspaceId
);
`, { workspaceId: value.workspaceId });

    databaseRowCount += await countRows(transaction, `
SELECT COUNT(1) AS count
FROM sessions
WHERE home_workspace_id = :workspaceId
   OR active_workspace_id = :workspaceId;
`, { workspaceId: value.workspaceId });
    await transaction.run(`
DELETE FROM sessions
WHERE home_workspace_id = :workspaceId
   OR active_workspace_id = :workspaceId;
`, { workspaceId: value.workspaceId });

    const workspaceTables = await discoverWorkspaceTables(transaction);
    for (const tableName of workspaceTables) {
      const statements = transaction.dialect.introspection.scopedTableRows(tableName, "workspace_id");
      databaseRowCount += await countRows(transaction, statements.count, { scopeValue: value.workspaceId });
      await transaction.run(statements.delete, { scopeValue: value.workspaceId });
    }

    const workspaceCount = await countRows(transaction, `
SELECT COUNT(1) AS count
FROM workspaces
WHERE workspace_id = :workspaceId;
`, { workspaceId: value.workspaceId });
    await transaction.run(`
DELETE FROM workspaces
WHERE workspace_id = :workspaceId;
`, { workspaceId: value.workspaceId });
    databaseRowCount += workspaceCount;

    await transaction.run(`
UPDATE workspace_purge_tombstones
SET status = 'complete',
    purged_at = :now,
    file_object_count = :fileObjectCount,
    file_object_bytes = :fileObjectBytes,
    database_row_count = :databaseRowCount,
    last_failure_class = NULL,
    updated_at = :now
WHERE workspace_fingerprint = :workspaceFingerprint;
`, {
      databaseRowCount,
      fileObjectBytes: artifacts.fileObjectBytes,
      fileObjectCount: artifacts.fileObjectCount,
      now: value.now,
      workspaceFingerprint: value.workspaceFingerprint,
    });

    const foreignKeyViolations = await transaction.query(transaction.dialect.introspection.foreignKeyCheck());
    if (foreignKeyViolations.length > 0) {
      throw new Error(`Workspace purge would leave ${foreignKeyViolations.length} foreign-key violation(s).`);
    }
    return { ...artifacts, alreadyComplete: false, databaseRowCount };
  });
}

/** @param {TransactionClient} transaction @returns {Promise<string[]>} */
async function discoverWorkspaceTables(transaction) {
  const tables = /** @type {DatabaseTableNameRow[]} */ (await transaction.query(transaction.dialect.introspection.tableNames()));
  /** @type {string[]} */
  const workspaceTables = [];
  for (const { name } of tables) {
    if (name === "workspaces") continue;
    const columns = /** @type {DatabaseColumnRow[]} */ (await transaction.query(transaction.dialect.introspection.tableInfo(name)));
    if (columns.some((column) => column.name === "workspace_id")) {
      workspaceTables.push(name);
    }
  }
  return workspaceTables.sort((left, right) => {
    if (left === "search_index_fts") return -1;
    if (right === "search_index_fts") return 1;
    return left.localeCompare(right);
  });
}

/** @param {TransactionClient} transaction @param {string} sql @param {DatabaseParams} params */
async function countRows(transaction, sql, params) {
  const row = /** @type {PurgeCountRow | null} */ (await transaction.get(sql, params));
  return Number(row?.count) || 0;
}

export const workspacePurgeRepository = {
  beginFence,
  finalize,
  markFailure,
  readTombstone,
};
