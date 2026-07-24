import { registerPrivateFeedProvider } from "../../core/private-feeds/private-feed-providers.js";
import { PRIVATE_CALENDAR_PROVIDER_ID } from "../../services/private-feeds.service.js";
import { permissionsService } from "../../services/permissions.service.js";
import { buildTasksPrivateCalendarContent } from "./task-calendar-feed.service.js";

function registerTasksPrivateCalendarFeedProvider() {
  return registerPrivateFeedProvider({
    id: PRIVATE_CALENDAR_PROVIDER_ID,
    render: renderTasksPrivateCalendarFeed,
  });
}

async function renderTasksPrivateCalendarFeed({ session }) {
  const canViewTasks = await permissionsService.canInAnyScope(session, "tasks.view", {
    operation: "read",
    workspace_id: session.workspace_id,
  });
  if (!canViewTasks) {
    return null;
  }

  return buildTasksPrivateCalendarContent({ session });
}

export {
  registerTasksPrivateCalendarFeedProvider,
  renderTasksPrivateCalendarFeed,
};
