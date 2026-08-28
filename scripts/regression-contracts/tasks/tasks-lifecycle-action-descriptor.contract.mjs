import { escapeRegExp, extractFunctionSpan } from "../../test-support/source-scan.mjs";
import assert from "node:assert/strict";

import { createProjectTextReader } from "../../test-support/source-scan.mjs";
// Consolidated under tasks.current-static-contracts by 0.33.33.10.
const { readText } = createProjectTextReader();

const tasksModule = readText("src/modules/tasks/module.js");
const tasksRoutes = readText("src/modules/tasks/tasks.routes.js");
const tasksPublicRoutes = readText("src/modules/tasks/public-api.routes.js");
const tasksScript = readText("public/js/tasks.js");
const tasksView = readText("views/protected/tasks.html");

assert.match(tasksModule, /version:\s*appVersion/, "Tasks module should report the current app version");

const behaviorHandlers = constBlock(tasksScript, "TASK_LIFECYCLE_BEHAVIOR_HANDLERS");
const registerBehaviors = extractFunctionSpan(tasksScript, "registerTaskLifecycleBehaviors");
const createActions = extractFunctionSpan(tasksScript, "createActions");
const lifecycleStrip = extractFunctionSpan(tasksScript, "createTaskLifecycleActionStrip");
const lifecycleDescriptor = extractFunctionSpan(tasksScript, "taskLifecycleActionStripDescriptor");
const lifecycleButton = extractFunctionSpan(tasksScript, "taskLifecycleActionButton");
const disabledReason = extractFunctionSpan(tasksScript, "taskLifecycleDisabledReason");
const permissionCheck = extractFunctionSpan(tasksScript, "hasTaskLifecyclePermission");
const permissionAllow = extractFunctionSpan(tasksScript, "permissionAllowsTaskAction");
const runLifecycleAction = extractFunctionSpan(tasksScript, "runTaskLifecycleAction");
const confirmLifecycleAction = extractFunctionSpan(tasksScript, "confirmTaskLifecycleAction");
const updateLifecycleStatus = extractFunctionSpan(tasksScript, "updateTaskLifecycleStatus");
const postTaskAction = extractFunctionSpan(tasksScript, "postTaskAction");

assert.match(registerBehaviors, /taskLifecycleActionStripDescriptor\(\)\.actions\.forEach[\s\S]*registerBehavior\(action\.behavior, handler\)/, "Lifecycle behaviors should be registered through the view behavior registry");
assert.match(behaviorHandlers, /"tasks\.lifecycle\.complete": \(\{ record, trigger \}\) => postTaskAction\(record, "complete", trigger\)/, "Complete should dispatch through the Tasks-owned complete handler with focus-return context");
assert.match(behaviorHandlers, /"tasks\.lifecycle\.reopen": \(\{ record \}\) => postTaskAction\(record, "reopen"\)/, "Reopen should dispatch through the Tasks-owned reopen handler");
assert.match(behaviorHandlers, /"tasks\.lifecycle\.archive": \(\{ record \}\) => postTaskAction\(record, "archive"\)/, "Archive should dispatch through the Tasks-owned archive handler");
assert.match(behaviorHandlers, /"tasks\.lifecycle\.restore": \(\{ record \}\) => postTaskAction\(record, "restore"\)/, "Restore should dispatch through the Tasks-owned restore handler");
assert.match(behaviorHandlers, /"tasks\.lifecycle\.block"[\s\S]*openTaskDialogForBlock\(record, action, trigger\)/, "Block should dispatch through the canonical Tasks editor so a reason can be entered");
assert.match(behaviorHandlers, /"tasks\.lifecycle\.resume"[\s\S]*updateTaskLifecycleStatus\(record, action\.statusPayload \|\| \{ status: "in_progress", blocked_reason: "" \}\)/, "Resume should dispatch through the Tasks-owned update route handler");

