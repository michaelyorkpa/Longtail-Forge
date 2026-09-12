import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const reader = createProjectTextReader();
const source = reader.readText("public/js/time-tracking-timer-dialog.js");

const LIFTED = [
  "findTimerControl", "requireTimerValue", "emptyTimerDialogFields", "readText", "taskOptionRows",
  "normalizeTaskOptions", "startedTimerId", "startedTimerRecord", "populateClientOptions",
  "populateProjectOptions", "populateTaskOptions", "updateBillableDefault", "getClient",
  "getProject", "getTask", "findClientIdForTask", "nextManualTimerSlot", "setStatus",
  "workspaceShowsClientTools", "workspaceUsesBillableFlag", "workspaceBillableValue",
  "selectWorkspaceScopeClientIfNeeded",
];

const CONTROLS = [
  ["billable", "[data-time-tracking-timer-dialog-billable]", "select", "HTMLSelectElement"],
  ["billableControl", "[data-time-tracking-timer-dialog-billable-control]", "label", "HTMLElement"],
  ["cancel", "[data-time-tracking-timer-dialog-cancel]", "button", "HTMLButtonElement"],
  ["client", "[data-time-tracking-timer-dialog-client]", "select", "HTMLSelectElement"],
  ["description", "[data-time-tracking-timer-dialog-description]", "textarea", "HTMLTextAreaElement"],
  ["project", "[data-time-tracking-timer-dialog-project]", "select", "HTMLSelectElement"],
  ["save", "[data-time-tracking-timer-dialog-save]", "button", "HTMLButtonElement"],
  ["status", "[data-time-tracking-timer-dialog-status]", "p", "HTMLElement"],
  ["task", "[data-time-tracking-timer-dialog-task]", "select", "HTMLSelectElement"],
];

/** @param {Record<string, unknown>} [overrides] */
const project = (overrides = {}) => ({
  billable: "yes", id: "p1", name: "Project One", optionLabel: "Project One", ...overrides,
});

/** @param {Record<string, unknown>} [overrides] */
const client = (overrides = {}) => ({
  billable: "yes", id: "c1", name: "Client One", optionLabel: "Client One",
  projects: [project()], ...overrides,
});

/**
 * @param {{ omit?: string[], workspaceType?: string, availableTools?: string[],
 *   clients?: unknown[], taskOptions?: unknown[], activeManualTimers?: unknown[] }} [options]
 */
function timerCase(options = {}) {
  const omit = new Set(options.omit || []);
  const document = new FakeDocument();
  const surface = document.createElement("dialog");
  surface.setAttribute("data-time-tracking-timer-dialog", "");
  document.body.appendChild(surface);

  for (const [, selector, tag] of CONTROLS) {
    if (omit.has(selector)) continue;
    const element = document.createElement(tag);
    element.setAttribute(selector.slice(1, -1), "");
    surface.appendChild(element);
  }

  const context = vm.createContext({
    document,
    ...fakeDomConstructors(),
    MAX_MANUAL_TIMER_SLOTS: 4,
    clients: options.clients || [client()],
    taskOptions: options.taskOptions || [],
    activeManualTimers: options.activeManualTimers || [],
    context: null,
    namespace: {
      workspaceContext: {
        workspaceType: options.workspaceType || "business",
        workspaceCapabilities: { availableTools: options.availableTools || ["clients_projects"] },
      },
    },
    requirePageController: () => ({
      /** @param {string} value @param {string} text */
      createOption: (value, text) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        return option;
      },
    }),
    requireClientProjectOptions: () => ({
      /** @param {{ optionLabel?: string, name?: string }} record */
      optionLabel: (record) => record.optionLabel || record.name || "",
    }),
    createOption: null,
    clientOptionLabel: null,
    projectOptionLabel: null,
  });

  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), context);
  vm.runInContext("createOption = (value, text) => requirePageController().createOption(value, text);", context);
  vm.runInContext("clientOptionLabel = (record) => requireClientProjectOptions().optionLabel(record);", context);
  vm.runInContext("projectOptionLabel = (record) => requireClientProjectOptions().optionLabel(record);", context);
  vm.runInContext(`var fields = {
    ${CONTROLS.map(([name, selector, , constructor]) =>
    `${name}: findTimerControl(document, ${JSON.stringify(selector)}, ${constructor})`).join(",\n    ")}
  };`, context);

  const api = vm.runInContext(`({ ${LIFTED.join(", ")} })`, context);
  /** @param {string} selector */
  const control = (selector) => document.querySelector(selector);
  /** @param {string} selector */
  const optionValues = (selector) => control(selector).options.map((option) => option.value);
  return { api, context, document, surface, control, optionValues };
}

