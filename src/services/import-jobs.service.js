import { enqueueJob } from "../core/jobs/job-queue.js";
import { getJobHandler, registerJobHandler } from "../core/jobs/index.js";

const FUTURE_IMPORT_JOB_TYPE = "import.future";
const FUTURE_IMPORT_JOB_PRIORITY = 1;
let futureImportJobHandlersRegistered = false;

function registerFutureImportJobHandlers(options = {}) {
  if (futureImportJobHandlersRegistered && !options.replace && getJobHandler(FUTURE_IMPORT_JOB_TYPE)) {
    return;
  }

  registerJobHandler(FUTURE_IMPORT_JOB_TYPE, handleFutureImportJob, {
    replace: true,
  });
  futureImportJobHandlersRegistered = true;
}

async function queueFutureImportJob(context = {}, options = {}) {
  const workspaceId = normalizeRequiredText(context.workspaceId || context.workspace_id || options.workspaceId || options.workspace_id, "Future import job requires a workspace.");
  const source = normalizeText(context.source || options.source) || "reserved";
  const enqueued = await enqueueJob({
    dedupeKey: options.dedupeKey || options.dedupe_key || `import:future:${workspaceId}:${source}`,
    jobType: FUTURE_IMPORT_JOB_TYPE,
    maxAttempts: options.maxAttempts || options.max_attempts || 1,
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

function normalizeRequiredText(value, message) {
  const text = normalizeText(value);

  if (!text) {
    throw new Error(message);
  }

  return text;
}

function normalizeText(value) {
  return String(value || "").trim();
}

export {
  FUTURE_IMPORT_JOB_TYPE,
  handleFutureImportJob,
  queueFutureImportJob,
  registerFutureImportJobHandlers,
};
