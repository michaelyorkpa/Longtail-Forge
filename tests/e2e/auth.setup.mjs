// Seeded test-session setup: logs in once against the target server and saves
// the authenticated storageState (session cookies) that the desktop and mobile
// projects reuse, so protected surfaces are reachable without hard-coding real
// credentials into specs.

import fs from "node:fs";
import path from "node:path";
import { expect, test as setup } from "@playwright/test";
import { E2E_PASSWORD, E2E_STORAGE_STATE_PATH, E2E_USERNAME } from "./support/e2e-env.mjs";

setup("seed an authenticated session", async ({ request }) => {
  const response = await request.post("/api/login", {
    data: {
      username: E2E_USERNAME,
      password: E2E_PASSWORD,
    },
  });

  expect(
    response.ok(),
    `login as ${E2E_USERNAME} must succeed (status ${response.status()}); ` +
      "for LTF_E2E_BASE_URL external-server runs set LTF_E2E_USERNAME/LTF_E2E_PASSWORD",
  ).toBeTruthy();

  fs.mkdirSync(path.dirname(E2E_STORAGE_STATE_PATH), { recursive: true });
  await request.storageState({ path: E2E_STORAGE_STATE_PATH });
});
