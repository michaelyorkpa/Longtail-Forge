import { registerPrivateFeedProvider } from "../../core/private-feeds/private-feed-providers.js";
import { PRIVATE_CALENDAR_PROVIDER_ID } from "../../services/private-feeds.service.js";
import { permissionsService } from "../../services/permissions.service.js";
import { taskCalendarSubscriptionResource } from "./task-calendar-feed.scope.js";
import { buildTasksPrivateCalendarContent } from "./task-calendar-feed.service.js";

function registerTasksPrivateCalendarFeedProvider() {
  return registerPrivateFeedProvider({
    id: PRIVATE_CALENDAR_PROVIDER_ID,
    render: renderTasksPrivateCalendarFeed,
  });
}

async function renderTasksPrivateCalendarFeed({ session, subscription }) {
  if (
    !subscription
    || subscription.ownerUserId !== session?.user_id
    || subscription.workspaceId !== session?.workspace_id
  ) {
    return null;
  }

  const canViewTasks = await permissionsService.can(
    session,
    "tasks.view",
    taskCalendarSubscriptionResource(subscription),
  );
  if (!canViewTasks) {
    return null;
  }

  return buildTasksPrivateCalendarContent({ session, subscription });
}

export {
  registerTasksPrivateCalendarFeedProvider,
  renderTasksPrivateCalendarFeed,
};
