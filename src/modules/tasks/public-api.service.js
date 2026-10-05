import { tasksService } from "./tasks.service.js";
import { pagePublicApiItems } from "../../core/public-api-responses.js";

/** @typedef {import("../../types/http-contracts.d.ts").ApiSession} ApiSession */
/** @typedef {import("../../types/task-recurrence-contracts.d.ts").TaskRecord} TaskRecord */
/** @typedef {import("../../types/task-server-contracts.d.ts").TaskServerSession} TaskServerSession */
/** @typedef {{ limit?: unknown, offset?: unknown }} PublicTaskQuery */
/** @typedef {{ failed?: boolean, queued?: boolean }} PublicRecurrenceJob */

/** @param {ApiSession} context @param {PublicTaskQuery} query */
async function listTasks(context, query = {}) {
  const result = await tasksService.listAll(asTaskServerSession(context));
  return pagePublicApiItems(result.tasks.map((task) => withWorkspaceAlias(task, context)), query);
}

/** @param {ApiSession} context @param {string} taskId */
async function readTask(context, taskId) {
  const result = await tasksService.read(taskId, asTaskServerSession(context));
  return withWorkspaceAlias(result.task, context);
}

/** @param {ApiSession} context @param {unknown} payload */
async function createTask(context, payload) {
  const result = await tasksService.create(payload, asTaskServerSession(context));
  return withWorkspaceAlias(result.task, context);
}

/** @param {ApiSession} context @param {string} taskId @param {unknown} payload */
async function updateTask(context, taskId, payload) {
  const result = await tasksService.update(taskId, payload, asTaskServerSession(context));
  return withWorkspaceAlias(result.task, context);
}

/** @param {ApiSession} context @param {string} taskId */
async function completeTask(context, taskId) {
  const result = await tasksService.complete(taskId, asTaskServerSession(context));
  return withWorkspaceAlias({
    task: result.task,
    createdTask: result.createdTask || null,
    recurrenceContinuity: result.recurrenceContinuity || null,
    recurrenceJob: publicRecurrenceJob(result.recurrenceJob),
  }, context);
}

/** @param {ApiSession} context @param {string} taskId */
async function reopenTask(context, taskId) {
  const result = await tasksService.reopen(taskId, asTaskServerSession(context));
  return withWorkspaceAlias(result.task, context);
}

/** @param {ApiSession} context @param {string} taskId */
async function archiveTask(context, taskId) {
  const result = await tasksService.archive(taskId, asTaskServerSession(context));
  return withWorkspaceAlias(result.task, context);
}

/** @param {ApiSession} context @param {string} taskId */
async function restoreTask(context, taskId) {
  const result = await tasksService.restore(taskId, asTaskServerSession(context));
  return withWorkspaceAlias(result.task, context);
}

/** @template {object} RecordValue @param {RecordValue} record @param {ApiSession} context @returns {RecordValue & { workspace_id: unknown }} */
function withWorkspaceAlias(record, context) {
  const workspaceId = Reflect.get(record, "workspace_id") || context.workspace_id;

  return {
    ...record,
    workspace_id: workspaceId,
  };
}

/** @param {ApiSession} context @returns {TaskServerSession} */
function asTaskServerSession(context) {
  return /** @type {TaskServerSession} */ (context);
}

/** @param {PublicRecurrenceJob | null | undefined} recurrenceJob */
function publicRecurrenceJob(recurrenceJob = {}) {
  const job = recurrenceJob || {};
  return {
    failed: job.failed === true,
    queued: job.queued === true,
  };
}

export const tasksPublicApiService = {
  archiveTask,
  completeTask,
  createTask,
  listTasks,
  readTask,
  reopenTask,
  restoreTask,
  updateTask,
};
