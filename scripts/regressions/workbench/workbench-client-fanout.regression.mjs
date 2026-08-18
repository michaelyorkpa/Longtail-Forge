/* global fetch */

export const regressionMeta = Object.freeze({
  id: "workbench.workbench-client-fanout",
  area: "workbench",
  tier: "focused",
  tags: ["cache", "compression", "fan-out", "performance", "progressive-render"],
  description: "Proves the workbench client loads in one parallel fan-out with stale-while-revalidate caches and warm-first render, the cached-fetch helper never duplicates fetches, dialog scripts lazy-load, and the app serves compressed responses.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-workbench-fanout-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "workbench-fanout.db");
process.env.SUPER_ADMIN_PASSWORD = "Workbench-Fanout-Test-123!";

const workbenchSource = readFileSync(path.join(root, "public/js/workbench.js"), "utf8");
const navigationSource = readFileSync(path.join(root, "public/js/navigation.js"), "utf8");
const workbenchHtml = readFileSync(path.join(root, "views/protected/workbench.html"), "utf8");
const appSource = readFileSync(path.join(root, "src/core/app.js"), "utf8");
const cachedFetchSource = readFileSync(path.join(root, "public/js/shared/cached-fetch.js"), "utf8");

// The cached-fetch helper runs in a sandbox with a scripted API so its
// stale-while-revalidate and no-duplicate-fetch behavior is provable in Node.
function createCachedFetchSandbox() {
  const storage = new Map();
  const calls = [];
  let nextResponse = null;
  const sandboxWindow = {
    LongtailForge: {
      api: {
        getJson: async (url, options) => {
          calls.push({ options, url });
          return typeof nextResponse === "function" ? nextResponse(url) : nextResponse;
        },
      },
    },
    sessionStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      removeItem: (key) => storage.delete(key),
      setItem: (key, value) => storage.set(key, String(value)),
    },
  };
  new Function("window", cachedFetchSource)(sandboxWindow);

  return {
    calls,
    cachedFetch: sandboxWindow.LongtailForge.cachedFetch,
    setResponse: (value) => {
      nextResponse = value;
    },
  };
}

try {
  // One parallel fan-out: focus candidates fire with the restored selection
  // before anything is awaited, the former sequential waits are gone, and the
  // restored candidates are reused unless validation changed the selection.
  const loadWorkbenchBody = workbenchSource.slice(
    workbenchSource.indexOf("async function loadWorkbench()"),
    workbenchSource.indexOf("function renderWarmWorkbench()"),
  );
  assert.doesNotMatch(loadWorkbenchBody, /await window\.LongtailForge\.workspaceContextReady/, "loadWorkbench must not await the workspace context");
  assert.doesNotMatch(workbenchSource, /loadSessionTimezone/, "the workbench must not issue the /api/session timezone round-trip");
  assert.ok(
    loadWorkbenchBody.indexOf("loadFocusCandidatesForState()") < loadWorkbenchBody.indexOf("await Promise.all"),
    "focus candidates must be requested with the restored selection before the fan-out is awaited",
  );
  assert.match(loadWorkbenchBody, /renderWarmWorkbench\(\)/, "the warm render must happen before the fan-out resolves");
  assert.match(loadWorkbenchBody, /selectionInvalidated \? await loadFocusCandidatesForState\(\) : restoredFocusData/, "candidates refetch only when the restored selection is invalidated");
  assert.match(loadWorkbenchBody, /workbenchRegistryCardsChanged/, "cached-registry card fetches must reconcile against the fresh registry");
  assert.match(workbenchSource, /window\.addEventListener\("longtailforge:workspace-context-updated"/, "the workbench must reconcile on workspace-context updates");

  // Live reads stay uncached; near-static reads go through the shared helper.
  assert.match(workbenchSource, /focus-candidates\?\$\{params\.toString\(\)\}`, \{ cache: "no-store" \}/, "focus candidates stay uncached");
  assert.match(workbenchSource, /api\.getJson\(card\.listRoute, \{ cache: "no-store" \}\)/, "card source data stays uncached");
  assert.match(workbenchSource, /cachedFetch\.getJson\("\/api\/workbench\/focus-modes"/, "focus modes use the cached-fetch helper");
  assert.match(workbenchSource, /cachedFetch\.getJson\("\/api\/client-projects\?view=options"/, "client/project options use the cached-fetch helper");

  // Timezone comes from the app-shell bootstrap payload, and the stored
  // workspace context hydrates synchronously for cached-context renders.
  assert.match(navigationSource, /setUserTimezone\?\.\(shell\.user\?\.timezone \|\| shell\.timezone\)/, "the app-shell bootstrap must feed the session timezone");
  assert.match(navigationSource, /function hydrateStoredWorkspaceContext\(\)/, "the stored workspace context must hydrate synchronously");

  // Dialog-only scripts lazy-load through the module-action dependency
  // mechanism, and the remaining workbench scripts are deferred.
  for (const lazyScript of ["js/task-dialog.js", "js/time-entry-dialog.js", "js/clients-projects.js"]) {
    assert.equal(workbenchHtml.includes(`src="${lazyScript}"`), false, `${lazyScript} must not load statically on the workbench`);
    assert.ok(workbenchSource.includes(`src: "${lazyScript}"`), `${lazyScript} must be a lazy module-action dependency`);
  }
  const scriptTags = (workbenchHtml.match(/<script [^>]*src="js\/[^"]+"[^>]*>/g) || [])
    .filter((tag) => !tag.includes("js/theme-init.js"));
  assert.ok(scriptTags.length > 0, "workbench should keep its shared script tags");
  for (const tag of scriptTags) {
    assert.match(tag, /defer/, `workbench script tag should defer: ${tag}`);
  }
  assert.match(workbenchHtml, /js\/shared\/cached-fetch\.js/, "the cached-fetch helper must load on the workbench");

  // Cached-fetch behavior: cold fetches once, warm serves the cached copy and
  // revalidates exactly once, and onUpdate fires only when the payload drifts.
  const sandbox = createCachedFetchSandbox();
  sandbox.setResponse({ modes: ["one"] });
  const cold = await sandbox.cachedFetch.getJson("/api/workbench/focus-modes", { cacheKey: "ws:focus-modes" });
  assert.equal(cold.fromCache, false);
  assert.deepEqual(cold.data, { modes: ["one"] });
  assert.equal(sandbox.calls.length, 1, "a cold load fetches exactly once");
  assert.equal(sandbox.calls[0].options.cache, "no-cache", "near-static reads must allow ETag revalidation");

  const updates = [];
  const warm = await sandbox.cachedFetch.getJson("/api/workbench/focus-modes", {
    cacheKey: "ws:focus-modes",
    onUpdate: (data) => updates.push(data),
  });
  assert.equal(warm.fromCache, true, "a warm load serves the cached copy");
  await warm.revalidated;
  assert.equal(sandbox.calls.length, 2, "a warm load revalidates exactly once — no duplicate fetches");
  assert.deepEqual(updates, [], "onUpdate must not fire when the payload is unchanged");

  sandbox.setResponse({ modes: ["one", "two"] });
  const drifted = await sandbox.cachedFetch.getJson("/api/workbench/focus-modes", {
    cacheKey: "ws:focus-modes",
    onUpdate: (data) => updates.push(data),
  });
  assert.deepEqual(drifted.data, { modes: ["one"] }, "the stale copy renders first");
  await drifted.revalidated;
  assert.deepEqual(updates, [{ modes: ["one", "two"] }], "onUpdate fires once when the payload drifts");
  assert.deepEqual(sandbox.cachedFetch.readCached("ws:focus-modes"), { modes: ["one", "two"] }, "the cache stores the fresh payload");

  // The app itself serves compressed responses for compressible assets.
  assert.match(appSource, /app\.use\(compression\(\)\);/, "the app must register compression middleware");
  const { createApp } = await import("../../../src/core/app.js");
  const { closeSqlite, initializeDatabase } = await import("../../../src/db/index.js");
  await initializeDatabase();
  const server = await new Promise((resolve) => {
    const instance = http.createServer(/** @type {import("node:http").RequestListener} */ (/** @type {unknown} */ (createApp())));
    instance.listen(0, "127.0.0.1", () => resolve(instance));
  });

  try {
    const port = server.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/js/workbench.js`, {
      headers: { "Accept-Encoding": "gzip" },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-encoding"), "gzip", "compressible assets must be served gzip-compressed");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  await closeSqlite();
  console.log("workbench client fan-out regression passed.");
} finally {
  const { closeSqlite } = await import("../../../src/db/index.js");
  await closeSqlite().catch(() => {});
  await fs.rm(tempDir, { force: true, recursive: true });
}
