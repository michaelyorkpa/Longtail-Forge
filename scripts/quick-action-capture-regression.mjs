import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const appShellService = readText("src/services/app-shell.service.js");
const footer = readText("public/js/footer.js");
const dashboardEntry = readText("public/js/dashboard.entry.js");
const navigation = readText("public/js/navigation.js");
const stylesheet = readText("public/css/longtail-forge.css");
const icons = readText("public/js/shared/icons.js");
const moduleActions = readText("public/js/shared/module-actions.js");
const moduleContract = readText("docs/module-contract.md");
const surfaceContract = readText("docs/ui-surface-contract.md");
const regressionSuite = readText("scripts/regression-legacy-snapshot.json");
let checks = 0;

function check(name, assertion) {
  assertion();
  checks += 1;
}

check("app-shell bootstrap publishes server-gated quick actions", () => {
  assert.match(appShellService, /const QUICK_ACTION_DEFINITIONS = Object\.freeze\(\[/);
  assert.match(appShellService, /readQuickActions\(session, workspaceContext, \{ reportingReports, searchTargets \}\)/);
  assert.match(appShellService, /quickActions,/);
  assert.match(appShellService, /workspaceContext: \{[\s\S]*quickActions,[\s\S]*viewSurfaces,/);
  assert.match(navigation, /quickActions: shell\.quickActions \|\| shell\.workspaceContext\?\.quickActions \|\| \[\]/);
  assert.match(navigation, /quickActions: Array\.isArray\(settings\.quickActions\) \? settings\.quickActions : previousContext\.quickActions \|\| \[\]/);
});

check("quick actions are gated by module, capability, permission, and search availability", () => {
  assert.match(appShellService, /function quickActionModulesAvailable/);
  assert.match(appShellService, /function quickActionWorkspaceCapabilitiesAvailable/);
  assert.match(appShellService, /function quickActionPermissionsAllowed/);
  assert.match(appShellService, /permissionsService\.canInAnyScope\(session, permissionId/);
  assert.match(appShellService, /requiredSearchTargets/);
  assert.match(appShellService, /normalizeSearchTargetsForQuickActions\(options\.searchTargets\)\.length === 0/);
  assert.match(appShellService, /requiredReportingReports/);
  assert.match(appShellService, /normalizeReportingReportsForShell\(options\.reportingReports\)\.length === 0/);
});

check("first action set routes modal-backed Timer, Task, Note, and List actions through the registry", () => {
  assert.match(appShellService, /id: "timer"[\s\S]*actionType: "module-action"[\s\S]*moduleActionId: "time-tracking\.timer\.create"[\s\S]*requiredPermissions: \["time_entries\.create"\]/);
  assert.match(appShellService, /id: "task"[\s\S]*actionType: "module-action"[\s\S]*moduleActionId: "tasks\.add"[\s\S]*requiredPermissions: \["tasks\.create"\]/);
  assert.match(appShellService, /id: "note"[\s\S]*actionType: "module-action"[\s\S]*moduleActionId: "notes\.add"[\s\S]*requiredPermissions: \["notes\.create"\]/);
  assert.match(appShellService, /id: "list"[\s\S]*actionType: "module-action"[\s\S]*moduleActionId: "lists\.add"[\s\S]*requiredPermissions: \["lists\.create"\]/);
  [
    ["file", "files.html", "target-aware file upload capture ships"],
    ["reporting", "reporting.html", "reporting.view"],
    ["search", "search.html", "Temporary fallback: opens Search"],
  ].forEach(([id, href, marker]) => {
    assert.match(appShellService, new RegExp(`id: "${id}"[\\s\\S]*actionType: "fallback-link"[\\s\\S]*href: "${escapeRegExp(href)}"[\\s\\S]*${escapeRegExp(marker)}`));
    assert.match(appShellService, new RegExp(`id: "${id}"[\\s\\S]*temporaryFallback: true`));
  });
});

check("shared footer owns a quiet bottom-right drawer on protected shell pages", () => {
  assert.match(footer, /mountQuickActionCapture\(\)/);
  assert.match(footer, /window\.LongtailForge\?\.workspaceContextReady/);
  assert.match(footer, /document\.querySelector\("\.site-header"\)/);
  assert.match(footer, /root\.dataset\.quickActionCapture = ""/);
  assert.match(footer, /drawer\.hidden = true/);
  assert.match(footer, /drawer\.setAttribute\("aria-hidden", "true"\)/);
  assert.match(footer, /setAttribute\("aria-expanded", "false"\)/);
  assert.match(footer, /event\.key === "Escape"/);
  assert.match(footer, /root\.contains\(event\.target\)/);
  assert.match(footer, /shell\.toggle\.focus\(\)/);
});

check("QAC dispatches modal actions through the module action registry with safe current-page context", () => {
  assert.match(footer, /"time-tracking\.timer\.create": \[[\s\S]*js\/time-tracking-timer-dialog\.js/);
  assert.match(footer, /quickActionDependencySets = \{[\s\S]*"tasks\.add": \[[\s\S]*js\/shared\/module-actions\.js[\s\S]*js\/task-dialog\.js/);
  assert.match(footer, /const moduleActionBaseDependencies = \[[\s\S]*js\/shared\/module-actions\.js/);
  assert.match(footer, /"notes\.add": \[[\s\S]*\.\.\.moduleActionBaseDependencies[\s\S]*module: true, src: "js\/notes\.js"/);
  assert.match(footer, /"lists\.add": \[[\s\S]*\.\.\.moduleActionBaseDependencies[\s\S]*module: true, src: "js\/lists\.js"/);
  assert.match(footer, /function loadQuickActionScript\(dependency\)[\s\S]*dependency\.module[\s\S]*import\(key\)[\s\S]*document\.createElement\("script"\)/);
  assert.match(footer, /ensureQuickActionDependencies\(action\.moduleActionId\)/);
  assert.match(footer, /window\.LongtailForge\.moduleActions\.open\(action\.moduleActionId, \{[\s\S]*source: "quick-action-capture"/);
  assert.match(footer, /function readQuickActionPageContext\(\)[\s\S]*path: window\.location\.pathname[\s\S]*query: window\.location\.search[\s\S]*title:/);
  assert.match(moduleActions, /trigger\.focus\(\)/);
  assert.match(moduleActions, /complete: \(detail = \{\}\) => finish\(true, detail\)/);
  assert.match(footer, /refresh: \(detail\) => notifyQuickActionHostRefresh\(action, detail\)/);
});

check("QAC uses the shared icon registry and avoids badge or recommendation behavior", () => {
  assert.match(icons, /bolt: Object\.freeze/);
  assert.match(footer, /icon: "bolt"/);
  assert.doesNotMatch(functionBlock(footer, "createQuickActionShell"), /badge|alert|recommend/i);
  assert.doesNotMatch(functionBlock(footer, "createQuickActionItem"), /badge|alert|recommend/i);
});

check("QAC styles are footer-aware, responsive, and quiet until opened", () => {
  assert.match(stylesheet, /\.quick-action-capture\s*\{[\s\S]*position:\s*fixed;[\s\S]*right:\s*max\(16px, env\(safe-area-inset-right\)\);[\s\S]*bottom:\s*var\(--quick-action-bottom\)/);
  assert.match(stylesheet, /--quick-action-bottom:\s*calc\(var\(--site-footer-visible-offset,\s*0px\) \+ 20px\)/);
  assert.match(stylesheet, /\.quick-action-capture-drawer\[hidden\]\s*\{[\s\S]*display:\s*none;/);
  assert.match(stylesheet, /@media \(max-width: 640px\)[\s\S]*\.quick-action-capture-toggle \.action-button-label\s*\{[\s\S]*display:\s*none;/);
  assert.doesNotMatch(stylesheet.match(/\.quick-action-capture[\s\S]*?\/\* Default card-like page container/)?.[0] || "", /badge|alert|recommend/i);
});

check("all shell-backed protected hosts load the shared app shell includes that mount QAC", () => {
  const accountRecovery = readText(path.join("views", "protected", "account-recovery.html"));
  assert.doesNotMatch(accountRecovery, /js\/navigation\.js/, "export-only recovery must not load ordinary navigation or QAC");
  assert.match(accountRecovery, /js\/account-recovery\.js/, "export-only recovery should load only its restricted controller");
  const protectedViews = readdirSync(path.join(root, "views", "protected"))
    .filter((fileName) => fileName.endsWith(".html"))
    .filter((fileName) => !["account-recovery.html", "developer-example.html"].includes(fileName));

  assert.ok(protectedViews.length > 0, "protected views should be present");
  protectedViews.forEach((fileName) => {
    const source = readText(path.join("views", "protected", fileName));

    if (fileName === "dashboard.html") {
      assert.match(source, /type="module" src="js\/dashboard\.entry\.js"/, "Dashboard should load its authenticated module entry");
      assert.match(dashboardEntry, /"\/js\/navigation\.js"[\s\S]*"\/js\/footer\.js"/, "Dashboard entry should import the authenticated navigation and shared footer shells");
      return;
    }

    assert.match(source, /js\/navigation\.js/, `${fileName} should load the authenticated navigation shell`);
    assert.match(source, /js\/footer\.js/, `${fileName} should load the shared footer shell`);
  });
});

check("documentation records the QAC framework/module boundary", () => {
  assert.match(moduleContract, /As of 0\.33\.6\.10b[\s\S]*Quick Action Capture/);
  assert.match(moduleContract, /Task, Note, and List actions dispatch through `LongtailForge\.moduleActions`/);
  assert.match(moduleContract, /As of 0\.33\.6\.12d-2[\s\S]*Time Tracking owns `time-tracking\.timer\.create`/);
  assert.match(surfaceContract, /As of 0\.33\.6\.10b[\s\S]*Quick Action Capture/);
  assert.match(surfaceContract, /must not show badges, alerts, or recommendation behavior/);
  assert.match(surfaceContract, /As of 0\.33\.6\.12d-2[\s\S]*QAC Timer opens the Time Tracking Create Timer modal/);
});

check("regression suite includes QAC coverage", () => {
  assert.match(regressionSuite, /scripts\/quick-action-capture-regression\.mjs/);
});

console.log(`Quick Action Capture regression passed ${checks} checks.`);

function readText(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function functionBlock(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `Missing function ${functionName}`);
  const nextFunction = source.slice(start + 1).search(/\nfunction\s+/);
  return source.slice(start, nextFunction === -1 ? source.length : start + 1 + nextFunction);
}
