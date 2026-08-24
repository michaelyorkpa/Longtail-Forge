import assert from "node:assert/strict";

import { createProjectTextReader, extractFunctionSpan } from "../../test-support/source-scan.mjs";
// Consolidated under tasks.current-static-contracts by 0.33.33.10.
const { readText } = createProjectTextReader();

const tasksModule = readText("src/modules/tasks/module.js");
const tasksScript = readText("public/js/tasks.js");
const taskDialogScript = readText("public/js/task-dialog.js");
const notesLinkedPanel = readText("public/js/shared/notes-linked-panel.js");
const viewBuilder = readText("public/js/shared/view-builder.js");
const tasksService = readText("src/modules/tasks/tasks.service.js");
const taskBlockRecoveryEngine = readText("src/modules/tasks/task-block-recovery-engine.js");
const taskRelationshipsRepo = readText("src/modules/tasks/task-relationships.repo.js");
const tasksView = readText("views/protected/tasks.html");
const workbenchView = readText("views/protected/workbench.html");
const tasksDocs = readText("docs/tasks-module.md");
const notesDocs = readText("docs/notes-module.md");
const moduleContract = readText("docs/module-contract.md");
const viewContract = readText("docs/view-building-contract.md");
const declarativeGuide = readText("docs/declarative-view-surfaces.md");
const relationshipRegression = readText("scripts/task-relationships-regression.mjs");
const linkedPanelRegression = readText("scripts/notes-linked-panel-regression.mjs");

assert.match(tasksModule, /version:\s*appVersion/, "Tasks module should report the current app version");

const appendContext = extractFunctionSpan(tasksScript, "appendTaskContext");
const contextBadge = extractFunctionSpan(tasksScript, "taskContextBadge");
const contextFallback = extractFunctionSpan(tasksScript, "taskContextSummaryFallback");
const blockingText = extractFunctionSpan(tasksScript, "blockingSummaryText");
const writeParentFields = extractFunctionSpan(taskDialogScript, "writeParentTaskFields");
const readParent = extractFunctionSpan(taskDialogScript, "readCurrentParentTaskId");
const parentOptions = extractFunctionSpan(taskDialogScript, "parentTaskOptions");
const syncParent = extractFunctionSpan(taskDialogScript, "syncParentTaskRelationship");
const mountNotes = extractFunctionSpan(taskDialogScript, "mountTaskNotesPanel");
const noteList = extractFunctionSpan(notesLinkedPanel, "noteList");
const linkedNoteItem = extractFunctionSpan(notesLinkedPanel, "linkedNoteListItem");
const linkedNoteSecondary = extractFunctionSpan(notesLinkedPanel, "linkedNoteSecondaryLabel");
const createList = extractFunctionSpan(viewBuilder, "createLinkedContextList");
const renderRows = extractFunctionSpan(viewBuilder, "renderLinkedContextRows");
const addChild = extractFunctionSpan(tasksService, "addChildTask");
const updateChild = extractFunctionSpan(tasksService, "updateChildTaskRelationship");
const removeChild = extractFunctionSpan(tasksService, "removeChildTaskRelationship");
const assertCanRelate = extractFunctionSpan(tasksService, "assertCanRelateTasks");
const blockParent = extractFunctionSpan(tasksService, "blockParentForChild");
const recoverParent = extractFunctionSpan(tasksService, "recoverParentIfNoBlockingChildren");
const planBlockParent = extractFunctionSpan(taskBlockRecoveryEngine, "planParentBlockTransition");
const planRecoverParent = extractFunctionSpan(taskBlockRecoveryEngine, "planParentRecoveryTransition");

