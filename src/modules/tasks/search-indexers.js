import { registerSearchIndexer } from "../../core/search/indexer-registry.js";
import { readSearchTagsText } from "../../core/search/tag-text.js";
import { taskChecklistsRepository } from "./task-checklists.repo.js";
import { taskRelationshipsRepository } from "./task-relationships.repo.js";
import { tasksRepository } from "./tasks.repo.js";

const TASKS_SEARCH_INDEXER_ID = "tasks.records";

function registerTasksSearchIndexers() {
  return registerSearchIndexer(TASKS_SEARCH_INDEXER_ID, indexTaskRecord);
}

async function indexTaskRecord({ workspaceId, recordId }) {
  if (!recordId) {
    const tasks = await tasksRepository.readAll(workspaceId);
    const documents = [];

    for (const task of tasks) {
      documents.push(await taskToSearchDocument(task));
    }

    return { documents };
  }

  const task = await tasksRepository.readById(workspaceId, recordId);

  if (!task) {
    return null;
  }

  return taskToSearchDocument(task);
}

async function taskToSearchDocument(task) {
  const assigneeText = (task.assignees || [])
    .map((assignee) => assignee.displayName || assignee.username || assignee.user_id)
    .filter(Boolean)
    .join(" ");
  const tagsText = await readSearchTagsText({
    workspaceId: task.workspace_id,
    targetType: "task",
    targetId: task.task_id,
  });
  const dueText = [task.due_date, task.due_time].filter(Boolean).join(" ");
  const checklistItems = await taskChecklistsRepository.readForTask(task.workspace_id, task.task_id);
  const checklistProgress = taskChecklistProgress(checklistItems);
  const relationshipSummary = await taskRelationshipsRepository.relationshipSummary(task.workspace_id, task.task_id);
  const body = [
    task.next_action,
    task.status === "blocked" ? task.blocked_reason : "",
    task.resume_note,
    checklistProgress.next_incomplete_item_label,
    relationshipSummary.incomplete_blocking_child_count > 0 ? "Incomplete blocking child tasks" : "",
    task.description,
    task.client_name,
    task.project_name,
    assigneeText,
    dueText,
  ].filter(Boolean).join("\n");

  return {
    workspace_id: task.workspace_id,
    task_id: task.task_id,
    title: task.title,
    summary: task.next_action || checklistProgress.next_incomplete_item_label || task.resume_note || task.description || task.project_name || task.client_name || "",
    body,
    tags_text: tagsText,
    client_id: task.client_id,
    project_id: task.project_id,
    search_status: task.archived_at ? "archived" : task.completed_at ? "completed" : task.status,
    record_created_at: task.created_at,
    record_updated_at: task.last_worked_at || task.updated_at,
  };
}

function taskChecklistProgress(items = []) {
  const activeItems = Array.isArray(items) ? items.filter((item) => !item.deleted_at) : [];
  const completedCount = activeItems.filter((item) => item.is_checked).length;
  const nextIncomplete = activeItems.find((item) => !item.is_checked);

  return {
    total_count: activeItems.length,
    completed_count: completedCount,
    next_incomplete_item_label: nextIncomplete?.label || "",
  };
}

export {
  TASKS_SEARCH_INDEXER_ID,
  indexTaskRecord,
  registerTasksSearchIndexers,
};
