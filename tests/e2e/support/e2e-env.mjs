// Shared environment contract for the Playwright end-to-end smoke harness.
//
// Two modes:
// - Managed-server mode (default): the harness boots its own `node server.js`
//   against a throwaway, git-ignored data directory (`data/e2e`) on a dedicated
//   local port, seeding the super admin with a test-only password. The data
//   directory is wiped at the start of every managed run so no real dev or
//   production data path is ever touched.
// - External-server mode: set LTF_E2E_BASE_URL to point at an already-running
//   server. No server is booted and nothing is wiped; supply LTF_E2E_USERNAME
//   and LTF_E2E_PASSWORD for an account on that server.
//
// Playwright is dev/test tooling only. Nothing under src/, server.js, or
// public/ may import this file or anything else in tests/e2e/.

import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const DEFAULT_E2E_PORT = 8101;

const externalBaseUrl = String(process.env.LTF_E2E_BASE_URL || "").trim().replace(/\/+$/, "");
const usesManagedServer = externalBaseUrl === "";

const parsedPort = Number.parseInt(String(process.env.LTF_E2E_PORT || ""), 10);
const E2E_PORT = Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65535
  ? parsedPort
  : DEFAULT_E2E_PORT;

const E2E_BASE_URL = usesManagedServer ? `http://127.0.0.1:${E2E_PORT}` : externalBaseUrl;

// Harness-owned throwaway data directory for managed-server runs. Lives under
// the git-ignored data/ tree, separate from the real dev database and files.
const E2E_DATA_DIR = path.join(repoRoot, "data", "e2e");

// Test-only credentials. In managed-server mode the bootstrap seeds the super
// admin with this password against the throwaway e2e database, so no real
// credential is committed or reused. External-server runs must override both.
const E2E_USERNAME = String(process.env.LTF_E2E_USERNAME || "").trim() || "support@longtailforge.local";
const E2E_PASSWORD = String(process.env.LTF_E2E_PASSWORD || "") || "Longtail-e2e-smoke-1!";

// Saved authenticated session (cookies) shared by the desktop/mobile projects.
// Written by auth.setup.mjs; git-ignored.
const E2E_STORAGE_STATE_PATH = path.join(repoRoot, "tests", "e2e", ".auth", "storage-state.json");

export {
  E2E_BASE_URL,
  E2E_DATA_DIR,
  E2E_PASSWORD,
  E2E_PORT,
  E2E_STORAGE_STATE_PATH,
  E2E_USERNAME,
  usesManagedServer,
};
