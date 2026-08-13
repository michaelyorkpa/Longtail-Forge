import { enqueueJob } from "../core/jobs/job-queue.js";
import { getJobHandler, registerJobHandler } from "../core/jobs/index.js";
import { db } from "../core/database.js";
import { searchIndexRebuildService } from "./search-index-rebuild.service.js";
import { searchService } from "./search.service.js";

const SEARCH_INDEX_JOB_TYPE = "search.index";
const DEFAULT_SEARCH_JOB_PRIORITY = 10;
const DEFAULT_REBUILD_JOB_PRIORITY = 1;
const OPERATION_REINDEX = "reindex";
const OPERATION_REMOVE = "remove";
const OPERATION_REBUILD = "rebuild";
let searchIndexJobHandlersRegistered = false;

/** @typedef {{moduleId: string, recordId: string, recordType: string, workspaceId: string}} SearchJobReference */
/** @typedef {{moduleId?: unknown, module_id?: unknown, recordId?: unknown, record_id?: unknown, recordType?: unknown, record_type?: unknown, workspaceId?: unknown, workspace_id?: unknown, reason?: unknown, [key: string]: unknown}} SearchJobContext */
/** @typedef {{maxAttempts?: number, max_attempts?: number, priority?: number}} SearchJobOptions */
/** @typedef {SearchJobOptions & {app?: boolean, dryRun?: boolean, dry_run?: boolean, moduleId?: unknown, module_id?: unknown, requestedByUserId?: unknown, requested_by_user_id?: unknown, scope?: unknown, source?: unknown, workspaceId?: unknown, workspace_id?: unknown}} SearchRebuildOptions */
/** @typedef {SearchRebuildOptions & {operation?: unknown, recordReference?: SearchJobContext}} SearchJobPayload */
/** @typedef {{code?: string, message?: string}} SearchJobError */
/** @typedef {{ok?: boolean, errors?: SearchJobError[], [key: string]: unknown}} SearchJobResult */
/** @typedef {import("../types/search-rebuild-contracts.js").SearchRebuildSummary} SearchRebuildSummary */

/** @param {{replace?: boolean}} [options] */
function registerSearchIndexJobHandlers(options = {}) {
  if (searchIndexJobHandlersRegistered && !options.replace && getJobHandler(SEARCH_INDEX_JOB_TYPE)) {
    return;
  }

  registerJobHandler(SEARCH_INDEX_JOB_TYPE, handleSearchIndexJob, {
    publicDemoCapability: "records.workspace",
    replace: true,
  });
  searchIndexJobHandlersRegistered = true;
}

/** @param {SearchJobContext} [context] @param {SearchJobOptions} [options] */
async function queueSearchIndexRecord(context = {}, options = {}) {
  const reference = normalizeRecordReference(context);
  const enqueued = await enqueueJob({
    workspaceId: reference.workspaceId,
    jobType: SEARCH_INDEX_JOB_TYPE,
    dedupeKey: dedupeKey(OPERATION_REINDEX, reference),
    priority: options.priority ?? DEFAULT_SEARCH_JOB_PRIORITY,
    maxAttempts: options.maxAttempts || options.max_attempts || 3,
    payload: {
      operation: OPERATION_REINDEX,
      reason: context.reason || "",
      recordReference: {
        ...context,
        ...reference,
      },
    },
  });

  return shapeQueueResult(enqueued, OPERATION_REINDEX, reference);
}

/** @param {SearchJobContext} [context] @param {SearchJobOptions} [options] */
async function queueSearchIndexRemoval(context = {}, options = {}) {
  const reference = normalizeRecordReference(context);
  const enqueued = await enqueueJob({
    workspaceId: reference.workspaceId,
    jobType: SEARCH_INDEX_JOB_TYPE,
    dedupeKey: dedupeKey(OPERATION_REMOVE, reference),
    priority: options.priority ?? DEFAULT_SEARCH_JOB_PRIORITY,
    maxAttempts: options.maxAttempts || options.max_attempts || 3,
    payload: {
      operation: OPERATION_REMOVE,
      reason: context.reason || "",
      recordReference: {
        ...context,
        ...reference,
      },
    },
  });

  return shapeQueueResult(enqueued, OPERATION_REMOVE, reference);
}

