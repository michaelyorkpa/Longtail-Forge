export const regressionMeta = Object.freeze({
  id: "tasks.task-critical-quick-fixes",
  area: "tasks",
  tier: "focused",
  tags: ["blocked-reason", "checklist", "modal", "parent-child", "tags", "tasks", "workbench"],
  description: "Pins the current Tasks quick-fix contracts for checklist keys and spacing, searchable tag controls, parent-child creation and list anatomy, create-save continuity, workspace project narrowing, and reason-capture Block flows.",
  runMode: "static",
});

import assert from "node:assert/strict";

import { createProjectTextReader } from "../../test-support/source-scan.mjs";
const { readTextAsync: readText } = createProjectTextReader();

const css = await readText("public/css/longtail-forge.css");
const capturePrompt = await readText("public/js/shared/capture-prompt.js");
const tags = await readText("public/js/shared/tags.js");
const taskDialog = await readText("public/js/task-dialog.js");
const tasks = await readText("public/js/tasks.js");
const workbench = await readText("public/js/workbench.js");
const taskService = await readText("src/modules/tasks/tasks.service.js");
const taskTimerService = await readText("src/modules/tasks/task-timers.service.js");
const activeTimerRepository = await readText("src/modules/time-tracking/active-timers.repo.js");

assert.match(
  functionBlock(taskDialog, "handleChecklistInputKeydown"),
  /event\.key !== "Enter"[\s\S]*event\.preventDefault\(\)[\s\S]*await addChecklistItem\(\)/,
  "Enter in the checklist add field should add an item instead of submitting the task form",
);
assert.match(
  functionBlock(taskDialog, "handleChecklistListKeydown"),
  /data-task-checklist-label[\s\S]*event\.key !== "Enter"[\s\S]*event\.preventDefault\(\)[\s\S]*await saveChecklistItemLabel\(row, itemId\)/,
  "Enter in a checklist row should save that item instead of submitting the task form",
);
assert.match(css, /\.task-checklist-field\[open\]\s*\{[\s\S]*gap:\s*12px;[\s\S]*padding:\s*14px;/, "the expanded checklist should keep readable internal spacing");
assert.match(css, /\.task-checklist-list\s*\{[\s\S]*display:\s*grid;[\s\S]*gap:\s*6px;/, "checklist rows should not visually run together");

assert.match(
  functionBlock(tasks, "createTaskFilterChrome"),
  /taskControlLabel\("Tag", view\.createElement\("input"[\s\S]*data-task-tag-filter[\s\S]*placeholder: "Type to search tags"/,
  "the Tasks tag filter should be a type-to-search input",
);
assert.match(functionBlock(tasks, "populateTagFilter"), /tags\?\.mountFilterPicker\?\.\(tagFilter,[\s\S]*tags,[\s\S]*value: nextValue/, "the Tasks filter should use the shared searchable tag picker");
assert.match(tags, /function mountFilterPicker\([\s\S]*"All tags"[\s\S]*"No Tags"/, "the shared filter picker should retain All tags and No Tags choices");
assert.match(tags, /function mountFilterPicker\([\s\S]*aria-activedescendant[\s\S]*ArrowDown[\s\S]*ArrowUp/, "the shared filter picker should expose keyboard-selected suggestions accessibly");
assert.match(tags, /input\.addEventListener\("keydown", async \(event\) => \{[\s\S]*ArrowDown[\s\S]*moveTagSuggestionSelection[\s\S]*activeSuggestion\.click\(\)/, "the shared tag editor should select suggestions with ArrowDown and Enter");

assert.match(
  functionBlock(taskDialog, "parentTaskOptions"),
  /taskId \|\| !\["complete", "archived"\]\.includes\(task\.status\)[\s\S]*!selectedClientId \|\| !task\.client_id \|\| task\.client_id === selectedClientId[\s\S]*selectedProjectId[\s\S]*childrenByParent[\s\S]*appendBranch[\s\S]*optionLabel/,
  "parent choices should preserve scope filters and render parent-before-child hierarchy labels",
);
const inheritance = functionBlock(taskDialog, "applySelectedParentTaskInheritance");
assert.match(inheritance, /fields\.dueDate\.value = parentTask\.due_date[\s\S]*fields\.dueTime\.value = parentTask\.due_time[\s\S]*fields\.priority\.value/, "selecting a parent should inherit schedule and priority");
assert.match(inheritance, /!fields\.client\.value && parentTask\.client_id[\s\S]*fields\.client\.value = parentTask\.client_id/, "selecting a parent should fill an empty client");
assert.match(inheritance, /!fields\.project\.value && parentTask\.project_id[\s\S]*populateProjectInput\(parentTask\.project_id/, "selecting a parent should fill an empty project");

assert.match(functionBlock(tasks, "renderTasks"), /nestedTaskDisplayRows\(tasks\)[\s\S]*taskNestingDepths\.set\(task, depth\)[\s\S]*createTaskRow\(task\)/, "the Tasks list should annotate and render its parent-before-child projection");
assert.match(functionBlock(tasks, "nestedTaskDisplayRows"), /childrenByParentId[\s\S]*appendBranch\(child, depth \+ 1/, "nested task rows should retain descendant depth");
assert.match(functionBlock(tasks, "createTaskRow"), /is-task-child[\s\S]*--task-nesting-depth/, "child rows should expose a bounded visual nesting depth");
assert.match(functionBlock(tasks, "appendParentTaskChip"), /button\.textContent = `Child of: \$\{truncateTaskName\(parentTitle\)\}`[\s\S]*openTaskDialogById\(parentTaskId, button\)/, "the truncated Child of chip should open the canonical parent editor");

assert.match(functionBlock(taskDialog, "saveTask"), /saveTaskForm\(\{ closeOnSuccess: false \}\)/, "primary Save should persist without closing Add or Edit dialogs");
assert.match(functionBlock(taskDialog, "saveTaskForm"), /!wasEditing[\s\S]*transitionCreatedTaskToEdit\(result\.task\)[\s\S]*Task saved\. Continue editing or choose Save & Close\./, "the create dialog should transition in place to a persisted edit dialog");
assert.match(functionBlock(taskDialog, "taskEditorModalDescriptor"), /id: "save-close", label: "Save & Close"[\s\S]*id: "save", label: "Save task"/, "the task editor should expose separate Save & Close and Save actions");

assert.match(functionBlock(taskDialog, "populateFormOptions"), /option\("", workspaceProjectsLabel\(\)\)/, "Business task context should identify workspace-level projects explicitly");
assert.match(functionBlock(taskDialog, "populateProjectInput"), /\(project\.client_id \|\| ""\) === selectedClientId/, "workspace-level context should show only projects without a client association");

assert.match(functionBlock(capturePrompt, "open"), /dataset\.capturePromptInput[\s\S]*Cancel[\s\S]*Continue[\s\S]*createModalForm\([\s\S]*showModal/, "the shared capture prompt should use framework modal primitives with one input and explicit actions");
assert.match(functionBlock(capturePrompt, "open"), /confirmed: false[\s\S]*if \(!value\)[\s\S]*reportValidity[\s\S]*confirmed: true, value/, "the shared capture prompt should only confirm a non-empty capture and should otherwise resolve as cancelled");
assert.match(functionBlock(tasks, "openTaskDialogForBlock"), /focusTarget: "blocked_reason"[\s\S]*promptBlockedReason: true[\s\S]*status: "blocked"/, "Tasks Block should open the canonical editor and request the shared Block capture");
assert.match(functionBlock(workbench, "blockFocusedTask"), /openTaskCandidate\([\s\S]*defaults: \{ status: "blocked" \}[\s\S]*focusTarget: "blocked_reason"[\s\S]*promptBlockedReason: true/, "Workbench Block should open the canonical editor and request the shared Block capture");
assert.match(functionBlock(taskDialog, "focusTaskEditorTarget"), /blocked_reason: fields\.blockedReason[\s\S]*blocked_reason: fields\.taskDetailsPanel/, "Blocked Reason focus should open Task Details and focus the field");
assert.match(functionBlock(taskDialog, "updateBlockedReasonState"), /fields\.blockedReason\.required = isBlocked/, "the canonical editor should mark Blocked Reason required while status is Blocked");
assert.match(functionBlock(taskDialog, "handleTaskStatusChange"), /nextStatus !== "blocked"[\s\S]*promptAndBlockCurrentTask[\s\S]*statusBefore: previousTaskEditorStatus/, "changing the editor status to Blocked should use the shared capture transition");
assert.match(functionBlock(taskDialog, "performBlockCapture"), /previousReason\.trim\(\)[\s\S]*if \(!blockedReason\)[\s\S]*prompt: "Why is the task now blocked\?"[\s\S]*if \(!result\.confirmed\)[\s\S]*fields\.status\.value = priorStatus[\s\S]*saveTaskForm\([\s\S]*Blocking task/, "Continue should persist Blocked and its reason while Cancel restores the prior editor status, with an existing reason suppressing the prompt");
assert.match(functionBlock(taskDialog, "createTaskEditorDialog"), /const block = view\.createActionButton\([\s\S]*icon: "pause"[\s\S]*iconOnly: true[\s\S]*children: \[block, complete,[\s\S]*block\.dataset\.blockTask/, "the edit header should place the icon-only Block/Resume action immediately left of Complete");
assert.match(functionBlock(taskDialog, "updateBlockTaskActionState"), /isBlocked[\s\S]*!\["complete", "archived"\]\.includes\(status\)[\s\S]*hasTaskEditPermission[\s\S]*icon: isBlocked \? "start" : "pause"[\s\S]*label/, "the header action should be edit-only, permission-gated, Play/Resume while Blocked, Pause/Block while active, and hidden only for terminal states");
assert.match(functionBlock(taskDialog, "resumeBlockedTask"), /fields\.status\.value = "in_progress"[\s\S]*fields\.blockedReason\.value = ""[\s\S]*saveTaskForm\([\s\S]*Resuming task/, "the header Play action should persist Blocked work as In Progress and clear its Blocked Reason");
assert.match(functionBlock(taskDialog, "applyChecklistResult"), /syncTaskStatusField\(currentTask\)[\s\S]*updateBlockedReasonState\(\)[\s\S]*writeTaskMetadataRibbon\(currentTask\)/, "checklist mutations should synchronize the open editor lifecycle controls with the authoritative Task response");
assert.match(functionBlock(taskDialog, "saveTaskForm"), /currentTask\?\.status === "blocked"[\s\S]*await refreshTaskTimers\(\)/, "saving Blocked in the canonical editor should reload its automatically paused timer state");
assert.match(functionBlock(taskService, "pauseRunningTimersForBlockedTask"), /task\?\.status !== "blocked"[\s\S]*taskTimersService\.pauseRunningForBlockedTask\(task, session\)/, "every Tasks-owned Blocked persistence path should use the task-timer pause boundary");
assert.match(functionBlock(taskTimerService, "pauseRunningForBlockedTask"), /activeTimersService\.pauseRunningSourced\(taskTimerSource\(task\), session\)/, "Tasks should request source-scoped pause through the Time Tracking service");
assert.match(functionBlock(activeTimerRepository, "pauseRunningBySource"), /db\.run\(pauseRunningBySourceSql\(\), \{[\s\S]*sourceId:[\s\S]*sourceModuleId:[\s\S]*sourceType:/, "source-scoped pause should use named parameters through the reviewed dialect-aware SQL builder");
assert.match(functionBlock(activeTimerRepository, "pauseRunningBySourceSql"), /source_module_id = :sourceModuleId[\s\S]*source_type = :sourceType[\s\S]*source_id = :sourceId[\s\S]*timer_status = 'running'/, "source-scoped pause should cover every running timer for the Task");
assert.doesNotMatch(functionBlock(activeTimerRepository, "pauseRunningBySourceSql"), /user_id/, "source-scoped pause should not leave another user's running timer active on the Blocked Task");
assert.match(functionBlock(taskDialog, "hasTaskEditPermission"), /tasks\.edit_all[\s\S]*tasks\.edit_own[\s\S]*created_by_user_id[\s\S]*assignee_ids/, "the header Block action should honor all-task and own-task edit permissions");
assert.match(functionBlock(taskService, "normalizeTaskPayload"), /status === "blocked" && !blockedReason[\s\S]*Blocked Reason is required when a task is Blocked\.[\s\S]*400/, "the service boundary should reject blocked tasks without a reason");
assert.match(functionBlock(tasks, "applyBulkAction"), /captureBulkBlockedReason[\s\S]*selectedBulkActions/, "bulk Block should capture a missing reason before constructing status actions");
assert.match(functionBlock(tasks, "captureBulkBlockedReason"), /value !== "blocked" \|\| bulkBlockedReasonInput\?\.value\.trim\(\)[\s\S]*Why is the task now blocked\?[\s\S]*if \(!result\.confirmed\)[\s\S]*bulkBlockedReasonInput\.value = result\.value/, "bulk Block should reuse an existing reason, cancel cleanly, or capture the shared prompt value");
assert.match(functionBlock(tasks, "selectedBulkActions"), /blocked_reason: status === "blocked" \? blockedReason : ""/, "bulk Block should send the required reason through the canonical status action");
assert.doesNotMatch(functionBlock(taskService, "blockParentsForIncompleteChild"), /capturePrompt|Why is the task now blocked/, "automatic parent rollup should remain a non-interactive service transition");

assert.match(
  functionBlock(tasks, "taskWorkflowActionVisible"),
  /action\.timerVisibility && !taskTimerSurfaceAvailable\(\)[\s\S]*return false/,
  "Tasks row menus should omit task-timer actions when timer surfaces are unavailable",
);
assert.match(
  functionBlock(taskDialog, "writeTaskTimerFields"),
  /timerSurfaceAvailable[\s\S]*timerField\.hidden = !task\?\.task_id \|\| !timerSurfaceAvailable[\s\S]*if \(!timerSurfaceAvailable\)[\s\S]*return/,
  "the Task editor should remove its timer field when Time Tracking or Task Timers is disabled",
);
assert.match(
  functionBlock(workbench, "renderTaskFocusSurface"),
  /if \(taskTimerSurfaceAvailable\(\)\)[\s\S]*createTaskFocusTimerSection/,
  "Task Focus should append its timer section only when task timers are available",
);
assert.match(
  functionBlock(workbench, "visibleTimerPanelTimers"),
  /taskTimerSurfaceAvailable\(\) \|\| !isTaskTimer\(timer\)/,
  "Workbench should remove task timers from the timer panel while preserving unrelated manual timers",
);
assert.match(
  functionBlock(workbench, "taskTimerSurfaceAvailable"),
  /moduleEnabled\("tasks"\)[\s\S]*moduleEnabled\("time-tracking"\)[\s\S]*taskTimersEnabled !== false/,
  "Workbench task-timer surfaces should share the module and Task Timers eligibility contract",
);

console.log("Task critical quick-fixes regression passed.");

function functionBlock(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.slice(start + 1).search(/\n(?:async\s+)?function\s+/);
  return source.slice(start, nextFunction === -1 ? source.length : start + 1 + nextFunction);
}
