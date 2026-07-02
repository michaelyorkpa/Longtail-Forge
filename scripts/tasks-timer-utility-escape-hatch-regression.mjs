import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.21.0.4";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const tasksModule = readText("src/modules/tasks/module.js");
const taskDialogScript = readText("public/js/task-dialog.js");
const taskTimerService = readText("src/modules/tasks/task-timers.service.js");
const tasksRoutes = readText("src/modules/tasks/tasks.routes.js");
const tasksDocs = readText("docs/tasks-module.md");
const declarativeGuide = readText("docs/declarative-view-surfaces.md");
const viewContract = readText("docs/view-building-contract.md");
const taskTimerRegression = readText("scripts/task-timer-status-regression.mjs");
const notificationRegression = readText("scripts/notification-regression.mjs");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the current app version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the current app version");
assert.match(tasksModule, new RegExp(`version:\\s*"${escapeRegExp(appVersion)}"`), "Tasks module should report the current app version");

const editorDialog = functionBlock(taskDialogScript, "createTaskEditorDialog");
const editorDescriptor = functionBlock(taskDialogScript, "taskEditorModalDescriptor");
const utilityActions = functionBlock(taskDialogScript, "taskEditorUtilityActions");
const timerSection = functionBlock(taskDialogScript, "taskEditorTimerSection");
const tagsDialog = functionBlock(taskDialogScript, "createTaskTagsDialog");
const filesDialog = functionBlock(taskDialogScript, "createTaskFilesDialog");
const notesSection = functionBlock(taskDialogScript, "taskEditorNotesSection");
const ensureDialog = functionBlock(taskDialogScript, "ensureDialog");
const decorateControls = functionBlock(taskDialogScript, "decorateTaskDialogControls");
const tagMount = functionBlock(taskDialogScript, "mountTaskTagPicker");
const fileMount = functionBlock(taskDialogScript, "mountTaskFileAttachments");
const notesMount = functionBlock(taskDialogScript, "mountTaskNotesPanel");
const followWriter = functionBlock(taskDialogScript, "writeTaskNotificationFollowFields");
const followToggle = functionBlock(taskDialogScript, "toggleTaskNotificationFollow");
const followState = functionBlock(taskDialogScript, "writeNotificationFollowState");
const openTagsDialog = functionBlock(taskDialogScript, "openTaskTagsDialog");
const openFilesDialog = functionBlock(taskDialogScript, "openTaskFilesDialog");
const closeUtilities = functionBlock(taskDialogScript, "closeTaskUtilityDialogs");
const loadTimers = functionBlock(taskDialogScript, "loadTaskTimers");
const saveTimer = functionBlock(taskDialogScript, "saveTaskTimer");
const finalizeTimer = functionBlock(taskDialogScript, "finalizeTaskTimer");
const resetTimer = functionBlock(taskDialogScript, "resetTaskTimer");
const applyTimerMutation = functionBlock(taskDialogScript, "applyTaskTimerMutationResult");
const syncTaskStatusField = functionBlock(taskDialogScript, "syncTaskStatusField");
const writeTimerFields = functionBlock(taskDialogScript, "writeTaskTimerFields");
const currentTimer = functionBlock(taskDialogScript, "currentTaskTimer");
const upsertTimer = functionBlock(taskDialogScript, "upsertTaskTimer");
const removeTimer = functionBlock(taskDialogScript, "removeTaskTimer");
const copyTaskLink = functionBlock(taskDialogScript, "copyTaskLink");

