import { Router } from "express";
import { apiKeysService } from "../services/api-keys.service.js";
import { asyncRoute, readJsonBody } from "../utils/http.js";

const apiKeysRoutes = Router();

apiKeysRoutes.get("/api-keys", asyncRoute(async (request, response) => {
  const result = await apiKeysService.list(request.session);
  response.status(200).json(result);
}));

apiKeysRoutes.post("/api-keys", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await apiKeysService.create(payload, request.session);
  response.status(201).json(result);
}));

apiKeysRoutes.put("/api-keys/:apiKeyId/revoke", asyncRoute(async (request, response) => {
  const result = await apiKeysService.revoke(request.params.apiKeyId, request.session);
  response.status(200).json(result);
}));

export { apiKeysRoutes };
