import { Router } from "express";
import { timeEntriesService } from "../services/time-entries.service.js";
import { asyncRoute, readJsonBody } from "../utils/http.js";

const timeEntriesRoutes = Router();

timeEntriesRoutes.get("/time-entries", asyncRoute(async (request, response) => {
  const result = await timeEntriesService.list();
  response.status(200).json(result);
}));

timeEntriesRoutes.post("/time-entries", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await timeEntriesService.create(payload);
  response.status(201).json(result);
}));

timeEntriesRoutes.put("/time-entries/:entryId", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await timeEntriesService.update(payload, request.params.entryId);
  response.status(200).json(result);
}));

export { timeEntriesRoutes };
