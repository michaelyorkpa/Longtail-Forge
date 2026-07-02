import { Router } from "express";
import { jobsService } from "../services/jobs.service.js";
import { asyncRoute } from "../utils/http.js";

const jobsRoutes = Router();

jobsRoutes.get("/jobs/status", asyncRoute(async (request, response) => {
  const jobs = await jobsService.readAdminReadout(request.session, request.query);

  response.setHeader("Cache-Control", "no-store");
  response.status(200).json({ jobs });
}));

export { jobsRoutes };
