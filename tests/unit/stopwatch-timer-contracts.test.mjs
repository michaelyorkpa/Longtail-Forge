import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const reader = createProjectTextReader();
const source = reader.readText("public/js/stop-watch.js");
const timerDialog = reader.readText("public/js/time-tracking-timer-dialog.js");

const LIFTED = [
  "existingStopwatchControl", "closestStopwatchElement", "optionFlag", "readTimerText",
  "taskOptionRows", "startedTimerId", "normalizeTaskOptions", "clampTimerCount", "formatTime",
  "pad", "capitalize", "billableValue",
];

/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));

/** @param {{ billableWorkspace?: boolean }} [options] */
function stopwatchCase(options = {}) {
  const document = new FakeDocument();
  const context = vm.createContext({
    document,
    ...fakeDomConstructors(),
    workspaceUsesBillableFlag: () => options.billableWorkspace !== false,
  });
  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), context);
  const api = vm.runInContext(`({ ${LIFTED.join(", ")} })`, context);
  return { api, context, document };
}

describe("Stopwatch control acquisition", () => {
  /**
   * This page is unlike its siblings: a missing control is **built**, not refused. So the lookup
   * answers null to trigger the caller's fallback rather than to stop the page.
   */
  it("answers the existing control, and nothing when the card carries the wrong kind", () => {
    const testCase = stopwatchCase();
    const root = testCase.document.createElement("div");
    const select = testCase.document.createElement("select");
    select.setAttribute("data-stopwatch-client", "");
    root.appendChild(select);

    assert.equal(
      testCase.api.existingStopwatchControl(root, "[data-stopwatch-client]", testCase.context.HTMLSelectElement),
      select,
    );
    assert.equal(
      testCase.api.existingStopwatchControl(root, "[data-stopwatch-client]", testCase.context.HTMLInputElement),
      null,
      "a control of another kind is the case the fallback exists for",
    );
    assert.equal(
      testCase.api.existingStopwatchControl(root, "[data-stopwatch-project]", testCase.context.HTMLSelectElement),
      null,
    );
  });

  it("acquires every timer control through that lookup at the subtype the card carries", () => {
    const DECLARED = [
      ["[data-stopwatch-client]", "HTMLSelectElement"],
      ["[data-stopwatch-project]", "HTMLSelectElement"],
      ["[data-stopwatch-description]", "HTMLInputElement"],
      ["[data-stopwatch-billable]", "HTMLInputElement"],
      ["[data-stopwatch-start]", "HTMLButtonElement"],
      ["[data-stopwatch-pause]", "HTMLButtonElement"],
      ["[data-stopwatch-stop]", "HTMLButtonElement"],
      ["[data-stopwatch-reset]", "HTMLButtonElement"],
      ["[data-stopwatch-clear-on-reset]", "HTMLInputElement"],
      ["[data-stopwatch-display]", "HTMLElement"],
      ["[data-stopwatch-tags]", "HTMLElement"],
    ];

    for (const [selector, constructor] of DECLARED) {
      const expected = `existingStopwatchControl(root, "${selector}", ${constructor})`;
      assert.equal(source.includes(expected), true, `${selector} must be acquired as ${expected}`);
    }
  });

  /**
   * The billable control is an `<input type="checkbox">`, and the page reads `.checked` off it.
   * Narrowing it as a select would have sent a real checkbox down the fallback path and built a
   * second one, so the subtype is pinned rather than left to the reader's memory.
   */
  it("knows the billable control is a checkbox, not a select", () => {
    assert.equal(source.includes('"[data-stopwatch-billable]", HTMLInputElement'), true);
    assert.equal(source.includes('"[data-stopwatch-billable]", HTMLSelectElement'), false);
    assert.equal(source.includes("this.billableInput.checked"), true);
  });

  it("performs no bare document query and carries no suppression", () => {
    assert.equal(source.split("document.querySelector").length - 1, 0);
    assert.equal(source.split("root.querySelector(selector)").length - 1, 1);
    for (const suppression of ["@ts-expect-error", "@ts-ignore", "eslint-disable"]) {
      assert.equal(source.includes(suppression), false, `${suppression} must not appear`);
    }
  });

  it("finds a control's wrapper, preferring its own marker over the label around it", () => {
    const testCase = stopwatchCase();
    const label = testCase.document.createElement("label");
    const marked = testCase.document.createElement("div");
    marked.setAttribute("data-stopwatch-billable-control", "");
    const input = testCase.document.createElement("input");
    marked.appendChild(input);
    label.appendChild(marked);

    assert.equal(
      testCase.api.closestStopwatchElement(input, "[data-stopwatch-billable-control]", "label"),
      marked,
    );

    const bare = testCase.document.createElement("input");
    const onlyLabel = testCase.document.createElement("label");
    onlyLabel.appendChild(bare);
    assert.equal(
      testCase.api.closestStopwatchElement(bare, "[data-stopwatch-billable-control]", "label"),
      onlyLabel,
      "a control in no marked wrapper falls back to the label around it",
    );

    const loose = testCase.document.createElement("input");
    assert.equal(testCase.api.closestStopwatchElement(loose, "[data-x]", "label"), null);
  });
});

