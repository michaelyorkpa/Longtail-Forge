import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const iconHelper = readText("public/js/shared/icons.js");
const tasks = readText("public/js/tasks.js");
const taskDialog = readText("public/js/task-dialog.js");
const stopWatch = readText("public/js/stop-watch.js");
const css = readText("public/css/longtail-forge.css");
const roadmap = readText("ROADMAP.md");

["complete", "duplicate"].forEach((iconName) => {
  assert.match(iconHelper, new RegExp(`${iconName}:\\s*Object\\.freeze`), `shared icon helper must include ${iconName} for Tasks row actions`);
});

assert.match(tasks, /window\.LongtailForge\.icons\?\.createIconButton/, "Tasks row actions must use the shared icon button helper");
assert.match(tasks, /function taskActionIcon\(label\)/, "Tasks row action icons must be mapped through semantic labels");
assert.match(tasks, /label === "Archive" \? "danger" : ""/, "Tasks archive row action must preserve danger styling");
assert.match(tasks, /title:\s*label/, "Tasks icon-only row actions must preserve title text");

assert.match(taskDialog, /function decorateTaskDialogControls\(\)/, "Task dialog must decorate task timer controls through a local helper");
assert.match(taskDialog, /icons\.decorateButton\(fields\.timerStart,\s*\{ icon: "start"[\s\S]*text: "Start"[\s\S]*iconOnly: false/, "Task timer Start must be icon-plus-text");
assert.match(taskDialog, /icons\.decorateButton\(fields\.timerFinalize,\s*\{ icon: "save"[\s\S]*text: "Save Time"[\s\S]*iconOnly: false/, "Task timer Save Time must keep visible text");
assert.match(taskDialog, /icons\.decorateButton\(fields\.timerReset,\s*\{ icon: "restore"[\s\S]*variant: "danger"/, "Task timer Reset must preserve danger styling");

assert.match(stopWatch, /function decorateStopwatchControls\(/, "Time Tracker must decorate stopwatch controls through a local helper");
assert.match(stopWatch, /icons\.decorateButton\(startButton,\s*\{ icon: "start"[\s\S]*text: "Start"[\s\S]*iconOnly: false/, "Time Tracker Start must be icon-plus-text");
assert.match(stopWatch, /icons\.decorateButton\(stopButton,\s*\{ icon: "save"[\s\S]*text: "Save & End"[\s\S]*iconOnly: false/, "Time Tracker Save & End must keep visible text");
assert.match(stopWatch, /icons\.decorateButton\(resetButton,\s*\{ icon: "delete"[\s\S]*text: "Discard"[\s\S]*variant: "danger"/, "Time Tracker Discard must preserve danger styling");

assert.match(css, /\.task-row-actions \.icon-button\s*\{[\s\S]*width:\s*44px/, "Tasks row icon buttons must stay compact");
assert.match(css, /\[data-stopwatch-controls\] button\s*\{[\s\S]*min-width:\s*44px/, "Time Tracker controls must keep the 44px minimum touch target");
assert.doesNotMatch(css, /\.task-row-actions button\s*\{[\s\S]*min-width:\s*104px/, "Tasks row actions must not keep the old wide text-button minimum");

assert.match(roadmap, /### Pass 2 - Convert high-density framework and task controls[\s\S]*- \[x\] Convert timer controls/, "Roadmap must mark Pass 2 timer controls complete");
assert.match(roadmap, /### Pass 2 - Convert high-density framework and task controls[\s\S]*- \[x\] Preserve module ownership/, "Roadmap must mark Pass 2 module ownership complete");

console.log("Icon control conversion regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
