import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.21.0.1";
const modalStandardVersion = "0.33.5.18.10.8.5";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const tasksModule = readText("src/modules/tasks/module.js");
const notesModule = readText("src/modules/notes/module.js");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const uiSurfaceContract = readText("docs/ui-surface-contract.md");
const viewBuildingContract = readText("docs/view-building-contract.md");
const tasksDocs = readText("docs/tasks-module.md");
const notesDocs = readText("docs/notes-module.md");
const viewBuilder = readText("public/js/shared/view-builder.js");
const taskDialog = readText("public/js/task-dialog.js");
const notesJs = readText("public/js/notes.js");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the modal action contract version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the modal action contract version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the modal action contract version");
assert.match(tasksModule, new RegExp(`version:\\s*"${escapeRegExp(appVersion)}"`), "Tasks module metadata should report the modal action contract version");
assert.match(notesModule, new RegExp(`version:\\s*"${escapeRegExp(appVersion)}"`), "Notes module metadata should report the modal action contract version");

assert.match(roadmap, /Completed 0\.33\.5\.18\.11\.1 through 0\.33\.5\.18\.11\.13 are archived/, "Roadmap should archive completed Files browse/edit/preview slices");
assert.match(roadmap, /Completed 0\.33\.5\.18\.12\.1 through 0\.33\.5\.18\.12\.7 are archived/, "Roadmap should archive the completed Files upload/action/guardrail branch");

for (const [name, doc] of [
  ["UI surface contract", uiSurfaceContract],
  ["View-building contract", viewBuildingContract],
]) {
  assert.match(doc, /0\.33\.5\.18\.10\.8\.1/, `${name} should record the 10.8.1 modal action standard`);
  assert.match(doc, /footer utility group[\s\S]*footer commit group|utility and commit grouping/, `${name} should document utility and commit footer grouping`);
  assert.match(doc, /Tags, Files, and Copy Link[\s\S]*icon plus short visible text/, `${name} should document icon plus text utility actions`);
  assert.match(doc, /Cancel and Save[\s\S]*compact\s+Tasks pattern|compact\s+Tasks pattern[\s\S]*Cancel and Save/, `${name} should document compact commit actions`);
  assert.match(doc, /Follow\s+Notifications bell/, `${name} should document the heading follow bell standard`);
  assert.match(doc, /meaningful\s+(record\s+)?notifications/, `${name} should block cosmetic follow bells`);
  assert.match(doc, /stacked child dialogs/, `${name} should document child dialogs for substantial utility content`);
  assert.match(doc, new RegExp(escapeRegExp(modalStandardVersion)), `${name} should record the 10.8.5 modal standardization closeout`);
  assert.match(doc, /finalized converted modal action standard|finalized cross-module converted modal action ownership standard/, `${name} should document the finalized converted modal action standard`);
  assert.match(doc, /Strict converted-surface guardrails|Strict\s+guardrails/, `${name} should document strict converted-surface guardrails`);
  assert.match(doc, /module-specific (heading or footer|modal footer\/heading) anatomy|module-specific modal footer\/heading anatomy/, `${name} should reject one-off converted modal anatomy`);
  assert.match(doc, /inline (parent-body )?Tags\/Files|substantial footer utilities\s+inside the parent modal body|expanding\s+inline\s+inside the parent editor body/, `${name} should reject inline parent-body utility panels`);
}

assert.match(tasksDocs, new RegExp(`current Tasks module behavior as of ${escapeRegExp(appVersion)}`), "Tasks docs should report the current module handoff version");
assert.match(tasksDocs, new RegExp(`As of ${escapeRegExp(modalStandardVersion)}[\\s\\S]*Task editor is the Tasks reference implementation`), "Tasks docs should keep the historical modal contract version");
assert.match(tasksDocs, /Task Tags and Files footer utilities open stacked child dialogs/, "Tasks docs should document the shipped child-dialog behavior");
assert.match(tasksDocs, /Tags, Files, and Copy Link footer utilities use icon plus text/, "Tasks docs should align utility action placement");
assert.match(tasksDocs, /Task modal notification following is owned by the heading bell/, "Tasks docs should align heading action placement");
assert.match(tasksDocs, /Task editor is the Tasks reference implementation for the finalized converted-modal action standard/, "Tasks docs should identify the reference modal standard");

