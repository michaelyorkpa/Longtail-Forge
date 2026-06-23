import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const styles = readText("public/css/longtail-forge.css");
const taskDialogScript = readText("public/js/task-dialog.js");
const notesScript = readText("public/js/notes.js");
const surfaceContract = readText("docs/ui-surface-contract.md");

for (const className of [
  "surface-modal-heading",
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
  /\.surface-modal-heading\s*\{[\s\S]*display:\s*flex;[\s\S]*justify-content:\s*space-between;[\s\S]*min-width:\s*0;/,
  "modal title rows should use the shared framework heading layout",
);
assert.match(
  styles,
  /\.surface-modal-group\s*\{[\s\S]*display:\s*grid;[\s\S]*gap:\s*10px;[\s\S]*padding:\s*12px;/,
  "modal section groups should share one framework-owned box spacing contract",
);
assert.match(
  styles,
  /\.surface-modal-heading > \.view-modal-title\s*\{[\s\S]*min-width:\s*0;/,
  "modal title text should fit inside the shared heading row",
);
assert.match(
  styles,
  /summary\.surface-modal-section-heading\s*\{[\s\S]*display:\s*flex;[\s\S]*list-style:\s*none;[\s\S]*cursor:\s*pointer;/,
  "collapsible modal section summaries should use an inside-the-box shared heading layout",
);
assert.match(
  styles,
  /summary\.surface-modal-section-heading::-webkit-details-marker\s*\{[\s\S]*display:\s*none;/,
  "collapsible modal section summaries should hide the browser marker in WebKit",
);
assert.match(
  styles,
  /summary\.surface-modal-section-heading::marker\s*\{[\s\S]*content:\s*"";/,
  "collapsible modal section summaries should hide the browser marker",
);
assert.match(
  styles,
  /summary\.surface-modal-section-heading::before\s*\{[\s\S]*border-left:\s*5px solid currentColor;/,
  "collapsible modal section summaries should draw the shared caret inside the section",
);
assert.match(
  styles,
  /details\[open\] > summary\.surface-modal-section-heading::before\s*\{[\s\S]*rotate\(90deg\)/,
  "open modal section summaries should rotate the shared caret",
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
  ["fallback Tasks dialog", taskDialogScript],
]) {
  const [label, text] = source;

  for (const heading of [
    "Task Details",
    "Checklist",
    "Recurrence",
    "Reminders",
    "Notes",
  ]) {
    assert.match(
      text,
      new RegExp(`<summary class="surface-modal-section-heading">${escapeRegExp(heading)}</summary>`),
      `${label} should use shared modal section summary heading for ${heading}`,
    );
  }

  assert.match(
    text,
    /<h3 class="surface-modal-section-heading">Task Timer<\/h3>/,
    `${label} should use shared modal section heading for Task Timer`,
  );
  assert.match(
    text,
    /class="task-details-grid surface-modal-section-body"/,
    `${label} should mark Task Details content as a shared modal section body`,
  );
  assert.doesNotMatch(text, /Core Task Details|Assignment and Scheduling|<summary class="surface-modal-section-heading">Primary Context<\/summary>|Advanced Details/, `${label} should not split Task Details into extra visible section boxes`);
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
  taskDialogScript,
  /className: "surface-modal-heading"/,
  "Task editor should use the shared modal heading row class",
);
assert.match(
  notesScript,
  /className: "surface-modal-heading"/,
  "Notes editor should use the shared modal heading row class",
);
assert.doesNotMatch(
  `${taskDialogScript}\n${notesScript}\n${styles}`,
  /task-dialog-heading|notes-dialog-heading/,
  "Tasks and Notes must not keep separate modal heading row classes",
);
assert.doesNotMatch(
  styles,
  /\.task-(?:reminder|notes)-field\s*\{[^}]*border-(?:top|bottom):/,
  "Task reminder/notes modal fields must not keep legacy task-only section borders",
);
assert.doesNotMatch(
  styles,
  /\.task-(?:reminder|notes)-field summary\s*\{/,
  "Task reminder/notes modal summaries must not keep task-only heading styling",
);
assert.doesNotMatch(
  styles,
  /\.notes-detail-group\[open\] > \.surface-modal-section-heading|\.notes-context-panel\[open\] > \.surface-modal-section-heading/,
  "Notes modal groups must not add note-only heading spacing on top of the shared modal group gap",
);
assert.match(
  notesScript,
  /className: "notes-detail-group surface-modal-group"[\s\S]*className: "surface-modal-section-heading", text: "Note Details"/,
  "Notes Details should use the shared modal group and section heading class",
);
assert.match(
  notesScript,
  /className: "notes-context-panel surface-modal-group"[\s\S]*className: "surface-modal-section-heading", text: "Linked Context"/,
  "Notes Linked Context should use the shared modal group and section heading class",
);
assert.match(
  notesScript,
  /className: "surface-modal-section-heading", text: "Primary Context"/,
  "Notes non-collapsible Primary Context heading should use the shared modal section heading class",
);

assert.match(
  taskDialogScript,
  /class="task-recurrence-field surface-modal-group surface-divider-top"[\s\S]*class="surface-modal-section-heading">Recurrence/,
  "Recurrence divider should live on the section being toggled, above its heading",
);
assert.match(
  taskDialogScript,
  /class="task-reminder-field surface-modal-group surface-divider-top"[\s\S]*class="surface-modal-section-heading">Reminders/,
  "Reminder divider should live on the section being toggled, above its heading",
);
assert.match(
  taskDialogScript,
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
