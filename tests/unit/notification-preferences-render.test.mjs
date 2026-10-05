import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/shared/notification-preferences.js");

/**
 * The preference renderer and the workspace-default reader, through the real module.
 *
 * `0.33.33.39.32` took `notification-preferences.js` to zero. `normalizeEvents` now reads each
 * event through `requiredMember` and spreads it through `recordFields`; the row, placeholder and
 * priority select hand opaque values to the node's own setters through `Reflect.set`; the heading
 * level reaches `createElement` through a template; and the grouping map is typed. These cases
 * hold each of those to what it did. `notification-response-contracts` already executes the three
 * payload readers.
 *
 * One case names the one narrowing: a priority element answering a non-string `value`.
 */

/** @typedef {Record<string, unknown>} Bag */

/** @param {unknown} value @returns {value is Bag} */
const isBag = (value) => value !== null && typeof value === "object";

/** @param {unknown} value @returns {value is (...args: unknown[]) => unknown} */
const isCallable = (value) => typeof value === "function";

function load() {
  const context = createFakeBrowserContext({ longtailForge: {} });
  vm.runInNewContext(source, context, { filename: "notification-preferences.js" });
  const api = context.window.LongtailForge.notificationPreferences;
  assert.ok(isBag(api));
  /** @param {string} name */
  const member = (name) => {
    const fn = api[name];
    assert.ok(isCallable(fn), `${name} is published`);
    /** @param {unknown[]} args */
    return (...args) => Reflect.apply(fn, api, args);
  };
  return {
    document: context.document,
    readWorkspaceDefaultsPayload: member("readWorkspaceDefaultsPayload"),
    renderGroupingPreferences: member("renderGroupingPreferences"),
    renderPreferenceGroups: member("renderPreferenceGroups"),
  };
}

/** @param {Bag} [overrides] */
const event = (overrides = {}) => ({
  defaultEnabled: true, defaultPriority: "normal", description: "Something changed.", id: "tasks.updated",
  label: "Task updated", moduleEnabled: true, moduleId: "tasks", userEnabled: true,
  workspaceEnabled: true, workspacePriority: "high", ...overrides,
});

/** @param {() => unknown} build */
function thrown(build) {
  try {
    build();
  } catch (error) {
    assert.ok(isBag(error));
    return String(error.name);
  }
  return null;
}

