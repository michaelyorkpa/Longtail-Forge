import { Router } from "express";
import { activeTimersService } from "../modules/time-tracking/active-timers.service.js";
import { workbenchService } from "../services/workbench.service.js";
import { asyncRoute, readJsonBody } from "../core/http.js";

const workbenchRoutes = Router();

workbenchRoutes.get("/workbench/bootstrap", asyncRoute(async (request, response) => {
  const result = await workbenchService.bootstrap(request.session);
  response.status(200).json(result);
}));

workbenchRoutes.put("/workbench/timers/:timerSlot/status", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await activeTimersService.updateStatus(request.params.timerSlot, payload, request.session);
  response.status(200).json(result);
}));

export { workbenchRoutes };
