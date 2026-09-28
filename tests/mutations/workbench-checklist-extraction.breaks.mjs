import { runMutationCampaign } from "../../scripts/test-support/mutation-runner.mjs";

// Exercise behavior, not the separate token-equivalence assertion. The runner retains the
// original byte copy, bounds every invocation, and verifies SHA-256 restoration in finally.
runMutationCampaign({
  sourcePath: "public/js/workbench-task-focus-checklist.js",
  suites: ["tests/unit/workbench-checklist-extraction.test.mjs", "--testNamePattern=matches the old|keeps opaque|attaches the original"],
  suiteTimeoutMs: 20000,
  campaignTimeoutMs: 120000,
  cases: [
    { name: "event wiring removed", find: 'body.addEventListener("change", handleTaskFocusChecklistChange);', replace: 'body.addEventListener("input", handleTaskFocusChecklistChange);' },
    { name: "populated disclosure closed", find: 'setWorkbenchDisclosureOpen(details, items.length > 0);', replace: 'setWorkbenchDisclosureOpen(details, false);' },
    { name: "pending mutation no longer disables rows", find: 'checkbox.disabled = Boolean(active?.checklistMutationItemId);', replace: 'checkbox.disabled = false;' },
    { name: "opaque getter receiver replaced", find: 'Reflect.get(Object(value), key, value)', replace: 'Reflect.get(Object(value), key, {})' },
  ],
});
