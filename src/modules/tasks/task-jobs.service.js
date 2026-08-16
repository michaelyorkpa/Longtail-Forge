import { enqueueJob } from "../../core/jobs/job-queue.js";
import { db } from "../../core/database.js";
import { getJobHandler, registerJobHandler } from "../../core/jobs/index.js";
import { modulesService } from "../../core/modules/modules.service.js";
import { auditService } from "../../core/audit.js";
import { searchIndexSyncService } from "../../services/search-index-sync.service.js";
import { tasksRepository } from "./tasks.repo.js";
import { taskRecurrenceService } from "./task-recurrence.service.js";
import { taskRemindersService } from "./task-reminders.service.js";

const TASKS_MODULE_ID = "tasks";
const TASK_REMINDER_JOB_TYPE = "task.reminder";
const TASK_RECURRENCE_JOB_TYPE = "task.recurrence";
const TASK_REMINDER_JOB_PRIORITY = 30;
const TASK_REMINDER_SWEEP_PRIORITY = 5;
const TASK_RECURRENCE_JOB_PRIORITY = 20;
const TASK_REMINDER_CLOCK_SKEW_MS = 2 * 60 * 1000;
const TASK_REMINDER_MAX_ATTEMPTS = 25;
const TASK_REMINDER_SCHEDULING_HORIZON_DAYS = 30;
const TASK_REMINDER_SWEEP_INTERVAL_HOURS = 12;
const TASK_REMINDER_SWEEP_BATCH_SIZE = 500;
const TASK_RECURRENCE_SWEEP_PRIORITY = 15;
const TASK_RECURRENCE_SWEEP_INTERVAL_HOURS = 12;
let taskJobHandlersRegistered = false;

/** @param {Pick<import("../../types/task-recurrence-contracts.d.ts").TaskJobOptions, "replace">} [options] */
function registerTaskJobHandlers(options = {}) {
  if (taskJobHandlersRegistered && !options.replace &&
    getJobHandler(TASK_REMINDER_JOB_TYPE) &&
    getJobHandler(TASK_RECURRENCE_JOB_TYPE)) {
    return;
  }

  registerJobHandler(TASK_REMINDER_JOB_TYPE, handleTaskReminderJob, {
    publicDemoCapability: "records.workspace",
    replace: true,
  });
  registerJobHandler(TASK_RECURRENCE_JOB_TYPE, handleTaskRecurrenceJob, {
    publicDemoCapability: "records.workspace",
    replace: true,
  });
  taskJobHandlersRegistered = true;
}

/** @param {import("../../types/task-recurrence-contracts.d.ts").TaskRecord} task @param {import("../../types/task-recurrence-contracts.d.ts").TaskJobOptions} [options] */
async function queueTaskReminderJobsForTask(task, options = {}) {
  const workspaceId = normalizeText(task?.workspace_id || options.workspaceId || options.workspace_id);
  const taskId = normalizeText(task?.task_id || options.taskId || options.task_id);

  if (!workspaceId || !taskId || !isReminderEligibleTask(task)) {
    return {
      ok: true,
      operation: "queue_task_reminders",
      queued: false,
      queuedCount: 0,
      skipped: true,
      reason: "task_not_reminder_eligible",
      taskId,
      workspaceId,
      jobs: [],
    };
  }

  const now = normalizeDate(options.now) || new Date();
  const horizonEnd = normalizeDate(options.horizonEnd || options.horizon_end) || taskReminderHorizonEnd(now, options.horizonDays || options.horizon_days);
  const pendingOccurrences = /** @type {import("../../types/task-recurrence-contracts.d.ts").ReminderOccurrence[]} */ (
    await taskRemindersService.computePendingReminderOccurrences(task, now)
  );
  const occurrences = pendingOccurrences.filter((occurrence) => reminderWithinHorizon(occurrence, horizonEnd));
  const jobs = [];

  for (const occurrence of occurrences) {
    const dedupeKey = taskReminderDedupeKey(task, occurrence);
    if (await completedJobExists(workspaceId, TASK_REMINDER_JOB_TYPE, dedupeKey)) {
      jobs.push({
        dedupeKey,
        occurrence,
        queued: false,
        skipped: true,
        reason: "already_fired",
      });
      continue;
    }

    const enqueued = await enqueueJob({
      availableAt: occurrence.reminder_at_utc,
      dedupeKey,
      jobType: TASK_REMINDER_JOB_TYPE,
      maxAttempts: options.maxAttempts || options.max_attempts || TASK_REMINDER_MAX_ATTEMPTS,
      priority: options.priority ?? TASK_REMINDER_JOB_PRIORITY,
      workspaceId,
      payload: {
        dueAtUtc: occurrence.due_at_utc,
        dueKind: occurrence.due_kind,
        offsetMinutes: occurrence.offset_minutes,
        operation: "fire_reminder",
        reason: normalizeText(options.reason) || "task.reminder.scheduled",
        reminderAtUtc: occurrence.reminder_at_utc,
        requestedByUserId: normalizeText(options.session?.user_id || options.requestedByUserId || options.requested_by_user_id),
        source: normalizeText(options.source) || "tasks-service",
        taskId,
        workspaceId,
      },
    });

    jobs.push({
      dedupeKey,
      job: enqueued?.job || null,
      jobId: enqueued?.job?.jobId || "",
      occurrence,
      queueAction: enqueued?.action || "",
      queued: enqueued?.action === "inserted" || enqueued?.action === "updated",
      skipped: false,
    });
  }

  return {
    ok: true,
    operation: "queue_task_reminders",
    queued: jobs.some((job) => job.queued),
    queuedCount: jobs.filter((job) => job.queued).length,
    skipped: false,
    taskId,
    workspaceId,
    jobs,
    horizonEnd: horizonEnd.toISOString(),
    pendingOccurrenceCount: pendingOccurrences.length,
    skippedBeyondHorizonCount: pendingOccurrences.length - occurrences.length,
  };
}

