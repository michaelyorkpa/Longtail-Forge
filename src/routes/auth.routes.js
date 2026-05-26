import { Router } from "express";
import { authService } from "../services/auth.service.js";
import { legacyRoute } from "./route-utils.js";

const authRoutes = Router();

authRoutes.post("/login", legacyRoute((request, response) => authService.login(request, response)));

authRoutes.post("/logout", legacyRoute((request, response) => authService.logout(request, response)));

authRoutes.get("/session", legacyRoute((request, response) => authService.readSession(request, response)));

export { authRoutes };
