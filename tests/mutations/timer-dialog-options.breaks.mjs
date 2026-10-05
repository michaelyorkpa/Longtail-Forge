import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Run explicitly, with no server or other verification reading this source concurrently.
// This harness is not a standing gate; it proves the checkpoint's new behavioral assertions.
const sourcePath = "public/js/time-tracking-timer-dialog.js";
const suites = ["tests/unit/timer-dialog-options-contracts.test.mjs"];
const original = Buffer.from(readFileSync(sourcePath));
const source = original.toString("utf8");
/** @param {Buffer} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const beforeHash = hash(original);

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the completion claims -----------------------------------------------------------------------
  ["a control reverts to an unchecked query",
    'client: findTimerControl(surface, "[data-time-tracking-timer-dialog-client]", HTMLSelectElement),',
    'client: surface.querySelector("[data-time-tracking-timer-dialog-client]"),'],
  ["a control is narrowed past what the markup writes",
    'description: findTimerControl(surface, "[data-time-tracking-timer-dialog-description]", HTMLTextAreaElement),',
    'description: findTimerControl(surface, "[data-time-tracking-timer-dialog-description]", HTMLSelectElement),'],
  ["the surface is narrowed past what the markup writes",
    'dialog = findTimerControl(document, "[data-time-tracking-timer-dialog]", HTMLDialogElement);\n\n    if (!dialog) {',
    'dialog = findTimerControl(document, "[data-time-tracking-timer-dialog]", HTMLFormElement);\n\n    if (!dialog) {'],
  ["a cast replaces the checked lookup",
    'save: findTimerControl(surface, "[data-time-tracking-timer-dialog-save]", HTMLButtonElement),',
    'save: /** @type {HTMLButtonElement} */ (surface.querySelector("[data-time-tracking-timer-dialog-save]")),'],
  ["a suppression is introduced",
    "  function populateClientOptions() {",
    "  // @ts-expect-error deliberately added\n  function populateClientOptions() {"],
  ["the lookup stops checking the subtype",
    "    const element = root.querySelector(selector);\n    return element instanceof constructor ? element : null;",
    "    const element = root.querySelector(selector);\n    return element;"],
  ["the required narrowing stops refusing an absent control",
    "    if (value === null) {\n      throw new TypeError(`The time tracking timer dialog requires its ${name}.`);\n    }",
    "    if (false) {\n      throw new TypeError(`unreachable`);\n    }"],
  ["the empty record loses a member",
    "      billableControl: null,\n      cancel: null,",
    "      cancel: null,"],

  // --- the record reader ------------------------------------------------------------------------------
  ["a falsy member stops falling through to the next spelling",
    "      if (value) {\n        return String(value);\n      }",
    "      if (value !== undefined) {\n        return String(value);\n      }"],
  ["the reader stops reading own members only",
    "      const value = Object.hasOwn(source, name)\n        ? /** @type {Record<string, unknown>} */ (source)[name]\n        : undefined;",
    "      const value = /** @type {Record<string, unknown>} */ (source)[name];"],
  ["the reader stops refusing a source that is not a record",
    '    if (typeof source !== "object" || source === null) {\n      return "";\n    }',
    '    if (source === undefined) {\n      return "";\n    }'],
  ["the spellings are tried in the wrong order",
    "    for (const name of names) {",
    "    for (const name of [...names].reverse()) {"],

  // --- the task rows ------------------------------------------------------------------------------------
  ["the task rows are read from the wrong envelope member",
    '    const tasks = /** @type {Record<string, unknown>} */ (options).tasks;\n    return Array.isArray(tasks) ? tasks : [];',
    '    const tasks = /** @type {Record<string, unknown>} */ (data).tasks;\n    return Array.isArray(tasks) ? tasks : [];'],
  ["a non-list of task rows is taken as a list",
    "    return Array.isArray(tasks) ? tasks : [];",
    "    return tasks || [];"],
  ["the envelope stops being checked for its options member",
    '    if (typeof data !== "object" || data === null || !Object.hasOwn(data, "options")) {\n      return [];\n    }',
    "    if (data === undefined) {\n      return [];\n    }"],
  ["a completed task is offered",
    '        return readText(task, "id", "task_id") && status !== "complete" && status !== "archived";',
    '        return readText(task, "id", "task_id") && status !== "archived";'],
  ["an archived task is offered",
    '        return readText(task, "id", "task_id") && status !== "complete" && status !== "archived";',
    '        return readText(task, "id", "task_id") && status !== "complete";'],
  ["a task with no identifier is offered",
    '        return readText(task, "id", "task_id") && status !== "complete" && status !== "archived";',
    '        return status !== "complete" && status !== "archived";'],
  ["the identifier stops accepting the producer's other spelling",
    '        id: readText(task, "id", "task_id"),',
    '        id: readText(task, "id"),'],
  ["an unlabelled task stops being named",
    '        label: readText(task, "label", "title") || "Untitled Task",',
    '        label: readText(task, "label", "title"),'],
  ["the option label stops preferring the label written for the list",
    '        optionLabel: readText(task, "optionLabel", "displayName", "label") || "Untitled Task",',
    '        optionLabel: readText(task, "label") || "Untitled Task",'],
  ["a task loses its default status",
    '        status: readText(task, "status") || "open",',
    '        status: readText(task, "status"),'],

  // --- the acknowledgment ---------------------------------------------------------------------------------
  ["the started identifier is read off the acknowledgment root",
    '    const id = /** @type {Record<string, unknown>} */ (timer).active_timer_id;',
    '    const id = /** @type {Record<string, unknown>} */ (result).active_timer_id;'],
  ["the started identifier stops being coerced",
    "    return id ? String(id) : \"\";",
    '    return typeof id === "string" ? id : "";'],
  ["an acknowledgment with no timer answers something",
    '    if (typeof result !== "object" || result === null || !Object.hasOwn(result, "timer")) {\n      return "";\n    }',
    '    if (false) {\n      return "";\n    }'],
  ["the acknowledged timer stops being passed on",
    "    return /** @type {Record<string, unknown>} */ (result).timer || null;",
    "    return null;"],

  // --- the option lists ---------------------------------------------------------------------------------------
  ["the client list is appended to rather than rebuilt",
    '    clientSelect.replaceChildren(createOption("", "Select a client"));',
    '    clientSelect.append(createOption("", "Select a client"));'],
  ["the client list loses its placeholder",
    '    clientSelect.replaceChildren(createOption("", "Select a client"));',
    "    clientSelect.replaceChildren();"],
  ["the client control stays open with no client",
    "    clientSelect.disabled = clients.length === 0;",
    "    clientSelect.disabled = false;"],
  ["the project control stays open with no client chosen",
    "    projectSelect.disabled = !client;",
    "    projectSelect.disabled = false;"],
  ["the project list loses its placeholder",
    '    projectSelect.replaceChildren(createOption("", "Select a project"));',
    "    projectSelect.replaceChildren();"],
  ["a project the chosen client does not offer is selected anyway",
    '    projectSelect.value = client.projects.some((project) => project.id === projectId) ? projectId : "";',
    "    projectSelect.value = projectId;"],
  ["the project list is read from the wrong client",
    "    const client = getClient(requireTimerValue(fields.client, \"client select\").value);",
    "    const client = clients[0];"],
  ["a task outside the chosen project is offered",
    "      task.project_id && (!selectedProjectId || task.project_id === selectedProjectId)",
    "      !selectedProjectId || task.project_id === selectedProjectId"],
  ["a task with no project at all is offered",
    "      task.project_id && (!selectedProjectId || task.project_id === selectedProjectId)",
    "      task.project_id === selectedProjectId || !selectedProjectId || true"],
  ["the task list loses its no-task option",
    '    taskSelect.replaceChildren(createOption("", "No task"));',
    "    taskSelect.replaceChildren();"],
  ["a task the filter dropped is selected anyway",
    '    taskSelect.value = taskCandidates.some((task) => task.id === taskId) ? taskId : "";',
    "    taskSelect.value = taskId;"],
  ["the task control stays open with no task in the workspace",
    "    taskSelect.disabled = taskOptions.length === 0;",
    "    taskSelect.disabled = false;"],

  // --- the billable default -------------------------------------------------------------------------------------
  ["a workspace that does not bill still offers a billable default",
    '    if (!workspaceUsesBillableFlag()) {\n      billable.value = "no";\n      return;\n    }',
    '    if (false) {\n      billable.value = "no";\n      return;\n    }'],
  ["the billable default stops preferring the project",
    "    const billableSource = project || client;",
    "    const billableSource = client;"],
  ["the billable default stops falling back to the client",
    "    const billableSource = project || client;",
    "    const billableSource = project;"],
  ["the billable default is inverted",
    '    billable.value = billableSource?.billable === "no" ? "no" : "yes";',
    '    billable.value = billableSource?.billable === "no" ? "yes" : "no";'],
  ["the submitted billable value stops asking the control",
    '    return workspaceUsesBillableFlag()\n      && requireTimerValue(fields.billable, "billable select").value === "yes" ? "yes" : "no";',
    '    return workspaceUsesBillableFlag() ? "yes" : "no";'],

  // --- the lookups -------------------------------------------------------------------------------------------------
  ["a project is found without checking its client",
    "    return getClient(clientId)?.projects.find((project) => project.id === projectId) || null;",
    "    return clients.flatMap((client) => client.projects).find((project) => project.id === projectId) || null;"],
  ["a task's own client stops being preferred",
    "    const taskClientId = task.client_id || \"\";\n    if (taskClientId) {",
    "    const taskClientId = \"\";\n    if (taskClientId) {"],
  ["a task's client stops falling back to the project's owner",
    "    return clients.find((client) => (\n      Array.isArray(client.projects) &&\n      client.projects.some((project) => project.id === task.project_id)\n    ))?.id || \"\";",
    '    return "";'],
  ["the workspace-scope client is selected even where client tools are shown",
    "    if (workspaceShowsClientTools()) {\n      return;\n    }",
    "    if (false) {\n      return;\n    }"],
  ["the workspace-scope client stops being selected where client tools are hidden",
    "    const workspaceClient = clients.find((client) => client.isWorkspaceScope);",
    "    const workspaceClient = null;"],

  // --- the manual slots ------------------------------------------------------------------------------------------------
  ["an occupied slot is handed out again",
    "      if (!usedSlots.has(slot)) {",
    "      if (true) {"],
  ["the slots stop being numbered from one",
    "    for (let index = 1; index <= MAX_MANUAL_TIMER_SLOTS; index += 1) {",
    "    for (let index = 0; index < MAX_MANUAL_TIMER_SLOTS; index += 1) {"],
  ["a slot is handed out past the workspace's limit",
    "    for (let index = 1; index <= MAX_MANUAL_TIMER_SLOTS; index += 1) {",
    "    for (let index = 1; index <= MAX_MANUAL_TIMER_SLOTS + 1; index += 1) {"],
  ["a full set of slots still answers one",
    '    return "";\n  }\n\n  function selectWorkspaceScopeClientIfNeeded() {',
    '    return "1";\n  }\n\n  function selectWorkspaceScopeClientIfNeeded() {'],

  // --- the status line ----------------------------------------------------------------------------------------------------
  ["the status stops being toned for an error",
    '      fields.status.classList.toggle("error-text", Boolean(options.isError));',
    '      fields.status.classList.toggle("error-text", false);'],
  ["the status is toned for every message",
    '      fields.status.classList.toggle("error-text", Boolean(options.isError));',
    '      fields.status.classList.toggle("error-text", true);'],
  ["the status stops reaching the host",
    "    context?.setStatus?.(message, options);",
    "    void options;"],
  // **Withdrawn as unobservable here, not as uncovered.** Dropping the `|| ""` differs only for a
  // nullish message, and `scripts/test-support/fake-dom.mjs` sets `textContent` through
  // `String(value ?? "")` - so the fixture answers `""` for both spellings where a real element
  // would render the word `undefined`. Proving it would take a rendered run of this dialog, which
  // is out of proportion to a status line's fallback; the guard ships unchanged and no assertion
  // was invented to claim coverage the fixture cannot give.
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