/** @param {import("../../types/task-recurrence-contracts.d.ts").TaskJobOptions} [options] */
async function queueTaskReminderSweepJobs(options = {}) {
  const workspaceIds = normalizeWorkspaceIds(options.workspaceIds || options.workspace_ids);
  const targetWorkspaceIds = workspaceIds.length > 0 ? workspaceIds : await readActiveWorkspaceIds();
  const jobs = [];

  for (const workspaceId of targetWorkspaceIds) {
    jobs.push(await queueTaskReminderSweepJob({
      ...options,
      workspaceId,
    }));
  }

  return {
    ok: true,
    operation: "queue_task_reminder_sweeps",
    queued: jobs.some((job) => job.queued),
    queuedCount: jobs.filter((job) => job.queued).length,
    skipped: targetWorkspaceIds.length === 0,
    workspaceCount: targetWorkspaceIds.length,
    jobs,
  };
}

/** @param {import("../../types/task-recurrence-contracts.d.ts").TaskJobOptions} [options] */
async function queueTaskReminderSweepJob(options = {}) {
  const workspaceId = normalizeRequiredText(options.workspaceId || options.workspace_id, "Task reminder sweep requires a workspace.");
  const availableAt = normalizeDate(options.availableAt || options.available_at) || new Date();
  const horizonDays = normalizePositiveInteger(options.horizonDays || options.horizon_days, TASK_REMINDER_SCHEDULING_HORIZON_DAYS);
  const batchSize = normalizePositiveInteger(options.batchSize || options.batch_size, TASK_REMINDER_SWEEP_BATCH_SIZE);
  const enqueued = await enqueueJob({
    availableAt: availableAt.toISOString(),
    dedupeKey: taskReminderSweepDedupeKey(workspaceId, availableAt),
    jobType: TASK_REMINDER_JOB_TYPE,
    maxAttempts: options.maxAttempts || options.max_attempts || 3,
    priority: options.priority ?? TASK_REMINDER_SWEEP_PRIORITY,
    workspaceId,
    payload: {
      batchSize,
      horizonDays,
      operation: "sweep_reminders",
      reason: normalizeText(options.reason) || "task.reminder.sweep",
      reschedule: options.reschedule === false ? false : true,
      source: normalizeText(options.source) || "task-reminder-sweep",
      workspaceId,
    },
  });

  return {
    ok: true,
    operation: "queue_task_reminder_sweep",
    queued: enqueued?.action === "inserted" || enqueued?.action === "updated",
    deduped: enqueued?.action === "deduped_running",
    queueAction: enqueued?.action || "",
    job: enqueued?.job || null,
    jobId: enqueued?.job?.jobId || "",
    workspaceId,
  };
}

