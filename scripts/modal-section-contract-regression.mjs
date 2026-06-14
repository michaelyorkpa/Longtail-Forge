import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const styles = readText("public/css/longtail-forge.css");
const tasksView = readText("views/protected/tasks.html");
const taskDialogScript = readText("public/js/task-dialog.js");
const surfaceContract = readText("docs/ui-surface-contract.md");

for (const className of [
  "surface-modal-section-heading",
  "surface-modal-section-body",
  "surface-modal-section-help",
  "surface-modal-section-validation",
  "surface-chip-row",
]) {
  assert.match(styles, new RegExp(`\\.${className}`), `${className} must be defined by the framework stylesheet`);
  assert.match(surfaceContract, new RegExp(`\\.${className}`), `${className} must be documented in the surface contract`);
}

assert.match(
  styles,
  /summary\.surface-modal-section-heading\s*\{[\s\S]*cursor:\s*pointer;/,
  "collapsible modal section summaries should share pointer affordance",
);
assert.match(
  styles,
  /\.surface-modal-section-heading:focus-visible\s*\{[\s\S]*box-shadow:\s*var\(--surface-focus-ring\)/,
  "modal section headings should share the framework focus ring",
);
assert.match(
  styles,
  /\.surface-modal-section-help\s*\{[\s\S]*color:\s*var\(--color-muted\)/,
  "modal section help text should use the shared muted text token",
);
assert.match(
  styles,
  /\.surface-modal-section-validation\s*\{[\s\S]*color:\s*var\(--color-danger\)/,
  "modal section validation text should use the shared danger token",
);

for (const source of [
  ["static Tasks dialog", tasksView],
  ["fallback Tasks dialog", taskDialogScript],
]) {
  const [label, text] = source;

  for (const heading of ["Task Details", "Checklist", "Assignees", "Recurrence", "Reminders", "Notes"]) {
    assert.match(
      text,
      new RegExp(`<summary class="surface-modal-section-heading">${escapeRegExp(heading)}</summary>`),
      `${label} should use shared modal section summary heading for ${heading}`,
    );
  }

  assert.match(
    text,
    /<legend class="surface-modal-section-heading">Task Timer<\/legend>/,
    `${label} should use shared modal section heading for Task Timer`,
  );
  assert.match(
    text,
    /class="task-details-grid surface-modal-section-body"/,
    `${label} should mark Task Details content as a shared modal section body`,
  );
  assert.match(
    text,
    /class="task-checklist-add-row surface-modal-section-body"/,
    `${label} should mark Checklist controls as a shared modal section body`,
  );
  assert.match(
    text,
    /class="task-recurrence-controls surface-modal-section-body"/,
    `${label} should mark Recurrence controls as a shared modal section body`,
  );
  assert.match(
    text,
    /class="reminder-offset-grid surface-modal-section-body"/,
    `${label} should mark Reminder override controls as a shared modal section body`,
  );
  assert.match(
    text,
    /class="surface-modal-section-help" data-task-checklist-status/,
    `${label} should use shared help styling for Checklist status`,
  );
  assert.match(
    text,
    /class="surface-modal-section-help" data-task-recurrence-summary/,
    `${label} should use shared help styling for Recurrence summary`,
  );
}

assert.match(
  tasksView,
  /class="task-recurrence-field surface-modal-group surface-divider-top"[\s\S]*class="surface-modal-section-heading">Recurrence/,
  "Recurrence divider should live on the section being toggled, above its heading",
);
assert.match(
  tasksView,
  /class="task-reminder-field surface-modal-group surface-divider-top"[\s\S]*class="surface-modal-section-heading">Reminders/,
  "Reminder divider should live on the section being toggled, above its heading",
);
assert.match(
  tasksView,
  /class="task-notes-field surface-modal-group surface-divider-top"[\s\S]*class="surface-modal-section-heading">Notes/,
  "Notes divider should live on the section being toggled, above its heading",
);

console.log("Modal section contract regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
