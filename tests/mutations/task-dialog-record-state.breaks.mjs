import assert from "node:assert/strict";
import { runMutationCampaign } from "../../scripts/test-support/mutation-runner.mjs";
// Six focused behavior breaks. No annotation mutants, equivalent credits, or withdrawals.
// Shared runner supplies bounded syntax/suite runs, retained backup and SHA-256 restoration.
const cases = [
  { name: "required nullish row stops refusing", find: 'throw new TypeError("Task detail projection is unavailable.");', replace: 'return {};' },
  { name: "projection loses inherited fields and identity", find: 'const fields = Object(value);', replace: 'const fields = { ...Object(value) };' },
  { name: "missing optional projection exposes object prototype", find: 'return value === null || value === undefined ? undefined : taskProjectionFields(value);', replace: 'return taskProjectionFields(value ?? {});' },
  { name: "timer mutation discards retained detail", find: '...(currentTask || {}),\n        ...result.task,', replace: '...result.task,' },
  { name: "completion loses raw writer identity", find: 'currentTask = result.task;\n    currentTask.recurrenceContinuity', replace: 'currentTask = { ...result.task };\n    currentTask.recurrenceContinuity' },
  { name: "checklist reorder submits old order", find: 'items.splice(nextIndex, 0, item);', replace: 'items.splice(index, 0, item);' },
];
const result = runMutationCampaign({ sourcePath: "public/js/task-dialog.js", suites: ["tests/unit/task-dialog-record-state.test.mjs"], cases, suiteTimeoutMs: 15000, syntaxTimeoutMs: 5000, campaignTimeoutMs: 180000 });
assert.deepEqual(result.survivors, [], "Meaningful survivors need an assertion or a recorded finding");
assert.deepEqual(result.unusable, [], "Invalid and incidental failures are not evidence");
