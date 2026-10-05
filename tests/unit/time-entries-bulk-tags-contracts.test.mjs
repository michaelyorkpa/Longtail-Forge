import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const reader = createProjectTextReader();
const source = reader.readText("public/js/time-entries.js");

const LIFTED = [
  "findTimeEntryControl", "requireTimeEntryValue", "isTimeEntryRecord", "readTagBulkAssignment",
  "loadTagOptions", "populateTagFilter", "mountBulkTagPicker", "applyBulkTagAction",
  "toggleVisibleSelection", "syncSelectionToEntries", "updateSelectionControls",
  "updateBulkControls", "createSelectionCell", "noTagsFilterValue", "normalizeTagFilterValue",
  "tagFilterAllOption", "tagFilterNoTagsOption",
];

const CONTROLS = [
  ["filterTagControl", "[data-time-entry-filter-tag-control]", "label", "HTMLElement"],
  ["filterTagSelect", "[data-time-entry-filter-tag]", "select", "HTMLSelectElement"],
  ["bulkToolbar", "[data-time-entry-bulk-toolbar]", "details", "HTMLDetailsElement"],
  ["bulkActionSelect", "[data-time-entry-bulk-action]", "select", "HTMLSelectElement"],
  ["bulkTagsControl", "[data-time-entry-bulk-tags]", "div", "HTMLElement"],
  ["bulkApplyButton", "[data-time-entry-bulk-apply]", "button", "HTMLButtonElement"],
  ["selectAllInput", "[data-time-entry-select-all]", "input", "HTMLInputElement"],
];

/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));

/** @param {string} source_ @param {string} name */
function constant(source_, name) {
  const match = source_.match(new RegExp(`const ${name} = [\\s\\S]*?;`));
  assert.ok(match, name);
  return match[0];
}

/** @param {Record<string, unknown>} [overrides] */
function catalogueTag(overrides = {}) {
  return { tag_id: "t1", name: "Billing", slug: "billing", color: "", ...overrides };
}

/** @param {string} entryId */
const row = (entryId) => ({ entryId, endTime: new Date("2026-03-02T10:00:00.000Z") });

/**
 * @param {{ tags?: unknown, mountPicker?: unknown, loadTags?: unknown, response?: unknown,
 *   omit?: string[] }} [options]
 */