describe("renderPreferenceGroups normalises and renders what it is handed", () => {
  it("does nothing without a container, and renders the placeholder through the node's setter", () => {
    const f = load();
    assert.equal(f.renderPreferenceGroups(null, [event()]), undefined);
    const container = f.document.createElement("div");
    f.renderPreferenceGroups(container, "not a list");
    assert.equal(container.querySelector(".placeholder-copy")?.textContent, "No configurable notification types");
    f.renderPreferenceGroups(container, [], { emptyText: 42 });
    assert.equal(container.querySelector(".placeholder-copy")?.textContent, "42", "the setter converts, as the assignment did");
  });

  it("reads both id and module spellings, groups by module, and orders disabled modules last", () => {
    const f = load();
    const container = f.document.createElement("div");
    f.renderPreferenceGroups(container, [
      event({ id: "", event_type: "time.logged", moduleId: "", module_id: "time_tracking" }),
      event({ id: "", eventType: "files.shared", moduleId: "files", moduleEnabled: false }),
      event({ id: "tasks.created" }),
      event({ id: "", moduleId: "tasks" }),
    ], { headingLevel: "h4" });
    const sections = container.querySelectorAll("section");
    assert.deepEqual(sections.map((section) => [section.dataset.notificationPreferenceModule,
      section.dataset.notificationPreferenceModuleEnabled]), [["tasks", "true"], ["time_tracking", "true"], ["files", "false"]]);
    assert.deepEqual(sections.map((section) => section.children[0]?.tagName), ["H4", "H4", "H4"]);
    assert.deepEqual(sections.map((section) => section.children[0]?.textContent), ["Tasks", "Time Tracking", "Files"]);
    assert.deepEqual(container.querySelectorAll("fieldset").map((row) => row.dataset.notificationEventId),
      ["tasks.created", "time.logged", "files.shared"], "an event with no id is dropped");
  });

  it("still fails on a missing event, as its first member read did", () => {
    const f = load();
    assert.equal(thrown(() => f.renderPreferenceGroups(f.document.createElement("div"), [null])), "TypeError");
  });

  it("builds each row from the spread members, through the nodes' own setters", () => {
    const f = load();
    const container = f.document.createElement("div");
    f.renderPreferenceGroups(container, [
      event({ id: "a", label: "", description: 7, workspaceEnabled: false }),
      event({ id: "b", workspacePriority: "", defaultPriority: "urgent", userEnabled: false }),
      event({ id: "c", workspacePriority: "", defaultPriority: "" }),
    ], { includeWorkspaceDefaults: true, canManageWorkspaceDefaults: true });
    const rows = container.querySelectorAll("fieldset");
    assert.deepEqual(rows.map((row) => row.querySelector("legend")?.textContent), ["a", "Task updated", "Task updated"],
      "an empty label falls back to the id");
    assert.equal(rows[0]?.querySelector("p")?.textContent, "7");
    const userInputs = container.querySelectorAll("[data-preference-user-enabled]");
    assert.deepEqual(userInputs.map((input) => [input.checked, input.disabled, input.dataset.preferenceOriginalEnabled]),
      [[false, true, "true"], [false, false, "false"], [true, false, "true"]]);
    assert.deepEqual(container.querySelectorAll("[data-preference-workspace-priority]").map((select) => select.value),
      ["high", "urgent", "normal"]);
  });

  it("leaves the workspace columns out unless both options allow them", () => {
    const f = load();
    const container = f.document.createElement("div");
    f.renderPreferenceGroups(container, [event()], { includeWorkspaceDefaults: true });
    assert.equal(container.querySelectorAll("[data-preference-workspace-enabled]").length, 0);
  });
});

describe("renderGroupingPreferences and the workspace-default reader", () => {
  it("labels the client option by workspace type and selects the normalised mode", () => {
    const f = load();
    // The double's `append` takes nodes only; the DOM's also takes text, as the label's does.
    const create = f.document.createElement;
    Reflect.set(f.document, "createElement", (/** @type {string} */ tagName) => {
      const element = Reflect.apply(create, f.document, [tagName]);
      const append = element.append;
      Reflect.set(element, "append", (/** @type {unknown[]} */ ...nodes) => Reflect.apply(append, element,
        nodes.map((node) => (typeof node === "string" ? f.document.createTextNode(node) : node))));
      return element;
    });
    const container = f.document.createElement("div");
    f.renderGroupingPreferences(container, { grouping_mode: "record_type" }, { workspaceType: "personal" });
    const select = container.querySelector("select");
    assert.equal(select?.value, "record_type");
    assert.equal(container.querySelectorAll("option")[0]?.textContent, "Project");
  });

  it("answers each id and priority as the reads did, and 'normal' for a non-string priority", () => {
    const f = load();
    /** @param {unknown} value */
    const rowWith = (value) => ({ dataset: { notificationEventId: "e" }, querySelector: () => ({ value }) });
    const payload = f.readWorkspaceDefaultsPayload({
      querySelectorAll: () => [
        { checked: true, closest: () => rowWith("high") },
        { checked: false, closest: () => rowWith("") },
        // A `<select>` answers a string; an `<li>` carrying the attribute would answer a number,
        // which the published `priority: string` never allowed. It now falls back.
        { checked: true, closest: () => rowWith(3) },
      ],
    });
    assert.deepEqual(JSON.parse(JSON.stringify(payload)), [
      { id: "e", enabled: true, priority: "high" },
      { id: "e", enabled: false, priority: "normal" },
      { id: "e", enabled: true, priority: "normal" },
    ]);
  });
});
