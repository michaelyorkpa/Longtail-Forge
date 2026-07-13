export const regressionMeta = Object.freeze({
  id: "tasks.task-editor-workbench-handoff",
  area: "tasks",
  tier: "focused",
  tags: ["deep-link", "guardrail", "modal", "tasks", "workbench"],
  description: "Pins the task editor's icon-only Open in Workbench handoff: placed immediately left of the notification bell, edit-mode only, accessible icon-only anatomy, and navigation through the canonical workbench.html?taskId= deep-link contract.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const taskDialogJs = await readText("public/js/task-dialog.js");
const iconsJs = await readText("public/js/shared/icons.js");
const frameworkCss = await readText("public/css/longtail-forge.css");

let checks = 0;

// Every host that loads the Task editor must load the notification
// subscription helper, or the heading bell is silently dead on that page —
// the ghost-paint bug hid exactly this on Workbench, Calendar, and Dashboard.
const protectedViewsDir = path.join(root, "views", "protected");
for (const viewFile of (await fs.readdir(protectedViewsDir)).filter((name) => name.endsWith(".html")).sort()) {
  const viewSource = await fs.readFile(path.join(protectedViewsDir, viewFile), "utf8");

  if (viewSource.includes("js/task-dialog.js")) {
    assert.ok(
      viewSource.includes("js/shared/notification-subscriptions.js"),
      `views/protected/${viewFile} loads the Task editor and must load js/shared/notification-subscriptions.js so the heading bell works`,
    );
    checks += 1;
  }
}

// The forge-themed icon lives in the shared icon set, not a one-off SVG.
assert.match(iconsJs, /anvil: Object\.freeze\(\[/, "the shared icon set must own the anvil icon");
assert.doesNotMatch(taskDialogJs, /<svg|createElementNS/i, "the task dialog must not hand-build icon SVG");
checks += 2;

// The button is icon-only with an accessible name and sits in the heading
// actions group immediately left of the notification bell.
assert.match(
  taskDialogJs,
  /const workbenchOpen = view\.createActionButton\(\{[\s\S]*?icon: "anvil",[\s\S]*?iconOnly: true,[\s\S]*?label: "Open in Workbench",[\s\S]*?role: "utility",[\s\S]*?title: "Open in Workbench",[\s\S]*?\}\)/,
  "the Workbench handoff must be an icon-only utility action with an accessible name",
);
assert.match(
  taskDialogJs,
  /className: "surface-modal-heading-actions",\s*children: \[workbenchOpen, notificationToggle\]/,
  "the Workbench handoff must sit immediately left of the notification bell in the heading actions group",
);
assert.match(
  taskDialogJs,
  /icons\.decorateButton\(fields\.workbenchOpen, \{ icon: "anvil", label: "Open in Workbench", text: "", title: "Open in Workbench", iconOnly: true \}\)/,
  "the decorated Workbench handoff must stay icon-only with no visible text",
);
assert.match(
  frameworkCss,
  /\.surface-modal-heading-actions\s*\{[\s\S]*?display:\s*inline-flex;/,
  "the framework CSS must own the modal heading actions group",
);
assert.match(
  frameworkCss,
  /\.action-button\[hidden\]\s*\{\s*display:\s*none;\s*\}/,
  "hidden action buttons must actually hide despite the inline-flex display rule",
);
checks += 5;

// Edit-mode only: hidden by default and only shown for a persisted task, so
// the create and duplicate dialogs never offer the handoff.
assert.match(
  taskDialogJs,
  /workbenchOpen\.dataset\.taskWorkbenchOpen = "";\s*workbenchOpen\.hidden = true;/,
  "the Workbench handoff must carry its stable hook and start hidden",
);
assert.match(
  taskDialogJs,
  /fields\.workbenchOpen\.hidden = !currentTaskId;/,
  "the Workbench handoff must only be visible when editing a persisted task",
);
checks += 2;

// Navigation goes through the canonical Workbench deep-link contract — the
// same taskId parameter the Workbench load handles — with no second path.
const handlerBody = functionBody(taskDialogJs, "openTaskInWorkbench");
assert.match(handlerBody, /new global\.URL\("workbench\.html", global\.location\.href\)/, "the handoff must target workbench.html");
assert.match(handlerBody, /url\.searchParams\.set\("taskId", currentTaskId\)/, "the handoff must use the canonical taskId deep-link parameter");
assert.match(handlerBody, /if \(!currentTaskId\)/, "the handoff must no-op without a persisted task");
assert.match(
  taskDialogJs,
  /fields\.workbenchOpen\?\.addEventListener\("click", openTaskInWorkbench\)/,
  "the handoff button must dispatch the navigation handler",
);
assert.doesNotMatch(taskDialogJs, /workbench\.html\?/, "the handoff must build its URL through URL/searchParams, not string concatenation");
checks += 5;

console.log(`Task editor Workbench handoff guardrail passed ${checks} checks.`);

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
