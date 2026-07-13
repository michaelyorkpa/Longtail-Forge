export const regressionMeta = Object.freeze({
  id: "workbench.task-focus-deep-link",
  area: "workbench",
  tier: "focused",
  tags: ["dashboard", "deep-link", "guardrail", "tasks", "workbench"],
  description: "Pins the Workbench task-focus deep-link contract: workbench.html?taskId= enters Task Focus through the existing path, every failure falls back to Focus Selection with one generic message that leaks nothing, and dashboard per-task handoffs carry the task while panel-level actions stay generic.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const workbenchJs = await readText("public/js/workbench.js");
const dashboardJs = await readText("public/js/dashboard.js");
const tasksService = await readText("src/modules/tasks/tasks.service.js");

let checks = 0;

// The deep link reads exactly the taskId query parameter and is applied as
// part of the normal Workbench load, after state and candidates exist.
assert.match(
  workbenchJs,
  /function taskFocusDeepLinkTaskId\(\)[\s\S]*?params\.get\("taskId"\)/,
  "the deep link must read the taskId query parameter",
);
assert.match(
  functionBody(workbenchJs, "loadWorkbench"),
  /await applyTaskFocusDeepLink\(\)/,
  "the Workbench load must apply the task-focus deep link",
);
checks += 2;

// A readable task enters Task Focus through the existing path — no parallel
// task-focus implementation and no extra fetch in the deep-link body itself.
const deepLinkBody = functionBody(workbenchJs, "applyTaskFocusDeepLink");
assert.match(deepLinkBody, /moduleEnabled\("tasks"\)/, "the deep link must respect the Tasks module gate");
assert.match(deepLinkBody, /candidateTaskId\(entry\) === taskId/, "the deep link should reuse a matching loaded candidate for context");
assert.match(deepLinkBody, /await enterTaskFocus\(candidate, taskId\)/, "the deep link must enter Task Focus through the existing enterTaskFocus path");
assert.doesNotMatch(deepLinkBody, /api\.getJson|fetch\(/, "the deep link must not add its own task fetch; enterTaskFocus owns the permission-checked read");
checks += 4;

// Every failure falls back to Focus Selection with one generic message: the
// module-disabled and unreadable/unknown branches share the same constant, so
// the response cannot reveal whether the task exists.
assert.match(
  workbenchJs,
  /const WORKBENCH_TASK_FOCUS_LINK_FALLBACK = "[^"$]+";/,
  "the fallback message must be one static string with no interpolated task data",
);
assert.equal(
  (deepLinkBody.match(/WORKBENCH_TASK_FOCUS_LINK_FALLBACK/g) || []).length,
  2,
  "the module-disabled and failed-focus branches must share the same generic fallback message",
);
assert.match(
  deepLinkBody,
  /state\.activeTaskFocus\?\.error[\s\S]*?resetTaskFocusState\(\);[\s\S]*?renderWorkbench\(\);/,
  "a failed deep-link focus must fall back to Focus Selection, not an error page",
);
assert.doesNotMatch(deepLinkBody, /taskId\}|\$\{taskId/, "the fallback path must not echo the requested task id into user-facing copy");
checks += 4;

// Dashboard per-task Open Workbench handoffs carry the task into Task Focus;
// panel-level actions stay generic Workbench/Tasks entries.
assert.match(
  tasksService,
  /function dashboardTaskWorkbenchAction\(task\)[\s\S]*?\?taskId=\$\{encodeURIComponent\(task\.task_id\)\}/,
  "dashboard task rows must deep-link their Workbench handoff to the row's task",
);
assert.match(
  tasksService,
  /action: dashboardTaskWorkbenchAction\(task\)/,
  "dashboard task rows must use the deep-linked Workbench action",
);
assert.match(
  tasksService,
  /workbench: \{\s*label: "Open Workbench",\s*href: DASHBOARD_WORKBENCH_URL,\s*\}/,
  "the panel-level Open Workbench action must stay the generic Workbench entry",
);
assert.match(
  dashboardJs,
  /attrs: \{ href: action\.href \}/,
  "the dashboard browser must render the server-supplied row action href as-is",
);
checks += 4;

console.log(`Workbench task-focus deep-link guardrail passed ${checks} checks.`);

async function readText(relativePath) {
  return fs.readFile(path.join(root, relativePath), "utf8");
}

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`) >= 0
    ? source.indexOf(`function ${name}(`)
    : source.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1, `Missing function ${name}`);

  const signatureEnd = source.indexOf(") {", start);
  const openBrace = signatureEnd >= 0 ? signatureEnd + 2 : source.indexOf("{", start);
  assert.notEqual(openBrace, -1, `Missing body for function ${name}`);

  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openBrace, index + 1);
      }
    }
  }

  throw new Error(`Could not parse function ${name}`);
}
