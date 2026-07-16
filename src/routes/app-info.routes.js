import { Router } from "express";
import { config } from "../config.js";
import { appVersion } from "../core/version.js";

const appInfoRoutes = Router();

appInfoRoutes.get("/app-info", (_request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.status(200).json({
    name: config.appName,
    version: appVersion,
    commitSha: config.release.commitSha || null,
    artifactSha256: config.release.artifactSha256 || null,
  });
});

export { appInfoRoutes };
