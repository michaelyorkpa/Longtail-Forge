// @ts-check

import { Router } from "express";
import { config } from "../config.js";
import { correspondingSourceUrl } from "../core/corresponding-source.js";

/** @typedef {import("../types/route-contracts.js").RouteRequest} RouteRequest */
/** @typedef {import("../types/route-contracts.js").RouteResponse} RouteResponse */

const appInfoRoutes = Router();

appInfoRoutes.get("/app-info", /** @param {RouteRequest} _request @param {RouteResponse} response */ (_request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.status(200).json({
    name: config.appName,
    version: config.appDisplayVersion,
    displayVersion: config.appDisplayVersion,
    canonicalVersion: config.appVersion,
    sourceBranch: config.release.sourceBranch,
    commitSha: config.release.commitSha || null,
    artifactSha256: config.release.artifactSha256 || null,
    deploymentMode: config.deployment.mode,
    demoMode: config.demo.enabled,
    correspondingSourceUrl: correspondingSourceUrl(),
  });
});

export { appInfoRoutes };
