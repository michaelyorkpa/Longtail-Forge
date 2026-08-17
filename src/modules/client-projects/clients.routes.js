import { Router } from "express";
import { clientsService } from "./clients.service.js";
import { asyncRoute, readJsonBody } from "../../core/http.js";
import { AppError } from "../../core/errors.js";

/** @typedef {import("../../types/client-project-contracts.js").ClientProjectPayload} ClientProjectPayload */

const clientsRoutes = Router();

clientsRoutes.get("/client-projects", asyncRoute(async (request, response) => {
  if (String(request.query.view || "").trim() === "options") {
    const optionsResult = await clientsService.readClientProjectOptions(request.session, {
      includeInactive: readQueryFlag(request.query.includeInactive ?? request.query.include_inactive),
    });
    response.status(200).json(optionsResult);
    return;
  }

  const result = await clientsService.readClientProjects(request.session, {
    includeReminderPolicies: readQueryList(request.query.include).includes("reminderPolicy"),
  });
  response.status(200).json(result);
}));

clientsRoutes.put("/client-projects", asyncRoute(async (request, response) => {
  const result = await clientsService.saveClientProjects();
  response.status(200).json(result);
}));

/** @param {unknown} value @returns {boolean} */
function readQueryFlag(value) {
  return ["1", "true", "yes"].includes(String(value ?? "").trim().toLowerCase());
}

/** @param {unknown} value @returns {string[]} */
function readQueryList(value) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

clientsRoutes.get("/clients", asyncRoute(async (request, response) => {
  const result = await clientsService.listClients(request.session, request.query);
  response.status(200).json(result);
}));

clientsRoutes.post("/clients", asyncRoute(async (request, response) => {
  const payload = requireClientProjectPayload(await readJsonBody(request));
  const result = await clientsService.createClient(payload, request.session);
  response.status(201).json(result);
}));

clientsRoutes.get("/clients/:clientId", asyncRoute(async (request, response) => {
  const result = await clientsService.readClient(request.params.clientId, request.session);
  response.status(200).json(result);
}));

clientsRoutes.put("/clients/:clientId", asyncRoute(async (request, response) => {
  const payload = requireClientProjectPayload(await readJsonBody(request));
  const result = await clientsService.updateClient(request.params.clientId, payload, request.session);
  response.status(200).json(result);
}));

clientsRoutes.delete("/clients/:clientId", asyncRoute(async (request, response) => {
  const result = await clientsService.archiveClient(request.params.clientId, {}, request.session);
  response.status(200).json(result);
}));

clientsRoutes.get("/projects", asyncRoute(async (request, response) => {
  const result = await clientsService.listProjects(request.session, request.query);
  response.status(200).json(result);
}));

clientsRoutes.post("/projects", asyncRoute(async (request, response) => {
  const payload = requireClientProjectPayload(await readJsonBody(request));
  const result = await clientsService.createProject("", payload, request.session);
  response.status(201).json(result);
}));

clientsRoutes.get("/clients/:clientId/projects", asyncRoute(async (request, response) => {
  const result = await clientsService.listClientProjects(request.params.clientId, request.session);
  response.status(200).json(result);
}));

clientsRoutes.post("/clients/:clientId/projects", asyncRoute(async (request, response) => {
  const payload = requireClientProjectPayload(await readJsonBody(request));
  const result = await clientsService.createProject(request.params.clientId, payload, request.session);
  response.status(201).json(result);
}));

clientsRoutes.get("/projects/:projectId", asyncRoute(async (request, response) => {
  const result = await clientsService.readProject(request.params.projectId, request.session);
  response.status(200).json(result);
}));

clientsRoutes.put("/projects/:projectId", asyncRoute(async (request, response) => {
  const payload = requireClientProjectPayload(await readJsonBody(request));
  const result = await clientsService.updateProject(request.params.projectId, payload, request.session);
  response.status(200).json(result);
}));

clientsRoutes.delete("/projects/:projectId", asyncRoute(async (request, response) => {
  const result = await clientsService.archiveProject(request.params.projectId, {}, request.session);
  response.status(200).json(result);
}));

export { clientsRoutes };

/** @param {unknown} payload @returns {ClientProjectPayload} */
function requireClientProjectPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new AppError("A JSON object is required.", 400);
  }
  return /** @type {ClientProjectPayload} */ (payload);
}
