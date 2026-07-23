import { timeEntriesService } from "../time-tracking/index.js";
import { taskChecklistsRepository } from "./task-checklists.repo.js";
import { taskTimersRepository } from "./task-timers.repo.js";

async function readStartedWorkEvidence(workspaceId, taskId, checklistItems = null) {
  const [hasActiveTimer, hasPersistedTime, resolvedChecklistItems] = await Promise.all([
    taskTimersRepository.hasActiveForTask(workspaceId, taskId),
    timeEntriesService.hasTaskTime(workspaceId, taskId),
    Array.isArray(checklistItems)
      ? checklistItems
      : taskChecklistsRepository.readForTask(workspaceId, taskId),
  ]);
  const hasCheckedChecklistItem = resolvedChecklistItems.some((item) => item.is_checked);

  return {
    hasActiveTimer,
    hasCheckedChecklistItem,
    hasPersistedTime,
    hasStartedWork: hasActiveTimer || hasPersistedTime || hasCheckedChecklistItem,
  };
}

export const taskWorkEvidenceService = {
  readStartedWorkEvidence,
};
