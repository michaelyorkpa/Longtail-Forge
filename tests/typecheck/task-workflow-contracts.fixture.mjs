// @ts-check

import { taskChecklistsRepository } from "../../src/modules/tasks/task-checklists.repo.js";
import { taskRelationshipsRepository } from "../../src/modules/tasks/task-relationships.repo.js";
import { taskRemindersService } from "../../src/modules/tasks/task-reminders.service.js";
import { taskTimersService } from "../../src/modules/tasks/task-timers.service.js";
import { taskWorkEvidenceService } from "../../src/modules/tasks/task-work-evidence.service.js";

/** @type {import("../../src/types/task-workflow-contracts.js").TaskWorkflowSession} */
const session = {
  active_workspace_id: "workspace-1",
  home_workspace_id: "workspace-1",
  ip_address: "127.0.0.1",
  password_change_required: false,
  session_mode: "normal",
  timezone: "America/New_York",
  user_id: "user-1",
  username: "user@example.test",
  workspace_id: "workspace-1",
};

void taskChecklistsRepository.readForTask(session.workspace_id, "task-1");
void taskRelationshipsRepository.relationshipSummary(session.workspace_id, "task-1");
void taskRemindersService.readWorkspaceDefaults(session.workspace_id);
void taskTimersService.list(session);
void taskWorkEvidenceService.readStartedWorkEvidence(session.workspace_id, "task-1");

// @ts-expect-error Checklist labels stay textual at the repository boundary.
void taskChecklistsRepository.create(session.workspace_id, "task-1", { label: 42 });

// @ts-expect-error Timer workflows require the complete checked request-session contract.
void taskTimersService.list({ workspace_id: "workspace-1" });
