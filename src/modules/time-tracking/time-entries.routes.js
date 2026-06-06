import { Router } from "express";
import { activeTimersService } from "./active-timers.service.js";
import { timeEntriesService } from "./time-entries.service.js";
import { asyncRoute, readJsonBody } from "../../core/http.js";

const timeEntriesRoutes = Router();

timeEntriesRoutes.get("/time-entries", asyncRoute(async (request, response) => {
  const result = await timeEntriesService.list(request.session, request.query);
  response.status(200).json(result);
}));

timeEntriesRoutes.post("/time-entries", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await timeEntriesService.create(payload, request.session);
  response.status(201).json(result);
}));

timeEntriesRoutes.put("/time-entries/:entryId", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await timeEntriesService.update(payload, request.params.entryId, request.session);
  response.status(200).json(result);
}));

timeEntriesRoutes.delete("/time-entries/:entryId", asyncRoute(async (request, response) => {
  const result = await timeEntriesService.remove(request.params.entryId, request.session);
  response.status(200).json(result);
}));

timeEntriesRoutes.get("/active-timers", asyncRoute(async (request, response) => {
  const result = await activeTimersService.list(request.session);
  response.status(200).json(result);
}));

timeEntriesRoutes.get("/active-timers/all", asyncRoute(async (request, response) => {
  const result = await activeTimersService.listAll(request.session);
  response.status(200).json(result);
}));

timeEntriesRoutes.put("/active-timers/:timerSlot", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await activeTimersService.save(request.params.timerSlot, payload, request.session);
  response.status(200).json(result);
}));

timeEntriesRoutes.post("/active-timers/:timerSlot/start", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await activeTimersService.updateStatus(
    request.params.timerSlot,
    { ...payload, timer_status: "running" },
    request.session,
  );
  response.status(200).json(result);
}));

timeEntriesRoutes.post("/active-timers/:timerSlot/pause", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await activeTimersService.updateStatus(
    request.params.timerSlot,
    { ...payload, timer_status: "paused" },
    request.session,
  );
  response.status(200).json(result);
}));

timeEntriesRoutes.post("/active-timers/:timerSlot/finalize", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await activeTimersService.finalize(request.params.timerSlot, payload, request.session);
  response.status(201).json(result);
}));

timeEntriesRoutes.delete("/active-timers/:timerSlot", asyncRoute(async (request, response) => {
  const result = await activeTimersService.remove(request.params.timerSlot, request.session);
  response.status(200).json(result);
}));

export { timeEntriesRoutes };
