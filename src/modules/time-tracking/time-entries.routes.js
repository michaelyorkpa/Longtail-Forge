// @ts-check
import { Router } from "express";
import { activeTimersService } from "./active-timers.service.js";
import { timeEntriesService } from "./time-entries.service.js";
import { asyncRoute, readJsonBody } from "../../core/http.js";
import { AppError } from "../../core/errors.js";

/** @typedef {import("../../types/time-tracking-contracts.d.ts").TimeTrackingSession} TimeTrackingSession */

const timeEntriesRoutes = Router();

timeEntriesRoutes.get("/time-entries", asyncRoute(async (request, response) => {
  const result = await timeEntriesService.list(readTimeTrackingSession(request), request.query);
  response.status(200).json(result);
}));

timeEntriesRoutes.post("/time-entries", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await timeEntriesService.create(payload, readTimeTrackingSession(request));
  response.status(201).json(result);
}));

timeEntriesRoutes.put("/time-entries/:entryId", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await timeEntriesService.update(payload, request.params.entryId, readTimeTrackingSession(request));
  response.status(200).json(result);
}));

timeEntriesRoutes.delete("/time-entries/:entryId", asyncRoute(async (request, response) => {
  const result = await timeEntriesService.remove(request.params.entryId, readTimeTrackingSession(request));
  response.status(200).json(result);
}));

timeEntriesRoutes.get("/active-timers", asyncRoute(async (request, response) => {
  const result = await activeTimersService.list(readTimeTrackingSession(request));
  response.status(200).json(result);
}));

timeEntriesRoutes.get("/active-timers/all", asyncRoute(async (request, response) => {
  const result = await activeTimersService.listAll(readTimeTrackingSession(request));
  response.status(200).json(result);
}));

timeEntriesRoutes.put("/active-timers/:timerSlot", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await activeTimersService.save(request.params.timerSlot, payload, readTimeTrackingSession(request));
  response.status(200).json(result);
}));

timeEntriesRoutes.post("/active-timers/:timerSlot/start", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await activeTimersService.updateStatus(
    request.params.timerSlot,
    { ...readObjectPayload(payload), timer_status: "running" },
    readTimeTrackingSession(request),
  );
  response.status(200).json(result);
}));

timeEntriesRoutes.post("/active-timers/:timerSlot/pause", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await activeTimersService.updateStatus(
    request.params.timerSlot,
    { ...readObjectPayload(payload), timer_status: "paused" },
    readTimeTrackingSession(request),
  );
  response.status(200).json(result);
}));

timeEntriesRoutes.post("/active-timers/:timerSlot/finalize", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await activeTimersService.finalize(request.params.timerSlot, payload, readTimeTrackingSession(request));
  response.status(201).json(result);
}));

timeEntriesRoutes.delete("/active-timers/:timerSlot", asyncRoute(async (request, response) => {
  const result = await activeTimersService.remove(request.params.timerSlot, readTimeTrackingSession(request));
  response.status(200).json(result);
}));

/** @param {Express.Request} request @returns {TimeTrackingSession} */
function readTimeTrackingSession(request) {
  if (!request.session?.workspace_id) {
    throw new AppError("Time Tracking route requires an active workspace session.", 401);
  }
  return /** @type {TimeTrackingSession} */ (request.session);
}

/** @param {unknown} payload @returns {Record<string, unknown>} */
function readObjectPayload(payload) {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? /** @type {Record<string, unknown>} */ (payload)
    : {};
}

export { timeEntriesRoutes };