assert.match(notesDocs, new RegExp(`current Notes implementation as of ${escapeRegExp(appVersion)}`), "Notes docs should report the current module handoff version");
assert.match(notesDocs, new RegExp(`As of ${escapeRegExp(modalStandardVersion)}[\\s\\S]*Notes editor is the Notes reference implementation`), "Notes docs should keep the historical modal contract version");
assert.match(notesDocs, /`Tags`, `Files`, and saved-note `Copy Link`/, "Notes docs should document the shipped Copy Link footer utility");
assert.match(notesDocs, /Tags, Files, and Copy Link footer utilities use icon plus text/, "Notes docs should align utility action placement");
assert.match(notesDocs, /heading action slot uses a saved-note Follow Notifications bell/, "Notes docs should document the shipped heading follow action");
assert.match(notesDocs, /Notes owns which note events are meaningful/, "Notes docs should keep notification production module-owned");
assert.match(notesDocs, /Notes editor is the Notes reference implementation for the finalized converted-modal action standard/, "Notes docs should identify the reference modal standard");

assert.match(viewBuilder, /function createModalFooter[\s\S]*surface-modal-footer-utilities[\s\S]*data-modal-footer-group": "utility"[\s\S]*surface-modal-footer-commit[\s\S]*data-modal-footer-group": "commit"/, "View builder should own utility and commit footer groups");
assert.match(viewBuilder, /function createActionButton[\s\S]*button\.dataset\.surfaceActionRole = role/, "View builder action buttons should carry stable action roles");

assert.match(taskDialog, /view\.renderDescriptorModalForm\(descriptor, \{[\s\S]*utilityActions: taskEditorUtilityActions\(descriptor\)[\s\S]*actions: taskEditorCommitActions\(descriptor\)/, "Task editor should feed utility and commit actions into the framework modal footer");
assert.match(taskDialog, /className: "surface-modal-footer-action"[\s\S]*role: action\.role/, "Task editor footer actions should use framework footer action class and stable roles");
assert.match(taskDialog, /role: "utility"[\s\S]*title: "Follow task notifications"/, "Task follow notifications should live in the heading action slot");
assert.match(taskDialog, /function createTaskTagsDialog\(\)[\s\S]*view\.createModal\([\s\S]*title: "Task Tags"/, "Task Tags should use the framework child modal shell");
assert.match(taskDialog, /function createTaskFilesDialog\(\)[\s\S]*view\.createModal\([\s\S]*title: "Task Files"/, "Task Files should use the framework child modal shell");
assert.match(taskDialog, /showTaskModal\(tagsDialog, \{ parent: dialog, trigger: fields\.tagToggle \}\)/, "Task Tags should open as a stacked child dialog");
assert.match(taskDialog, /showTaskModal\(filesDialog, \{ parent: dialog, trigger: fields\.fileToggle \}\)/, "Task Files should open as a stacked child dialog");

assert.match(notesJs, /view\.renderDescriptorModalForm\(modal, \{[\s\S]*actions: \[cancel, save\][\s\S]*utilityActions: \[tagsToggle, filesToggle, copyLink\]/, "Note editor should feed utility and commit actions into the framework modal footer");
assert.match(notesJs, /createNoteTagsDialogShell[\s\S]*view\.createModal\([\s\S]*title: "Tags"/, "Notes should keep Tags in a stacked child dialog");
assert.match(notesJs, /createNoteFilesDialogShell[\s\S]*view\.createModal\([\s\S]*title: "Files"/, "Notes should keep Files in a stacked child dialog");
assert.match(notesJs, /action: "follow-note-notifications"[\s\S]*icon: "bell"[\s\S]*iconOnly: true/, "Notes heading action should be the saved-note follow bell");
assert.doesNotMatch(notesJs, /data-note-dialog-close|noteDialogClose/, "Notes should not keep the duplicate top Close button hook");

assert.match(changelog, new RegExp(`## Version ${escapeRegExp(modalStandardVersion)} - `), "Changelog should include the modal action contract version");
assert.match(changelog, /Finalized the cross-module converted modal action standard/, "Changelog should summarize the finalized modal standard");
assert.match(changelog, /strict converted-surface guardrails protect the standardized footer\/heading pattern/, "Changelog should summarize the guardrail closeout");
assert.match(regressionSuite, /scripts\/modal-action-standardization-contract-regression\.mjs/, "Regression suite should include the modal action contract regression");

console.log("Modal action standardization contract regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
