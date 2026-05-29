import { Router } from "express";
import { timeEntriesService } from "./time-entries.service.js";
import { asyncRoute, readJsonBody } from "../../core/http.js";

const timeEntriesRoutes = Router();

timeEntriesRoutes.get("/time-entries", asyncRoute(async (request, response) => {
  const result = await timeEntriesService.list(request.session);
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

export { timeEntriesRoutes };