assert.match(createActions, /actionButton\("Edit"[\s\S]*actionButton\("Duplicate"[\s\S]*actionButton\("Copy Link"[\s\S]*actionButton\("Follow Notifications"[\s\S]*createTaskLifecycleActionStrip\(task\)/, "Task row utilities should stay module-owned while lifecycle actions move into the framework action strip");
assert.match(lifecycleStrip, /view\.createDetailActionStrip\(\{[\s\S]*ariaLabel:\s*"Task lifecycle actions"[\s\S]*className:\s*"task-row-lifecycle-actions"[\s\S]*actions/, "Lifecycle placement should use the framework detail action strip");
assert.match(lifecycleButton, /view\.createActionButton\(options\)/, "Lifecycle buttons should use the framework action button helper when available");
assert.match(lifecycleButton, /disabled:\s*Boolean\(disabledReason\)/, "Lifecycle button disabled display should be driven through the framework action helper");
assert.match(lifecycleButton, /dataset\.taskLifecycleAction = action\.id[\s\S]*dataset\.taskLifecycleBehavior = action\.behavior/, "Lifecycle buttons should expose stable action and behavior hooks");

[
  ["complete-task", "Complete", "tasks.lifecycle.complete", "tasks.complete"],
  ["reopen-task", "Reopen", "tasks.lifecycle.reopen", "tasks.complete"],
  ["archive-task", "Archive", "tasks.lifecycle.archive", "tasks.archive"],
  ["restore-task", "Restore", "tasks.lifecycle.restore", "tasks.restore"],
].forEach(([id, label, behavior, permission]) => {
  assert.match(lifecycleDescriptor, new RegExp(`id:\\s*"${id}"[\\s\\S]*label:\\s*"${label}"[\\s\\S]*behavior:\\s*"${escapeRegExp(behavior)}"[\\s\\S]*requiredPermissions:\\s*\\["${escapeRegExp(permission)}"\\]`), `${label} should declare behavior and permission intent`);
});

assert.match(lifecycleDescriptor, /id:\s*"block-task"[\s\S]*label:\s*"Block"[\s\S]*behavior:\s*"tasks\.lifecycle\.block"[\s\S]*requiredAnyPermissions:\s*\["tasks\.edit_all", "tasks\.edit_own"\][\s\S]*statusPayload:\s*\{ status: "blocked" \}/, "Block should declare edit permission intent and a status payload");
assert.match(lifecycleDescriptor, /id:\s*"resume-task"[\s\S]*label:\s*"Resume"[\s\S]*icon:\s*"start"[\s\S]*behavior:\s*"tasks\.lifecycle\.resume"[\s\S]*requiredAnyPermissions:\s*\["tasks\.edit_all", "tasks\.edit_own"\][\s\S]*statusPayload:\s*\{ status: "in_progress", blocked_reason: "" \}/, "Resume should use the Play icon, declare edit permission intent, move Blocked work to In Progress, and clear its reason");
assert.match(lifecycleDescriptor, /id:\s*"archive-task"[\s\S]*role:\s*"destructive"[\s\S]*variant:\s*"danger"[\s\S]*confirm:\s*\{[\s\S]*title:\s*"Archive task"[\s\S]*danger:\s*true/, "Archive should stay destructive and confirmed");
assert.doesNotMatch(lifecycleDescriptor, /delete-task|soft-delete|permanent-delete|tasks\.lifecycle\.delete/, "Lifecycle descriptors should not invent a task delete workflow");

assert.match(disabledReason, /Task action is unavailable/, "Missing task records should render disabled lifecycle actions");
assert.match(permissionCheck, /requiredPermissions[\s\S]*requiredAnyPermissions/, "Lifecycle permission display should understand both all-of and any-of permission declarations");
assert.match(permissionAllow, /permissionId === "tasks\.edit_own"[\s\S]*return isOwnTask\(task\)/, "Own-task edit permission display should respect task ownership");
assert.match(runLifecycleAction, /if \(action\.confirm && !await confirmTaskLifecycleAction\(action, task\)\)/, "Confirmed lifecycle actions should prompt before dispatch");
assert.match(runLifecycleAction, /handler\(\{[\s\S]*record:\s*task[\s\S]*refresh:\s*reloadTaskList/, "Lifecycle handlers should receive the Tasks record and refresh hook");
assert.match(confirmLifecycleAction, /modal\?\.confirm[\s\S]*danger:\s*confirmOptions\.danger === true \|\| action\.role === "destructive"/, "Destructive lifecycle confirmation should use the framework modal confirm helper");
assert.match(updateLifecycleStatus, /api\.putJson\(`\/api\/tasks\/\$\{encodeURIComponent\(task\.task_id\)\}`, payload\)[\s\S]*upsertTask\(result\.task\)[\s\S]*await reloadTaskList\(\)/, "Direct lifecycle status updates should use the existing Tasks update route and refresh the list");
assert.match(extractFunctionSpan(tasksScript, "openTaskDialogForBlock"), /focusTarget:\s*"blocked_reason"[\s\S]*status:\s*"blocked"/, "Block should open the canonical editor in blocked state focused on Blocked Reason");
assert.match(postTaskAction, /api\.postJson\(`\/api\/tasks\/\$\{encodeURIComponent\(task\.task_id\)\}\/\$\{action\}`, \{\}\)[\s\S]*await reloadTaskList\(\)/, "POST lifecycle actions should use the existing Tasks lifecycle routes and refresh the list");

assert.doesNotMatch(tasksRoutes, /tasksRoutes\.delete\("\/tasks\/:taskId"\s*,/, "Browser API should not expose a task delete route");
assert.doesNotMatch(tasksPublicRoutes, /tasksPublicApiRoutes\.delete|\/api\/v1\/tasks\/:taskId\/delete/, "Public API should not expose a task delete route");
assert.match(tasksView, /css\/longtail-forge\.css[\s\S]*js\/shared\/view-builder\.js[\s\S]*js\/shared\/view-renderer\.js[\s\S]*js\/task-dialog\.js[\s\S]*js\/tasks\.js/, "Tasks host should load the lifecycle descriptor cache key");

console.log("Tasks lifecycle action descriptor regression passed.");

/**
 * Extract one named const declaration from a source file this module reads, from its
 * declaration to the next top-level function declaration.
 * @param {string} source file text from the shared project text reader
 * @param {string} constName the name to locate
 */
function constBlock(source, constName) {
  const start = source.indexOf(`const ${constName}`);
  assert.notEqual(start, -1, `${constName} should exist`);
  const nextFunction = source.slice(start + 1).search(/\n(?:async\s+)?function\s+/);
  return source.slice(start, nextFunction === -1 ? source.length : start + 1 + nextFunction);
}
