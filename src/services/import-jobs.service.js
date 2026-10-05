import { enqueueJob } from "../core/jobs/job-queue.js";
import { getJobHandler, registerJobHandler } from "../core/jobs/index.js";

const FUTURE_IMPORT_JOB_TYPE = "import.future";
const FUTURE_IMPORT_JOB_PRIORITY = 1;
let futureImportJobHandlersRegistered = false;

/** @typedef {{ replace?: boolean }} FutureImportRegistrationOptions */
/** @typedef {{ workspaceId?: unknown, workspace_id?: unknown, source?: unknown, requestedByUserId?: unknown, requested_by_user_id?: unknown }} FutureImportContext */
/** @typedef {{ workspaceId?: unknown, workspace_id?: unknown, source?: unknown, dedupeKey?: unknown, dedupe_key?: unknown, maxAttempts?: unknown, max_attempts?: unknown, priority?: number }} FutureImportOptions */

/** @param {FutureImportRegistrationOptions} [options] */
function registerFutureImportJobHandlers(options = {}) {
  if (futureImportJobHandlersRegistered && !options.replace && getJobHandler(FUTURE_IMPORT_JOB_TYPE)) {
    return;
  }

  registerJobHandler(FUTURE_IMPORT_JOB_TYPE, handleFutureImportJob, {
    publicDemoCapability: "imports.workspace",
    replace: true,
  });
  futureImportJobHandlersRegistered = true;
}

/** @param {FutureImportContext} [context] @param {FutureImportOptions} [options] */
async function queueFutureImportJob(context = {}, options = {}) {
  const workspaceId = normalizeRequiredText(context.workspaceId || context.workspace_id || options.workspaceId || options.workspace_id, "Future import job requires a workspace.");
  const source = normalizeText(context.source || options.source) || "reserved";
  const enqueued = await enqueueJob({
    dedupeKey: normalizeText(options.dedupeKey || options.dedupe_key) || `import:future:${workspaceId}:${source}`,
    jobType: FUTURE_IMPORT_JOB_TYPE,
    maxAttempts: normalizePositiveInteger(options.maxAttempts || options.max_attempts, 1),
    priority: options.priority ?? FUTURE_IMPORT_JOB_PRIORITY,
    workspaceId,
    payload: {
      operation: "reserved_import",
      requestedByUserId: normalizeText(context.requestedByUserId || context.requested_by_user_id),
      source,
      workspaceId,
    },
  });

  return {
    ok: true,
    operation: "queue_future_import",
    queued: enqueued?.action === "inserted" || enqueued?.action === "updated",
    deduped: enqueued?.action === "deduped_running",
    queueAction: enqueued?.action || "",
    job: enqueued?.job || null,
    jobId: enqueued?.job?.jobId || "",
    workspaceId,
  };
}

/** @param {import("../types/framework-contracts.js").JobHandlerContext<"import.future">} context */
async function handleFutureImportJob({ payload = {} }) {
  const operation = normalizeText(payload.operation || "reserved_import");

  if (operation !== "reserved_import") {
    throw new Error(`Unknown future import job operation "${operation}".`);
  }

  return {
    reserved: true,
    skipped: true,
    reason: "import_producer_not_implemented",
    source: normalizeText(payload.source) || "reserved",
    workspaceId: normalizeText(payload.workspaceId || payload.workspace_id),
  };
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

/** @param {unknown} value @param {number} fallback */
function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export {
  FUTURE_IMPORT_JOB_TYPE,
  handleFutureImportJob,
  queueFutureImportJob,
  registerFutureImportJobHandlers,
};
