import { Router } from "express";
import { requireApiKey } from "../../middleware/require-api-key.js";
import { asyncRoute } from "../../core/http.js";

const developerExamplePublicApiRoutes = Router();

developerExamplePublicApiRoutes.get("/api/v1/developer-example", requireApiKey("developer_example:read"), asyncRoute(async (request, response) => {
  response.status(200).json({
    apiVersion: "v1",
    workspace_id: request.apiSession.workspace_id,
    data: {
      moduleId: "developer-example",
      message: "Developer example module public API route.",
    },
  });
}));

export { developerExamplePublicApiRoutes };

