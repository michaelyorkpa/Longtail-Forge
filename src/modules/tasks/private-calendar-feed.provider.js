// @ts-check

import { registerPrivateFeedProvider } from "../../core/private-feeds/private-feed-providers.js";
import { PRIVATE_CALENDAR_PROVIDER_ID } from "../../services/private-feeds.service.js";
import { permissionsService } from "../../services/permissions.service.js";
import { taskCalendarSubscriptionResource } from "./task-calendar-feed.scope.js";
import { buildTasksPrivateCalendarContent } from "./task-calendar-feed.service.js";

/** @typedef {import("../../types/task-workflow-contracts.js").TaskPrivateFeedRenderContext} TaskPrivateFeedRenderContext */

function registerTasksPrivateCalendarFeedProvider() {
  return registerPrivateFeedProvider({
    id: PRIVATE_CALENDAR_PROVIDER_ID,
    render: renderTasksPrivateCalendarFeed,
  });
}

/** @param {Readonly<TaskPrivateFeedRenderContext>} context */
async function renderTasksPrivateCalendarFeed({ session, subscription }) {
  if (
    !subscription
    || subscription.ownerUserId !== session?.user_id
    || subscription.workspaceId !== session?.workspace_id
  ) {
    return null;
  }

  const canViewTasks = await permissionsService.can(
    /** @type {import("../../types/http-contracts.js").PrivateFeedAuthorizationSession} */ (session),
    "tasks.view",
    taskCalendarSubscriptionResource(subscription),
  );
  if (!canViewTasks) {
    return null;
  }

  return buildTasksPrivateCalendarContent({
    session: /** @type {import("../../types/http-contracts.js").PrivateFeedAuthorizationSession} */ (session),
    subscription,
  });
}

export {
  registerTasksPrivateCalendarFeedProvider,
  renderTasksPrivateCalendarFeed,
};
