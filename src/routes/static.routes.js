import { Router } from "express";
import { staticService } from "../services/static.service.js";
import { legacyRoute } from "./route-utils.js";

const staticRoutes = Router();

staticRoutes.get("*", legacyRoute((request, response) => staticService.serve(request, response)));

export { staticRoutes };
