// @ts-check
import {
  activeTimersRepository,
  activeTimersService,
  timeEntriesRepository,
  timeEntriesService,
  timeTrackingSettingsService,
} from "../../src/modules/time-tracking/index.js";

/** @type {import("../../src/types/time-tracking-contracts.d.ts").TimeTrackingSession} */
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

void activeTimersRepository.readBySlot(session.workspace_id, session.user_id, "1");
void activeTimersService.list(session);
void timeEntriesRepository.readDashboardEffortSummary(session.workspace_id, { limit: 3 });
void timeEntriesService.list(session, { tagIds: ["tag-1"] });
void timeTrackingSettingsService.read(session);

// @ts-expect-error Time Tracking services require a workspace request session.
void activeTimersService.list(42);

// @ts-expect-error Timer persistence requires the complete named timer record.
void activeTimersRepository.upsert({ active_timer_id: "timer-1" });
