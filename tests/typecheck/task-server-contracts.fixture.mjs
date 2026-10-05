// @ts-check

import { tasksRepository } from "../../src/modules/tasks/tasks.repo.js";
import { tasksService } from "../../src/modules/tasks/tasks.service.js";

/** @type {import("../../src/types/task-server-contracts.d.ts").TaskServerSession} */
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

void tasksRepository.create(session.workspace_id, {
  status: "open",
  title: "Checked repository task",
});
void tasksService.create({ title: "Checked service task" }, session);
void tasksService.calendarWindow(session, { end: "2026-09-30", start: "2026-09-01" });

// @ts-expect-error Repository task writes require a textual title.
void tasksRepository.create(session.workspace_id, { status: "open", title: 42 });

// @ts-expect-error Tasks workflows require the complete checked request-session contract.
void tasksService.list({ workspace_id: "workspace-1" });
