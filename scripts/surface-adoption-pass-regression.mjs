import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const styles = readText("public/css/longtail-forge.css");
const notificationsView = readText("views/protected/notifications.html");
const notificationsScript = readText("public/js/notifications.js");
const notificationPreferences = readText("public/js/shared/notification-preferences.js");
const tasksView = readText("views/protected/tasks.html");
const taskDialogScript = readText("public/js/task-dialog.js");
const surfaceContract = readText("docs/ui-surface-contract.md");

assert.match(
  notificationsView,
  /class="notification-workspace surface-main-panel"/,
  "Notifications list workspace should use the shared main-screen panel shell",
);
assert.match(
  notificationsView,
  /class="notification-preferences surface-main-panel"/,
  "Notifications preferences workspace should use the shared main-screen panel shell",
);
assert.match(
  notificationsView,
  /css\/longtail-forge\.css\?v=11/,
  "Notifications page should load the adoption-pass stylesheet cache key",
);
assert.match(
  notificationsView,
  /\/js\/notifications\.js\?v=7/,
  "Notifications page should load the adoption-pass notifications script cache key",
);
assert.match(
  notificationsView,
  /\/js\/shared\/notification-preferences\.js\?v=4/,
  "Notifications page should load the adoption-pass notification preferences helper cache key",
);
assert.match(
  notificationsScript,
  /row\.className = `notification-row surface-card is-\$\{notification\.status \|\| "unread"\}`/,
  "Script-rendered notification rows should use the shared card surface",
);
assert.match(
  notificationsScript,
  /actions\.className = "notification-row-actions surface-dense-actions"/,
  "Notification row actions should use the shared dense action placement",
);
assert.match(
  notificationPreferences,
  /fieldset\.className = "notification-grouping-preferences surface-main-panel"/,
  "Notification grouping preferences should use the shared main panel surface",
);
assert.match(
  notificationPreferences,
  /section\.className = "notification-preference-group surface-main-panel"/,
  "Notification preference groups should use the shared main panel surface",
);
assert.match(
  notificationPreferences,
  /row\.className = "notification-preference-row surface-main-panel"/,
  "Notification preference rows should use the shared main panel surface",
);

assert.match(
  taskDialogScript,
  /className: \["task-timer-controls", "surface-modal-section-body", "surface-dense-actions"\]/,
  "Task timer controls should use the shared dense action placement",
);
assert.match(
  taskDialogScript,
  /className: "surface-chip"[\s\S]*"data-task-timer-display": ""[\s\S]*text: "00:00:00"/,
  "Task timer display should use the shared chip surface",
);
assert.match(
  taskDialogScript,
  /className: \["task-timer-controls", "surface-modal-section-body", "surface-dense-actions"\]/,
  "Fallback task dialog timer controls should use the shared dense action placement",
);
assert.match(
  taskDialogScript,
  /className: "surface-chip"[\s\S]*"data-task-timer-display": ""[\s\S]*text: "00:00:00"/,
  "Fallback task dialog timer display should use the shared chip surface",
);
assert.match(tasksView, /css\/longtail-forge\.css\?v=69/, "Tasks view should load the adoption-pass stylesheet cache key");

assert.match(
  styles,
  /\.notification-panel-item\s*\{[\s\S]*border:\s*1px solid var\(--color-border-subtle\)/,
  "Bell dropdown notification items must retain their local surface treatment outside this adoption pass",
);
assert.doesNotMatch(
  styles,
  /\.notification-row\s*\{[^}]*border:\s*1px solid var\(--color-border-subtle\)/,
  "Full page notification rows should get border/background treatment from the shared card class",
);
assert.match(
  surfaceContract,
  /Notifications boxes and task timer surfaces are the first adoption-pass targets/i,
  "surface contract should record the first adoption-pass targets",
);

console.log("Surface adoption pass regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