describe("Timer dialog control acquisition", () => {
  it("acquires every control through the checked lookup at the subtype its own markup writes", () => {
    const DECLARED = [
      ["billable", "billable]", "HTMLSelectElement"],
      ["billableControl", "billable-control]", "HTMLElement"],
      ["cancel", "cancel]", "HTMLButtonElement"],
      ["client", "client]", "HTMLSelectElement"],
      ["description", "description]", "HTMLTextAreaElement"],
      ["project", "project]", "HTMLSelectElement"],
      ["save", "save]", "HTMLButtonElement"],
      ["status", "status]", "HTMLElement"],
      ["task", "task]", "HTMLSelectElement"],
    ];

    for (const [name, tail, constructor] of DECLARED) {
      const expected = `${name}: findTimerControl(surface, "[data-time-tracking-timer-dialog-${tail}", ${constructor}),`;
      assert.equal(source.includes(expected), true, `${name} must be acquired as ${expected}`);
    }
    // Both query sites, because `ensureDialog` asks twice - once for a surface an earlier open
    // left behind, and once for the one it just appended. Pinning one would leave the other free.
    assert.equal(
      source.split('findTimerControl(document, "[data-time-tracking-timer-dialog]", HTMLDialogElement)').length - 1,
      2,
      "the surface comes from the document at its own subtype, at both query sites",
    );
  });

  it("performs no bare document query and carries no suppression", () => {
    assert.equal(source.split("document.querySelector").length - 1, 0);
    assert.equal(source.split("root.querySelector(selector)").length - 1, 1);
    for (const suppression of ["@ts-expect-error", "@ts-ignore", "eslint-disable"]) {
      assert.equal(source.includes(suppression), false, `${suppression} must not appear`);
    }
  });

  it("refuses a control the document rendered at another subtype", () => {
    const testCase = timerCase({ omit: ["[data-time-tracking-timer-dialog-client]"] });
    const wrong = testCase.document.createElement("div");
    wrong.setAttribute("data-time-tracking-timer-dialog-client", "");
    testCase.surface.appendChild(wrong);

    const found = testCase.api.findTimerControl(
      testCase.surface,
      "[data-time-tracking-timer-dialog-client]",
      testCase.context.HTMLSelectElement,
    );

    assert.equal(found, null);
    assert.throws(() => testCase.api.requireTimerValue(found, "client select"), {
      name: "TypeError",
      message: "The time tracking timer dialog requires its client select.",
    });
  });

  it("starts from a record whose shape is already complete", () => {
    const testCase = timerCase();
    const empty = testCase.api.emptyTimerDialogFields();

    assert.deepEqual(Object.keys(empty).sort(), CONTROLS.map(([name]) => name).sort());
    for (const value of Object.values(empty)) {
      assert.equal(value, null);
    }
  });
});

