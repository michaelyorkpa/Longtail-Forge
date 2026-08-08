import { Router } from "express";
import { config } from "../config.js";
import { listPublicDemoVisitorAccounts } from "../core/public-demo-visitor-accounts.js";
import { AppError } from "../utils/app-error.js";

const PUBLIC_DEMO_TEMPORARY_CHANGES_NOTICE = "This public demo resets every hour, so your changes are temporary.";

function createPublicDemoAccountRoutes(options = {}) {
  const demoEnabled = options.demoEnabled ?? config.demo.enabled;
  const router = Router();

  router.get("/public-demo/accounts", (_request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (!demoEnabled) {
      throw new AppError("The requested resource was not found.", 404);
    }

    response.status(200).json({
      accounts: listPublicDemoVisitorAccounts(),
      notice: PUBLIC_DEMO_TEMPORARY_CHANGES_NOTICE,
    });
  });

  return router;
}

const publicDemoAccountRoutes = createPublicDemoAccountRoutes();

export {
  PUBLIC_DEMO_TEMPORARY_CHANGES_NOTICE,
  createPublicDemoAccountRoutes,
  publicDemoAccountRoutes,
};
