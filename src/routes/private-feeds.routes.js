import { Router } from "express";
import { getRequestContext } from "../core/request-context.js";
import {
  AUTHENTICATION_THROTTLE_MESSAGE,
  authenticationThrottle,
  emitAuthenticationThrottleLockout,
} from "../security/auth-throttle.js";
import { privateFeedsService } from "../services/private-feeds.service.js";
import { asyncRoute, readJsonBody } from "../utils/http.js";

const privateFeedPublicRoutes = Router();
const privateFeedLifecycleRoutes = Router();
const CALENDAR_REFRESH_SECONDS = 15 * 60;

privateFeedPublicRoutes.get("/feeds/calendar/:token.ics", asyncRoute(async (request, response) => {
  const requestContext = getRequestContext(request);
  const throttleContext = {
    dimensions: ["ip"],
    ipAddress: requestContext.ipAddress,
    scope: "private-calendar-feed",
  };
  const throttleStatus = await authenticationThrottle.check(throttleContext);
  if (throttleStatus.blocked) {
    sendThrottleResponse(response, throttleStatus.retryAfterSeconds);
    return;
  }

  const content = await privateFeedsService.renderCalendar(request.params.token);
  const recorded = await authenticationThrottle.recordSensitiveAction(throttleContext);
  await emitAuthenticationThrottleLockout(throttleContext, recorded);

  if (content === null) {
    sendMissingResponse(response);
    return;
  }

  response.set({
    "Cache-Control": "private, no-store",
    "Content-Disposition": 'inline; filename="longtail-forge-tasks.ics"',
    "Content-Type": "text/calendar; charset=utf-8",
    "X-Calendar-Refresh-Interval": String(CALENDAR_REFRESH_SECONDS),
  });
  response.status(200).send(content);
}));

privateFeedLifecycleRoutes.get("/private-feeds/calendar-subscriptions", asyncRoute(async (request, response) => {
  response.set("Cache-Control", "no-store");
  response.status(200).json(await privateFeedsService.listCalendarSubscriptions(request.session));
}));

privateFeedLifecycleRoutes.post("/private-feeds/calendar-subscriptions", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  response.set("Cache-Control", "no-store");
  response.status(201).json(await privateFeedsService.createCalendarSubscription(
    payload,
    request.session,
    getRequestContext(request).origin,
  ));
}));

privateFeedLifecycleRoutes.post("/private-feeds/calendar-subscriptions/:subscriptionId/rotate", asyncRoute(async (request, response) => {
  response.set("Cache-Control", "no-store");
  response.status(200).json(await privateFeedsService.rotateCalendarSubscription(
    request.params.subscriptionId,
    request.session,
    getRequestContext(request).origin,
  ));
}));

privateFeedLifecycleRoutes.delete("/private-feeds/calendar-subscriptions/:subscriptionId", asyncRoute(async (request, response) => {
  response.set("Cache-Control", "no-store");
  response.status(200).json(await privateFeedsService.revokeCalendarSubscription(
    request.params.subscriptionId,
    request.session,
  ));
}));

function sendMissingResponse(response) {
  response.set({
    "Cache-Control": "private, no-store",
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.status(404).send("Calendar feed not found.");
}

function sendThrottleResponse(response, retryAfterSeconds) {
  response.set({
    "Cache-Control": "private, no-store",
    "Content-Type": "text/plain; charset=utf-8",
    "Retry-After": String(Math.max(1, retryAfterSeconds || 1)),
  });
  response.status(429).send(AUTHENTICATION_THROTTLE_MESSAGE);
}

export {
  privateFeedLifecycleRoutes,
  privateFeedPublicRoutes,
};