describe("Stopwatch shared readers", () => {
  /**
   * `active-timer-list-contracts` pins these two copies character-for-character so neither page
   * can drift. This restates the fact from the other side: a checkpoint that types one copy must
   * type both, and this file did not touch either.
   */
  it("keeps the active-timer reader identical to the timer dialog's copy", () => {
    /** @param {string} text */
    const readerRegion = (text) => {
      const start = text.indexOf("  function isActiveTimerRecord(value) {");
      const end = text.indexOf("\n  }\n", text.indexOf("  function readActiveTimerList(body) {"));
      return text.slice(start, end);
    };

    assert.equal(readerRegion(source), readerRegion(timerDialog));
  });

  /**
   * The task normalizers are **not** shared, and that is deliberate: this page requires a project
   * up front and never reads a client off a task, while the dialog carries `client_id` and filters
   * by project when the list is painted.
   */
  it("keeps its own task normalizer, which the timer dialog's is not", () => {
    assert.equal(source.includes('readTimerText(task, "project_id")'), true);
    assert.equal(source.includes("client_id: readTimerText"), false);
    assert.equal(timerDialog.includes('client_id: readText(task, "client_id")'), true);
  });
});

describe("Stopwatch record reading", () => {
  it("answers the first spelling that carries something, reading own members only", () => {
    const testCase = stopwatchCase();

    assert.equal(testCase.api.readTimerText({ id: "t1" }, "id", "task_id"), "t1");
    assert.equal(testCase.api.readTimerText({ task_id: "t2" }, "id", "task_id"), "t2");
    assert.equal(testCase.api.readTimerText({ id: "t1", task_id: "t2" }, "id", "task_id"), "t1");
    assert.equal(testCase.api.readTimerText({}, "constructor"), "");
    assert.equal(testCase.api.readTimerText(Object.create({ id: "inherited" }), "id"), "");
    assert.equal(testCase.api.readTimerText(null, "id"), "");
    assert.equal(testCase.api.readTimerText("t1", "id"), "");
  });

  it("treats a falsy member as absent so the fallbacks still choose", () => {
    const testCase = stopwatchCase();

    assert.equal(testCase.api.readTimerText({ id: 0, task_id: "t2" }, "id", "task_id"), "t2");
    assert.equal(testCase.api.readTimerText({ id: "" }, "id"), "");
    assert.equal(testCase.api.readTimerText({ id: 7 }, "id"), "7");
  });

  /**
   * These methods are registered directly as listeners, so a click hands them the `Event` where an
   * options record is expected. An event carries none of these members and therefore takes the
   * same path an empty object takes - which is what has always happened, now read rather than
   * assumed.
   */
  it("reads a boolean option, and treats an event as carrying none", () => {
    const testCase = stopwatchCase();

    assert.equal(testCase.api.optionFlag({ persist: false }, "persist"), false);
    assert.equal(testCase.api.optionFlag({ persist: true }, "persist"), true);
    assert.equal(testCase.api.optionFlag({}, "persist"), undefined);
    assert.equal(testCase.api.optionFlag({ persist: "no" }, "persist"), undefined);
    assert.equal(testCase.api.optionFlag({ type: "click" }, "persist"), undefined);
    assert.equal(testCase.api.optionFlag(null, "persist"), undefined);
    // Own members only: an option reached through the prototype chain is not this caller's.
    assert.equal(testCase.api.optionFlag(Object.create({ persist: false }), "persist"), undefined);
    assert.equal(
      testCase.api.optionFlag({ persist: false }, "persist") !== false, false,
      "an explicit false is the only thing that stops a persist",
    );
    assert.equal(
      testCase.api.optionFlag({ type: "click" }, "persist") !== false, true,
      "and an event therefore persists, exactly as it did before",
    );
  });

  /**
   * The four options this page reads all go through that reader. This is a source fact rather
   * than a lifted one: the readers live on `StopwatchTimer`, whose methods this fixture does not
   * instantiate, so a call site reverting to a bare member read would otherwise be invisible here.
   */
  it("reads every option through that reader, never off the record directly", () => {
    // Counted, not merely present: `persist` is read at two sites - pausing and resetting - so
    // presence alone would not see one of them replaced by a constant.
    const READS = [
      ["persist", 2], ["ignoreClearPreference", 1], ["forceClearElapsed", 1],
      ["compactAfterRemoval", 1], ["shouldReset", 1], ["resetExisting", 1],
    ];

    for (const [name, expected] of READS) {
      assert.equal(
        source.split(`optionFlag(options, "${name}")`).length - 1,
        expected,
        `${name} must be read through optionFlag at ${expected} site(s)`,
      );
      assert.equal(source.includes(`options.${name}`), false, `${name} must not be read off the record directly`);
    }
  });

  it("finds the task rows only where the response carries them", () => {
    const testCase = stopwatchCase();

    assert.deepEqual(plain(testCase.api.taskOptionRows({ options: { tasks: [1, 2] } })), [1, 2]);
    assert.deepEqual(plain(testCase.api.taskOptionRows({ options: { tasks: "one" } })), []);
    assert.deepEqual(plain(testCase.api.taskOptionRows({ tasks: [1] })), []);
    assert.deepEqual(plain(testCase.api.taskOptionRows(null)), []);
  });

  it("reads the identifier a persisted timer acknowledged, and nothing more", () => {
    const testCase = stopwatchCase();

    assert.equal(testCase.api.startedTimerId({ timer: { active_timer_id: "a1" } }), "a1");
    assert.equal(testCase.api.startedTimerId({ timer: { active_timer_id: 42 } }), "42");
    assert.equal(testCase.api.startedTimerId({ timer: {} }), "");
    assert.equal(testCase.api.startedTimerId({}), "");
    assert.equal(testCase.api.startedTimerId(null), "");
  });
});

