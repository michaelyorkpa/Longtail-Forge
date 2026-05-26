import { Router } from "express";
import { timeEntriesService } from "../services/time-entries.service.js";
import { legacyRoute } from "./route-utils.js";

const timeEntriesRoutes = Router();

timeEntriesRoutes.get("/time-entries", legacyRoute((request, response) =>
  timeEntriesService.list(response),
));

timeEntriesRoutes.post("/time-entries", legacyRoute((request, response) =>
  timeEntriesService.create(request, response),
));

timeEntriesRoutes.put("/time-entries/:entryId", legacyRoute((request, response) =>
    timeEntriesService.update(request, response),
));

export { timeEntriesRoutes };