describe("Timer dialog record reading", () => {
  it("answers the first spelling that carries something", () => {
    const testCase = timerCase();

    assert.equal(testCase.api.readText({ clientId: "c1" }, "clientId", "client_id"), "c1");
    assert.equal(testCase.api.readText({ client_id: "c2" }, "clientId", "client_id"), "c2");
    assert.equal(testCase.api.readText({ clientId: "c1", client_id: "c2" }, "clientId", "client_id"), "c1");
  });

  /** Falsy members keep falling through, as the `||` chains this replaced did. */
  it("treats a falsy member as absent rather than coercing it", () => {
    const testCase = timerCase();

    assert.equal(testCase.api.readText({ clientId: 0, client_id: "c2" }, "clientId", "client_id"), "c2");
    assert.equal(testCase.api.readText({ clientId: "", client_id: "c2" }, "clientId", "client_id"), "c2");
    assert.equal(testCase.api.readText({ clientId: 7 }, "clientId"), "7");
  });

  it("reads own members only, and refuses a source that is not a record", () => {
    const testCase = timerCase();

    assert.equal(testCase.api.readText({}, "constructor"), "");
    assert.equal(testCase.api.readText({}, "toString"), "");
    assert.equal(testCase.api.readText(null, "clientId"), "");
    assert.equal(testCase.api.readText("clientId=c1", "clientId"), "");
    assert.equal(testCase.api.readText(4, "clientId"), "");
  });

  it("finds the task rows only where the response actually carries them", () => {
    const testCase = timerCase();
    // The empty fallback is built inside the vm realm, so only its content is comparable here.
    const plain = (/** @type {unknown} */ value) => JSON.parse(JSON.stringify(value));

    assert.deepEqual(plain(testCase.api.taskOptionRows({ options: { tasks: [1, 2] } })), [1, 2]);
    assert.deepEqual(plain(testCase.api.taskOptionRows({ options: { tasks: "one,two" } })), []);
    assert.deepEqual(plain(testCase.api.taskOptionRows({ options: {} })), []);
    assert.deepEqual(plain(testCase.api.taskOptionRows({ tasks: [1] })), []);
    assert.deepEqual(plain(testCase.api.taskOptionRows(null)), []);
    assert.deepEqual(plain(testCase.api.taskOptionRows("tasks")), []);
  });

  it("keeps only startable tasks and names each one", () => {
    const testCase = timerCase();

    const normalized = testCase.api.normalizeTaskOptions({
      options: {
        tasks: [
          { id: "t1", title: "Write the thing", project_id: "p1", client_id: "c1" },
          { task_id: "t2", label: "Second", status: "open", project_id: "p1" },
          { id: "t3", label: "Done", status: "complete" },
          { id: "t4", label: "Filed", status: "archived" },
          { label: "No identifier at all" },
        ],
      },
    });

    assert.deepEqual(normalized.map((/** @type {{ id: string }} */ task) => task.id), ["t1", "t2"]);
    assert.equal(normalized[0].label, "Write the thing");
    assert.equal(normalized[0].status, "open");
    assert.equal(normalized[0].client_id, "c1");
    assert.equal(normalized[1].id, "t2", "a row spelling its identifier task_id is still readable");
  });

  it("names a task the producer left unlabelled", () => {
    const testCase = timerCase();

    const [task] = testCase.api.normalizeTaskOptions({ options: { tasks: [{ id: "t1" }] } });

    assert.equal(task.label, "Untitled Task");
    assert.equal(task.optionLabel, "Untitled Task");
    assert.equal(task.project_id, "");
  });

  it("prefers the option label the producer wrote for the list", () => {
    const testCase = timerCase();

    const [task] = testCase.api.normalizeTaskOptions({
      options: { tasks: [{ id: "t1", label: "Plain", optionLabel: "Client / Project / Plain" }] },
    });

    assert.equal(task.optionLabel, "Client / Project / Plain");
    assert.equal(task.label, "Plain");
  });
});

