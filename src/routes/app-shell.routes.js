import { Router } from "express";
import { appShellService } from "../services/app-shell.service.js";
import { asyncRoute } from "../utils/http.js";

const appShellRoutes = Router();

appShellRoutes.get("/app-shell/bootstrap", asyncRoute(async (request, response) => {
  const result = await appShellService.bootstrap(request.session);
  response.status(200).json(result);
}));

export { appShellRoutes };