/** @param {import("../../types/task-recurrence-contracts.d.ts").TaskJobOptions} [options] */
async function sweepTaskReminderJobsForWorkspace(options = {}) {
  const workspaceId = normalizeRequiredText(options.workspaceId || options.workspace_id, "Task reminder sweep requires a workspace.");
  const now = normalizeDate(options.now) || new Date();
  const horizonEnd = normalizeDate(options.horizonEnd || options.horizon_end) || taskReminderHorizonEnd(now, options.horizonDays || options.horizon_days);
  const batchSize = normalizePositiveInteger(options.batchSize || options.batch_size, TASK_REMINDER_SWEEP_BATCH_SIZE);
  let offset = 0;
  let candidateCount = 0;
  let queuedCount = 0;
  let occurrenceCount = 0;
  let skippedBeyondHorizonCount = 0;

  while (true) {
    const candidates = await tasksRepository.readReminderSchedulingCandidates(workspaceId, {
      limit: batchSize,
      offset,
    });

    if (candidates.length === 0) {
      break;
    }

    candidateCount += candidates.length;
    for (const task of candidates) {
      const result = await queueTaskReminderJobsForTask(task, {
        horizonEnd,
        now,
        reason: normalizeText(options.reason) || "task.reminder.sweep",
        source: normalizeText(options.source) || "task_reminder_sweep",
      });
      queuedCount += result.queuedCount || 0;
      occurrenceCount += result.pendingOccurrenceCount || 0;
      skippedBeyondHorizonCount += result.skippedBeyondHorizonCount || 0;
    }

    if (candidates.length < batchSize) {
      break;
    }

    offset += candidates.length;
  }

  return {
    candidateCount,
    horizonEnd: horizonEnd.toISOString(),
    occurrenceCount,
    operation: "sweep_task_reminders",
    queued: queuedCount > 0,
    queuedCount,
    skippedBeyondHorizonCount,
    workspaceId,
  };
}

/** @param {import("../../types/task-recurrence-contracts.d.ts").TaskRecurrenceJobContext} [context] @param {import("../../types/task-recurrence-contracts.d.ts").TaskJobOptions} [options] */
async function queueTaskRecurrenceGeneration(context = {}, options = {}) {
  const completedTask = context.completedTask || context.task || {};
  const workspaceId = normalizeRequiredText(
    completedTask.workspace_id || context.workspaceId || context.workspace_id,
    "Task recurrence job requires a workspace.",
  );
  const taskId = normalizeRequiredText(
    completedTask.task_id || context.taskId || context.task_id,
    "Task recurrence job requires a completed task.",
  );

  if (!completedTask.recurrence_template_id || !completedTask.recurrence_instance_date) {
    return {
      ok: true,
      operation: "queue_task_recurrence",
      queued: false,
      skipped: true,
      reason: "task_not_recurring",
      taskId,
      workspaceId,
    };
  }

  const enqueued = await enqueueJob({
    dedupeKey: taskRecurrenceDedupeKey(completedTask),
    jobType: TASK_RECURRENCE_JOB_TYPE,
    maxAttempts: options.maxAttempts || options.max_attempts || 3,
    priority: options.priority ?? TASK_RECURRENCE_JOB_PRIORITY,
    workspaceId,
    payload: {
      completedTaskId: taskId,
      operation: "generate_next_instance",
      recurrenceInstanceDate: completedTask.recurrence_instance_date,
      recurrenceTemplateId: completedTask.recurrence_template_id,
      requestedByUserId: normalizeText(context.session?.user_id || context.requestedByUserId || context.requested_by_user_id),
      source: normalizeText(options.source || context.source) || "task.completed",
      workspaceId,
    },
  });

  return {
    ok: true,
    operation: "queue_task_recurrence",
    queued: enqueued?.action === "inserted" || enqueued?.action === "updated",
    deduped: enqueued?.action === "deduped_running",
    queueAction: enqueued?.action || "",
    job: enqueued?.job || null,
    jobId: enqueued?.job?.jobId || "",
    taskId,
    workspaceId,
  };
}

/** @param {import("../../types/task-recurrence-contracts.d.ts").TaskJobHandlerInput} input */
async function handleTaskReminderJob({ payload = {} }) {
  const operation = normalizeText(payload.operation || "fire_reminder");

  if (operation === "sweep_reminders") {
    return handleTaskReminderSweepJob({ payload });
  }

  if (operation !== "fire_reminder") {
    throw new Error(`Unknown ${TASK_REMINDER_JOB_TYPE} operation "${operation}".`);
  }

  return handleTaskReminderFireJob({ payload });
}

