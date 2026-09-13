import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Run explicitly, with no server or other verification reading this source concurrently.
// This harness is not a standing gate; it proves the checkpoint's new behavioral assertions.
const sourcePath = "public/js/stop-watch.js";
const suites = ["tests/unit/stopwatch-timer-contracts.test.mjs"];
const original = Buffer.from(readFileSync(sourcePath));
const source = original.toString("utf8");
/** @param {Buffer} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const beforeHash = hash(original);

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the completion claims -----------------------------------------------------------------------
  ["a control reverts to an unchecked query",
    'existingStopwatchControl(root, "[data-stopwatch-client]", HTMLSelectElement) ||',
    'root.querySelector("[data-stopwatch-client]") ||'],
  ["the billable control is narrowed as a select again",
    'existingStopwatchControl(root, "[data-stopwatch-billable]", HTMLInputElement) ||',
    'existingStopwatchControl(root, "[data-stopwatch-billable]", HTMLSelectElement) ||'],
  ["a start button is narrowed past what the card carries",
    'existingStopwatchControl(root, "[data-stopwatch-start]", HTMLButtonElement) ||',
    'existingStopwatchControl(root, "[data-stopwatch-start]", HTMLSelectElement) ||'],
  ["the description control is narrowed past what the card carries",
    'existingStopwatchControl(root, "[data-stopwatch-description]", HTMLInputElement) ||',
    'existingStopwatchControl(root, "[data-stopwatch-description]", HTMLSelectElement) ||'],
  ["a suppression is introduced",
    "  function optionFlag(options, name) {",
    "  // @ts-expect-error deliberately added\n  function optionFlag(options, name) {"],
  ["the lookup stops checking the subtype",
    "    const element = root.querySelector(selector);\n    return element instanceof constructor ? element : null;",
    "    const element = root.querySelector(selector);\n    return element;"],
  ["the billable control is read as a value rather than a checkbox",
    "  function billableValue(input) {\n    return workspaceUsesBillableFlag() && input.checked ? \"yes\" : \"no\";",
    "  function billableValue(input) {\n    return workspaceUsesBillableFlag() && input.value === \"yes\" ? \"yes\" : \"no\";"],

  // --- the shared reader, and the one that is deliberately not shared -----------------------------------
  ["the active-timer reader drifts from the timer dialog's copy",
    "    return typeof value === \"object\" && value !== null && !Array.isArray(value);\n  }\n\n  /**\n   * One active timer, vouched for only as far as its slot.",
    "    return typeof value === \"object\" && value !== null;\n  }\n\n  /**\n   * One active timer, vouched for only as far as its slot."],
  ["this page's task normalizer stops requiring a project",
    '        && readTimerText(task, "project_id")\n',
    ""],
  ["this page's task normalizer starts carrying a client",
    '        id: readTimerText(task, "id", "task_id"),',
    '        client_id: readTimerText(task, "client_id"),\n        id: readTimerText(task, "id", "task_id"),'],

  // --- the wrapper lookup -------------------------------------------------------------------------------
  ["the wrapper lookup stops preferring its own marker",
    "    const wrapper = control.closest(selector) || control.closest(fallbackSelector);",
    "    const wrapper = control.closest(fallbackSelector) || control.closest(selector);"],
  ["the wrapper lookup loses its label fallback",
    "    const wrapper = control.closest(selector) || control.closest(fallbackSelector);",
    "    const wrapper = control.closest(selector);"],
  // **Withdrawn as unobservable here, not as uncovered.** `scripts/test-support/fake-dom.mjs`
  // answers every `nodeType === 1` node to `HTMLElement`, so the fixture cannot produce an
  // `Element` that is not one and this narrowing has nothing to discriminate. The check ships
  // unchanged - a real document has plenty of such elements - and no assertion was invented to
  // claim coverage the fixture cannot give.

  // --- the option reader -------------------------------------------------------------------------------------
  // **Withdrawn, and inert for a real reason.** Dropping the presence check changes nothing an
  // event can show: the member reads as `undefined`, which the `typeof value === "boolean"` guard
  // below already answers `undefined` for. What the presence check genuinely decides is the
  // prototype case, and that is the break immediately after this one.
  ["a non-boolean option is taken as one",
    "    return typeof value === \"boolean\" ? value : undefined;",
    "    return Boolean(value);"],
  ["the option reader stops reading own members only",
    "  function optionFlag(options, name) {\n    if (typeof options !== \"object\" || options === null || !Object.hasOwn(options, name)) {",
    "  function optionFlag(options, name) {\n    if (typeof options !== \"object\" || options === null || !(name in options)) {"],
  ["a persist option stops being honoured",
    'const shouldPersist = optionFlag(options, "persist") !== false;\n      const shouldClearInfo',
    'const shouldPersist = true;\n      const shouldClearInfo'],
  ["a reset option stops being honoured",
    '      const shouldReset = optionFlag(options, "shouldReset") !== false;',
    "      const shouldReset = true;"],

  // --- the record reader ---------------------------------------------------------------------------------------
  ["a falsy member stops falling through to the next spelling",
    "      if (value) {\n        return String(value);\n      }",
    "      if (value !== undefined) {\n        return String(value);\n      }"],
  ["the record reader stops reading own members only",
    "      const value = Object.hasOwn(source, name)\n        ? /** @type {Record<string, unknown>} */ (source)[name]\n        : undefined;",
    "      const value = /** @type {Record<string, unknown>} */ (source)[name];"],
  ["the record reader stops refusing a source that is not a record",
    "  function readTimerText(source, ...names) {\n    if (typeof source !== \"object\" || source === null) {\n      return \"\";\n    }",
    "  function readTimerText(source, ...names) {\n    if (source === undefined) {\n      return \"\";\n    }"],
  ["the spellings are tried in the wrong order",
    "    for (const name of names) {\n      const value = Object.hasOwn(source, name)",
    "    for (const name of [...names].reverse()) {\n      const value = Object.hasOwn(source, name)"],
  ["the task rows are read from the wrong envelope member",
    "    const tasks = /** @type {Record<string, unknown>} */ (options).tasks;\n    return Array.isArray(tasks) ? tasks : [];",
    "    const tasks = /** @type {Record<string, unknown>} */ (data).tasks;\n    return Array.isArray(tasks) ? tasks : [];"],
  ["a non-list of task rows is taken as a list",
    "    return Array.isArray(tasks) ? tasks : [];",
    "    return tasks || [];"],
  ["the acknowledged identifier is read off the receipt root",
    '    return readTimerText(/** @type {Record<string, unknown>} */ (result).timer, "active_timer_id");',
    '    return readTimerText(result, "active_timer_id");'],
  ["a receipt with no timer answers something",
    '    if (typeof result !== "object" || result === null || !Object.hasOwn(result, "timer")) {\n      return "";\n    }',
    '    if (false) {\n      return "";\n    }'],

  // --- the task catalogue ------------------------------------------------------------------------------------------
  ["a completed task is offered",
    '        && readTimerText(task, "status") !== "complete"\n',
    ""],
  ["an archived task is offered",
    '        && readTimerText(task, "status") !== "archived"\n',
    ""],
  ["a task with no identifier is offered",
    '        readTimerText(task, "id", "task_id")\n',
    "        true\n"],
  ["the identifier stops accepting the producer's other spelling",
    '        id: readTimerText(task, "id", "task_id"),',
    '        id: readTimerText(task, "id"),'],
  ["an unlabelled task stops being named",
    '        label: readTimerText(task, "label", "title") || "Untitled Task",',
    '        label: readTimerText(task, "label", "title"),'],
  ["the option label stops preferring the label written for the list",
    '        optionLabel: readTimerText(task, "optionLabel", "displayName", "label") || "Untitled Task",',
    '        optionLabel: readTimerText(task, "label") || "Untitled Task",'],
  ["a task loses its default status",
    '        status: readTimerText(task, "status") || "open",',
    '        status: readTimerText(task, "status"),'],

  // --- counts, formatting and the billable word -----------------------------------------------------------------------
  ["a count outside the offered set is accepted",
    '    if (typeof timerCount === "number" && [1, 2, 3, 4].includes(timerCount)) {',
    '    if (typeof timerCount === "number") {'],
  ["a word that looks like a count is accepted",
    '    if (typeof timerCount === "number" && [1, 2, 3, 4].includes(timerCount)) {',
    "    if ([1, 2, 3, 4].includes(Number(timerCount))) {"],
  ["the count set gains a slot the page cannot render",
    "[1, 2, 3, 4].includes(timerCount)",
    "[1, 2, 3, 4, 5].includes(timerCount)"],
  ["elapsed time loses its hours",
    "    const hours = Math.floor(totalSeconds / 3600);",
    "    const hours = 0;"],
  ["elapsed time stops padding",
    '    return String(value).padStart(2, "0");',
    "    return String(value);"],
  ["a state word stops being capitalized",
    "    return value.charAt(0).toUpperCase() + value.slice(1);",
    "    return value;"],
  ["the billable word stops asking the control",
    '    return workspaceUsesBillableFlag() && input.checked ? "yes" : "no";',
    '    return workspaceUsesBillableFlag() ? "yes" : "no";'],
  ["a workspace that does not bill still answers yes",
    '    return workspaceUsesBillableFlag() && input.checked ? "yes" : "no";',
    '    return input.checked ? "yes" : "no";'],
  ["the billable word is inverted",
    '    return workspaceUsesBillableFlag() && input.checked ? "yes" : "no";',
    '    return workspaceUsesBillableFlag() && input.checked ? "no" : "yes";'],
];

