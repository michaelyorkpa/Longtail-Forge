// Managed e2e server boot for the Playwright smoke harness.
//
// Wipes the harness-owned throwaway data directory, pins every runtime
// environment value the harness depends on (so a local .env cannot redirect
// the managed server at real data), then boots the unchanged production entry
// point `node server.js` in-process. `npm start` itself is untouched; this
// wrapper exists only so Playwright's webServer gets a deterministic, isolated
// instance on a dedicated local port.

import fs from "node:fs";
import path from "node:path";
import { E2E_DATA_DIR, E2E_PASSWORD, E2E_PORT, E2E_USERNAME, usesManagedServer } from "./e2e-env.mjs";

if (!usesManagedServer) {
  throw new Error("LTF_E2E_BASE_URL is set; the harness must not boot a managed server for an external target.");
}

// Fresh throwaway data directory every managed run: deterministic bootstrap,
// deterministic seeded credentials, no state accumulation between runs.
fs.rmSync(E2E_DATA_DIR, { recursive: true, force: true });
fs.mkdirSync(E2E_DATA_DIR, { recursive: true });

// Pin the managed server's runtime contract before server.js loads .env
// (loadRuntimeEnvFile never overrides values that are already set).
process.env.PORT = String(E2E_PORT);
process.env.HOST = "127.0.0.1";
process.env.LONGTAIL_ENV = "development";
process.env.LONGTAIL_INITIAL_WORKSPACE_NAME = "E2E Smoke Workspace";
process.env.LONGTAIL_DATA_DIR = E2E_DATA_DIR;
process.env.LONGTAIL_DATABASE_FILE = path.join(E2E_DATA_DIR, "longtail-forge.db");
process.env.LONGTAIL_LOCAL_STORAGE_ROOT = path.join(E2E_DATA_DIR, "files");
process.env.LONGTAIL_SESSION_COOKIE_SECURE = "false";
process.env.LONGTAIL_SESSION_COOKIE_SAMESITE = "Lax";
process.env.LONGTAIL_SUPPORT_VIEW_ENABLED = "true";
process.env.LONGTAIL_SUPPORT_VIEW_TTL_SECONDS = "300";
process.env.SUPER_ADMIN_USERNAME = E2E_USERNAME;
process.env.SUPER_ADMIN_PASSWORD = E2E_PASSWORD;

await import("../../../server.js");