assert.match(createList, /className:\s*\["view-linked-context-picker-list", options\.className\]/, "Framework should own reusable linked-context read-list anatomy");
assert.match(createList, /renderLinkedContextRows\(rows,[\s\S]*options\.items \|\| options\.records \|\| options\.linkedItems/, "Linked context read lists should render normalized rows through the shared row helper");
assert.match(renderRows, /normalizePickerRecords\(items\)[\s\S]*createLinkedContextPickerRow/, "Linked context read lists and pickers should share normalized row anatomy");
assert.match(viewBuilder, /createLinkedContextList,/, "LongtailForge.view should expose createLinkedContextList");

assert.match(appendContext, /view\.createDetailBadgeRow\(\{[\s\S]*ariaLabel:\s*"Task context"[\s\S]*className:\s*"task-context-summary"[\s\S]*badges:\s*chips\.map\(taskContextBadge\)/, "Task row context and relationship chips should use the framework badge-row primitive");
assert.match(contextBadge, /className:\s*\["task-context-chip", chip\.className\][\s\S]*label:\s*chip\.label[\s\S]*value:\s*chip\.value/, "Tasks should own the labels and values for task relationship/context chips");
assert.match(contextFallback, /document\.createElement\("div"\)[\s\S]*task-context-summary[\s\S]*document\.createElement\("span"\)/, "Task row context should keep a narrow fallback without moving relationship rules into the framework");
assert.match(appendContext, /blockingSummaryText\(task\.relationshipSummary\)/, "Task rows should still read blocking display from Tasks relationshipSummary payloads");
assert.match(blockingText, /incomplete_blocking_child_count[\s\S]*child\$\{blockers === 1 \? "" : "ren"\}/, "Blocking summary text should still be derived from incomplete blocking child count");

assert.match(writeParentFields, /readCurrentParentTaskId\(task\.task_id\)[\s\S]*parentTaskOptions\(task\?\.task_id \|\| ""\)\.map\(\(candidate\) => option\(candidate\.task_id, candidate\.optionLabel \|\| candidate\.title\)\)/, "Parent task field should keep readable hierarchy labels as option labels");
assert.match(readParent, /\/api\/tasks\/\$\{encodeURIComponent\(taskId\)\}\/relationships[\s\S]*relationship\.direction === "parent"/, "Current parent lookup should stay on the Tasks relationship route");
assert.match(parentOptions, /task\.task_id !== taskId[\s\S]*!selectedClientId \|\| !task\.client_id \|\| task\.client_id === selectedClientId[\s\S]*!selectedProjectId \|\| !task\.project_id \|\| task\.project_id === selectedProjectId[\s\S]*localeCompare/, "Parent task options should preserve task-owned scope filtering and readable title sorting");
assert.match(syncParent, /api\.deleteJson\(`\/api\/tasks\/\$\{encodeURIComponent\(currentParentTaskId\)\}\/children\/\$\{encodeURIComponent\(taskId\)\}`\)[\s\S]*api\.postJson\(`\/api\/tasks\/\$\{encodeURIComponent\(nextParentTaskId\)\}\/children`[\s\S]*is_blocking:\s*false/, "Parent task saves should continue through Tasks-owned relationship routes");

assert.match(noteList, /namespace\.view\?\.createLinkedContextList\(\{[\s\S]*ariaLabel:\s*"Linked notes"[\s\S]*className:\s*"notes-linked-panel-list"[\s\S]*items:\s*state\.notes\.map\(\(note\) => linkedNoteListItem\(state, note\)\)/, "Task-linked Notes panel should render linked rows through the framework linked-context read-list helper");
assert.match(linkedNoteItem, /displayLabel:\s*note\.label \|\| "Untitled note"[\s\S]*hintLabel:\s*note\.excerpt \|\| \(note\.security_mode === "secure" \? "Secure note body is hidden\." : ""\)[\s\S]*sourceUrl:\s*note\.sourceUrl \|\| `notes\.html\?note=\$\{encodeURIComponent\(note\.id \|\| ""\)\}`/, "Linked note rows should use readable note labels, safe hints, and normal note URLs");
assert.match(linkedNoteItem, /removable:\s*canUnlink\(state, note\)[\s\S]*secondaryLabel:\s*linkedNoteSecondaryLabel\(note\)/, "Linked note rows should keep unlink permissions and safe metadata in the owning helper");
assert.match(linkedNoteSecondary, /visibility[\s\S]*security_mode[\s\S]*status[\s\S]*formatToken[\s\S]*join\(" \| "\)/, "Linked note secondary labels should contain readable metadata tokens");
assert.doesNotMatch(`${linkedNoteItem}\n${linkedNoteSecondary}`, /displayLabel:\s*note\.id|textContent\s*=\s*note\.id|targetId:\s*note\.id[\s\S]*displayLabel:\s*note\.id/, "Linked note row labels should not fall back to raw note IDs");
assert.match(mountNotes, /namespace\.notesLinkedPanel\.mount\(fields\.notesContainer,[\s\S]*moduleId:\s*"tasks"[\s\S]*readonly:\s*task\?\.status === "archived"[\s\S]*saveFirstMessage:\s*"Save the task before adding notes\."[\s\S]*targetType:\s*"task"[\s\S]*title:\s*"Task Notes"/, "Task dialog should keep the Notes-owned linked panel contract");

assert.match(addChild, /assertCanRelateTasks\(session, parentTask, childTask\)[\s\S]*taskRelationshipsRepository\.(readActivePair|create)[\s\S]*blockParentForChild\(session, parentTask, childTask\)/, "Adding child relationships should keep Tasks service-owned validation and blocking side effects");
assert.match(updateChild, /taskRelationshipsRepository\.update[\s\S]*blockParentForChild\(session, parentTask, childTask\)[\s\S]*recoverParentIfNoBlockingChildren\(session, parentTask\)/, "Updating child relationships should preserve blocking and recovery side effects");
assert.match(removeChild, /taskRelationshipsRepository\.remove[\s\S]*recoverParentIfNoBlockingChildren\(session, parentTask\)/, "Removing child relationships should preserve parent recovery behavior");
assert.match(assertCanRelate, /parentTask\.workspace_id !== childTask\.workspace_id[\s\S]*same workspace[\s\S]*parentTask\.client_id &&[\s\S]*childTask\.client_id &&[\s\S]*parentTask\.client_id !== childTask\.client_id[\s\S]*same client[\s\S]*hasPath/, "Relationship scope rules should stay Tasks-owned");
assert.match(planBlockParent, /isTaskTerminalStatus\(parentTask\.status\)[\s\S]*isTaskTerminalStatus\(blockingChild\.status\)[\s\S]*blockedReason[\s\S]*pauseRunningTimers: true[\s\S]*status_transition_reason: "blocked_by_child"/, "The checked transition engine should own terminal guards, reason selection, timer-pause intent, and block metadata");
assert.match(blockParent, /planParentBlockTransition\([\s\S]*transition\.effects\.persistTask[\s\S]*tasksRepository\.update\([\s\S]*transition\.taskPatch\.status[\s\S]*transition\.effects\.pauseRunningTimers[\s\S]*emitTaskEvent\("task\.updated"[\s\S]*syncTaskSearchIndex/, "Blocking child relationships should keep persistence, timer, event, and search side effects in the Tasks orchestrator");
assert.match(planRecoverParent, /normalizedStatus\(parentTask\.status\) !== "blocked"[\s\S]*incompleteBlockingChildCount[\s\S]*manual_block_preserved[\s\S]*pauseRunningTimers: false[\s\S]*status_transition_reason: "unblocked_by_child"/, "The checked transition engine should distinguish remaining blockers and manual reasons before planning recovery");
assert.match(recoverParent, /readBlockingChildren[\s\S]*planParentRecoveryTransition\([\s\S]*isIncompleteTask\(relationship\.child_status\)[\s\S]*transition\.effects\.persistTask[\s\S]*tasksRepository\.update\([\s\S]*emitTaskEvent\("task\.updated"[\s\S]*syncTaskSearchIndex/, "Cleared blocking child relationships should keep reads, persistence, events, and search side effects in the Tasks orchestrator");
assert.match(tasksService, /readableRelationshipsForTask[\s\S]*direction:\s*isParentSide \? "child" : "parent"[\s\S]*related_task_readable[\s\S]*related_task:\s*canReadRelated && relatedTask/, "Relationship read payloads should still expose related readable task data only when permitted");
assert.match(taskRelationshipsRepo, /readForTask[\s\S]*task_relationships\.workspace_id = :workspaceId[\s\S]*relationshipSummary[\s\S]*incomplete_blocking_child_count/, "Relationship repository should keep relationship reads and summaries Tasks-owned");

assert.match(relationshipRegression, /same client/i, "Existing relationship regression should preserve same-client boundary coverage");
assert.match(relationshipRegression, /circular/i, "Existing relationship regression should preserve circular relationship coverage");
assert.match(relationshipRegression, /blocking child tasks/i, "Existing relationship regression should preserve blocking-child coverage");
assert.match(relationshipRegression, /relationshipSummary/, "Existing relationship regression should preserve relationship summary coverage");
assert.match(linkedPanelRegression, /AccessBeforeShaping|createClientUserSession|private|secure/i, "Existing linked panel regression should preserve permission-safe read-model coverage");
assert.match(tasksView, /js\/shared\/notes-linked-panel\.js[\s\S]*js\/shared\/view-builder\.js[\s\S]*js\/task-dialog\.js[\s\S]*js\/tasks\.js/, "Tasks host should load refreshed linked-context, framework helper, and task row assets");
assert.match(workbenchView, /js\/shared\/notes-linked-panel\.js[\s\S]*js\/shared\/view-builder\.js/, "Workbench host should keep linked-context and framework helper assets static for the lazy Task dialog");
assert.match(tasksDocs, /0\.33\.5\.18\.10\.4[\s\S]*relationships and linked notes/, "Tasks docs should document the relationship and linked-context cleanup");
assert.match(notesDocs, /Tasks module mounts this helper[\s\S]*Task-created note links/, "Notes docs should keep the task-created note context contract");
assert.match(moduleContract, /0\.33\.5\.18\.10\.4[\s\S]*Task relationship and linked-note display/, "Module contract should document the 10.4 ownership boundary");
assert.match(viewContract, /createLinkedContextList/, "View-building contract should document the linked-context read-list helper");
assert.match(declarativeGuide, /0\.33\.5\.18\.10\.4[\s\S]*createLinkedContextList/, "Declarative guide should document the 10.4 linked-context helper boundary");

console.log("Tasks relationship and linked context regression passed.");
