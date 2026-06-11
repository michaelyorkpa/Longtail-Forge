import { Router } from "express";
import { listsService } from "./lists.service.js";
import { asyncRoute, readJsonBody } from "../../core/http.js";

const listsRoutes = Router();

listsRoutes.get("/lists", asyncRoute(async (request, response) => {
  const result = await listsService.list(request.session, request.query);
  response.status(200).json(result);
}));

listsRoutes.post("/lists", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await listsService.create(payload, request.session);
  response.status(201).json(result);
}));

listsRoutes.get("/lists/item-suggestions", asyncRoute(async (request, response) => {
  const result = await listsService.suggestItems(request.session, request.query);
  response.status(200).json(result);
}));

listsRoutes.get("/lists/catalog-items", asyncRoute(async (request, response) => {
  const result = await listsService.suggestItems(request.session, request.query);
  response.status(200).json({ catalogItems: result.suggestions });
}));

listsRoutes.post("/lists/catalog-items", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await listsService.createCatalogItem(payload, request.session);
  response.status(201).json(result);
}));

listsRoutes.put("/lists/catalog-items/:catalogItemId", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await listsService.updateCatalogItem(request.params.catalogItemId, payload, request.session);
  response.status(200).json(result);
}));

listsRoutes.post("/lists/item-catalog", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await listsService.createCatalogItem(payload, request.session);
  response.status(201).json(result);
}));

listsRoutes.put("/lists/item-catalog/:catalogItemId", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await listsService.updateCatalogItem(request.params.catalogItemId, payload, request.session);
  response.status(200).json(result);
}));

listsRoutes.get("/lists/:listId", asyncRoute(async (request, response) => {
  const result = await listsService.read(request.params.listId, request.session, {
    includeDeleted: request.query.includeDeleted === "true" || request.query.include_deleted === "true",
    includeDeletedItems: request.query.includeDeletedItems === "true" || request.query.include_deleted_items === "true",
    includeItems: request.query.includeItems !== "false" && request.query.include_items !== "false",
  });
  response.status(200).json(result);
}));

listsRoutes.put("/lists/:listId", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await listsService.update(request.params.listId, payload, request.session);
  response.status(200).json(result);
}));

listsRoutes.delete("/lists/:listId", asyncRoute(async (request, response) => {
  const result = await listsService.softDelete(request.params.listId, request.session);
  response.status(200).json(result);
}));

listsRoutes.post("/lists/:listId/complete", asyncRoute(async (request, response) => {
  const result = await listsService.complete(request.params.listId, request.session);
  response.status(200).json(result);
}));

listsRoutes.post("/lists/:listId/finalize", asyncRoute(async (request, response) => {
  const result = await listsService.finalize(request.params.listId, request.session);
  response.status(200).json(result);
}));

listsRoutes.post("/lists/:listId/reopen", asyncRoute(async (request, response) => {
  const result = await listsService.reopen(request.params.listId, request.session);
  response.status(200).json(result);
}));

listsRoutes.post("/lists/:listId/duplicate", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await listsService.duplicate(request.params.listId, payload, request.session);
  response.status(201).json(result);
}));

listsRoutes.post("/lists/:listId/mark-reusable", asyncRoute(async (request, response) => {
  const result = await listsService.markReusable(request.params.listId, request.session);
  response.status(200).json(result);
}));

listsRoutes.post("/lists/:listId/unmark-reusable", asyncRoute(async (request, response) => {
  const result = await listsService.unmarkReusable(request.params.listId, request.session);
  response.status(200).json(result);
}));

listsRoutes.post("/lists/:listId/archive", asyncRoute(async (request, response) => {
  const result = await listsService.archive(request.params.listId, request.session);
  response.status(200).json(result);
}));

listsRoutes.post("/lists/:listId/restore", asyncRoute(async (request, response) => {
  const result = await listsService.restore(request.params.listId, request.session);
  response.status(200).json(result);
}));

listsRoutes.post("/lists/:listId/delete", asyncRoute(async (request, response) => {
  const result = await listsService.softDelete(request.params.listId, request.session);
  response.status(200).json(result);
}));

listsRoutes.get("/lists/:listId/items", asyncRoute(async (request, response) => {
  const result = await listsService.read(request.params.listId, request.session, {
    includeDeletedItems: request.query.includeDeletedItems === "true" || request.query.include_deleted_items === "true",
  });
  response.status(200).json({ items: result.items });
}));

listsRoutes.post("/lists/:listId/items", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await listsService.createItem(request.params.listId, payload, request.session);
  response.status(201).json(result);
}));

listsRoutes.post("/lists/:listId/items/reorder", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await listsService.reorderItems(request.params.listId, payload, request.session);
  response.status(200).json(result);
}));

listsRoutes.put("/lists/:listId/items/:itemId", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await listsService.updateItem(request.params.listId, request.params.itemId, payload, request.session);
  response.status(200).json(result);
}));

listsRoutes.delete("/lists/:listId/items/:itemId", asyncRoute(async (request, response) => {
  const result = await listsService.deleteItem(request.params.listId, request.params.itemId, request.session);
  response.status(200).json(result);
}));

listsRoutes.post("/lists/:listId/items/:itemId/check", asyncRoute(async (request, response) => {
  const result = await listsService.checkItem(request.params.listId, request.params.itemId, request.session);
  response.status(200).json(result);
}));

listsRoutes.post("/lists/:listId/items/:itemId/uncheck", asyncRoute(async (request, response) => {
  const result = await listsService.uncheckItem(request.params.listId, request.params.itemId, request.session);
  response.status(200).json(result);
}));

listsRoutes.post("/lists/:listId/items/:itemId/complete", asyncRoute(async (request, response) => {
  const result = await listsService.completeItem(request.params.listId, request.params.itemId, request.session);
  response.status(200).json(result);
}));

listsRoutes.post("/lists/:listId/items/:itemId/delete", asyncRoute(async (request, response) => {
  const result = await listsService.deleteItem(request.params.listId, request.params.itemId, request.session);
  response.status(200).json(result);
}));

export { listsRoutes };