/** @param {SearchRebuildOptions} [options] */
async function queueSearchIndexRebuild(options = {}) {
  const scope = normalizeRebuildScope(options.scope || (options.app === true ? "app" : options.workspaceId || options.workspace_id ? "workspace" : "app"));
  const workspaceId = scope === "app"
    ? normalizeText(options.workspaceId || options.workspace_id) || await readFirstWorkspaceId()
    : normalizeRequiredText(options.workspaceId || options.workspace_id, "Search rebuild job requires a workspace.");
  const moduleId = normalizeText(options.moduleId || options.module_id);

  if (!workspaceId) {
    return {
      ok: true,
      operation: "queue_rebuild",
      queued: false,
      skipped: true,
      reason: "no_workspace",
    };
  }

  const enqueued = await enqueueJob({
    workspaceId,
    jobType: SEARCH_INDEX_JOB_TYPE,
    dedupeKey: rebuildDedupeKey({ moduleId, scope, workspaceId }),
    priority: options.priority ?? DEFAULT_REBUILD_JOB_PRIORITY,
    maxAttempts: options.maxAttempts || options.max_attempts || 3,
    payload: {
      dryRun: options.dryRun === true || options.dry_run === true,
      moduleId,
      operation: OPERATION_REBUILD,
      requestedByUserId: normalizeText(options.requestedByUserId || options.requested_by_user_id),
      scope,
      source: normalizeText(options.source) || "manual",
      workspaceId,
    },
  });

  return {
    ...shapeQueueResult(enqueued, OPERATION_REBUILD, {
      moduleId,
      recordId: "",
      recordType: "",
      workspaceId,
    }),
    scope,
    moduleId,
  };
}

/** @param {SearchRebuildOptions} [options] */
async function queueSearchIndexRebuildIfEmpty(options = {}) {
  const row = await db.get("SELECT COUNT(*) AS count FROM search_index;");
  const indexedCount = Number(row?.count || 0);

  if (indexedCount > 0) {
    return {
      ok: true,
      operation: "queue_rebuild_if_empty",
      queued: false,
      skipped: true,
      reason: "search_index_not_empty",
      indexedCount,
    };
  }

  const result = await queueSearchIndexRebuild({
    ...options,
    scope: "app",
    source: options.source || "startup-empty-index",
  });

  return {
    ...result,
    operation: "queue_rebuild_if_empty",
    indexedCount,
  };
}

/** @param {{payload?: SearchJobPayload}} input */
async function handleSearchIndexJob({ payload = {} }) {
  const operation = normalizeText(payload.operation);

  if (operation === OPERATION_REINDEX) {
    return assertSearchResult(await searchService.reindexSearchRecord(payload.recordReference || payload, {
      throwOnError: true,
    }));
  }

  if (operation === OPERATION_REMOVE) {
    return assertSearchResult(await searchService.removeSearchDocument(payload.recordReference || payload, {
      throwOnError: true,
    }));
  }

  if (operation === OPERATION_REBUILD) {
    return assertRebuildSummary(await runRebuild(payload));
  }

  throw new Error(`Unknown search index job operation "${operation}".`);
}

/** @param {SearchJobPayload} [payload] */
async function runRebuild(payload = {}) {
  const scope = normalizeRebuildScope(payload.scope);
  const moduleId = normalizeText(payload.moduleId || payload.module_id);
  const dryRun = payload.dryRun === true || payload.dry_run === true;
  const source = normalizeText(payload.source) || "job";

  if (scope === "app") {
    return searchIndexRebuildService.rebuildApp({
      audit: false,
      dryRun,
      moduleId,
      source,
    });
  }

  const workspaceId = normalizeRequiredText(payload.workspaceId || payload.workspace_id, "Workspace rebuild job requires a workspace.");
  if (moduleId) {
    return searchIndexRebuildService.rebuildModule({
      audit: false,
      dryRun,
      moduleId,
      source,
      workspaceId,
    });
  }

  return searchIndexRebuildService.rebuildWorkspace({
    audit: false,
    dryRun,
    source,
    workspaceId,
  });
}