/** @param {import("../../types/task-recurrence-contracts.d.ts").TaskJobHandlerInput} input */
async function handleTaskReminderSweepJob({ payload = {} }) {
  assertOperation(payload, "sweep_reminders", TASK_REMINDER_JOB_TYPE);
  const workspaceId = normalizeRequiredText(payload.workspaceId || payload.workspace_id, "Task reminder sweep requires a workspace.");
  const result = await sweepTaskReminderJobsForWorkspace({
    batchSize: payload.batchSize || payload.batch_size,
    horizonDays: payload.horizonDays || payload.horizon_days,
    reason: payload.reason || "task.reminder.sweep",
    source: payload.source || "task_reminder_sweep",
    workspaceId,
  });
  let nextSweep = null;

  if (payload.reschedule !== false) {
    nextSweep = await queueTaskReminderSweepJob({
      availableAt: addHours(new Date(), TASK_REMINDER_SWEEP_INTERVAL_HOURS),
      batchSize: payload.batchSize || payload.batch_size,
      horizonDays: payload.horizonDays || payload.horizon_days,
      reason: "task.reminder.sweep.next",
      source: "task_reminder_sweep",
      workspaceId,
    });
  }

  return {
    ...result,
    nextSweepAt: nextSweep?.job?.availableAt || "",
    nextSweepJobId: nextSweep?.jobId || "",
  };
}

/** @param {import("../../types/task-recurrence-contracts.d.ts").TaskJobHandlerInput} input */
async function handleTaskReminderFireJob({ payload = {} }) {
  assertOperation(payload, "fire_reminder", TASK_REMINDER_JOB_TYPE);
  const workspaceId = normalizeRequiredText(payload.workspaceId || payload.workspace_id, "Task reminder job requires a workspace.");
  const taskId = normalizeRequiredText(payload.taskId || payload.task_id, "Task reminder job requires a task.");
  const reminderAtUtc = normalizeRequiredText(payload.reminderAtUtc || payload.reminder_at_utc, "Task reminder job requires a reminder time.");
  const reminderAt = new Date(reminderAtUtc);

  if (!Number.isFinite(reminderAt.getTime())) {
    throw new Error("Task reminder job has an invalid reminder time.");
  }

  const now = new Date();
  if (reminderAt.getTime() - now.getTime() > TASK_REMINDER_CLOCK_SKEW_MS) {
    throw new Error("Task reminder job was claimed before the reminder clock-skew window.");
  }

  const task = await tasksRepository.readById(workspaceId, taskId);
  if (!task) {
    return skippedReminder("task_not_found", workspaceId, taskId);
  }

  if (!isReminderEligibleTask(task)) {
    return skippedReminder("task_not_reminder_eligible", workspaceId, taskId);
  }

  const occurrences = /** @type {import("../../types/task-recurrence-contracts.d.ts").ReminderOccurrence[]} */ (
    await taskRemindersService.computePendingReminderOccurrences(task, new Date(0))
  );
  const matchedOccurrence = occurrences.find((occurrence) => (
    occurrence.reminder_at_utc === reminderAtUtc &&
    occurrence.due_at_utc === normalizeText(payload.dueAtUtc || payload.due_at_utc) &&
    Number(occurrence.offset_minutes) === Number(payload.offsetMinutes || payload.offset_minutes)
  ));

  if (!matchedOccurrence) {
    return skippedReminder("stale_reminder_payload", workspaceId, taskId);
  }

  const session = jobSession({
    userId: "",
    workspaceId,
  });
  const eventResult = await modulesService.emitInternalEvent("task.due_soon", {
    session,
    moduleId: TASKS_MODULE_ID,
    recordType: "task",
    recordId: task.task_id,
    newValue: task,
    source: "task_reminder_job",
    metadata: {
      due_at_utc: matchedOccurrence.due_at_utc,
      due_kind: matchedOccurrence.due_kind,
      offset_minutes: matchedOccurrence.offset_minutes,
      notification_delivery_key: taskReminderDedupeKey(task, matchedOccurrence),
      recipient_user_ids: taskReminderRecipientIds(task),
      reminder_at_utc: matchedOccurrence.reminder_at_utc,
      reminder_delivery_key: taskReminderDedupeKey(task, matchedOccurrence),
      source: "task_reminder_job",
      task_id: task.task_id,
    },
  });

  return {
    event: eventResult.event?.name || "task.due_soon",
    fired: true,
    reminderAtUtc,
    taskId,
    workspaceId,
  };
}

