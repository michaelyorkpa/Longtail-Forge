import { Router } from "express";
import { tagsService } from "../services/tags.service.js";
import { asyncRoute, readJsonBody } from "../utils/http.js";

const tagsRoutes = Router();

tagsRoutes.get("/tags", asyncRoute(async (request, response) => {
  const result = await tagsService.list(request.session, request.query);
  response.status(200).json(result);
}));

tagsRoutes.post("/tags", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await tagsService.create(request.session, payload);
  response.status(201).json(result);
}));

tagsRoutes.get("/tags/assignments", asyncRoute(async (request, response) => {
  const result = await tagsService.listAssignments(request.session, request.query);
  response.status(200).json(result);
}));

tagsRoutes.put("/tags/assignments", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await tagsService.replaceAssignments(request.session, payload);
  response.status(200).json(result);
}));

tagsRoutes.put("/tags/:tagId", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await tagsService.update(request.session, request.params.tagId, payload);
  response.status(200).json(result);
}));

tagsRoutes.post("/tags/:tagId/archive", asyncRoute(async (request, response) => {
  const result = await tagsService.archive(request.session, request.params.tagId);
  response.status(200).json(result);
}));

tagsRoutes.post("/tags/:tagId/restore", asyncRoute(async (request, response) => {
  const result = await tagsService.restore(request.session, request.params.tagId);
  response.status(200).json(result);
}));

export { tagsRoutes };
