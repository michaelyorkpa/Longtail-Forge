import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tasks = readText("public/js/tasks.js");
const styles = readText("public/css/longtail-forge.css");
const icons = readText("public/js/shared/icons.js");

assert.match(tasks, /<th colspan="6">Task Details<\/th>/, "Tasks table header should match the dense task-detail row layout");
assert.match(tasks, /row\.classList\.add\("task-density-row"\)/, "Task rows should use the dense row class");
assert.match(tasks, /contentCell\.colSpan = 6/, "Task detail content should span the non-selection columns");
assert.match(tasks, /titleBand\.className = "task-density-title"/, "Dense task rows should have a title band");
assert.match(tasks, /metaBand\.className = "task-density-meta"/, "Dense task rows should have a metadata band");
assert.match(tasks, /actionsBand\.className = "task-density-actions"/, "Dense task rows should have an actions band");
assert.doesNotMatch(tasks, /actionsRow|task-actions-row/, "Task list should no longer render a separate action row");
assert.match(tasks, /appendTagChips\(titleBand, task\.tags\)/, "Task tags should render in the title band");
assert.match(tasks, /appendTaskMetadata\(metaBand, task\)/, "Task metadata should render in the compact metadata band");
assert.match(tasks, /appendTaskContext\(metaBand, task\)/, "Resume context should render in the compact metadata band");
assert.match(tasks, /checklistProgressText\(task\.checklistProgress\)/, "Checklist progress should be available as compact task context");
assert.match(tasks, /blockingSummaryText\(task\.relationshipSummary\)/, "Blocking child context should be available as compact task context");
assert.match(tasks, /icon:\s*"bell"/, "Follow Notifications should use a bell icon");
assert.match(icons, /bell:\s*Object\.freeze/, "Shared icons should include a bell icon");
assert.match(styles, /\.task-density-title\s*\{[\s\S]*display:\s*grid/, "Dense title band should be stable and compact");
assert.match(styles, /\.task-density-meta\s*\{[\s\S]*flex-wrap:\s*wrap/, "Metadata band should wrap compactly");
assert.match(styles, /\.task-row-actions\s*\{[\s\S]*justify-content:\s*flex-end/, "Task actions should be right aligned");
assert.match(styles, /\.task-scope-cell,[\s\S]*\.task-assignee-cell\s*\{[\s\S]*max-width:\s*11rem/, "Mobile scope and assignee metadata should truncate harder");

console.log("Task list density regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
