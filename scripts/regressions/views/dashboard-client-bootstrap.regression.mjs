export const regressionMeta = Object.freeze({
  id: "views.dashboard-client-bootstrap",
  area: "views",
  tier: "focused",
  tags: ["assets", "dashboard", "performance", "sequencing", "views"],
  description: "Pins Dashboard warm-first bootstrap sequencing, route-promise reuse, parallel asset loading, the rendered first-fetch gap budget, and lazy Task editor delivery.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";

const [
  dashboardEntry,
  dashboardHost,
  tasksDashboard,
  taskCalendar,
  timeTrackingDashboard,
  tasksModule,
] = await Promise.all([
  readText("public/js/dashboard.entry.js"),
  readText("public/js/dashboard.js"),
  readText("public/js/tasks-dashboard.js"),
  readText("public/js/shared/task-calendar.js"),
  readText("public/js/time-tracking-dashboard.js"),
  readText("src/modules/tasks/module.js"),
]);

assert.match(
  dashboardEntry,
  /async function importScripts\(assetPaths\) \{\s*await Promise\.all\(assetPaths\.map\(\(assetPath\) => importScript\(assetPath\)\)\);\s*\}/,
  "Dashboard base-script batches must load in parallel",
);
assert.match(
  dashboardEntry,
  /async function loadContributedAssets\(assets\) \{\s*await Promise\.all\(/,
  "Dashboard contributed scripts and styles must load in parallel",
);
assert.doesNotMatch(
  dashboardEntry,
  /for\s+await|for\s*\([^)]*of assetPaths[^)]*\)\s*\{\s*await importScript|for\s*\([^)]*of Array\.isArray\(assets\)[^)]*\)\s*\{/,
  "Dashboard asset loaders must not restore serial for-await chains",
);

const manifestStart = dashboardEntry.indexOf("const dashboardManifestPromise = loadDashboardManifest()");
const warmStart = dashboardEntry.search(/dashboardManifestPromise\r?\n  \.then/);
const remainingHostAssets = dashboardEntry.indexOf('"/js/shared/modal.js"');
assert.ok(manifestStart >= 0 && warmStart > manifestStart, "Dashboard entry must start and warm the manifest");
assert.ok(
  warmStart < remainingHostAssets,
  "Dashboard manifest warmup must be armed before the remaining host assets load",
);
assert.match(
  dashboardEntry,
  /cachedFetch\.getJson\("\/api\/dashboard"[\s\S]*cacheKey: `\$\{workspaceId\}:dashboard:\$\{dashboardAssetVersion\(\)\}:manifest`/,
  "the near-static Dashboard manifest must use the workspace- and release-keyed stale-while-revalidate helper",
);
assert.match(
  dashboardEntry,
  /const dashboardDataPromises = new Map\(\)[\s\S]*dataPromises: dashboardDataPromises[\s\S]*loadDashboardRoute\(dashboardPanelRoute\(panel\)\)/,
  "panel data warmup must populate the shared route-keyed promise map",
);
assert.match(
  dashboardEntry,
  /panel\.renderer !== "tasks\.calendar"[\s\S]*new Date\(\)[\s\S]*statuses: "open,in_progress,blocked"/,
  "the Dashboard calendar warm route must be Today-anchored and active-status scoped",
);

const hostWarm = dashboardHost.indexOf("warmDashboardPanelData();");
const hostAssetLoad = dashboardHost.indexOf("const browserAssetsReady = loadDashboardBrowserAssets");
const hostAssetAwait = dashboardHost.indexOf("await browserAssetsReady;");
assert.ok(
  hostWarm >= 0 && hostWarm < hostAssetLoad && hostAssetLoad < hostAssetAwait,
  "Dashboard panel reads must warm before contributed-asset loading completes",
);
assert.match(
  dashboardHost,
  /const dashboardDataPromises = dashboardBootstrap\?\.dataPromises \|\| new Map\(\)/,
  "the Dashboard host must reuse the entry's route promise map",
);
assert.match(
  timeTrackingDashboard,
  /const effortSummaryPromises = window\.LongtailForge\?\.dashboardBootstrap\?\.dataPromises \|\| new Map\(\)/,
  "Time Tracking panels must reuse their prewarmed effort-summary promise",
);
assert.match(
  taskCalendar,
  /const dashboardLoadRoute = root\.dashboardBootstrap\?\.loadRoute[\s\S]*return dashboardLoadRoute\(route\)/,
  "the shared task calendar must reuse its prewarmed bounded route on Dashboard",
);

assert.doesNotMatch(
  tasksDashboard.slice(0, tasksDashboard.indexOf("function renderTasksNeedsAttentionContribution")),
  /task-dialog\.js/,
  "Tasks Dashboard registration must not load the Task editor on first paint",
);
assert.match(
  tasksDashboard,
  /async function openTask\(taskId, trigger\)[\s\S]*await bridge\.importScript\("\/js\/task-dialog\.js"\)[\s\S]*openTaskEditor/,
  "the Task editor must load only when a Dashboard calendar item is opened",
);
assert.doesNotMatch(
  tasksDashboard,
  /workspaceContextReady/,
  "Dashboard calendar hydration must not wait for the app-shell workspace-context promise",
);

const taskDialogAsset = tasksModule.match(/\{\s*id: "tasks-dialog-script",[\s\S]*?\n\s*\},/)?.[0] || "";
assert.ok(taskDialogAsset, "Tasks must retain the canonical Task dialog browser asset");
assert.match(taskDialogAsset, /views: \["tasks", "workbench"\]/);
assert.doesNotMatch(taskDialogAsset, /"dashboard"/);

console.log("Dashboard client bootstrap regression passed.");

async function readText(relativePath) {
  return fs.readFile(new URL(`../../../${relativePath}`, import.meta.url), "utf8");
}