describe("Stopwatch task options", () => {
  it("requires a project, and drops a completed or archived task", () => {
    const testCase = stopwatchCase();

    const rows = testCase.api.normalizeTaskOptions({
      options: {
        tasks: [
          { id: "t1", title: "Write it", project_id: "p1" },
          { task_id: "t2", label: "Second", project_id: "p1", status: "open" },
          { id: "t3", label: "No project" },
          { id: "t4", label: "Done", project_id: "p1", status: "complete" },
          { id: "t5", label: "Filed", project_id: "p1", status: "archived" },
          { label: "No identifier", project_id: "p1" },
        ],
      },
    });

    assert.deepEqual(rows.map((/** @type {{ id: string }} */ row) => row.id), ["t1", "t2"]);
    assert.equal(rows[0].label, "Write it");
    assert.equal(rows[0].status, "open", "a task with no status of its own is open");
    assert.equal(rows[0].project_id, "p1");
  });

  it("names an unlabelled task and prefers the label written for the list", () => {
    const testCase = stopwatchCase();

    const [bare] = testCase.api.normalizeTaskOptions({ options: { tasks: [{ id: "t1", project_id: "p1" }] } });
    assert.equal(bare.label, "Untitled Task");
    assert.equal(bare.optionLabel, "Untitled Task");

    const [rich] = testCase.api.normalizeTaskOptions({
      options: { tasks: [{ id: "t1", project_id: "p1", label: "Plain", optionLabel: "Client / Plain" }] },
    });
    assert.equal(rich.optionLabel, "Client / Plain");
    assert.equal(rich.label, "Plain");
  });
});

describe("Stopwatch counts and formatting", () => {
  it("admits only the four timer counts this page offers", () => {
    const testCase = stopwatchCase();

    for (const count of [1, 2, 3, 4]) {
      assert.equal(testCase.api.clampTimerCount(count), count);
    }
    assert.equal(testCase.api.clampTimerCount(5), 1);
    assert.equal(testCase.api.clampTimerCount(0), 1);
    assert.equal(testCase.api.clampTimerCount("2"), 1, "a word that looks like a count is not one");
    assert.equal(testCase.api.clampTimerCount(null), 1);
  });

  it("formats elapsed time as padded hours, minutes and seconds", () => {
    const testCase = stopwatchCase();

    assert.equal(testCase.api.formatTime(0), "00:00:00");
    assert.equal(testCase.api.formatTime(1000), "00:00:01");
    assert.equal(testCase.api.formatTime(61_000), "00:01:01");
    assert.equal(testCase.api.formatTime(3_661_000), "01:01:01");
    assert.equal(testCase.api.pad(7), "07");
    assert.equal(testCase.api.pad(70), "70");
  });

  it("capitalizes a state word it is given", () => {
    const testCase = stopwatchCase();

    assert.equal(testCase.api.capitalize("running"), "Running");
    assert.equal(testCase.api.capitalize("paused"), "Paused");
    assert.equal(testCase.api.capitalize(""), "");
  });

  it("answers the billable word the control carries, and never yes outside a billing workspace", () => {
    const testCase = stopwatchCase();
    const input = testCase.document.createElement("input");

    input.checked = true;
    assert.equal(testCase.api.billableValue(input), "yes");

    input.checked = false;
    assert.equal(testCase.api.billableValue(input), "no");

    const personal = stopwatchCase({ billableWorkspace: false });
    const checked = personal.document.createElement("input");
    checked.checked = true;
    assert.equal(personal.api.billableValue(checked), "no", "a workspace that does not bill never answers yes");
  });
});