function bulkCase(options = {}) {
  const omit = new Set(options.omit || []);
  const document = new FakeDocument();
  /** @type {unknown[]} */
  const events = [];
  /** @type {Set<string>} */
  const selectedEntryIds = new Set();
  /** @type {{ entryId: string }[]} */
  let filtered = [];

  for (const [, selector, tag] of CONTROLS) {
    if (omit.has(selector)) continue;
    const element = document.createElement(tag);
    element.setAttribute(selector.slice(1, -1), "");
    document.body.appendChild(element);
  }

  const picker = {
    selected: /** @type {unknown} */ (null),
    readTagIds: () => /** @type {string[]} */ (["t1"]),
    setSelected: (/** @type {unknown} */ tagIds) => { picker.selected = tagIds; events.push(["set-selected", tagIds]); },
    refreshTags: async () => {},
  };

  /** @type {FakeMutationObserver[]} */
  const observers = [];
  class FakeMutationObserver {
    /** @param {() => void} callback */
    constructor(callback) {
      this.callback = callback;
      this.disconnected = false;
      /** @type {[unknown, unknown][]} */
      this.observed = [];
      observers.push(this);
    }
    /** @param {unknown} target @param {unknown} init */
    observe(target, init) { this.observed.push([target, init]); }
    disconnect() { this.disconnected = true; events.push("observer-disconnected"); }
  }

  const tagSurface = {
    NO_TAGS_FILTER_VALUE: "__no_tags__",
    loadTags: options.loadTags === undefined
      ? async () => (options.tags === undefined ? [catalogueTag()] : options.tags)
      : options.loadTags,
    mountPicker: options.mountPicker === undefined
      ? async (/** @type {unknown} */ container, /** @type {unknown} */ pickerOptions) => {
        events.push(["mount-picker", pickerOptions]);
        return picker;
      }
      : options.mountPicker,
  };

  const context = vm.createContext({
    document,
    window: { LongtailForge: { tags: tagSurface }, MutationObserver: FakeMutationObserver },
    ...fakeDomConstructors(),
    selectedEntryIds,
    timeEntryTagOptions: /** @type {unknown[]} */ ([]),
    bulkTagPicker: /** @type {unknown} */ (null),
    bulkTagObserver: /** @type {unknown} */ (null),
    requireNamespace: () => ({ tags: tagSurface }),
    requireApi: () => ({
      postJson: async (/** @type {string} */ url, /** @type {unknown} */ payload) => {
        events.push(["post", url, payload]);
        if (context.response instanceof Error) throw context.response;
        return context.response;
      },
    }),
    requireErrors: () => ({
      caughtMessage: (/** @type {unknown} */ error, /** @type {string} */ fallback) => {
        events.push(["caught", fallback]);
        return fallback;
      },
      // The published failure reader drops what it cannot vouch for, which is exactly the
      // property the response reader's length check depends on. Stubbed to that behaviour so
      // the check is exercised rather than bypassed.
      readBulkFailures: (/** @type {{ errors?: unknown }} */ body) => (Array.isArray(body?.errors)
        ? body.errors.filter((failure) => typeof failure === "object" && failure !== null)
        : []),
    }),
    setTimeEntryStatus: (/** @type {string} */ message) => events.push(["status", message]),
    loadTimeEntryData: async () => events.push("reloaded"),
    renderEntries: () => events.push("rendered"),
    getFilteredEntries: () => filtered,
    createOption: (/** @type {string} */ value, /** @type {string} */ text) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      return option;
    },
    formatDate: (/** @type {Date} */ date) => date.toISOString(),
    console: { error: () => {} },
    response: /** @type {unknown} */ (null),
  });

  vm.runInContext(constant(source, "TAG_BULK_ACTIONS"), context);
  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), context);
  for (const [name, selector, , constructor] of CONTROLS) {
    vm.runInContext(`var ${name} = findTimeEntryControl(${JSON.stringify(selector)}, ${constructor});`, context);
  }

  const api = vm.runInContext(`({ ${LIFTED.join(", ")} })`, context);
  /** @param {string} selector */
  const control = (selector) => document.querySelector(selector);
  return {
    api, context, document, events, control, picker, selectedEntryIds, observers,
    /** @param {{ entryId: string }[]} rows */
    setFiltered: (rows) => { filtered = rows; },
  };
}

