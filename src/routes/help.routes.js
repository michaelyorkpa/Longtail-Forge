import { Router } from "express";
import { helpService } from "../services/help.service.js";
import { asyncRoute } from "../utils/http.js";

const helpRoutes = Router();

helpRoutes.get("/help", asyncRoute(async (request, response) => {
  const result = await helpService.list(request.session);
  response.status(200).json(result);
}));

helpRoutes.get("/help/articles/:articleIdOrSlug", asyncRoute(async (request, response) => {
  const result = await helpService.readArticle(request.session, request.params.articleIdOrSlug);
  response.status(200).json(result);
}));

export { helpRoutes };
