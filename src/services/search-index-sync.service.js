import { searchService } from "./search.service.js";

const DEFAULT_LOGGER = console;
const LOG_PREFIX = "[search-index-sync]";

async function reindexRecord(context, options = {}) {
  const result = await searchService.reindexSearchRecord(context);
  logFailedResult(result, context, options);

  return result;
}

async function reindexRecords(records, options = {}) {
  const results = [];

  for (const record of records) {
    results.push(await reindexRecord(record, options));
  }

  return results;
}

async function removeRecord(context, options = {}) {
  const result = await searchService.removeSearchDocument(context);
  logFailedResult(result, context, options);

  return result;
}

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