/** @param {import("../../types/task-recurrence-contracts.d.ts").TaskJobHandlerInput} input */
async function handleTaskRecurrenceJob({ payload = {} }) {
  const operation = normalizeText(payload.operation || "generate_next_instance");

  if (operation === "sweep_recurrences") {
    return handleTaskRecurrenceSweepJob({ payload });
  }

  return handleTaskRecurrenceGenerateJob({ payload });
}

/** @param {import("../../types/task-recurrence-contracts.d.ts").TaskJobHandlerInput} input */
async function handleTaskRecurrenceGenerateJob({ payload = {} }) {
  assertOperation(payload, "generate_next_instance", TASK_RECURRENCE_JOB_TYPE);
  const workspaceId = normalizeRequiredText(payload.workspaceId || payload.workspace_id, "Task recurrence job requires a workspace.");
  const completedTaskId = normalizeRequiredText(payload.completedTaskId || payload.completed_task_id, "Task recurrence job requires a completed task.");
  const completedTask = await tasksRepository.readById(workspaceId, completedTaskId);

  if (!completedTask) {
    return {
      created: false,
      reason: "completed_task_not_found",
      skipped: true,
      taskId: completedTaskId,
      workspaceId,
    };
  }

  const session = jobSession({
    userId: normalizeText(payload.requestedByUserId || payload.requested_by_user_id || completedTask.updated_by_user_id || completedTask.created_by_user_id),
    workspaceId,
  });
  const recurrenceResult = await taskRecurrenceService.createNextInstance({
    session,
    completedTask,
    createTask: recurrenceCreateTaskAdapter(workspaceId, session, completedTask.created_by_user_id),
  });
  const createdTask = recurrenceResult?.task || null;

  if (createdTask && recurrenceResult?.wasCreated) {
    await recordRecurrenceInstanceCreated({
      completedTask,
      createdTask,
      session,
    });
    await queueTaskReminderJobsForTask(createdTask, {
      reason: "task.recurrence_instance_created",
      session,
      source: "task_recurrence_job",
    });
  }

  return {
    created: Boolean(createdTask && recurrenceResult?.wasCreated),
    createdTaskId: createdTask?.task_id || "",
    existing: Boolean(createdTask && !recurrenceResult?.wasCreated),
    taskId: completedTaskId,
    workspaceId,
  };
}

// Recurrence generation is completion-driven, so a completion that fails to enqueue a follow-up
// (or a chain that predates that trigger) leaves a template with no open instance and it stays
// dead forever. This self-rescheduling sweep is the safety net: it periodically re-anchors any
// active template that has no open instance to the next occurrence on or after today.
/** @param {import("../../types/task-recurrence-contracts.d.ts").TaskJobOptions} [options] */
async function queueTaskRecurrenceSweepJobs(options = {}) {
  const workspaceIds = normalizeWorkspaceIds(options.workspaceIds || options.workspace_ids);
  const targetWorkspaceIds = workspaceIds.length > 0 ? workspaceIds : await readActiveWorkspaceIds();
  const jobs = [];

  for (const workspaceId of targetWorkspaceIds) {
    jobs.push(await queueTaskRecurrenceSweepJob({
      ...options,
      workspaceId,
    }));
  }

  return {
    ok: true,
    operation: "queue_task_recurrence_sweeps",
    queued: jobs.some((job) => job.queued),
    queuedCount: jobs.filter((job) => job.queued).length,
    skipped: targetWorkspaceIds.length === 0,
    workspaceCount: targetWorkspaceIds.length,
    jobs,
  };
}

/** @param {import("../../types/task-recurrence-contracts.d.ts").TaskJobOptions} [options] */
async function queueTaskRecurrenceSweepJob(options = {}) {
  const workspaceId = normalizeRequiredText(options.workspaceId || options.workspace_id, "Task recurrence sweep requires a workspace.");
  const availableAt = normalizeDate(options.availableAt || options.available_at) || new Date();
  const enqueued = await enqueueJob({
    availableAt: availableAt.toISOString(),
    dedupeKey: taskRecurrenceSweepDedupeKey(workspaceId, availableAt),
    jobType: TASK_RECURRENCE_JOB_TYPE,
    maxAttempts: options.maxAttempts || options.max_attempts || 3,
    priority: options.priority ?? TASK_RECURRENCE_SWEEP_PRIORITY,
    workspaceId,
    payload: {
      operation: "sweep_recurrences",
      reason: normalizeText(options.reason) || "task.recurrence.sweep",
      reschedule: options.reschedule === false ? false : true,
      source: normalizeText(options.source) || "task-recurrence-sweep",
      workspaceId,
    },
  });

  return {
    ok: true,
    operation: "queue_task_recurrence_sweep",
    queued: enqueued?.action === "inserted" || enqueued?.action === "updated",
    deduped: enqueued?.action === "deduped_running",
    queueAction: enqueued?.action || "",
    job: enqueued?.job || null,
    jobId: enqueued?.job?.jobId || "",
    workspaceId,
  };
}

