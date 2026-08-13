import {
  queueSearchIndexRecord,
  queueSearchIndexRemoval,
} from "./search-index-jobs.service.js";

const DEFAULT_LOGGER = console;
const LOG_PREFIX = "[search-index-sync]";

/** @typedef {{ workspaceId?: string, moduleId: string, recordType: string, recordId: string, reason?: string } & Record<string, unknown>} SearchIndexSyncContext */
/** @typedef {{ logger?: Pick<Console, "error">, priority?: number, maxAttempts?: number, max_attempts?: number, swallowErrors?: boolean }} SearchIndexSyncOptions */
/** @typedef {{ code?: string, message?: string }} SearchIndexSyncError */
/** @typedef {{ ok: boolean, operation: string, queued: boolean, errors?: SearchIndexSyncError[] } & Record<string, unknown>} SearchIndexSyncResult */

/** @param {SearchIndexSyncContext} context @param {SearchIndexSyncOptions} [options] @returns {Promise<SearchIndexSyncResult>} */
async function reindexRecord(context, options = {}) {
  const result = await safelyQueueSearchJob(() => queueSearchIndexRecord(context, options), context, "queue_reindex");
  logFailedResult(result, context, options);

  return result;
}

/** @param {SearchIndexSyncContext[]} records @param {SearchIndexSyncOptions} [options] */
async function reindexRecords(records, options = {}) {
  /** @type {SearchIndexSyncResult[]} */
  const results = [];

  for (const record of records) {
    results.push(await reindexRecord(record, options));
  }

  return results;
}

/** @param {SearchIndexSyncContext} context @param {SearchIndexSyncOptions} [options] @returns {Promise<SearchIndexSyncResult>} */
async function removeRecord(context, options = {}) {
  const result = await safelyQueueSearchJob(() => queueSearchIndexRemoval(context, options), context, "queue_remove");
  logFailedResult(result, context, options);

  return result;
}

/** @param {() => Promise<SearchIndexSyncResult>} queueOperation @param {SearchIndexSyncContext} context @param {string} operation @returns {Promise<SearchIndexSyncResult>} */
async function safelyQueueSearchJob(queueOperation, context, operation) {
  try {
    return await queueOperation();
  } catch (error) {
    return {
      ok: false,
      operation,
      queued: false,
      errors: [{
        code: "search_index_queue_error",
        message: error instanceof Error ? error.message : String(error),
      }],
    };
  }
}

/** @param {SearchIndexSyncResult} result @param {SearchIndexSyncContext} context @param {SearchIndexSyncOptions} [options] */
function logFailedResult(result, context, options = {}) {
  if (result?.ok !== false) {
    return;
  }

  const logger = options.logger || DEFAULT_LOGGER;
  const errorText = (result.errors || [])
    .map((error) => `${error.code || "error"}: ${error.message || "Unknown search indexing failure."}`)
    .join("; ");

  logger.error(
    `${LOG_PREFIX} ${context.reason || "sync"} failed for ${context.moduleId}/${context.recordType}/${context.recordId}: ${errorText}`,
  );
}

export const searchIndexSyncService = {
  reindexRecord,
  reindexRecords,
  removeRecord,
};
