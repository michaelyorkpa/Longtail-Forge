import { Router } from "express";
import { workspaceAsyncRoute } from "../../core/http.js";

const developerExampleRoutes = Router();

developerExampleRoutes.get("/developer-example/status", workspaceAsyncRoute(async (request, response) => {
  response.status(200).json({
    moduleId: "developer-example",
    workspace_id: request.session.workspace_id,
    message: "Developer example module browser route.",
  });
}));

export { developerExampleRoutes };
