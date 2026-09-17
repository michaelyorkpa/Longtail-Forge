import assert from "node:assert/strict";
import { runMutationCampaign } from "../../scripts/test-support/mutation-runner.mjs";

// Small behavior campaign for changed reads, not annotation count. Shared runner retains
// bytes, checks syntax, bounds each suite and verifies SHA-256 restoration in finally.
// No equivalent, invalid or withdrawn cases are credited; a survivor remains a finding.
const cases = [
  { name: "render no longer replaces existing rows", find: "Reflect.apply(replaceChildren, list, taskContextOptionItems(rows));", replace: "void replaceChildren; void rows;" },
  { name: "unsaved input becomes editable", find: 'writeTaskControl(fields.checklistInput, "disabled", !canUseChecklist);', replace: 'writeTaskControl(fields.checklistInput, "disabled", false);' },
  { name: "section opens with zero rows", find: "length) => length > 0;", replace: "length) => length >= 0;" },
  { name: "host index is coerced before the original strict comparison", find: "[item, index, taskProjectionFields(items).length]", replace: "[item, Number(index), taskProjectionFields(items).length]" },
  { name: "custom trim loses its receiver", find: 'callTaskContextCollection(taskProjectionFields(input).value, "trim", [])', replace: 'Reflect.apply(taskProjectionFields(taskProjectionFields(input).value).trim, undefined, [])' },
  { name: "empty label no longer restores focus", find: "Reflect.apply(focus, input, []);", replace: "void focus;" },
  { name: "focus getter is read twice", find: "Reflect.apply(focus, input, []);", replace: "Reflect.apply(taskProjectionFields(input).focus, input, []);" },
  { name: "missing delete label loses fallback", find: '?.value || "this checklist item";', replace: '?.value || "";' },
];
const result = runMutationCampaign({ sourcePath: "public/js/task-dialog.js", suites: ["tests/unit/task-dialog-checklist-consumers.test.mjs"], cases, suiteTimeoutMs: 15000, syntaxTimeoutMs: 5000, campaignTimeoutMs: 180000 });
assert.deepEqual(result.survivors, [], "Meaningful survivors need a test or recorded finding");
assert.deepEqual(result.unusable, [], "Invalid and runner failures are not detections");
