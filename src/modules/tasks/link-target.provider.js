// @ts-check
import { tasksRepository } from "./tasks.repo.js";
import { permissionsService } from "../../core/permissions.js";
import {
  readableTargetLabel,
  sortText,
  targetSourceUrl,
} from "../../core/linked-context/link-target-shape.js";

/** @typedef {import("../../types/link-target-directory-contracts.js").LinkTargetSession} WorkspaceRequestSession */
/** @typedef {import("../../types/link-target-directory-contracts.js").LinkTargetAccessState} LinkTargetAccessState */
/** @typedef {import("../../types/link-target-directory-contracts.js").LinkTargetCandidate} LinkTargetCandidate */
/** @typedef {import("../../types/link-target-directory-contracts.js").LinkTargetDirectoryContext} LinkTargetDirectoryContext */
/** @typedef {import("../../types/link-target-directory-contracts.js").LinkTargetProviderOptions} LinkTargetProviderOptions */
/** @typedef {import("../../types/link-target-directory-contracts.js").LinkTargetType} LinkTargetType */

/** @typedef {{ task_id: string; title?: string; label?: string; client_id?: string; clientId?: string; client_name?: string; clientName?: string; project_id?: string; projectId?: string; project_name?: string; projectName?: string; status?: string; archived_at?: string|null; archivedAt?: string|null; completed_at?: string|null; completedAt?: string|null }} TaskTargetRow */

const TASK_TARGET_TITLE_MAX_LENGTH = 20;
/** @type {readonly LinkTargetType[]} */
const targetTypes = Object.freeze(["task"]);

/**
 * @param {WorkspaceRequestSession} session
 * @param {LinkTargetType} targetType
 * @param {LinkTargetProviderOptions} options
 * @returns {Promise<LinkTargetCandidate[]>}
 */
async function list(session, targetType, options) {
  if (targetType !== "task") return [];
  /** @type {TaskTargetRow[]} */
  const tasks = await tasksRepository.readAll(session.workspace_id);
  const readable = [];
  for (const task of tasks) {
    if (await canReadTask(session, task)) readable.push(taskCandidate(task, options.context, true));
  }
  return readable;
}

/**
 * @param {WorkspaceRequestSession} session
 * @param {LinkTargetType} targetType
 * @param {string} targetId
 * @param {LinkTargetProviderOptions} options
 * @returns {Promise<LinkTargetCandidate | null>}
 */
async function read(session, targetType, targetId, options) {
  if (targetType !== "task") return null;
  /** @type {TaskTargetRow | null} */
  const task = await tasksRepository.readById(session.workspace_id, targetId);
  return task && await canReadTask(session, task) ? taskCandidate(task, options.context, false) : null;
}

/**
 * @param {WorkspaceRequestSession} session
 * @param {LinkTargetType} targetType
 * @param {readonly string[]} targetIds
 * @returns {Promise<Map<string, LinkTargetAccessState>>}
 */
async function readAccess(session, targetType, targetIds) {
  /** @type {Map<string, LinkTargetAccessState>} */
  const states = new Map(targetIds.map((targetId) => [targetId, "unavailable"]));
  if (targetType !== "task" || targetIds.length === 0) return states;
  /** @type {TaskTargetRow[]} */
  const tasks = await tasksRepository.readByIds(session.workspace_id, [...targetIds]);
  for (const task of tasks) {
    states.set(task.task_id, (await canReadTask(session, task)) ? "readable" : "forbidden");
  }
  return states;
}

/** @param {TaskTargetRow} task @param {LinkTargetDirectoryContext} context @param {boolean} picker */
function taskCandidate(task, context, picker) {
  const title = readableTargetLabel(task.title || task.label, "task");
  const contextLabel = taskContextLabel(task, context);
  const displayLabel = picker
    ? (contextLabel ? `${truncateTitle(title)} - ${contextLabel}` : truncateTitle(title))
    : title;
  return {
    moduleId: "tasks",
    targetType: /** @type {const} */ ("task"),
    targetId: task.task_id,
    label: title,
    displayLabel,
    secondaryLabel: picker ? "" : contextLabel,
    sortKey: taskSortKey(task, context),
    subtitle: picker ? "" : contextLabel,
    sourceUrl: targetSourceUrl("task", task.task_id),
    clientId: textValue(task.client_id || task.clientId),
    clientName: textValue(task.client_name || task.clientName),
    projectId: textValue(task.project_id || task.projectId),
    projectName: taskProjectName(task),
    taskId: task.task_id,
    title,
    fullLabel: title,
    ariaLabel: contextLabel ? `${title} - ${contextLabel}` : title,
    workspaceId: context.workspaceId,
    workspaceName: context.workspaceName,
    suggestedLibraryBucket: "active_work",
  };
}

/** @param {WorkspaceRequestSession} session @param {TaskTargetRow} task */
async function canReadTask(session, task) {
  return permissionsService.can(session, "tasks.view", {
    workspace_id: session.workspace_id,
    client_id: textValue(task.client_id || task.clientId),
    project_id: textValue(task.project_id || task.projectId),
    operation: "read",
  });
}

/** @param {TaskTargetRow} task @param {LinkTargetDirectoryContext} context */
function taskContextLabel(task, context) {
  const projectName = taskProjectName(task);
  if (!projectName) return "";
  if (!context.isBusinessWorkspace) return projectName;
  return `${taskBusinessContextName(task, context)} | ${projectName}`;
}

/** @param {TaskTargetRow} task @param {LinkTargetDirectoryContext} context */
function taskBusinessContextName(task, context) {
  const clientId = textValue(task.client_id || task.clientId);
  return clientId
    ? readableTargetLabel(task.client_name || task.clientName, "client")
    : context.workspaceName;
}

/** @param {TaskTargetRow} task */
function taskProjectName(task) {
  return textValue(task.project_id || task.projectId)
    ? readableTargetLabel(task.project_name || task.projectName, "project")
    : "";
}

/** @param {TaskTargetRow} task @param {LinkTargetDirectoryContext} context */
function taskSortKey(task, context) {
  return [
    taskUsefulnessRank(task),
    sortText(taskProjectName(task) && context.isBusinessWorkspace ? taskBusinessContextName(task, context) : ""),
    sortText(taskProjectName(task)),
    sortText(task.title || task.label),
    sortText(task.task_id),
  ].join("|");
}

/** @param {TaskTargetRow} task */
function taskUsefulnessRank(task) {
  const status = textValue(task.status).toLowerCase();
  return task.archived_at || task.archivedAt || task.completed_at || task.completedAt || status === "archived" || status === "complete"
    ? "1"
    : "0";
}

/** @param {string} title */
function truncateTitle(title) {
  return title.length <= TASK_TARGET_TITLE_MAX_LENGTH
    ? title
    : `${title.slice(0, TASK_TARGET_TITLE_MAX_LENGTH - 3).trimEnd()}...`;
}

/** @param {unknown} value */
function textValue(value) {
  return String(value ?? "").trim();
}

const tasksLinkTargetProvider = Object.freeze({ targetTypes, list, read, readAccess });

export { tasksLinkTargetProvider };