/** @param {import("../../types/task-recurrence-contracts.d.ts").TaskJobHandlerInput} input */
async function handleTaskRecurrenceSweepJob({ payload = {} }) {
  assertOperation(payload, "sweep_recurrences", TASK_RECURRENCE_JOB_TYPE);
  const workspaceId = normalizeRequiredText(payload.workspaceId || payload.workspace_id, "Task recurrence sweep requires a workspace.");
  const result = await backfillStalledRecurrencesForWorkspace({
    reason: payload.reason || "task.recurrence.sweep",
    source: payload.source || "task_recurrence_sweep",
    workspaceId,
  });
  let nextSweep = null;

  if (payload.reschedule !== false) {
    nextSweep = await queueTaskRecurrenceSweepJob({
      availableAt: addHours(new Date(), TASK_RECURRENCE_SWEEP_INTERVAL_HOURS),
      reason: "task.recurrence.sweep.next",
      source: "task_recurrence_sweep",
      workspaceId,
    });
  }

  return {
    ...result,
    nextSweepAt: nextSweep?.job?.availableAt || "",
    nextSweepJobId: nextSweep?.jobId || "",
  };
}

/** @param {import("../../types/task-recurrence-contracts.d.ts").TaskJobOptions} [options] */
async function backfillStalledRecurrencesForWorkspace(options = {}) {
  const workspaceId = normalizeRequiredText(options.workspaceId || options.workspace_id, "Task recurrence sweep requires a workspace.");
  const today = new Date().toISOString().slice(0, 10);
  const templates = await taskRecurrenceService.listActiveTemplates(workspaceId);
  let healthyCount = 0;
  let createdCount = 0;
  let endedCount = 0;

  for (const template of templates) {
    const statsRow = await tasksRepository.readRecurrenceInstanceStats(workspaceId, template.recurrence_template_id);
    const stats = {
      latestInstanceDate: String(statsRow.latestInstanceDate || ""),
      openCount: Number(statsRow.openCount || 0),
      total: Number(statsRow.total || 0),
    };

    if (stats.openCount > 0) {
      // Chain still has an open instance ahead — healthy, nothing to backfill.
      healthyCount += 1;
      continue;
    }

    const session = jobSession({
      userId: normalizeText(template.updated_by_user_id || template.created_by_user_id),
      workspaceId,
    });
    const result = await taskRecurrenceService.ensureUpcomingInstance({
      session,
      template,
      latestInstanceDate: stats.latestInstanceDate,
      hasInstances: stats.total > 0,
      today,
      createTask: recurrenceCreateTaskAdapter(workspaceId, session, template.created_by_user_id),
    });

    if (result?.wasCreated && result.task) {
      createdCount += 1;
      await recordRecurrenceInstanceCreated({
        completedTask: { task_id: "" },
        createdTask: result.task,
        session,
      });
      await queueTaskReminderJobsForTask(result.task, {
        reason: "task.recurrence_backfill",
        session,
        source: "task_recurrence_sweep",
      });
    } else if (!result) {
      // Recurrence ended (past its UNTIL date) — nothing left to generate.
      endedCount += 1;
    }
  }

  return {
    operation: "sweep_task_recurrences",
    workspaceId,
    templateCount: templates.length,
    healthyCount,
    createdCount,
    endedCount,
    queued: createdCount > 0,
  };
}

/** @param {string} workspaceId @param {import("../../types/task-recurrence-contracts.d.ts").TaskRecurrenceSession} session @param {import("../../types/task-recurrence-contracts.d.ts").NullableText} createdByUserId @returns {import("../../types/task-recurrence-contracts.d.ts").TaskRecurrenceCreateAdapter} */
function recurrenceCreateTaskAdapter(workspaceId, session, createdByUserId) {
  return {
    findExisting: async (templateId, instanceDate) =>
      tasksRepository.readByRecurrenceInstance(workspaceId, templateId, instanceDate),
    create: async (nextTask) =>
      tasksRepository.createRecurrenceInstance(workspaceId, {
        ...nextTask,
        created_by_user_id: normalizeText(createdByUserId) || session.user_id,
        updated_by_user_id: session.user_id,
        completed_at: "",
        completed_by_user_id: "",
        archived_at: "",
        archived_by_user_id: "",
      }),
  };
}

