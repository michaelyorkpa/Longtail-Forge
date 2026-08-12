// @ts-check

import { Router } from "express";
import { operationalReadinessService } from "../services/operational-readiness.service.js";

function createOperationalHealthRoutes(options = {}) {
  const readinessService = options.readinessService || operationalReadinessService;
  const router = Router();

  router.get("/healthz", (_request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.status(200).json({ status: "ok" });
  });

  router.get("/readyz", async (_request, response) => {
    const ready = await readinessService.isReady();
    response.setHeader("Cache-Control", "no-store");
    response.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not_ready" });
  });

  return router;
}

const operationalHealthRoutes = createOperationalHealthRoutes();

export {
  createOperationalHealthRoutes,
  operationalHealthRoutes,
};
