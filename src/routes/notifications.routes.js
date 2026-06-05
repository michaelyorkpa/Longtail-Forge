import { Router } from "express";
import { notificationsService } from "../services/notifications.service.js";
import { asyncRoute } from "../utils/http.js";

const notificationsRoutes = Router();

notificationsRoutes.get("/notifications", asyncRoute(async (request, response) => {
  const result = await notificationsService.list(request.session, request.query);
  response.status(200).json(result);
}));

notificationsRoutes.get("/notifications/unread-count", asyncRoute(async (request, response) => {
  const result = await notificationsService.unreadCount(request.session);
  response.status(200).json(result);
}));

notificationsRoutes.post("/notifications/:notificationId/read", asyncRoute(async (request, response) => {
  const result = await notificationsService.markRead(request.params.notificationId, request.session);
  response.status(200).json(result);
}));

notificationsRoutes.post("/notifications/read-all", asyncRoute(async (request, response) => {
  const result = await notificationsService.markAllRead(request.session);
  response.status(200).json(result);
}));

notificationsRoutes.post("/notifications/:notificationId/dismiss", asyncRoute(async (request, response) => {
  const result = await notificationsService.dismiss(request.params.notificationId, request.session);
  response.status(200).json(result);
}));

export { notificationsRoutes };
