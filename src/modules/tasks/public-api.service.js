import { tasksService } from "./tasks.service.js";

async function listTasks(context, query = {}) {
  const result = await tasksService.list(context);
  return paged(result.tasks.map((task) => withWorkspaceAlias(task, context)), query);
}

async function readTask(context, taskId) {
  const result = await tasksService.read(taskId, context);
  return withWorkspaceAlias(result.task, context);
}

async function createTask(context, payload) {
  const result = await tasksService.create(payload, context);
  return withWorkspaceAlias(result.task, context);
}

async function updateTask(context, taskId, payload) {
  const result = await tasksService.update(taskId, payload, context);
  return withWorkspaceAlias(result.task, context);
}

async function completeTask(context, taskId) {
  const result = await tasksService.complete(taskId, context);
  return withWorkspaceAlias({
    task: result.task,
    createdTask: result.createdTask || null,
  }, context);
}

async function reopenTask(context, taskId) {
  const result = await tasksService.reopen(taskId, context);
  return withWorkspaceAlias(result.task, context);
}

async function archiveTask(context, taskId) {
  const result = await tasksService.archive(taskId, context);
  return withWorkspaceAlias(result.task, context);
}

async function restoreTask(context, taskId) {
  const result = await tasksService.restore(taskId, context);
  return withWorkspaceAlias(result.task, context);
}

function withWorkspaceAlias(record, context) {
  if (!record || typeof record !== "object") {
    return record;
  }

  const workspaceId = record.workspace_id || context.workspace_id;

  return {
    ...record,
    workspace_id: workspaceId,
  };
}

function paged(items, query) {
  const limit = clampInteger(query.limit, 1, 100, 50);
  const offset = clampInteger(query.offset, 0, Number.MAX_SAFE_INTEGER, 0);

  return {
    data: items.slice(offset, offset + limit),
    pagination: {
      limit,
      offset,
      total: items.length,
      has_more: offset + limit < items.length,
    },
  };
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
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
