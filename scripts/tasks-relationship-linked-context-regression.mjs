import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.18.14.1";
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const tasksModule = readText("src/modules/tasks/module.js");
const tasksScript = readText("public/js/tasks.js");
const taskDialogScript = readText("public/js/task-dialog.js");
const notesLinkedPanel = readText("public/js/shared/notes-linked-panel.js");
const viewBuilder = readText("public/js/shared/view-builder.js");
const tasksService = readText("src/modules/tasks/tasks.service.js");
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
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the current app version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the current app version");
assert.match(tasksModule, new RegExp(`version:\\s*"${escapeRegExp(appVersion)}"`), "Tasks module should report the current app version");

const appendContext = functionBlock(tasksScript, "appendTaskContext");
const contextBadge = functionBlock(tasksScript, "taskContextBadge");
const contextFallback = functionBlock(tasksScript, "taskContextSummaryFallback");
const blockingText = functionBlock(tasksScript, "blockingSummaryText");
const writeParentFields = functionBlock(taskDialogScript, "writeParentTaskFields");
const readParent = functionBlock(taskDialogScript, "readCurrentParentTaskId");
const parentOptions = functionBlock(taskDialogScript, "parentTaskOptions");
const syncParent = functionBlock(taskDialogScript, "syncParentTaskRelationship");
const mountNotes = functionBlock(taskDialogScript, "mountTaskNotesPanel");
const noteList = functionBlock(notesLinkedPanel, "noteList");
const linkedNoteItem = functionBlock(notesLinkedPanel, "linkedNoteListItem");
const linkedNoteSecondary = functionBlock(notesLinkedPanel, "linkedNoteSecondaryLabel");
const createList = functionBlock(viewBuilder, "createLinkedContextList");
const renderRows = functionBlock(viewBuilder, "renderLinkedContextRows");
const addChild = functionBlock(tasksService, "addChildTask");
const updateChild = functionBlock(tasksService, "updateChildTaskRelationship");
const removeChild = functionBlock(tasksService, "removeChildTaskRelationship");
const assertCanRelate = functionBlock(tasksService, "assertCanRelateTasks");
const blockParent = functionBlock(tasksService, "blockParentForChild");
const recoverParent = functionBlock(tasksService, "recoverParentIfNoBlockingChildren");

