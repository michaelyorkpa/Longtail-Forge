import { Router } from "express";
import { clientsService } from "../services/clients.service.js";
import { legacyRoute } from "./route-utils.js";

const clientsRoutes = Router();

clientsRoutes.get("/client-projects", legacyRoute((request, response) =>
  clientsService.readClientProjects(response),
));

clientsRoutes.put("/client-projects", legacyRoute((request, response) =>
    clientsService.saveClientProjects(request, response),
));

export { clientsRoutes };
