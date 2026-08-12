import assert from "node:assert/strict";

import { assertRoadmapCursorAtLeast } from "./lib/roadmap-cursor.mjs";
import { createProjectTextReader } from "./test-support/source-scan.mjs";
const { readText } = createProjectTextReader();

const appShellService = readText("src/services/app-shell.service.js");
const changelog = readText("CHANGELOG.md");
const footer = readText("public/js/footer.js");
const quickActionRefresh = readText("public/js/shared/quick-action-refresh.js");
const workbench = readText("public/js/workbench.js");
const workbenchView = readText("views/protected/workbench.html");
const moduleActions = readText("public/js/shared/module-actions.js");
const timerDialog = readText("public/js/time-tracking-timer-dialog.js");
const quickActionCaptureRegression = readText("scripts/quick-action-capture-regression.mjs");
const moduleActionsRegression = readText("scripts/module-actions-regression.mjs");
const moduleContract = readText("docs/module-contract.md");
const surfaceContract = readText("docs/ui-surface-contract.md");
const timeTrackingDocs = readText("docs/time-tracking-module.md");
const architectureDocs = readText("docs/architecture.md");

const timerQuickAction = actionDefinitionBlock(appShellService, "timer");
assert.match(
  timerQuickAction,
  /actionType: "module-action"[\s\S]*moduleActionId: "time-tracking\.timer\.create"[\s\S]*requiredPermissions: \["time_entries\.create"\]/,
  "QAC Timer should dispatch the Time Tracking Create Timer module action",
);
assert.doesNotMatch(
  timerQuickAction,
  /fallback-link|href: "time-tracker\.html"|temporaryFallback|temporaryLabel/,
  "QAC Timer should no longer expose the temporary Time Tracker page fallback",
);