assert.match(createList, /className:\s*\["view-linked-context-picker-list", options\.className\]/, "Framework should own reusable linked-context read-list anatomy");
assert.match(createList, /renderLinkedContextRows\(rows,[\s\S]*options\.items \|\| options\.records \|\| options\.linkedItems/, "Linked context read lists should render normalized rows through the shared row helper");
assert.match(renderRows, /normalizePickerRecords\(items\)[\s\S]*createLinkedContextPickerRow/, "Linked context read lists and pickers should share normalized row anatomy");
assert.match(viewBuilder, /createLinkedContextList,/, "LongtailForge.view should expose createLinkedContextList");

assert.match(appendContext, /view\.createDetailBadgeRow\(\{[\s\S]*ariaLabel:\s*"Task context"[\s\S]*className:\s*"task-context-summary"[\s\S]*badges:\s*chips\.map\(taskContextBadge\)/, "Task row context and relationship chips should use the framework badge-row primitive");
assert.match(contextBadge, /className:\s*\["task-context-chip", chip\.className\][\s\S]*label:\s*chip\.label[\s\S]*value:\s*chip\.value/, "Tasks should own the labels and values for task relationship/context chips");
assert.match(contextFallback, /document\.createElement\("div"\)[\s\S]*task-context-summary[\s\S]*document\.createElement\("span"\)/, "Task row context should keep a narrow fallback without moving relationship rules into the framework");
assert.match(appendContext, /blockingSummaryText\(task\.relationshipSummary\)/, "Task rows should still read blocking display from Tasks relationshipSummary payloads");
assert.match(blockingText, /incomplete_blocking_child_count[\s\S]*child\$\{blockers === 1 \? "" : "ren"\}/, "Blocking summary text should still be derived from incomplete blocking child count");

assert.match(writeParentFields, /readCurrentParentTaskId\(task\.task_id\)[\s\S]*parentTaskOptions\(task\?\.task_id \|\| ""\)\.map\(\(candidate\) => option\(candidate\.task_id, candidate\.title\)\)/, "Parent task field should keep readable task titles as option labels");
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
assert.match(blockParent, /autoBlockedReason\(\[childTask\.title \|\| childTask\.task_id\]\)[\s\S]*tasksRepository\.update\([\s\S]*status:\s*"blocked"[\s\S]*task\.updated/, "Blocking child relationships should keep Tasks-owned parent block events");
assert.match(recoverParent, /readBlockingChildren[\s\S]*blocked_reason\.startsWith\("Blocked by incomplete child task"\)[\s\S]*tasksRepository\.update\([\s\S]*status:\s*"open"[\s\S]*task\.updated/, "Cleared blocking child relationships should keep Tasks-owned recovery events");
assert.match(tasksService, /readableRelationshipsForTask[\s\S]*direction:\s*isParentSide \? "child" : "parent"[\s\S]*related_task_readable[\s\S]*related_task:\s*canReadRelated && relatedTask/, "Relationship read payloads should still expose related readable task data only when permitted");
assert.match(taskRelationshipsRepo, /readForTask[\s\S]*task_relationships\.workspace_id = \$\{sqlText\(workspaceId\)\}[\s\S]*relationshipSummary[\s\S]*incomplete_blocking_child_count/, "Relationship repository should keep relationship reads and summaries Tasks-owned");

assert.match(relationshipRegression, /same client/i, "Existing relationship regression should preserve same-client boundary coverage");
assert.match(relationshipRegression, /circular/i, "Existing relationship regression should preserve circular relationship coverage");
assert.match(relationshipRegression, /blocking child tasks/i, "Existing relationship regression should preserve blocking-child coverage");
assert.match(relationshipRegression, /relationshipSummary/, "Existing relationship regression should preserve relationship summary coverage");
assert.match(linkedPanelRegression, /AccessBeforeShaping|createClientUserSession|private|secure/i, "Existing linked panel regression should preserve permission-safe read-model coverage");
assert.match(tasksView, /js\/shared\/notes-linked-panel\.js\?v=2[\s\S]*js\/shared\/view-builder\.js\?v=16[\s\S]*js\/task-dialog\.js\?v=21[\s\S]*js\/tasks\.js\?v=20/, "Tasks host should load refreshed linked-context, framework helper, and task row assets");
assert.match(workbenchView, /js\/shared\/notes-linked-panel\.js\?v=2[\s\S]*js\/shared\/view-builder\.js\?v=16[\s\S]*js\/task-dialog\.js\?v=21/, "Workbench host should load refreshed linked-context and framework helper assets before the shared Task dialog");
assert.match(tasksDocs, /0\.33\.5\.18\.10\.4[\s\S]*relationships and linked notes/, "Tasks docs should document the relationship and linked-context cleanup");
assert.match(notesDocs, /Tasks module mounts this helper[\s\S]*Task-created note links/, "Notes docs should keep the task-created note context contract");
assert.match(moduleContract, /0\.33\.5\.18\.10\.4[\s\S]*Task relationship and linked-note display/, "Module contract should document the 10.4 ownership boundary");
assert.match(viewContract, /createLinkedContextList/, "View-building contract should document the linked-context read-list helper");
assert.match(declarativeGuide, /0\.33\.5\.18\.10\.4[\s\S]*createLinkedContextList/, "Declarative guide should document the 10.4 linked-context helper boundary");
assert.match(regressionSuite, /scripts\/tasks-relationship-linked-context-regression\.mjs/, "Regression suite should include the relationship and linked-context cleanup regression");

console.log("Tasks relationship and linked context regression passed.");

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
