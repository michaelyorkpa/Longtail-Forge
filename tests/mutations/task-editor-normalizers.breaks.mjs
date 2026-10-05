import assert from "node:assert/strict";
import { runMutationCampaign } from "../../scripts/test-support/mutation-runner.mjs";
// Uses the shared runner unchanged: retained backup, green baseline, bounded syntax/suite
// runs, assertion-aware outcomes and SHA-256 restoration in finally. Run alone.
// Domain mutations, not annotation mutations. No equivalent/invalid credits or withdrawals.
const cases = [
  { name: "action wrongly overrides explicit mode", find: 'params.mode || params.action || ""', replace: 'params.action || params.mode || ""' },
  { name: "mode gains unsupported whitespace trimming", find: 'String(params.mode || params.action || "").toLowerCase()', replace: 'String(params.mode || params.action || "").trim().toLowerCase()' },
  { name: "truthy strings become duplicate flags", find: 'if (params.duplicate === true) {', replace: 'if (params.duplicate) {' },
  { name: "id fallback disappears", find: 'params.task || params.taskId || params.task_id || params.recordId || params.id ? "edit" : "add"', replace: 'params.task || params.taskId || params.task_id || params.recordId ? "edit" : "add"' },
  { name: "sourceContext wrongly overrides context", find: 'inputFields(params.context || params.sourceContext || {})', replace: 'inputFields(params.sourceContext || params.context || {})' },
  { name: "nested context overrides nested params", find: '...inputFields(sourceContext.defaults || {}),\n      ...inputFields(params.defaults || {}),', replace: '...inputFields(params.defaults || {}),\n      ...inputFields(sourceContext.defaults || {}),' },
  { name: "explicit null no longer overrides defaults", find: 'if (params[key] !== undefined)', replace: 'if (params[key] != null)' },
  { name: "context flat defaults no longer override nested params", find: 'defaults[key] = sourceContext[key];', replace: 'defaults[key] = defaults[key] ?? sourceContext[key];' },
  { name: "primitive defaults lose their spread entries", find: 'return Object(value);', replace: 'return value !== null && typeof value === "object" ? value : {};' },
  { name: "focus whitespace is retained", find: 'String(value || "").trim().toLowerCase().replace(/-/g, "_")', replace: 'String(value || "").toLowerCase().replace(/-/g, "_")' },
  { name: "hyphen focus aliases stop resolving", find: '.toLowerCase().replace(/-/g, "_")', replace: '.toLowerCase()' },
  { name: "focus table reads inherited object names again", find: 'return Object.entries(aliases).find(([key]) => key === normalized)?.[1] || "";', replace: 'return Reflect.get(aliases, normalized) || "";' },
];
const result = runMutationCampaign({ sourcePath: "public/js/task-dialog.js", suites: ["tests/unit/task-editor-normalizers.test.mjs"], cases, suiteTimeoutMs: 15000, syntaxTimeoutMs: 5000, campaignTimeoutMs: 240000 });
assert.deepEqual(result.survivors, [], "A meaningful survivor requires a test or a recorded finding");
assert.deepEqual(result.unusable, [], "Invalid/incidental failures cannot count as detection");