describe("Time Entries bulk tag actions and selection", () => {
  it("answers the published catalogue and an empty list on either refusal path", async () => {
    const withTags = bulkCase({ tags: [catalogueTag(), catalogueTag({ tag_id: "t2" })] });
    assert.equal((await withTags.api.loadTagOptions()).length, 2);

    // A surface that publishes no loader, and a loader that throws, are both "no tags offered"
    // rather than a broken page - the filter and the picker simply have nothing to show.
    const noLoader = bulkCase({ loadTags: undefined, mountPicker: undefined });
    noLoader.context.requireNamespace = () => ({ tags: {} });
    assert.deepEqual(plain(await noLoader.api.loadTagOptions()), []);

    const throwing = bulkCase({ loadTags: async () => { throw new Error("offline"); } });
    assert.deepEqual(plain(await throwing.api.loadTagOptions()), []);
  });

  it("hides the tag filter when nothing is offered and builds options from the catalogue", () => {
    const testCase = bulkCase();
    const { api, context, control } = testCase;

    context.timeEntryTagOptions = [];
    api.populateTagFilter();
    assert.equal(control("[data-time-entry-filter-tag-control]").hidden, true);

    context.timeEntryTagOptions = [catalogueTag({ tag_id: "t1", name: "Billing" }), catalogueTag({ tag_id: "t2", name: "", slug: "internal" })];
    api.populateTagFilter();
    assert.equal(control("[data-time-entry-filter-tag-control]").hidden, false);

    const options = control("[data-time-entry-filter-tag]").children;
    // Two sentinels first, then one option per catalogue tag; an unnamed tag falls back to slug.
    assert.deepEqual(options.map((option) => option.value), ["", "__no_tags__", "t1", "t2"]);
    assert.deepEqual(options.map((option) => option.textContent), ["All tags", "No Tags", "Billing", "internal"]);
  });

  it("keeps a still-offered tag filter selected and drops one that is gone", () => {
    const testCase = bulkCase();
    const { api, context, control } = testCase;
    context.timeEntryTagOptions = [catalogueTag({ tag_id: "t1" })];

    control("[data-time-entry-filter-tag]").value = "t1";
    api.populateTagFilter();
    assert.equal(control("[data-time-entry-filter-tag]").value, "t1");

    control("[data-time-entry-filter-tag]").value = "__no_effective_tags__";
    api.populateTagFilter();
    assert.equal(control("[data-time-entry-filter-tag]").value, "__no_tags__");

    control("[data-time-entry-filter-tag]").value = "gone";
    api.populateTagFilter();
    assert.equal(control("[data-time-entry-filter-tag]").value, "");
  });

  it("mounts the picker with the catalogue and replaces a previous observer", async () => {
    const testCase = bulkCase();
    const { api, context, events, observers } = testCase;
    context.timeEntryTagOptions = [catalogueTag()];

    await api.mountBulkTagPicker();
    assert.deepEqual(plain(events[0]), ["mount-picker", { allowCreate: false, label: "Tags", placeholder: "Find tags", tags: [catalogueTag()] }]);
    assert.equal(context.bulkTagPicker, testCase.picker);
    assert.equal(observers.length, 1);
    assert.equal(observers[0].observed.length, 1);
    assert.deepEqual(plain(observers[0].observed[0][1]), { childList: true, subtree: true });

    // Mounting syncs the controls, so the toolbar reflects the picker it just gained.
    assert.equal(testCase.control("[data-time-entry-bulk-apply]").textContent, "Apply to 0");

    // Mounting again disconnects the first observer rather than leaving two watching one control.
    await api.mountBulkTagPicker();
    assert.equal(observers[0].disconnected, true);
    assert.equal(observers.length, 2);
    assert.equal(observers[1].disconnected, false);
  });

  it("leaves the picker unmounted when the surface declines", async () => {
    const declining = bulkCase({ mountPicker: async () => null });
    await declining.api.mountBulkTagPicker();
    assert.equal(declining.context.bulkTagPicker, null);

    const missingControl = bulkCase({ omit: ["[data-time-entry-bulk-tags]"] });
    await missingControl.api.mountBulkTagPicker();
    assert.equal(missingControl.context.bulkTagPicker, null);
    assert.equal(missingControl.events.length, 0);
  });

  it("sends the selected entries and tags, then clears both", async () => {
    const testCase = bulkCase();
    const { api, context, events, selectedEntryIds, control } = testCase;
    context.bulkTagPicker = testCase.picker;
    context.response = { action: "add", changed: ["a", "b"], changed_count: 2, errors: [], skipped_count: 0, target_type: "time_entry" };
    selectedEntryIds.add("a");
    selectedEntryIds.add("b");
    control("[data-time-entry-bulk-action]").value = "add";

    await api.applyBulkTagAction();

    assert.deepEqual(plain(events[1]), ["post", "/api/tags/bulk-assignments", {
      action: "add", tagIds: ["t1"], targetIds: ["a", "b"], targetType: "time_entry",
    }]);
    assert.equal(selectedEntryIds.size, 0);
    assert.deepEqual(plain(testCase.picker.selected), []);
    assert.ok(events.includes("reloaded"));
    assert.deepEqual(plain(events.at(-1)), ["status", "Updated tags on 2 time entries."]);
  });

  it("reads the action from the control and reports one entry in the singular with skips", async () => {
    const testCase = bulkCase();
    const { api, context, events, selectedEntryIds, control } = testCase;
    context.bulkTagPicker = testCase.picker;
    context.response = { action: "remove", changed: ["a"], changed_count: 1, errors: [{ target_id: "b" }], skipped_count: 1, target_type: "time_entry" };
    selectedEntryIds.add("a");
    control("[data-time-entry-bulk-action]").value = "remove";

    await api.applyBulkTagAction();

    assert.equal(plain(events[1])[2].action, "remove");
    assert.deepEqual(plain(events.at(-1)), ["status", "Updated tags on 1 time entry. 1 skipped."]);
  });

  it("treats any action but remove as add, because the control is the only vocabulary", async () => {
    const testCase = bulkCase();
    const { api, context, events, selectedEntryIds, control } = testCase;
    context.bulkTagPicker = testCase.picker;
    context.response = { action: "add", changed: ["a"], changed_count: 1, errors: [], skipped_count: 0, target_type: "time_entry" };
    selectedEntryIds.add("a");
    control("[data-time-entry-bulk-action]").value = "something-else";

    await api.applyBulkTagAction();
    assert.equal(plain(events[1])[2].action, "add");
  });

  it("sends nothing when there is no selection or no tag, and re-syncs the controls", async () => {
    const testCase = bulkCase();
    const { api, context, events, selectedEntryIds } = testCase;
    context.bulkTagPicker = testCase.picker;

    await api.applyBulkTagAction();
    assert.equal(events.some((event) => Array.isArray(event) && event[0] === "post"), false);

    selectedEntryIds.add("a");
    context.bulkTagPicker = { ...testCase.picker, readTagIds: () => [] };
    await api.applyBulkTagAction();
    assert.equal(events.some((event) => Array.isArray(event) && event[0] === "post"), false);
    // The apply button is re-decided rather than left disabled from a previous attempt.
    assert.equal(testCase.control("[data-time-entry-bulk-apply]").textContent, "Apply to 1");
  });

  it("refuses a response it cannot vouch for instead of reporting a count the body never stated", async () => {
    for (const body of [null, {}, { action: "add", changed: [], changed_count: 1, errors: [], skipped_count: 0, target_type: "time_entry" },
      { action: "sideways", changed: [], changed_count: 0, errors: [], skipped_count: 0, target_type: "time_entry" },
      { action: "add", changed: [], changed_count: 0, errors: ["not-a-failure"], skipped_count: 1, target_type: "time_entry" }]) {
      const testCase = bulkCase();
      const { api, context, events, selectedEntryIds } = testCase;
      context.bulkTagPicker = testCase.picker;
      context.response = body;
      selectedEntryIds.add("a");

      await api.applyBulkTagAction();

      assert.deepEqual(plain(events.at(-1)), ["status", "Time entry tags could not be updated."]);
      // The selection survives a refusal, because nothing was proven to have happened to it.
      assert.equal(selectedEntryIds.size, 1);
      assert.equal(events.includes("reloaded"), false);
    }
  });

  it("disables the apply button for the request and lets the control sync decide afterwards", async () => {
    const testCase = bulkCase();
    const { api, context, selectedEntryIds, control } = testCase;
    const apply = control("[data-time-entry-bulk-apply]");
    context.bulkTagPicker = testCase.picker;
    selectedEntryIds.add("a");
    context.response = new Error("network");

    let disabledDuringRequest = null;
    context.requireApi = () => ({
      postJson: async () => { disabledDuringRequest = apply.disabled; throw new Error("network"); },
    });

    await api.applyBulkTagAction();

    assert.equal(disabledDuringRequest, true);
    // The selection survived, so the button is enabled again by the sync in `finally`.
    assert.equal(apply.disabled, false);
  });

  it("selects and clears only the entries currently visible", () => {
    const testCase = bulkCase();
    const { api, selectedEntryIds, control } = testCase;
    testCase.setFiltered([row("a"), row("b")]);
    selectedEntryIds.add("hidden");

    control("[data-time-entry-select-all]").checked = true;
    api.toggleVisibleSelection();
    assert.deepEqual([...selectedEntryIds].sort(), ["a", "b", "hidden"]);

    control("[data-time-entry-select-all]").checked = false;
    api.toggleVisibleSelection();
    assert.deepEqual([...selectedEntryIds], ["hidden"]);
  });

  it("drops selections that are no longer visible", () => {
    const testCase = bulkCase();
    const { api, selectedEntryIds } = testCase;
    selectedEntryIds.add("a");
    selectedEntryIds.add("gone");

    api.syncSelectionToEntries([row("a")]);
    assert.deepEqual([...selectedEntryIds], ["a"]);
  });

  it("moves the select-all control through all three of its states", () => {
    const testCase = bulkCase();
    const { api, selectedEntryIds, control } = testCase;
    const selectAll = control("[data-time-entry-select-all]");
    const entries = [row("a"), row("b")];

    api.updateSelectionControls(entries);
    assert.deepEqual([selectAll.checked, selectAll.indeterminate, selectAll.disabled], [false, false, false]);

    selectedEntryIds.add("a");
    api.updateSelectionControls(entries);
    assert.deepEqual([selectAll.checked, selectAll.indeterminate, selectAll.disabled], [false, true, false]);

    selectedEntryIds.add("b");
    api.updateSelectionControls(entries);
    assert.deepEqual([selectAll.checked, selectAll.indeterminate, selectAll.disabled], [true, false, false]);

    // An empty list is not "all selected": the control is disabled and unchecked.
    api.updateSelectionControls([]);
    assert.deepEqual([selectAll.checked, selectAll.indeterminate, selectAll.disabled], [false, false, true]);
  });

  it("opens the toolbar for a selection and gates apply on both a selection and a tag", () => {
    const testCase = bulkCase();
    const { api, context, selectedEntryIds, control } = testCase;
    const toolbar = control("[data-time-entry-bulk-toolbar]");
    const apply = control("[data-time-entry-bulk-apply]");
    context.bulkTagPicker = testCase.picker;

    toolbar.open = false;
    api.updateBulkControls();
    // Never opened without a selection - and this function only ever opens, never closes.
    assert.equal(toolbar.open, false);
    assert.equal(apply.disabled, true);
    assert.equal(apply.textContent, "Apply to 0");

    selectedEntryIds.add("a");
    api.updateBulkControls();
    assert.equal(toolbar.open, true);
    assert.equal(apply.disabled, false);
    assert.equal(apply.textContent, "Apply to 1");

    // A selection with no tag chosen still cannot apply: both halves are required.
    context.bulkTagPicker = { ...testCase.picker, readTagIds: () => [] };
    api.updateBulkControls();
    assert.equal(apply.disabled, true);
  });

  it("builds a selection checkbox that reflects and writes the shared selection", () => {
    const testCase = bulkCase();
    const { api, selectedEntryIds } = testCase;
    testCase.setFiltered([row("a")]);
    selectedEntryIds.add("a");

    const cell = api.createSelectionCell({ entryId: "a", projectName: "Project One", endTime: new Date("2026-03-02T10:00:00.000Z") });
    const checkbox = cell.children[0];
    assert.equal(checkbox.checked, true);
    assert.equal(checkbox.value, "a");

    checkbox.checked = false;
    checkbox.dispatchEvent({ type: "change" });
    assert.equal(selectedEntryIds.has("a"), false);

    checkbox.checked = true;
    checkbox.dispatchEvent({ type: "change" });
    assert.equal(selectedEntryIds.has("a"), true);
  });

  it("declares the two slots this checkpoint typed, which no behaviour can assert", () => {
    // A `@type` claim is invisible at runtime, so the source is the only place it can be held.
    assert.equal(source.includes("@type {BrowserTagCatalogRecord[]}\n   */\n  let timeEntryTagOptions = [];"), true);
    assert.equal(source.includes("@type {BrowserTagPickerController | null}\n   */\n  let bulkTagPicker = null;"), true);
    assert.equal(source.includes("/** @type {MutationObserver | null} */\n  let bulkTagObserver = null;"), true);
    for (const name of ["BrowserTagCatalogRecord", "BrowserTagPickerController"]) {
      assert.equal(
        source.includes(`.js").${name}} ${name} */`), true,
        `${name} must be imported from the published contracts rather than restated here`,
      );
    }
  });

  it("reaches its diagnostics with no cast and no suppression", () => {
    assert.equal(/\/\*\* @type \{[^}]*\} \*\/ \(/.test(source), false, "no cast may stand in for a check");
    for (const suppression of ["@ts-expect-error", "@ts-ignore", "eslint-disable"]) {
      assert.equal(source.includes(suppression), false, `${suppression} must not appear`);
    }
  });

  it("acquires every bulk control through the checked lookup at the markup's own subtype", () => {
    for (const [name, selector, , constructor] of CONTROLS) {
      const expected = `const ${name} = findTimeEntryControl("${selector}", ${constructor});`;
      assert.equal(source.includes(expected), true, `${name} must be acquired as ${expected}`);
      assert.equal(source.includes(`const ${name} = document.querySelector`), false, `${name} must not go back to an unchecked query`);
    }
  });

  it("keeps the optional bulk controls optional rather than requiring them", () => {
    // These controls are genuinely optional in this page - every read already guards - so the
    // conversion must not turn absence into a thrown page.
    for (const name of ["bulkToolbar", "bulkActionSelect", "bulkTagsControl", "bulkApplyButton", "selectAllInput", "filterTagControl"]) {
      assert.equal(
        source.includes(`requireTimeEntryValue(${name}`), false,
        `${name} is guarded at every read and must stay optional`,
      );
    }
  });
});