let caught = 0;
let missed = 0;

try {
  for (const [name, find, replace] of cases) {
    const occurrences = source.split(find).length - 1;
    assert.equal(occurrences, 1, `anchor for "${name}" must appear exactly once (found ${occurrences})`);
    writeFileSync(sourcePath, source.replace(find, replace), "utf8");

    const syntax = spawnSync("node", ["--check", sourcePath], { encoding: "utf8", shell: true });
    const suite = spawnSync("node", ["node_modules/vitest/vitest.mjs", "run", ...suites], {
      encoding: "utf8", shell: true,
    });
    writeFileSync(sourcePath, original);

    const syntaxValid = syntax.status === 0;
    const refused = syntaxValid && suite.status !== 0;
    if (refused) {
      caught += 1;
      console.log(`CAUGHT (syntax valid, assertion failed): ${name}`);
    } else {
      missed += 1;
      console.log(`MISSED${syntaxValid ? "" : " (INVALID SYNTAX)"}: ${name}`);
    }
  }
} finally {
  writeFileSync(sourcePath, original);
  const afterHash = hash(Buffer.from(readFileSync(sourcePath)));
  assert.equal(afterHash, beforeHash, "source must be restored byte-for-byte");
  console.log(`Restored SHA-256 ${afterHash}`);
}

console.log(`${caught}/${cases.length} caught; ${missed} inert.`);
if (missed > 0) {
  process.exitCode = 1;
}
