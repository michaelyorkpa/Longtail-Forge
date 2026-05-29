import { Router } from "express";
import { clientsService } from "./clients.service.js";
import { asyncRoute, readJsonBody } from "../../core/http.js";

const clientsRoutes = Router();

clientsRoutes.get("/client-projects", asyncRoute(async (request, response) => {
  const result = await clientsService.readClientProjects(request.session);
  response.status(200).json(result);
}));

clientsRoutes.put("/client-projects", asyncRoute(async (request, response) => {
  const result = await clientsService.saveClientProjects(request.session);
  response.status(200).json(result);
}));

clientsRoutes.get("/clients", asyncRoute(async (request, response) => {
  const result = await clientsService.listClients(request.session);
  response.status(200).json(result);
}));

clientsRoutes.post("/clients", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await clientsService.createClient(payload, request.session);
  response.status(201).json(result);
}));

clientsRoutes.get("/clients/:clientId", asyncRoute(async (request, response) => {
  const result = await clientsService.readClient(request.params.clientId, request.session);
  response.status(200).json(result);
}));

clientsRoutes.put("/clients/:clientId", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await clientsService.updateClient(request.params.clientId, payload, request.session);
  response.status(200).json(result);
}));

clientsRoutes.delete("/clients/:clientId", asyncRoute(async (request, response) => {
  const result = await clientsService.archiveClient(request.params.clientId, {}, request.session);
  response.status(200).json(result);
}));

clientsRoutes.get("/projects", asyncRoute(async (request, response) => {
  const result = await clientsService.listProjects(request.session);
  response.status(200).json(result);
}));

clientsRoutes.get("/clients/:clientId/projects", asyncRoute(async (request, response) => {
  const result = await clientsService.listClientProjects(request.params.clientId, request.session);
  response.status(200).json(result);
}));

clientsRoutes.post("/clients/:clientId/projects", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await clientsService.createProject(request.params.clientId, payload, request.session);
  response.status(201).json(result);
}));

clientsRoutes.get("/projects/:projectId", asyncRoute(async (request, response) => {
  const result = await clientsService.readProject(request.params.projectId, request.session);
  response.status(200).json(result);
}));

clientsRoutes.put("/projects/:projectId", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await clientsService.updateProject(request.params.projectId, payload, request.session);
  response.status(200).json(result);
}));

clientsRoutes.delete("/projects/:projectId", asyncRoute(async (request, response) => {
  const result = await clientsService.archiveProject(request.params.projectId, {}, request.session);
  response.status(200).json(result);
}));

export { clientsRoutes };