/** @param {{ completedTask: Pick<import("../../types/task-recurrence-contracts.d.ts").TaskRecord, "task_id">, createdTask: import("../../types/task-recurrence-contracts.d.ts").TaskRecord, session: import("../../types/task-recurrence-contracts.d.ts").TaskRecurrenceSession }} input */
async function recordRecurrenceInstanceCreated({ completedTask, createdTask, session }) {
  await auditService.record({
    session,
    action: "task_recurrence_instance_created",
    changeType: "create",
    recordType: "task",
    recordId: createdTask.task_id,
    recordLabel: createdTask.title,
    recordUrl: `tasks.html?task=${encodeURIComponent(createdTask.task_id || "")}`,
    previousValue: null,
    newValue: createdTask,
    metadata: {
      recurrence_template_id: createdTask.recurrence_template_id || "",
      source_task_id: completedTask.task_id,
      summary: `Created recurring task instance "${createdTask.title || "Task"}"`,
      task_id: createdTask.task_id,
    },
  });
  await modulesService.emitInternalEvent("task.created", {
    session,
    moduleId: TASKS_MODULE_ID,
    recordType: "task",
    recordId: createdTask.task_id,
    previousValue: null,
    newValue: createdTask,
    source: "task_recurrence_job",
    metadata: {
      recurrence_template_id: createdTask.recurrence_template_id || "",
      source_task_id: completedTask.task_id,
    },
  });
  await searchIndexSyncService.reindexRecord({
    workspaceId: createdTask.workspace_id,
    moduleId: TASKS_MODULE_ID,
    recordType: "task",
    recordId: createdTask.task_id,
    reason: "task.recurrence_instance_created",
  });
}

/** @param {Partial<import("../../types/task-recurrence-contracts.d.ts").TaskRecord>} [task] */
function isReminderEligibleTask(task = {}) {
  return Boolean(task.task_id && task.workspace_id && task.due_date && !["archived", "complete"].includes(String(task.status || "")));
}

/** @param {import("../../types/task-recurrence-contracts.d.ts").TaskRecord} task @param {import("../../types/task-recurrence-contracts.d.ts").ReminderOccurrence} occurrence */
function taskReminderDedupeKey(task, occurrence) {
  return [
    "task",
    "reminder",
    task.workspace_id,
    task.task_id,
    occurrence.due_at_utc,
    occurrence.reminder_at_utc,
    occurrence.offset_minutes,
  ].map(normalizeText).join(":");
}

/** @param {Partial<import("../../types/task-recurrence-contracts.d.ts").TaskRecord>} [task] */
function taskReminderRecipientIds(task = {}) {
  const assigneeIds = Array.isArray(task.assignee_ids)
    ? task.assignee_ids.map(normalizeText).filter(Boolean)
    : [];

  if (assigneeIds.length > 0) {
    return [...new Set(assigneeIds)];
  }

  const creatorId = normalizeText(task.created_by_user_id);
  return creatorId ? [creatorId] : [];
}

/** @param {string} workspaceId @param {import("../../types/task-recurrence-contracts.d.ts").DateInput} [availableAt] */
function taskReminderSweepDedupeKey(workspaceId, availableAt = new Date()) {
  const timestamp = normalizeDate(availableAt)?.getTime() || Date.now();
  const intervalMs = TASK_REMINDER_SWEEP_INTERVAL_HOURS * 60 * 60 * 1000;
  const slot = Math.floor(timestamp / intervalMs);

  return ["task", "reminder", "sweep", workspaceId, slot].map(normalizeText).join(":");
}

/** @param {Partial<import("../../types/task-recurrence-contracts.d.ts").TaskRecord>} task */
function taskRecurrenceDedupeKey(task) {
  return [
    "task",
    "recurrence",
    task.workspace_id,
    task.recurrence_template_id,
    task.task_id,
    task.recurrence_instance_date,
  ].map(normalizeText).join(":");
}

/** @param {string} workspaceId @param {import("../../types/task-recurrence-contracts.d.ts").DateInput} [availableAt] */
function taskRecurrenceSweepDedupeKey(workspaceId, availableAt = new Date()) {
  const timestamp = normalizeDate(availableAt)?.getTime() || Date.now();
  const intervalMs = TASK_RECURRENCE_SWEEP_INTERVAL_HOURS * 60 * 60 * 1000;
  const slot = Math.floor(timestamp / intervalMs);

  return ["task", "recurrence", "sweep", workspaceId, slot].map(normalizeText).join(":");
}

