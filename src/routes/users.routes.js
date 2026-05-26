import { Router } from "express";
import { authService } from "../services/auth.service.js";
import { usersService } from "../services/users.service.js";
import { legacyRoute } from "./route-utils.js";

const usersRoutes = Router();

usersRoutes.get("/users", legacyRoute((request, response) =>
    usersService.list(response, request.session),
));

usersRoutes.post("/users", legacyRoute((request, response) =>
    usersService.create(request, response, request.session),
));

usersRoutes.put("/users/:userId/:action", legacyRoute((request, response) =>
    usersService.action(request, response, request.session, request.url),
));

usersRoutes.delete("/users/:userId", legacyRoute((request, response) =>
    usersService.delete(response, request.session, request.url),
));

usersRoutes.get("/user/settings", legacyRoute((request, response) =>
    usersService.readSettings(response, request.session),
));

usersRoutes.put("/user/settings", legacyRoute((request, response) =>
    usersService.saveSettings(request, response, request.session),
));

usersRoutes.put("/user/password", legacyRoute((request, response) =>
    authService.changePassword(request, response, request.session),
));

export { usersRoutes };