assert.match(editorDialog, /view\.renderDescriptorModalForm\(descriptor, \{[\s\S]*utilityActions: taskEditorUtilityActions\(descriptor\)[\s\S]*actions: taskEditorCommitActions\(descriptor\)/, "Task editor should keep framework-owned modal footer placement");
assert.match(editorDialog, /view\.createActionButton\(\{[\s\S]*action: "follow-task-notifications"[\s\S]*icon: "bell"[\s\S]*iconOnly: true[\s\S]*role: "utility"/, "Notification follow should stay a framework action button in the modal heading");
assert.match(editorDialog, /notificationToggle\.dataset\.taskNotificationToggle = ""[\s\S]*notificationToggle\.hidden = true[\s\S]*notificationToggle\.setAttribute\("aria-pressed", "false"\)/, "Notification follow button should keep task-owned state hooks");
assert.match(editorDescriptor, /id: "timer", label: "Task Timer", type: "section", width: "full"[\s\S]*id: "reminders", label: "Reminders"[\s\S]*id: "notes", label: "Notes"/, "Task editor descriptor should preserve Timer, Reminders, and Notes section placement");
assert.match(editorDescriptor, /utilityActions:\s*\[[\s\S]*id: "tags", label: "Task tags", icon: "tag", role: "utility"[\s\S]*id: "files", label: "Task files", icon: "file", role: "utility"[\s\S]*id: "copy-link", label: "Copy task link", icon: "copy", role: "utility"/, "Task editor descriptor should preserve utility footer actions");
assert.match(utilityActions, /view\.createActionButton\(\{[\s\S]*className: "surface-modal-footer-action"[\s\S]*iconOnly: false[\s\S]*role: action\.role[\s\S]*text: action\.text \|\| action\.label[\s\S]*title: action\.label/, "Utility footer actions should be framework action buttons with visible labels");
assert.match(utilityActions, /button\.dataset\.taskTagsToggle = ""[\s\S]*button\.dataset\.taskFilesToggle = ""[\s\S]*button\.dataset\.copyTaskLink = ""[\s\S]*button\.hidden = true/, "Utility footer actions should keep task-owned tags/files/copy hooks");

assert.match(timerSection, /className: \["task-timer-field", "surface-modal-group"\][\s\S]*"data-task-timer-field": ""[\s\S]*hidden: true[\s\S]*data-task-timer-start[\s\S]*data-task-timer-pause[\s\S]*data-task-timer-finalize[\s\S]*data-task-timer-reset/, "Task timer controls should remain in the shared modal section shell");
assert.match(timerSection, /className: \["task-timer-controls", "surface-modal-section-body", "surface-dense-actions"\][\s\S]*className: "surface-chip"[\s\S]*"data-task-timer-display": ""/, "Task timer controls should keep shared dense-action and chip anatomy");
assert.match(tagsDialog, /view\.createModal\(\{[\s\S]*title: "Task Tags"[\s\S]*body: \[tagsMount\][\s\S]*actions: \[close\]/, "Tags utility should stay a task-owned child dialog body");
assert.match(filesDialog, /view\.createModal\(\{[\s\S]*title: "Task Files"[\s\S]*body: \[filesMount\][\s\S]*actions: \[close\]/, "Files utility should stay a task-owned child dialog body");
assert.match(notesSection, /className: \["task-notes-field", "surface-modal-group", "surface-divider-top"\][\s\S]*"data-task-notes-panel": ""[\s\S]*taskEditorSectionHeading\(view, "summary", "Notes"\)[\s\S]*"data-task-notes": ""/, "Notes linked panel should stay in its shared modal section shell");
assert.doesNotMatch(taskDialogScript, /createTaskTimerDialog|data-task-timer-dialog|<dialog[^>]+timer/i, "Timer utility fragments should not create duplicate modal shells");

assert.match(ensureDialog, /fields\.timerStart\?\.addEventListener\("click", \(\) => saveTaskTimer\("running"\)\)[\s\S]*fields\.timerPause\?\.addEventListener\("click", \(\) => saveTaskTimer\("paused"\)\)[\s\S]*fields\.timerFinalize\?\.addEventListener\("click", finalizeTaskTimer\)[\s\S]*fields\.timerReset\?\.addEventListener\("click", resetTaskTimer\)/, "Task timer buttons should still dispatch to Tasks-owned handlers");
assert.match(ensureDialog, /fields\.copyLink\?\.addEventListener\("click", copyCurrentTaskLink\)/, "Copy Link should still dispatch to Tasks-owned behavior");
assert.match(ensureDialog, /fields\.tagToggle\?\.addEventListener\("click", openTaskTagsDialog\)[\s\S]*fields\.fileToggle\?\.addEventListener\("click", openTaskFilesDialog\)/, "Tags and Files footer buttons should still dispatch to Tasks-owned handlers");
assert.match(ensureDialog, /fields\.notificationToggle\?\.addEventListener\("click", toggleTaskNotificationFollow\)[\s\S]*fields\.notesContainer\?\.addEventListener\("notes-linked-panel:link"[\s\S]*fields\.notesContainer\?\.addEventListener\("notes-linked-panel:unlink"/, "Notification and linked-notes events should stay wired");
assert.match(decorateControls, /icons\.decorateButton\(fields\.timerStart, \{ icon: "start", label: "Start task timer"[\s\S]*icons\.decorateButton\(fields\.timerPause, \{ icon: "pause", label: "Pause task timer"[\s\S]*icons\.decorateButton\(fields\.timerFinalize, \{ icon: "save", label: "Save task timer as time"[\s\S]*icons\.decorateButton\(fields\.timerReset, \{ icon: "restore", label: "Reset task timer"[\s\S]*variant: "danger"/, "Task timer controls should keep recognizable icon treatment");

assert.match(loadTimers, /api\.getJson\("\/api\/tasks\/timers", \{ cache: "no-store" \}\)/, "Task modal should load active task timers from the Tasks route");
assert.match(saveTimer, /currentTaskTimer\(task\.task_id\)[\s\S]*readTaskTimerElapsedSeconds\(timer\)[\s\S]*api\.putJson\(`\/api\/tasks\/\$\{encodeURIComponent\(task\.task_id\)\}\/timer`[\s\S]*timer_status: timerStatus[\s\S]*applyTaskTimerMutationResult\(result, task\)/, "Start/pause should preserve Tasks-owned timer save behavior and apply the returned task state");
assert.match(finalizeTimer, /api\.postJson\(`\/api\/tasks\/\$\{encodeURIComponent\(task\.task_id\)\}\/timer\/finalize`[\s\S]*duration_seconds: durationSeconds[\s\S]*removeTaskTimer\(task\.task_id\)[\s\S]*applyTaskTimerMutationResult\(result, task\)[\s\S]*setStatus\("Task time saved\."\)/, "Finalize should preserve Tasks-owned time-save behavior and apply the returned task state");
assert.match(resetTimer, /modal\.confirm\(\{[\s\S]*title: "Reset task timer"[\s\S]*danger: true[\s\S]*api\.deleteJson\(`\/api\/tasks\/\$\{encodeURIComponent\(task\.task_id\)\}\/timer`\)[\s\S]*removeTaskTimer\(task\.task_id\)[\s\S]*applyTaskTimerMutationResult\(result, task\)/, "Reset should preserve confirmation, Tasks-owned delete behavior, and returned task state");
assert.match(applyTimerMutation, /result\?\.timer[\s\S]*upsertTaskTimer\(result\.timer\)[\s\S]*result\?\.task[\s\S]*currentTask = \{[\s\S]*\.\.\.\(currentTask \|\| \{\}\)[\s\S]*\.\.\.result\.task[\s\S]*syncTaskStatusField\(currentTask\)[\s\S]*writeTaskMetadataRibbon\(currentTask\)[\s\S]*notifyTaskEditorSaved\(result\)[\s\S]*writeTaskTimerFields\(currentTask\)/, "Task timer mutations should immediately apply the authoritative task payload returned by the service");
assert.match(syncTaskStatusField, /fields\.status[\s\S]*task\?\.status[\s\S]*fields\.status\.options[\s\S]*fields\.status\.value = task\.status/, "Timer-start status transitions should update the visible Task modal status select");
assert.match(writeTimerFields, /options\.taskTimersEnabled !== false[\s\S]*options\.timeTrackingEnabled !== false[\s\S]*fields\.timerStart\.disabled = !eligible \|\| timer\?\.timer_status === "running"[\s\S]*fields\.timerPause\.disabled = !eligible \|\| timer\?\.timer_status !== "running"[\s\S]*fields\.timerFinalize\.disabled = !eligible \|\| !timer[\s\S]*fields\.timerReset\.disabled = !timer/, "Timer state should preserve eligibility and disabled rules");
assert.match(writeTimerFields, /Save the task before using a task timer\.[\s\S]*readTaskTimerIneligibleReason\(task\)[\s\S]*Running\.[\s\S]*Paused\.[\s\S]*No active timer\.[\s\S]*global\.setInterval\(\(\) => updateTaskTimerDisplay\(timer\), 1000\)/, "Timer state text and running display updates should remain task-owned");
assert.match(currentTimer, /taskTimers\.find\(\(timer\) => timer\.task_id === taskId\)/, "Current task timer lookup should remain task-owned");
assert.match(upsertTimer, /timer_status === "running" && item\.task_id !== timer\.task_id[\s\S]*timer_status: "paused"[\s\S]*context\.taskTimers = taskTimers/, "Starting one task timer should pause other running task timers in modal state");
assert.match(removeTimer, /taskTimers = taskTimers\.filter\(\(timer\) => timer\.task_id !== taskId\)[\s\S]*context\.taskTimers = taskTimers/, "Removing a task timer should refresh modal timer state");

assert.match(tagMount, /namespace\.tags\?\.mountPicker[\s\S]*fields\.tagToggle\.hidden = false[\s\S]*selectedTags: tags/, "Tags utility should remain mounted through the Tags-owned picker");
assert.match(taskDialogScript, /tagIds: readTaskTagIds\(\)/, "Task saves should still include tag IDs from the Tags picker");
assert.match(fileMount, /namespace\.fileAttachments\?\.mount[\s\S]*canRemove: Boolean\(task\?\.task_id\)[\s\S]*canUpload: Boolean\(task\?\.task_id\)[\s\S]*moduleId: "tasks"/, "Files utility should remain mounted through the Files-owned attachment helper");
assert.match(fileMount, /saveFirstMessage: "Save the task before adding files\."[\s\S]*targetType: "task"[\s\S]*onAttachmentAdded: \(detail\) => context\?\.onAttachmentsChanged\?\.\(detail\)[\s\S]*onUploadCompleted: \(\) => setStatus\("Task file uploaded\."\)/, "Files utility should preserve task target, save-first, and callback behavior");
assert.match(notesMount, /namespace\.notesLinkedPanel\?\.mount[\s\S]*fields\.notesPanel\.open = options\.focus === true[\s\S]*moduleId: "tasks"[\s\S]*readonly: task\?\.status === "archived"[\s\S]*saveFirstMessage: "Save the task before adding notes\."[\s\S]*targetType: "task"[\s\S]*title: "Task Notes"/, "Notes utility should remain mounted through the Notes-owned linked panel helper");
assert.match(followWriter, /namespace\.notificationSubscriptions\.readStatus\(namespace\.notificationSubscriptions\.taskTarget\(taskId\)\)[\s\S]*writeNotificationFollowState\(result\.isFollowing === true\)/, "Notification follow state should read through the shared subscription helper");
assert.match(followToggle, /namespace\.notificationSubscriptions\.taskTarget\(currentTaskId\)[\s\S]*namespace\.notificationSubscriptions\.unfollow\(target\)[\s\S]*namespace\.notificationSubscriptions\.follow\(target\)[\s\S]*setStatus\(result\.isFollowing \? "Task notifications followed\." : "Task notifications unfollowed\."\)/, "Notification follow toggle should preserve follow/unfollow behavior");
assert.match(followState, /fields\.notificationToggle\.dataset\.isFollowing = String\(isFollowing\)[\s\S]*classList\.toggle\("is-following", isFollowing\)[\s\S]*setAttribute\("aria-pressed", String\(isFollowing\)\)/, "Notification follow button should preserve state, styling, and ARIA updates");
assert.match(openTagsDialog, /closeTaskFilesDialog\(\)[\s\S]*showTaskModal\(tagsDialog, \{ parent: dialog, trigger: fields\.tagToggle \}\)[\s\S]*\[data-tag-picker-input\]/, "Tags utility should open through the shared modal stack and focus the picker");
assert.match(openFilesDialog, /closeTaskTagsDialog\(\)[\s\S]*showTaskModal\(filesDialog, \{ parent: dialog, trigger: fields\.fileToggle \}\)[\s\S]*\[data-file-attachment-input\]/, "Files utility should open through the shared modal stack and focus upload when saved");
assert.match(closeUtilities, /fields\.tagToggle\?\.setAttribute\("aria-expanded", "false"\)[\s\S]*fields\.fileToggle\?\.setAttribute\("aria-expanded", "false"\)[\s\S]*closeTaskTagsDialog\(\)[\s\S]*closeTaskFilesDialog\(\)/, "Tags and Files child dialogs should close safely with the parent editor");
assert.match(copyTaskLink, /new global\.URL\("tasks\.html", global\.location\.href\)[\s\S]*url\.searchParams\.set\("task", task\.task_id\)[\s\S]*navigator\.clipboard\.writeText\(url\.toString\(\)\)[\s\S]*setStatus\("Task link copied\."\)/, "Copy task link should preserve task URL and clipboard behavior");

const routeSource = tasksRoutes;
assert.match(routeSource, /tasksRoutes\.get\("\/tasks\/timers"[\s\S]*taskTimersService\.list\(request\.session\)/, "Task timer list route should remain Tasks-owned");
assert.match(routeSource, /tasksRoutes\.put\("\/tasks\/:taskId\/timer"[\s\S]*taskTimersService\.save\(request\.params\.taskId, payload, request\.session\)/, "Task timer start/pause route should remain Tasks-owned");
assert.match(routeSource, /tasksRoutes\.post\("\/tasks\/:taskId\/timer\/finalize"[\s\S]*taskTimersService\.finalize\(request\.params\.taskId, payload, request\.session\)/, "Task timer finalize route should remain Tasks-owned");
assert.match(routeSource, /tasksRoutes\.delete\("\/tasks\/:taskId\/timer"[\s\S]*taskTimersService\.remove\(request\.params\.taskId, request\.session\)/, "Task timer reset route should remain Tasks-owned");

const serviceSave = functionBlock(taskTimerService, "save");
const serviceRemove = functionBlock(taskTimerService, "remove");
const serviceFinalize = functionBlock(taskTimerService, "finalize");
const assertTimersEnabled = functionBlock(taskTimerService, "assertTaskTimersEnabled");
const readEligibleTask = functionBlock(taskTimerService, "readEligibleTask");
const assertCanUseTaskTimer = functionBlock(taskTimerService, "assertCanUseTaskTimer");
const transitionTask = functionBlock(taskTimerService, "transitionTaskToInProgressForTimerStart");
const revertTransition = functionBlock(taskTimerService, "revertTaskTimerStartTransition");
const markWorked = functionBlock(taskTimerService, "markTaskWorked");
const timerSource = functionBlock(taskTimerService, "taskTimerSource");

assert.match(serviceSave, /await assertTaskTimersEnabled\(session\)[\s\S]*await assertCanUseTaskTimer\(session, task\)[\s\S]*transitionTaskToInProgressForTimerStart\(task, existingTimer, session\)[\s\S]*activeTimersService\.saveSourced\(taskTimerSource\(task\)[\s\S]*sourceMetadata: \{[\s\S]*taskTimerStatusTransition: transition[\s\S]*await markTaskWorked\(session, task\.task_id, `task_timer_\$\{timerStatus\}`\)/, "Task timer save should preserve eligibility, transition, sourced timer, and task-worked side effects");
assert.match(serviceSave, /const updatedTask = await tasksRepository\.readById\(session\.workspace_id, task\.task_id\)[\s\S]*task: updatedTask \|\| task[\s\S]*timer: taskTimerFromUnified\(result\.timer, updatedTask \|\| task\)/, "Task timer save should return the authoritative updated task with the timer payload");
assert.match(serviceRemove, /await assertTaskTimersEnabled\(session\)[\s\S]*await activeTimersService\.removeSourced\(taskTimerSource\(task\), session\)[\s\S]*await revertTaskTimerStartTransition\(task, timer, session\)[\s\S]*await markTaskWorked\(session, task\.task_id, "task_timer_removed"\)/, "Task timer reset should remove sourced timer, revert eligible status transition, and mark work");
assert.match(serviceRemove, /const updatedTask = await tasksRepository\.readById\(session\.workspace_id, task\.task_id\)[\s\S]*task: updatedTask \|\| task[\s\S]*removed: true/, "Task timer reset should return the authoritative updated task after any status reversion");
assert.match(serviceFinalize, /await assertTaskTimersEnabled\(session\)[\s\S]*await assertCanUseTaskTimer\(session, task\)[\s\S]*activeTimersService\.finalizeSourced\(taskTimerSource\(task\), payload, session[\s\S]*action: "task_timer_finalized"[\s\S]*await markTaskWorked\(session, task\.task_id, "task_timer_finalized"\)[\s\S]*task_timer_removed: true/, "Task timer finalize should create time, audit, mark work, and report removed timer state");
assert.match(serviceFinalize, /const updatedTask = await tasksRepository\.readById\(session\.workspace_id, task\.task_id\)[\s\S]*task: updatedTask \|\| task[\s\S]*task_timer_removed: true/, "Task timer finalize should return the authoritative updated task after saving time");
assert.match(assertTimersEnabled, /canWriteModule\(session\.workspace_id, TASKS_MODULE_ID\)[\s\S]*canWriteModule\(session\.workspace_id, TIME_TRACKING_MODULE_ID\)[\s\S]*settings\.taskTimersEnabled === false/, "Task timer writes should preserve Tasks, Time Tracking, and task-timer setting gates");
assert.match(readEligibleTask, /task\.status === "complete" \|\| task\.status === "archived"[\s\S]*Task timers require a project-linked task\./, "Task timer eligibility should reject completed, archived, and projectless tasks");
assert.match(assertCanUseTaskTimer, /permissionsService\.assertCan\(session, "tasks\.view", taskResource\(task\)\)[\s\S]*permissionsService\.assertCan\(session, "time_entries\.create"[\s\S]*operation: "task_timer"/, "Task timer writes should preserve task read and time entry create permission checks");
assert.match(transitionTask, /task\.status !== "open"[\s\S]*status: "in_progress"[\s\S]*action: "task_timer_status_started"[\s\S]*movedTaskFromOpen: true/, "Starting a timer should still move open tasks to in-progress with audit metadata");
assert.match(revertTransition, /transition\.movedTaskFromOpen !== true \|\| task\.status !== "in_progress"[\s\S]*status: "open"[\s\S]*action: "task_timer_status_reverted"/, "Reset should still revert only timer-started status transitions");
assert.match(markWorked, /tasksRepository\.markWorkedAt[\s\S]*searchIndexSyncService\.reindexRecord\(\{[\s\S]*moduleId: TASKS_MODULE_ID[\s\S]*recordType: "task"/, "Task timer mutations should keep last-worked and search-index side effects");
assert.match(timerSource, /source_module_id: TASKS_MODULE_ID[\s\S]*source_type: "task"[\s\S]*source_url: `tasks\.html\?task=\$\{encodeURIComponent\(task\.task_id\)\}`/, "Task timer source metadata should remain Tasks-owned");

assert.match(taskTimerRegression, /taskTimersService\.save[\s\S]*taskTimersService\.remove[\s\S]*taskTimersService\.finalize/, "Existing task timer regression should keep service lifecycle coverage");
assert.match(notificationRegression, /task notification follow UI uses shared subscription helper[\s\S]*notificationSubscriptions\\\.follow\\\(target\\\)[\s\S]*notificationSubscriptions\\\.unfollow\\\(target\\\)/, "Existing notification regression should keep task follow/unfollow helper coverage");
assert.match(tasksDocs, /As of 0\.33\.5\.18\.9\.6[\s\S]*Task Timer section keeps the shared `\.surface-modal-group` shell[\s\S]*Tags and Files stay in framework-placed footer utility actions[\s\S]*linked Notes panel stays mounted through the Notes-owned helper/, "Tasks docs should document the 9.6 timer and utility boundary");
assert.match(declarativeGuide, /As of 0\.33\.5\.18\.10\.3[\s\S]*timer state, tags, files, linked notes, copy-link, notification follow/, "Declarative guide should document the utility escape hatches");
assert.match(viewContract, /timer and utility preservation shipped in 0\.33\.5\.18\.9\.6[\s\S]*Task Timer state, Tags, Files, linked Notes, Copy Link, and notification follow\/unfollow/, "View-building contract should record the 9.6 preservation slice");
assert.match(regressionSuite, /scripts\/tasks-timer-utility-escape-hatch-regression\.mjs/, "Regression suite should include the timer/utility escape-hatch regression");

console.log("Tasks timer and utility escape-hatch regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function functionBlock(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.slice(start + 1).search(/\n(?:async\s+)?function\s+/);
  return source.slice(start, nextFunction === -1 ? source.length : start + 1 + nextFunction);
}