async function readActiveWorkspaceIds() {
  const rows = await db.query(`
SELECT workspace_id
FROM workspaces
WHERE COALESCE(status, 'active') = 'active'
ORDER BY created_at, workspace_id;
`);

  return rows.map((row) => normalizeText(row.workspace_id)).filter(Boolean);
}

/** @param {string} workspaceId @param {string} jobType @param {string} dedupeKey */
async function completedJobExists(workspaceId, jobType, dedupeKey) {
  const row = await db.get(`
SELECT job_id
FROM jobs
WHERE workspace_id = :workspaceId
  AND job_type = :jobType
  AND dedupe_key = :dedupeKey
  AND status = 'completed'
LIMIT 1;
`, {
    dedupeKey,
    jobType,
    workspaceId,
  });

  return Boolean(row?.job_id);
}

/** @param {string} reason @param {string} workspaceId @param {string} taskId */
function skippedReminder(reason, workspaceId, taskId) {
  return {
    fired: false,
    reason,
    skipped: true,
    taskId,
    workspaceId,
  };
}

/** @param {import("../../types/task-recurrence-contracts.d.ts").TaskJobPayload} payload @param {string} expectedOperation @param {string} jobType */
function assertOperation(payload, expectedOperation, jobType) {
  const operation = normalizeText(payload.operation || expectedOperation);

  if (operation !== expectedOperation) {
    throw new Error(`Unknown ${jobType} operation "${operation}".`);
  }
}

/** @param {{ userId?: string, workspaceId?: string }} [input] @returns {import("../../types/task-recurrence-contracts.d.ts").TaskRecurrenceSession} */
function jobSession({ userId = "", workspaceId = "" } = {}) {
  return {
    active_workspace_id: normalizeText(workspaceId),
    home_workspace_id: normalizeText(workspaceId),
    ip_address: "",
    password_change_required: false,
    role: "system",
    session_mode: "normal",
    timezone: "America/New_York",
    user_id: normalizeText(userId),
    username: "Job Worker",
    workspace_id: normalizeText(workspaceId),
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

/** @param {import("../../types/task-recurrence-contracts.d.ts").DateInput} value */
function normalizeDate(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/** @param {unknown} value @param {number} fallback */
function normalizePositiveInteger(value, fallback) {
  const number = Number.parseInt(String(value || ""), 10);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

/** @param {unknown} values */
function normalizeWorkspaceIds(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(normalizeText)
    .filter(Boolean))];
}

/** @param {import("../../types/task-recurrence-contracts.d.ts").DateInput} [now] @param {unknown} [horizonDays] */
function taskReminderHorizonEnd(now = new Date(), horizonDays = TASK_REMINDER_SCHEDULING_HORIZON_DAYS) {
  const days = normalizePositiveInteger(horizonDays, TASK_REMINDER_SCHEDULING_HORIZON_DAYS);
  const base = normalizeDate(now) || new Date();

  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

/** @param {Partial<import("../../types/task-recurrence-contracts.d.ts").ReminderOccurrence>} [occurrence] @param {Date} [horizonEnd] */
function reminderWithinHorizon(occurrence = {}, horizonEnd = taskReminderHorizonEnd()) {
  const reminderAt = normalizeDate(occurrence.reminder_at_utc);

  return Boolean(reminderAt && reminderAt.getTime() <= horizonEnd.getTime());
}

/** @param {import("../../types/task-recurrence-contracts.d.ts").DateInput} date @param {number} hours */
function addHours(date, hours) {
  const base = normalizeDate(date) || new Date();
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

export {
  TASK_REMINDER_SCHEDULING_HORIZON_DAYS,
  TASK_REMINDER_SWEEP_INTERVAL_HOURS,
  TASK_RECURRENCE_JOB_TYPE,
  TASK_REMINDER_JOB_TYPE,
  handleTaskRecurrenceJob,
  handleTaskReminderJob,
  queueTaskRecurrenceGeneration,
  queueTaskRecurrenceSweepJob,
  queueTaskRecurrenceSweepJobs,
  queueTaskReminderJobsForTask,
  queueTaskReminderSweepJob,
  queueTaskReminderSweepJobs,
  registerTaskJobHandlers,
  sweepTaskReminderJobsForWorkspace,
};
