import { Router } from "express";
import { clientsService } from "../services/clients.service.js";
import { asyncRoute, readJsonBody } from "../utils/http.js";

const clientsRoutes = Router();

clientsRoutes.get("/client-projects", asyncRoute(async (request, response) => {
  const result = await clientsService.readClientProjects();
  response.status(200).json(result);
}));

clientsRoutes.put("/client-projects", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await clientsService.saveClientProjects(payload);
  response.status(200).json(result);
}));

export { clientsRoutes };
