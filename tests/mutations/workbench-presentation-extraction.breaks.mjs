import assert from "node:assert/strict";
import { runMutationCampaign } from "../../scripts/test-support/mutation-runner.mjs";

// DOM/interaction comparisons are the mutation oracle; the separate body-identity case is excluded.
const result = runMutationCampaign({
  sourcePath: "public/js/workbench-task-focus-presentation.js",
  suites: ["tests/unit/workbench-presentation-extraction.test.mjs", "--testNamePattern=compares DOM|preserves action|retains live|preserves opaque"],
  suiteTimeoutMs: 20000,
  campaignTimeoutMs: 240000,
  cases: [
    { name: "live state getter snapshotted", find: "function create(host) {", replace: "function create(host) { host = { ...host };" },
    { name: "summary title fallback changed", find: '"Focused task"', replace: '"Different title"' },
    { name: "details opened by default", find: 'setWorkbenchDisclosureOpen(details, false);', replace: 'setWorkbenchDisclosureOpen(details, true);' },
    { name: "timer pause wired as running", find: 'onClick: () => saveFocusedTaskTimer("paused"),', replace: 'onClick: () => saveFocusedTaskTimer("running"),' },
    { name: "timer controls reordered", find: 'children: [duration, startButton, pauseButton, saveButton, resetButton],', replace: 'children: [duration, pauseButton, startButton, saveButton, resetButton],' },
    { name: "related item cloned at dispatch", find: 'openTaskFocusRelatedContextItem(item, event.currentTarget)', replace: 'openTaskFocusRelatedContextItem({ ...item }, event.currentTarget)' },
    { name: "related error lost", find: 'emptyState(context.error)', replace: 'emptyState("No related task context is available yet.")' },
    { name: "action listener swapped", find: 'onClick: completeFocusedTask,', replace: 'onClick: resumeFocusedTask,' },
    { name: "summary and details reordered", find: 'createTaskFocusSummary(active),\n        createTaskDetailsSection(active),', replace: 'createTaskDetailsSection(active),\n        createTaskFocusSummary(active),' },
    { name: "collapsed getter ignored", find: 'if (host.taskFocusInspectorCollapsed) {', replace: 'if (false) {' },
    { name: "active state snapshotted", find: 'const active = isTaskFocus ? host.state.activeTaskFocus : null;', replace: 'const active = null;' },
  ],
});
assert.equal(result.survivors.length, 0);
assert.equal(result.unusable.length, 0);