describe("Timer dialog acknowledgment reading", () => {
  it("reads the started timer's identifier without claiming the rest of the record", () => {
    const testCase = timerCase();

    assert.equal(testCase.api.startedTimerId({ timer: { active_timer_id: "a1" } }), "a1");
    assert.equal(testCase.api.startedTimerId({ timer: { active_timer_id: 42 } }), "42");
    assert.equal(testCase.api.startedTimerId({ timer: {} }), "");
    assert.equal(testCase.api.startedTimerId({ timer: null }), "");
    assert.equal(testCase.api.startedTimerId({}), "");
    assert.equal(testCase.api.startedTimerId(null), "");
    assert.equal(testCase.api.startedTimerId("a1"), "");
  });

  it("passes the acknowledged timer on exactly as it arrived", () => {
    const testCase = timerCase();
    const record = { active_timer_id: "a1", timer_slot: "2", extra: "kept" };

    assert.equal(testCase.api.startedTimerRecord({ timer: record }), record);
    assert.equal(testCase.api.startedTimerRecord({ timer: null }), null);
    assert.equal(testCase.api.startedTimerRecord({}), null);
    assert.equal(testCase.api.startedTimerRecord(null), null);
  });
});

describe("Timer dialog option population", () => {
  it("offers every client behind a placeholder", () => {
    const testCase = timerCase({ clients: [client(), client({ id: "c2", name: "Client Two", optionLabel: "Client Two" })] });

    testCase.api.populateClientOptions();

    assert.deepEqual(testCase.optionValues("[data-time-tracking-timer-dialog-client]"), ["", "c1", "c2"]);
    assert.equal(testCase.control("[data-time-tracking-timer-dialog-client]").disabled, false);
  });

  it("closes the client control when the workspace offers none", () => {
    const testCase = timerCase({ clients: [] });

    testCase.api.populateClientOptions();

    assert.deepEqual(testCase.optionValues("[data-time-tracking-timer-dialog-client]"), [""]);
    assert.equal(testCase.control("[data-time-tracking-timer-dialog-client]").disabled, true);
  });

  it("rebuilds the client list on a repaint rather than accumulating", () => {
    const testCase = timerCase();

    testCase.api.populateClientOptions();
    testCase.api.populateClientOptions();

    assert.deepEqual(testCase.optionValues("[data-time-tracking-timer-dialog-client]"), ["", "c1"]);
  });

  it("offers the selected client's projects and closes the control without one", () => {
    const testCase = timerCase();
    const clientSelect = testCase.control("[data-time-tracking-timer-dialog-client]");
    const projectSelect = testCase.control("[data-time-tracking-timer-dialog-project]");

    testCase.api.populateProjectOptions();
    assert.deepEqual(testCase.optionValues("[data-time-tracking-timer-dialog-project]"), [""]);
    assert.equal(projectSelect.disabled, true);

    clientSelect.value = "c1";
    testCase.api.populateProjectOptions("p1");

    assert.deepEqual(testCase.optionValues("[data-time-tracking-timer-dialog-project]"), ["", "p1"]);
    assert.equal(projectSelect.disabled, false);
    assert.equal(projectSelect.value, "p1");
  });

  it("refuses a requested project the selected client does not offer", () => {
    const testCase = timerCase();
    testCase.control("[data-time-tracking-timer-dialog-client]").value = "c1";

    testCase.api.populateProjectOptions("p9");

    assert.equal(testCase.control("[data-time-tracking-timer-dialog-project]").value, "");
  });

  it("offers only tasks belonging to the selected project", () => {
    const tasks = [
      { client_id: "c1", id: "t1", label: "One", optionLabel: "One", project_id: "p1", status: "open" },
      { client_id: "c1", id: "t2", label: "Two", optionLabel: "Two", project_id: "p2", status: "open" },
      { client_id: "c1", id: "t3", label: "Loose", optionLabel: "Loose", project_id: "", status: "open" },
    ];
    const testCase = timerCase({ taskOptions: tasks });
    testCase.control("[data-time-tracking-timer-dialog-project]").value = "p1";

    testCase.api.populateTaskOptions("t1");

    assert.deepEqual(testCase.optionValues("[data-time-tracking-timer-dialog-task]"), ["", "t1"]);
    assert.equal(testCase.control("[data-time-tracking-timer-dialog-task]").value, "t1");
  });

  it("offers every project-bearing task when no project is chosen, and never a loose one", () => {
    const tasks = [
      { client_id: "c1", id: "t1", label: "One", optionLabel: "One", project_id: "p1", status: "open" },
      { client_id: "c1", id: "t3", label: "Loose", optionLabel: "Loose", project_id: "", status: "open" },
    ];
    const testCase = timerCase({ taskOptions: tasks });

    testCase.api.populateTaskOptions();

    assert.deepEqual(testCase.optionValues("[data-time-tracking-timer-dialog-task]"), ["", "t1"]);
  });

  it("drops a requested task the chosen project does not offer", () => {
    const tasks = [
      { client_id: "c1", id: "t1", label: "One", optionLabel: "One", project_id: "p1", status: "open" },
      { client_id: "c1", id: "t2", label: "Two", optionLabel: "Two", project_id: "p2", status: "open" },
    ];
    const testCase = timerCase({ taskOptions: tasks });
    testCase.control("[data-time-tracking-timer-dialog-project]").value = "p1";

    testCase.api.populateTaskOptions("t2");

    assert.deepEqual(testCase.optionValues("[data-time-tracking-timer-dialog-task]"), ["", "t1"]);
    assert.equal(testCase.control("[data-time-tracking-timer-dialog-task]").value, "");
  });

  it("closes the task control when the workspace has no tasks at all", () => {
    const testCase = timerCase({ taskOptions: [] });

    testCase.api.populateTaskOptions();

    assert.equal(testCase.control("[data-time-tracking-timer-dialog-task]").disabled, true);
    assert.deepEqual(testCase.optionValues("[data-time-tracking-timer-dialog-task]"), [""]);
  });
});

