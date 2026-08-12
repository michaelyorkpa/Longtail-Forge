// @ts-check

import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { getRequestContext } from "../core/request-context.js";
import {
  AUTHENTICATION_THROTTLE_MESSAGE,
  authenticationThrottle,
  emitAuthenticationThrottleLockout,
} from "../security/auth-throttle.js";
import { privateFeedsService } from "../services/private-feeds.service.js";
import { AppError } from "../utils/app-error.js";
import { asyncRoute, readJsonBody } from "../utils/http.js";

/** @typedef {import("express").Request} ExpressRequest */
/** @typedef {import("express").Response} ExpressResponse */
/** @typedef {import("../types/private-feed-contracts.js").PrivateFeedManagementSession} PrivateFeedManagementSession */

const privateFeedPublicRoutes = Router();
const privateFeedLifecycleRoutes = Router();
const CALENDAR_REFRESH_SECONDS = 15 * 60;
const privateCalendarFeedRateLimit = rateLimit({
  /** @param {ExpressRequest} _request @param {ExpressResponse} response */
  handler: (_request, response) => {
    sendThrottleResponse(response, CALENDAR_REFRESH_SECONDS);
  },
  legacyHeaders: false,
  limit: 120,
  standardHeaders: "draft-8",
  windowMs: CALENDAR_REFRESH_SECONDS * 1000,
});

privateFeedPublicRoutes.get([
  "/feeds/calendar/:token/:calendarName.ics",
  "/feeds/calendar/:token.ics",
], privateCalendarFeedRateLimit, asyncRoute(readPublicCalendar));

privateFeedLifecycleRoutes.get("/private-feeds/calendar-subscriptions", asyncRoute(listCalendarSubscriptions));
privateFeedLifecycleRoutes.post("/private-feeds/calendar-subscriptions", asyncRoute(createCalendarSubscription));
privateFeedLifecycleRoutes.post("/private-feeds/calendar-subscriptions/:subscriptionId/rotate", asyncRoute(rotateCalendarSubscription));
privateFeedLifecycleRoutes.delete("/private-feeds/calendar-subscriptions/:subscriptionId", asyncRoute(removeCalendarSubscription));

/**
 * @param {ExpressRequest} request
 * @param {ExpressResponse} response
 */
async function readPublicCalendar(request, response) {
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
}

/**
 * @param {ExpressRequest} request
 * @param {ExpressResponse} response
 */
async function listCalendarSubscriptions(request, response) {
  const session = requirePrivateFeedManagementSession(request);
  response.set("Cache-Control", "no-store");
  response.status(200).json(await privateFeedsService.listCalendarSubscriptions(session));
}

/**
 * @param {ExpressRequest} request
 * @param {ExpressResponse} response
 */
async function createCalendarSubscription(request, response) {
  const session = requirePrivateFeedManagementSession(request);
  const payload = await readJsonBody(request);
  response.set("Cache-Control", "no-store");
  response.status(201).json(await privateFeedsService.createCalendarSubscription(
    payload,
    session,
    getRequestContext(request).origin,
  ));
}

/**
 * @param {ExpressRequest} request
 * @param {ExpressResponse} response
 */
async function rotateCalendarSubscription(request, response) {
  const session = requirePrivateFeedManagementSession(request);
  response.set("Cache-Control", "no-store");
  response.status(200).json(await privateFeedsService.rotateCalendarSubscription(
    request.params.subscriptionId,
    session,
    getRequestContext(request).origin,
  ));
}

/**
 * @param {ExpressRequest} request
 * @param {ExpressResponse} response
 */
async function removeCalendarSubscription(request, response) {
  const session = requirePrivateFeedManagementSession(request);
  response.set("Cache-Control", "no-store");
  response.status(200).json(await privateFeedsService.removeCalendarSubscription(
    request.params.subscriptionId,
    session,
  ));
}

/**
 * @param {ExpressRequest} request
 * @returns {PrivateFeedManagementSession}
 */
function requirePrivateFeedManagementSession(request) {
  const session = request.session;
  if (!session?.workspace_id) {
    throw new AppError("An active workspace is required.", 400);
  }
  return session;
}

/** @param {ExpressResponse} response */
function sendMissingResponse(response) {
  response.set({
    "Cache-Control": "private, no-store",
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.status(404).send("Calendar feed not found.");
}

/**
 * @param {ExpressResponse} response
 * @param {number} retryAfterSeconds
 */
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