/** @param {SearchJobResult} [result] */
function assertSearchResult(result = {}) {
  if (result.ok === false) {
    throw new Error(formatSearchErrors(result.errors));
  }

  return result;
}

/** @param {SearchRebuildSummary} summary */
function assertRebuildSummary(summary) {
  if (Number(summary.counts?.failed || 0) > 0) {
    const errors = (summary.targets || [])
      .flatMap((target) => target.errors || [])
      .map((error) => error.message || error.code || "Search rebuild failed.")
      .filter(Boolean);

    throw new Error(errors[0] || "Search rebuild failed.");
  }

  return summary;
}

/** @param {Awaited<ReturnType<typeof enqueueJob>>} enqueued @param {string} operation @param {SearchJobReference} reference */
function shapeQueueResult(enqueued, operation, reference) {
  const action = enqueued?.action || "";
  return {
    ok: true,
    operation: `queue_${operation}`,
    queued: action === "inserted" || action === "updated",
    deduped: action === "deduped_running",
    queueAction: action,
    job: enqueued?.job || null,
    jobId: enqueued?.job?.jobId || "",
    workspaceId: reference.workspaceId,
    moduleId: reference.moduleId,
    recordType: reference.recordType,
    recordId: reference.recordId,
    errors: [],
  };
}

/** @param {SearchJobContext} [context] @returns {SearchJobReference} */
function normalizeRecordReference(context = {}) {
  return {
    workspaceId: normalizeRequiredText(context.workspaceId || context.workspace_id, "Search index job requires a workspace."),
    moduleId: normalizeRequiredText(context.moduleId || context.module_id, "Search index job requires a module."),
    recordType: normalizeRequiredText(context.recordType || context.record_type, "Search index job requires a record type."),
    recordId: normalizeRequiredText(context.recordId || context.record_id, "Search index job requires a record ID."),
  };
}

/** @param {string} operation @param {SearchJobReference} reference */
function dedupeKey(operation, reference) {
  return [
    "search",
    operation,
    reference.workspaceId,
    reference.moduleId,
    reference.recordType,
    reference.recordId,
  ].join(":");
}

/** @param {{moduleId: string, scope: string, workspaceId: string}} input */
function rebuildDedupeKey({ moduleId, scope, workspaceId }) {
  return [
    "search",
    "rebuild",
    scope,
    workspaceId || "app",
    moduleId || "all",
  ].join(":");
}

async function readFirstWorkspaceId() {
  const row = await db.get(`
SELECT workspace_id
FROM workspaces
ORDER BY created_at ASC, workspace_id ASC
LIMIT 1;
`);

  return String(row?.workspace_id || "");
}

/** @param {unknown} value */
function normalizeRebuildScope(value) {
  return normalizeText(value) === "app" ? "app" : "workspace";
}

/** @param {unknown} value @param {string} message */
function normalizeRequiredText(value, message) {
  const text = normalizeText(value);

  if (!text) {
    throw new Error(message);
  }

  return text;
}

/** @param {unknown} value */
function normalizeText(value) {
  return String(value || "").trim();
}

/** @param {SearchJobError[]} [errors] */
function formatSearchErrors(errors = []) {
  return errors
    .map((error) => error.message || error.code || "Search indexing failed.")
    .filter(Boolean)
    .join("; ") || "Search indexing failed.";
}

export {
  SEARCH_INDEX_JOB_TYPE,
  handleSearchIndexJob,
  queueSearchIndexRecord,
  queueSearchIndexRebuild,
  queueSearchIndexRebuildIfEmpty,
  queueSearchIndexRemoval,
  registerSearchIndexJobHandlers,
};