describe("Timer dialog billable default", () => {
  it("answers no and stops asking when the workspace does not bill", () => {
    const testCase = timerCase({ workspaceType: "personal" });
    testCase.control("[data-time-tracking-timer-dialog-client]").value = "c1";

    testCase.api.updateBillableDefault();

    assert.equal(testCase.control("[data-time-tracking-timer-dialog-billable]").value, "no");
    assert.equal(testCase.api.workspaceBillableValue(), "no");
  });

  it("prefers the project's answer over the client's", () => {
    const testCase = timerCase({
      clients: [client({ billable: "no", projects: [project({ billable: "yes" })] })],
    });
    testCase.control("[data-time-tracking-timer-dialog-client]").value = "c1";
    testCase.control("[data-time-tracking-timer-dialog-project]").value = "p1";

    testCase.api.updateBillableDefault();

    assert.equal(testCase.control("[data-time-tracking-timer-dialog-billable]").value, "yes");
  });

  it("falls back to the client when no project is chosen", () => {
    const testCase = timerCase({ clients: [client({ billable: "no" })] });
    testCase.control("[data-time-tracking-timer-dialog-client]").value = "c1";

    testCase.api.updateBillableDefault();

    assert.equal(testCase.control("[data-time-tracking-timer-dialog-billable]").value, "no");
  });

  it("bills by default when neither says otherwise", () => {
    const testCase = timerCase({ clients: [] });

    testCase.api.updateBillableDefault();

    assert.equal(testCase.control("[data-time-tracking-timer-dialog-billable]").value, "yes");
  });

  it("reports the control's own answer only while the workspace bills", () => {
    const testCase = timerCase();
    testCase.control("[data-time-tracking-timer-dialog-billable]").value = "yes";

    assert.equal(testCase.api.workspaceBillableValue(), "yes");

    testCase.control("[data-time-tracking-timer-dialog-billable]").value = "no";
    assert.equal(testCase.api.workspaceBillableValue(), "no");
  });
});

