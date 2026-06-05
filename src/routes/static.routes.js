import { Router } from "express";
import { staticService } from "../services/static.service.js";
import { asyncRoute } from "../utils/http.js";

const staticRoutes = Router();

staticRoutes.get("*", asyncRoute(async (request, response) => {
  const result = await staticService.read(request.url, request.session);

  response.writeHead(result.statusCode, {
    "Content-Type": result.contentType,
  });
  response.end(result.contents);
}));

export { staticRoutes };
