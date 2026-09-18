import assert from "node:assert/strict";
import { runMutationCampaign } from "../../scripts/test-support/mutation-runner.mjs";

// Only changed consumer behavior is attacked, not parameter annotations or deferred writers.
// An inherited-key lookup mutation is equivalent here: the unchanged focus normalizer already
// rejects prototype names. Do not invent a bypass of that real producer to credit a detection.
const cases = [
  { name: "focus panel is closed before focus", find: "panel.open = true;", replace: "panel.open = false;" },
  { name: "unknown focus no longer falls back to title", find: 'Object.entries(targetMap).find(([key]) => key === focusTarget)?.[1] || fields.titleInput', replace: 'Object.entries(targetMap).find(([key]) => key === focusTarget)?.[1]' },
  { name: "return focus loses its receiver", find: "Reflect.apply(focus, target, []);", replace: "Reflect.apply(focus, undefined, []);" },
  { name: "notification status read loses its receiver", find: "Reflect.apply(readStatus, statusOwner, [target])", replace: "Reflect.apply(readStatus, undefined, [target])" },
  { name: "failed checkbox write no longer rolls back", find: 'Reflect.set(taskProjectionFields(checkbox), "checked", !taskProjectionFields(checkbox).checked);', replace: 'Reflect.set(taskProjectionFields(checkbox), "checked", taskProjectionFields(checkbox).checked);' },
  { name: "unknown checklist action becomes a save", find: 'if (action === "save") {', replace: 'if (action) {' },
];
const result = runMutationCampaign({ sourcePath: "public/js/task-dialog.js", suites: ["tests/unit/task-dialog-tail-consumers.test.mjs"], cases, suiteTimeoutMs: 15000, syntaxTimeoutMs: 5000, campaignTimeoutMs: 150000 });
assert.deepEqual(result.survivors, [], "A meaningful survivor requires a test or recorded finding");
assert.deepEqual(result.unusable, [], "Invalid or runner failures are not detections");