describe("Timer dialog selection lookups", () => {
  it("finds a client, a project within it, and a task", () => {
    const tasks = [{ client_id: "c1", id: "t1", label: "One", optionLabel: "One", project_id: "p1", status: "open" }];
    const testCase = timerCase({ taskOptions: tasks });

    assert.equal(testCase.api.getClient("c1").name, "Client One");
    assert.equal(testCase.api.getClient("absent"), undefined);
    assert.equal(testCase.api.getProject("c1", "p1").name, "Project One");
    assert.equal(testCase.api.getProject("c1", "absent"), null);
    assert.equal(testCase.api.getProject("absent", "p1"), null);
    assert.equal(testCase.api.getTask("t1").label, "One");
    assert.equal(testCase.api.getTask("absent"), null);
  });

  it("finds a task's client directly, then by the project that holds it", () => {
    const testCase = timerCase({
      clients: [client({ id: "c1" }), client({ id: "c2", projects: [project({ id: "p9" })] })],
    });

    assert.equal(testCase.api.findClientIdForTask({ client_id: "c1", project_id: "" }), "c1");
    assert.equal(testCase.api.findClientIdForTask({ client_id: "", project_id: "p9" }), "c2");
    assert.equal(
      testCase.api.findClientIdForTask({ client_id: "gone", project_id: "p9" }),
      "c2",
      "a client the workspace no longer offers falls through to the project's owner",
    );
    assert.equal(testCase.api.findClientIdForTask({ client_id: "", project_id: "absent" }), "");
  });

  it("selects the workspace-scope client only where the workspace hides client tools", () => {
    const scoped = [client({ id: "ws", isWorkspaceScope: true })];
    const shown = timerCase({ clients: scoped, availableTools: ["clients_projects"] });
    shown.api.selectWorkspaceScopeClientIfNeeded();
    assert.equal(shown.control("[data-time-tracking-timer-dialog-client]").value, "");

    const hidden = timerCase({ clients: scoped, availableTools: [] });
    hidden.api.selectWorkspaceScopeClientIfNeeded();
    assert.equal(hidden.control("[data-time-tracking-timer-dialog-client]").value, "ws");
  });
});

describe("Timer dialog manual slots", () => {
  it("hands back the lowest slot no timer is occupying", () => {
    const testCase = timerCase({ activeManualTimers: [{ timer_slot: "1" }, { timer_slot: "3" }] });

    assert.equal(testCase.api.nextManualTimerSlot(), "2");
  });

  it("hands back the first slot when nothing is running", () => {
    const testCase = timerCase();

    assert.equal(testCase.api.nextManualTimerSlot(), "1");
  });

  it("refuses when every slot is already in use", () => {
    const testCase = timerCase({
      activeManualTimers: ["1", "2", "3", "4"].map((timer_slot) => ({ timer_slot })),
    });

    assert.equal(testCase.api.nextManualTimerSlot(), "");
  });
});

describe("Timer dialog status", () => {
  it("writes the message and tones it only when the caller says it is an error", () => {
    const testCase = timerCase();
    const status = testCase.control("[data-time-tracking-timer-dialog-status]");

    testCase.api.setStatus("Starting timer...");
    assert.equal(status.textContent, "Starting timer...");
    assert.equal(status.classList.contains("error-text"), false);

    testCase.api.setStatus("Timer could not be started.", { isError: true });
    assert.equal(status.textContent, "Timer could not be started.");
    assert.equal(status.classList.contains("error-text"), true);

    testCase.api.setStatus("");
    assert.equal(status.textContent, "");
    assert.equal(status.classList.contains("error-text"), false);
  });

  /**
   * The status node stays optional: every read of it already sits behind `if (fields.status)`,
   * so this reports through the host without a surface to write on.
   */
  it("still reports to the host when the dialog has no status node", () => {
    const testCase = timerCase({ omit: ["[data-time-tracking-timer-dialog-status]"] });
    /** @type {unknown[]} */
    const reported = [];
    testCase.context.context = { setStatus: (/** @type {string} */ message) => reported.push(message) };

    testCase.api.setStatus("Starting timer...");

    assert.deepEqual(reported, ["Starting timer..."]);
  });
});