assert.match(
  moduleActions,
  /id: "time-tracking\.timer\.create"[\s\S]*recordType: "active_timer"[\s\S]*open: \(params, hostContext\) => namespace\.timeTrackingTimerDialog\.openCreate\(params, hostContext\)/,
  "shared module actions should register the Time Tracking Create Timer opener",
);
assert.match(
  timerDialog,
  /namespace\.moduleActions\?\.register\?\.\(\{[\s\S]*actionId: TIMER_ACTION_ID[\s\S]*open: openCreate[\s\S]*recordType: "active_timer"/,
  "Time Tracking dialog script should self-register the Create Timer action when lazy-loaded",
);

assert.match(
  footer,
  /const moduleActionBaseDependencies = \[[\s\S]*js\/shared\/module-actions\.js/,
  "QAC should keep module action registry loading in the shared dependency base",
);
assert.match(footer, /recordType: registeredAction\?\.recordType \|\| ""/,
  "QAC refresh events should carry the registered module-action record type");
assert.match(quickActionRefresh, /longtailforge:quick-action-refresh/,
  "framework refresh helper should own the QAC event name");
assert.match(quickActionRefresh, /function subscribe\(options = \{\}\)[\s\S]*global\.addEventListener\(EVENT_NAME, listener\)[\s\S]*return \(\) => global\.removeEventListener/,
  "framework refresh helper should own filtered listener lifecycle");
assert.match(workbenchView, /js\/shared\/quick-action-refresh\.js[\s\S]*js\/workbench\.js/,
  "Workbench should load the shared refresh helper before its page script");
assert.match(workbench, /quickActionRefresh\?\.subscribe\(\{[\s\S]*actionIds: \["time-tracking\.timer\.create"\][\s\S]*onRefresh: refreshWorkbenchTimers[\s\S]*recordTypes: \["active_timer"\]/,
  "Workbench should declaratively consume timer quick-action refreshes");
assert.match(workbench, /async function refreshWorkbenchTimers\(\)[\s\S]*state\.timers = sourceData\.timers[\s\S]*renderTimers\(\)/,
  "Workbench quick-action consumption should refresh only timer card state");
assert.match(
  footer,
  /"time-tracking\.timer\.create": \[[\s\S]*js\/shared\/page-controller\.js[\s\S]*\.\.\.moduleActionBaseDependencies[\s\S]*js\/shared\/client-project-options\.js[\s\S]*js\/time-tracking-timer-dialog\.js/,
  "QAC should lazy-load the Time Tracking Create Timer dialog dependencies",
);
assert.match(
  footer,
  /refresh: \(detail\) => notifyQuickActionHostRefresh\(action, detail\)/,
  "QAC should pass a host refresh callback into module action dispatch",
);
assert.match(
  footer,
  /function notifyQuickActionHostRefresh\(action, detail = \{\}\)[\s\S]*new CustomEvent\("longtailforge:quick-action-refresh"/,
  "QAC refresh callback should notify the current host after modal completion",
);

assert.match(timerDialog, /data-time-tracking-timer-dialog-client/, "Create Timer modal should include Client");
assert.match(timerDialog, /data-time-tracking-timer-dialog-project/, "Create Timer modal should include Project");
assert.match(timerDialog, /data-time-tracking-timer-dialog-task/, "Create Timer modal should include optional Task");
assert.match(timerDialog, /data-time-tracking-timer-dialog-description/, "Create Timer modal should include Description");
assert.match(timerDialog, /data-time-tracking-timer-dialog-billable-control[\s\S]*data-time-tracking-timer-dialog-billable/, "Create Timer modal should keep Billable inside a workspace-aware control");
assert.match(timerDialog, /Start Timer/, "Create Timer modal should expose a Start Timer action");

assert.match(
  timerDialog,
  /api\.getJson\("\/api\/client-projects\?view=options"[\s\S]*loadTaskOptions\(\)[\s\S]*api\.getJson\("\/api\/active-timers"/,
  "Create Timer modal should hydrate Client/Project, optional task, and active timer-slot state",
);
assert.match(
  timerDialog,
  /api\.getJson\("\/api\/tasks\?status=active&limit=200"/,
  "Create Timer modal should read Tasks-owned active task options for optional task selection",
);
assert.match(
  timerDialog,
  /function populateTaskOptions[\s\S]*task\.project_id && \(!selectedProjectId \|\| task\.project_id === selectedProjectId\)/,
  "Create Timer modal should offer only project-linked task timer candidates",
);

assert.match(
  timerDialog,
  /function updateBillableDefault\(\)[\s\S]*!workspaceUsesBillableFlag\(\)[\s\S]*fields\.billable\.value = "no"[\s\S]*const billableSource = project \|\| client;[\s\S]*fields\.billable\.value = billableSource\?\.billable === "no" \? "no" : "yes";/,
  "Manual timer billable default should be disabled outside Business and otherwise inherit from the selected Project or Client",
);
assert.match(
  timerDialog,
  /function startTaskTimer\(task\)[\s\S]*api\.putJson\(`\/api\/tasks\/\$\{encodeURIComponent\(task\.id\)\}\/timer`[\s\S]*active_task_timer_id: ""[\s\S]*timer_status: "running"/,
  "Selected task timers should start through the Tasks-owned task timer route",
);
assert.match(
  timerDialog,
  /function startManualTimer\(\{ client, project \}\)[\s\S]*nextManualTimerSlot\(\)[\s\S]*api\.putJson\(`\/api\/active-timers\/\$\{encodeURIComponent\(timerSlot\)\}`[\s\S]*billable: workspaceBillableValue\(\)[\s\S]*description: fields\.description\.value\.trim\(\)[\s\S]*timer_status: "running"/,
  "Manual timers should start through the existing active-timer route with workspace-safe billable and description",
);
assert.match(
  timerDialog,
  /const MAX_MANUAL_TIMER_SLOTS = 4[\s\S]*for \(let index = 1; index <= MAX_MANUAL_TIMER_SLOTS; index \+= 1\)/,
  "Manual timer creation should preserve the existing four-slot timer model",
);

assert.match(
  timerDialog,
  /const hostRefresh = context\?\.hostContext\?\.refresh;[\s\S]*await hostRefresh\(detail\)[\s\S]*new CustomEvent\("longtailforge:timers-changed"/,
  "Create Timer modal should notify host refresh hooks and broadcast timer changes after start",
);
assert.match(moduleActions, /trigger\.focus\(\)/, "shared module action host should keep focus return to the QAC trigger");
assert.match(timerDialog, /hostContext\?\.complete\?\.\(\{[\s\S]*actionId: TIMER_ACTION_ID/, "Create Timer modal should complete the module action after start");
assert.match(timerDialog, /hostContext\?\.cancel\?\.\(\{ actionId: TIMER_ACTION_ID \}\)/, "Create Timer modal should cancel the module action on close/cancel");

assert.match(quickActionCaptureRegression, /time-tracking\\\.timer\\\.create/, "QAC regression should cover the Timer module-action path");
assert.match(moduleActionsRegression, /timeTrackingTimerDialog\\\.openCreate/, "module actions regression should cover the Time Tracking timer opener");

assert.match(
  moduleContract,
  /As of 0\.33\.6\.12d-2[\s\S]*Time Tracking owns `time-tracking\.timer\.create`[\s\S]*QAC Timer/,
  "Module contract should record the Create Timer module-action boundary",
);
assert.match(
  surfaceContract,
  /As of 0\.33\.6\.12d-2[\s\S]*QAC Timer opens the Time Tracking Create Timer modal/,
  "UI surface contract should record the QAC Timer modal behavior",
);
assert.match(
  timeTrackingDocs,
  /As of version 0\.33\.6\.12d-2[\s\S]*Create Timer modal[\s\S]*`time-tracking\.timer\.create`/,
  "Time Tracking docs should record the Create Timer modal action",
);
assert.match(
  architectureDocs,
  /As of 0\.33\.6\.12d-2[\s\S]*Timer is modal-backed through `time-tracking\.timer\.create`/,
  "Architecture docs should record that Timer is no longer a QAC fallback",
);
assert.match(
  changelog,
  /## Version 0\.33\.6\.12d-2[\s\S]*Time Tracking-owned Create Timer modal registered as `time-tracking\.timer\.create`[\s\S]*QAC Timer to dispatch the Create Timer module action instead of navigating to `time-tracker\.html`/,
  "Changelog should preserve the Create Timer modal closeout",
);
assertRoadmapCursorAtLeast("0.33.8", "Live roadmap should advance to the current active cursor after the completed Workbench history");

console.log("Time Tracking Create Timer modal regression passed.");

function actionDefinitionBlock(source, id) {
  const marker = `id: "${id}"`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Missing quick action ${id}`);
  const nextAction = source.indexOf("  Object.freeze({", start + marker.length);
  return source.slice(start, nextAction === -1 ? source.indexOf("]);", start) : nextAction);
}
