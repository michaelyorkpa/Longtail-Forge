// Playwright end-to-end smoke configuration. Dev/test tooling only: nothing
// in the production runtime (src/, server.js, public/) imports Playwright,
// `npm start` stays `node server.js`, and `npm run check` never invokes this
// suite — run it explicitly with `npm run test:e2e` (browsers install via
// `npm run test:e2e:install`).
//
// By default the harness boots its own isolated server (see
// tests/e2e/support/start-e2e-server.mjs) on a dedicated local port with a
// throwaway data directory and seeded test credentials. Set LTF_E2E_BASE_URL
// to target an already-running server instead (with LTF_E2E_USERNAME /
// LTF_E2E_PASSWORD for that server).

import { defineConfig } from "@playwright/test";
import {
  E2E_BASE_URL,
  E2E_STORAGE_STATE_PATH,
} from "./tests/e2e/support/e2e-env.mjs";

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  fullyParallel: true,
  reporter: "list",
  retries: isCI ? 1 : 0,
  workers: 2,
  use: {
    baseURL: E2E_BASE_URL,
    trace: isCI ? "on-first-retry" : "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      // Logs in once and saves the shared authenticated storageState.
      name: "setup",
      testMatch: /auth\.setup\.mjs/,
    },
    {
      // Named desktop viewport, reused across specs.
      name: "desktop",
      dependencies: ["setup"],
      grepInvert: /@mobile/,
      use: {
        browserName: "chromium",
        viewport: { width: 1280, height: 800 },
        storageState: E2E_STORAGE_STATE_PATH,
      },
    },
    {
      // Named mobile viewport, reused across specs.
      name: "mobile",
      dependencies: ["setup"],
      grepInvert: /@desktop/,
      use: {
        browserName: "chromium",
        viewport: { width: 375, height: 812 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        storageState: E2E_STORAGE_STATE_PATH,
      },
    },
  ],
});
