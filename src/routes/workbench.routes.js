import { Router } from "express";
import { activeTimersService } from "../modules/time-tracking/active-timers.service.js";
import { workFocusModesService } from "../services/work-focus-modes.service.js";
import { workbenchService } from "../services/workbench.service.js";
import { asyncRoute, readJsonBody } from "../core/http.js";

const workbenchRoutes = Router();

workbenchRoutes.get("/workbench/bootstrap", asyncRoute(async (request, response) => {
  const result = await workbenchService.bootstrap(request.session);
  response.status(200).json(result);
}));

workbenchRoutes.get("/workbench/focus-modes", asyncRoute(async (request, response) => {
  const modes = await workFocusModesService.listFocusModes(request.session, request.query);
  response.status(200).json({ modes });
}));

workbenchRoutes.get("/workbench/focus-candidates", asyncRoute(async (request, response) => {
  const result = await workFocusModesService.listFocusCandidates(request.session, request.query);
  response.status(200).json(result);
}));

workbenchRoutes.put("/workbench/timers/:timerSlot/status", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await activeTimersService.updateStatus(request.params.timerSlot, payload, request.session);
  response.status(200).json(result);
}));

export { workbenchRoutes };
