import { Router } from "express";
import { config } from "../config.js";
import { correspondingSourceUrl } from "../core/corresponding-source.js";

const appInfoRoutes = Router();

appInfoRoutes.get("/app-info", (_request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.status(200).json({
    name: config.appName,
    version: config.appDisplayVersion,
    displayVersion: config.appDisplayVersion,
    canonicalVersion: config.appVersion,
    sourceBranch: config.release.sourceBranch,
    commitSha: config.release.commitSha || null,
    artifactSha256: config.release.artifactSha256 || null,
    correspondingSourceUrl: correspondingSourceUrl(),
  });
});

export { appInfoRoutes };
