import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  E2E_BASE_URL,
  E2E_PASSWORD,
  E2E_USERNAME,
  usesManagedServer,
} from "../tests/e2e/support/e2e-env.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const playwrightCli = require.resolve("@playwright/test/cli");
const playwrightArgs = [playwrightCli, "test", ...process.argv.slice(2)];

/** @typedef {import("node:child_process").ChildProcess} ManagedChildProcess */

/** @type {ManagedChildProcess | null} */
let managedServer = null;
/** @type {ManagedChildProcess | null} */
let playwright = null;
let interruptedSignal = "";

for (const signal of /** @type {ReadonlyArray<NodeJS.Signals>} */ (["SIGINT", "SIGTERM"])) {
  process.once(signal, () => {
    interruptedSignal = signal;
    playwright?.kill(signal);
  });
}

try {
  if (usesManagedServer) {
    managedServer = spawn(process.execPath, ["tests/e2e/support/start-e2e-server.mjs"], {
      cwd: repoRoot,
      env: process.env,
      stdio: "inherit",
      windowsHide: true,
    });
    await waitForManagedServer(managedServer);
  }

  const childEnv = usesManagedServer
    ? {
        ...process.env,
        LTF_E2E_BASE_URL: E2E_BASE_URL,
        LTF_E2E_MANAGED_SERVER: "true",
        LTF_E2E_PASSWORD: E2E_PASSWORD,
        LTF_E2E_USERNAME: E2E_USERNAME,
      }
    : process.env;
  playwright = spawn(process.execPath, playwrightArgs, {
    cwd: repoRoot,
    env: childEnv,
    stdio: "inherit",
    windowsHide: true,
  });
  const result = await waitForExit(playwright);
  process.exitCode = !interruptedSignal && !result.signal ? (result.code ?? 1) : 1;
} finally {
  await stopManagedServer(managedServer);
}

/** @param {ManagedChildProcess} child */
async function waitForManagedServer(child) {
  const deadline = Date.now() + 120000;
  /** @type {Error | null} */
  let lastError = null;

  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Managed e2e server exited before readiness (code=${child.exitCode}, signal=${child.signalCode}).`);
    }
    try {
      const response = await globalThis.fetch(`${E2E_BASE_URL}/api/app-info`);
      if (response.ok) return;
      lastError = new Error(`Readiness returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Managed e2e server did not become ready within 120 seconds: ${lastError?.message || "unknown error"}`);
}

/** @param {ManagedChildProcess | null} child */
async function stopManagedServer(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;

  child.kill("SIGTERM");
  const closed = await Promise.race([
    waitForExit(child).then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 5000)),
  ]);
  if (closed) return;

  child.kill("SIGKILL");
  await waitForExit(child);
}

/**
 * @param {ManagedChildProcess} child
 * @returns {Promise<{ code: number | null, signal: NodeJS.Signals | null }>}
 */
function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}
