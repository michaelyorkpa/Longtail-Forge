export const regressionMeta = Object.freeze({
  id: "views.dashboard-es-module-entry",
  area: "views",
  tier: "release-gate",
  tags: ["accessibility", "assets", "dashboard", "es-modules", "guardrail", "keyboard"],
  description: "Proves the Dashboard native ES-module entry, versioned local compatibility imports, contribution-owned module scripts and styles, and preserved accessible calendar controls.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const dashboardHtml = await read("views/protected/dashboard.html");
const workbenchHtml = await read("views/protected/workbench.html");
const entry = await read("public/js/dashboard.entry.js");
const dashboard = await read("public/js/dashboard.js");
const tasksDashboard = await read("public/js/tasks-dashboard.js");
const dashboardService = await read("src/services/dashboard.service.js");
const tasksModule = await read("src/modules/tasks/module.js");
const timeTrackingModule = await read("src/modules/time-tracking/module.js");
const frameworkCss = await read("public/css/longtail-forge.css");
const dashboardCss = await read("public/css/dashboard.css");
const tasksCss = await read("public/css/tasks-dashboard.css");
const timeTrackingCss = await read("public/css/time-tracking-dashboard.css");
const eslintConfig = await read("eslint.config.js");
let checks = 0;

const dashboardScripts = [...dashboardHtml.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)]
  .map((match) => match[0]);
assert.equal(dashboardScripts.length, 2, "Dashboard source should keep only critical theme init plus one page entry");
assert.match(dashboardScripts[0], /src="js\/theme-init\.js"/);
assert.match(dashboardScripts[1], /type="module" src="js\/dashboard\.entry\.js"/);
assert.doesNotMatch(dashboardHtml, /js\/(?:shared\/[^"']+|dashboard|tasks-dashboard|task-dialog|time-tracking-dashboard|footer)\.js/);
checks += 4;

assert.match(entry, /const namespace = window\.LongtailForge = window\.LongtailForge \|\| \{\}/);
assert.match(entry, /url\.origin !== window\.location\.origin/);
assert.ok(entry.includes("!/^\\/(?:css|js)\\//.test(url.pathname)"));
assert.match(entry, /namespace\.assetVersion\?\.value[\s\S]*meta\[data-asset-version\][\s\S]*url\.searchParams\.set\("v", version\)/);
assert.match(entry, /loadedScripts\.set\(url, import\(url\)\)/);
assert.match(entry, /await Promise\.all\(assetPaths\.map\(\(assetPath\) => importScript\(assetPath\)\)\)/);
assert.match(entry, /namespace\.esModuleBridge = Object\.freeze/);
assert.doesNotMatch(entry, /eval\(|new Function\(|https?:\/\//);
assert.match(eslintConfig, /files: \["public\/js\/dashboard\.entry\.js", "public\/js\/tasks-dashboard\.js"\][\s\S]*sourceType: "module"/);
checks += 9;

const explicitImports = [...entry.matchAll(/"(\/js\/[a-z0-9./-]+\.js)"/g)].map((match) => match[1]);
assert.ok(explicitImports.length >= 15, "Dashboard entry should explicitly name its preserved framework dependencies");
assert.equal(new Set(explicitImports).size, explicitImports.length, "Dashboard entry imports should not be duplicated");
for (const assetPath of explicitImports) {
  await fs.access(path.join(root, "public", assetPath.replace(/^\//, "")));
}
assert.ok(explicitImports.indexOf("/js/navigation.js") < explicitImports.indexOf("/js/dashboard.js"));
assert.ok(explicitImports.indexOf("/js/dashboard.js") < explicitImports.indexOf("/js/footer.js"));
checks += explicitImports.length + 4;

assert.match(dashboardService, /listActiveModuleBrowserAssets\(session\.workspace_id, session, "dashboard"\)/);
assert.match(dashboardService, /extensionPoints:\s*\{\s*browserAssets,\s*dashboardPanels/);
assert.match(dashboard, /const browserAssetsReady = loadDashboardBrowserAssets\(dashboardData\?\.extensionPoints\?\.browserAssets\)[\s\S]*await browserAssetsReady;[\s\S]*renderRegisteredDashboardPanels\(\)/);
assert.match(dashboard, /esModuleBridge\?\.loadContributedAssets/);
assert.doesNotMatch(dashboard, /tasks\.needs-attention|tasks\.calendar|tasks\.today-upcoming|tasks\.pressure|time-tracking\.active-timers/);
checks += 5;

for (const assetPath of [
  "/js/tasks-dashboard.js",
  "/css/tasks-dashboard.css",
  "/js/time-tracking-dashboard.js",
  "/css/time-tracking-dashboard.css",
]) {
  const owner = assetPath.includes("time-tracking") ? timeTrackingModule : tasksModule;
  assert.ok(owner.includes(`path: "${assetPath}"`), `${assetPath} must be declared by its owning module`);
  await fs.access(path.join(root, "public", assetPath.replace(/^\//, "")));
  checks += 2;
}
assert.match(tasksDashboard, /await bridge\.importScripts\(\[[\s\S]*"\/js\/shared\/task-calendar\.js"/);
assert.doesNotMatch(tasksDashboard.slice(0, tasksDashboard.indexOf("function renderTasksNeedsAttentionContribution")), /task-dialog\.js/);
assert.match(tasksDashboard, /async function openTask\(taskId, trigger\)[\s\S]*await bridge\.importScript\("\/js\/task-dialog\.js"\)/);
assert.match(tasksDashboard, /dashboard\.registerPanelRenderer\("tasks\.calendar"/);
assert.match(tasksDashboard, /taskCalendar\.fetchCalendarWindow\(range, \{[\s\S]*statuses: \["open", "in_progress", "blocked"\]/, "Dashboard calendar must request only active task statuses");
assert.match(tasksDashboard, /taskCalendar\.resolveDefaultView\(taskCalendar\.readPreferredCalendarView\(\)\)/, "Dashboard calendar must apply the saved or responsive default view");
assert.doesNotMatch(tasksDashboard, /workspaceContextReady|initialViewReady/, "Dashboard calendar must use the already hydrated context without delaying its first read");
assert.match(tasksDashboard, /attrs: \{ role: "group", "aria-label": "Dashboard calendar view" \}/);
assert.match(tasksDashboard, /attrs: \{ type: "button", "aria-pressed": viewId === state\.view/);
assert.match(tasksDashboard, /button\.addEventListener\("click"[\s\S]*state\.viewSelectedByUser = true[\s\S]*updateViewButtons\(\)/);
assert.match(tasksDashboard, /button\.setAttribute\("aria-pressed", button\.dataset\.dashboardCalendarView === state\.view/);
assert.match(tasksDashboard, /returnFocusTo: trigger/);
checks += 11;

assert.match(dashboardHtml, /css\/longtail-forge\.css[\s\S]*css\/dashboard\.css/);
assert.match(dashboardCss, /\.dashboard-page[\s\S]*\.dashboard-region-body--main[\s\S]*@media \(max-width: 720px\)/);
assert.match(tasksCss, /\.dashboard-calendar-toolbar[\s\S]*\.dashboard-task-row[\s\S]*@media \(max-width: 640px\)/);
assert.match(timeTrackingCss, /\.time-tracking-dashboard-content[\s\S]*\.time-tracking-dashboard-metrics/);
assert.doesNotMatch(frameworkCss, /\.dashboard-page|\.dashboard-task-row|\.time-tracking-dashboard-content/);
checks += 5;

assert.doesNotMatch(workbenchHtml, /workbench\.entry\.js|type="module"/);
assert.match(workbenchHtml, /js\/navigation\.js[\s\S]*js\/workbench\.js[\s\S]*js\/footer\.js/);
checks += 2;

console.log(`Dashboard ES-module entry guardrail passed ${checks} checks.`);

async function read(relativePath) {
  return fs.readFile(path.join(root, relativePath), "utf8");
}
