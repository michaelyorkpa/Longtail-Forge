import assert from "node:assert/strict";
import { runMutationCampaign } from "../../scripts/test-support/mutation-runner.mjs";
// Bounded shared runner, retained source backup and verified SHA-256 restoration.
// These cases protect the new checks, not the declaration count. No equivalent or
// invalid mutation is credited; no cases were withdrawn.
// First run: inherited dataset, callable dataset and inherited focus produced
// incidental throws outside assertions. Acceptance now uses doesNotThrow,
// so those input-domain regressions are explicitly asserted; the full table reran.
const cases = [
  { name: "close validation escapes instead of rejecting open", find: "          reject(error);", replace: "          throw error;" },
  { name: "close validation leaves open pending", find: "          reject(error);", replace: "          void error;" },
  { name: "non-extensible visibility becomes a throw", find: 'Reflect.set(element, "hidden", !hasClientScope);', replace: 'Object.assign(element, { hidden: !hasClientScope });' },
  { name: "workspace control visibility stops updating", find: 'Reflect.set(element, "hidden", !hasClientScope);', replace: 'Reflect.set(element, "unused", !hasClientScope);'  },
  { name: "required absence silently returns", find: 'throw new TypeError("Task dialog control is unavailable.");', replace: 'return value;' },
  { name: "dataset loses prototype inheritance", find: '"dataset" in control ? control.dataset : undefined', replace: 'Object.hasOwn(control, "dataset") ? control.dataset : undefined' },
  { name: "dataset accepts null", find: 'value !== null && (typeof value === "object" || typeof value === "function")', replace: 'typeof value === "object" || typeof value === "function"' },
  { name: "dataset refuses callable containers", find: '(typeof value === "object" || typeof value === "function")', replace: 'typeof value === "object"' },
  { name: "focus loses prototype inheritance", find: '"focus" in element && typeof element.focus === "function"', replace: 'Object.hasOwn(element, "focus") && typeof element.focus === "function"' },
  { name: "focus never invokes the accepted method", find: '      element.focus();\n      return;', replace: '      return;' },
  { name: "invalid focus becomes silent", find: 'throw new TypeError("Task dialog control cannot receive focus.");', replace: 'return;' },
  { name: "inherited close reason disappears", find: '"returnValue" in control ? control.returnValue : undefined', replace: 'Object.hasOwn(control, "returnValue") ? control.returnValue : undefined' },
  { name: "empty close reason loses its default", find: '      return "closed";', replace: '      return "";' },
  { name: "non-text close reason leaks through", find: 'throw new TypeError("Task dialog close reason must be text.");', replace: 'return value;' },
];
const result = runMutationCampaign({ sourcePath: "public/js/task-dialog.js", suites: ["tests/unit/task-dialog-dom-controls.test.mjs"], cases, suiteTimeoutMs: 15000, syntaxTimeoutMs: 5000, campaignTimeoutMs: 240000 });
assert.deepEqual(result.survivors, []);
assert.deepEqual(result.unusable, []);
