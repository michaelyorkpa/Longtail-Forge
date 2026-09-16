import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/shared/view-renderer.js");

/**
 * The descriptor vocabulary `0.33.33.39.8` named, and the two pure functions inside it that
 * nothing executed.
 *
 * `notes-editor-fields-links` lifts `renderDescriptorLinkedRecordsPanel`, and two Tasks and
 * Clients/Projects contracts pin `normalizeAction`'s icon-only branch as text. Neither runs
 * `normalizeAction` or `renderPlaceholder`. The checkpoint itself changed no executable byte -
 * removing its 98 added comment lines reproduces the baseline exactly - so these cases record
 * what the two answer rather than defending a change, and the rest of the file pins the shape
 * claims and the findings the annotations surfaced.
 */

/** @type {{ action: unknown, state: unknown, record: unknown }[]} */
const dispatched = [];

function renderer() {
  const browser = createFakeBrowserContext();
  const context = vm.createContext({
    ...browser,
    runDescriptorAction: (/** @type {unknown} */ action, /** @type {unknown} */ state, /** @type {unknown} */ record) => {
      dispatched.push({ action, state, record });
    },
  });
  for (const name of ["normalizeAction", "renderPlaceholder"]) {
    vm.runInContext(extractFunctionBlock(source, name), context);
  }
  return {
    api: vm.runInContext("({ normalizeAction, renderPlaceholder })", context),
    view: browser.window.LongtailForge?.view,
    document: browser.document,
  };
}

/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));

/** A minimal stand-in for the one primitive `renderPlaceholder` calls. */
function emptyStateView() {
  /** @type {Record<string, unknown>[]} */
  const calls = [];
  return { calls, view: { createEmptyState: (/** @type {Record<string, unknown>} */ options) => { calls.push(options); return options; } } };
}

describe("One descriptor action, normalised for the button primitive", () => {
  it("names the action from its label, then its id, then a word", () => {
    const { api } = renderer();
    assert.equal(api.normalizeAction({ label: "Archive", id: "archive" }).label, "Archive");
    assert.equal(api.normalizeAction({ id: "archive" }).label, "archive");
    assert.equal(api.normalizeAction({}).label, "Action");
    assert.equal(api.normalizeAction().label, "Action", "and a missing descriptor is still an action");
  });

  it("titles it from its own title, then the label, then the id", () => {
    const { api } = renderer();
    assert.equal(api.normalizeAction({ title: "Archive this", label: "Archive", id: "archive" }).title, "Archive this");
    assert.equal(api.normalizeAction({ label: "Archive", id: "archive" }).title, "Archive");
    assert.equal(api.normalizeAction({ id: "archive" }).title, "archive");
    assert.equal(api.normalizeAction({}).title, "Action");
  });

  /** The behaviour identifier is what the button carries, falling back to the action's own id. */
  it("carries the behaviour as the button's action, or the id when there is none", () => {
    const { api } = renderer();
    assert.equal(api.normalizeAction({ behavior: "lists.archive", id: "archive" }).action, "lists.archive");
    assert.equal(api.normalizeAction({ id: "archive" }).action, "archive");
  });

  /** Pinned by two contracts: an icon-only action carries an empty text, and only then. */
  it("empties the text for an icon-only action, and for nothing else", () => {
    const { api } = renderer();
    assert.equal(api.normalizeAction({ iconOnly: true, label: "Archive" }).text, "");
    assert.equal(api.normalizeAction({ iconOnly: true, label: "Archive" }).iconOnly, true);
    assert.equal(api.normalizeAction({ label: "Archive" }).text, undefined);
    assert.equal(api.normalizeAction({ iconOnly: "yes", label: "Archive" }).iconOnly, false,
      "the flag is read as exactly true, not for truthiness");
    assert.equal(api.normalizeAction({ iconOnly: "yes", label: "Archive" }).text, undefined);
  });

  /** Without a surface state there is nothing to dispatch into, so the button says so. */
  it("disables the action until it has a state to run against", () => {
    const { api } = renderer();
    const withoutState = api.normalizeAction({ id: "archive" });
    assert.equal(withoutState.disabled, true);
    assert.equal(withoutState.onClick, undefined);

    const state = { selectedRecord: null };
    const withState = api.normalizeAction({ id: "archive" }, state);
    assert.equal(withState.disabled, false);
    assert.equal(typeof withState.onClick, "function");
  });

  it("dispatches the action, its state and the record it was given", () => {
    const { api } = renderer();
    dispatched.length = 0;
    const state = { selectedRecord: { id: "r1" } };
    const record = { id: "r2" };
    api.normalizeAction({ id: "archive" }, state, record).onClick();
    assert.equal(dispatched.length, 1);
    assert.equal(dispatched[0].state, state, "the state by identity");
    assert.equal(dispatched[0].record, record, "and the record override by identity");
    assert.deepEqual(JSON.parse(JSON.stringify(dispatched[0].action)), { id: "archive" });
  });

  it("carries the icon and role through untouched", () => {
    const { api } = renderer();
    const normalized = api.normalizeAction({ icon: "archive", id: "archive", role: "destructive" });
    assert.equal(normalized.icon, "archive");
    assert.equal(normalized.role, "destructive");
  });
});

describe("The placeholder a surface shows in place of a panel", () => {
  it("prefers the empty state's own title and message", () => {
    const { api } = renderer();
    const { calls, view } = emptyStateView();
    api.renderPlaceholder("Index", { title: "No index", message: "Nothing to index yet." }, view);
    assert.deepEqual(plain(calls[0]), { title: "No index", message: "Nothing to index yet." });
  });

  it("falls back to the panel's own name, to a description, and to a general message", () => {
    const { api } = renderer();
    const { calls, view } = emptyStateView();
    api.renderPlaceholder("Index", { description: "Nothing yet." }, view);
    assert.deepEqual(plain(calls[0]), { title: "Index", message: "Nothing yet." });
    api.renderPlaceholder("Items", null, view);
    assert.deepEqual(plain(calls[1]), { title: "Items", message: "No records loaded." });
    api.renderPlaceholder("Items", undefined, view);
    assert.deepEqual(plain(calls[2]), { title: "Items", message: "No records loaded." });
  });
});

describe("view-renderer.js names the descriptor vocabulary it reads", () => {
  it("takes the framework descriptors as fragments rather than whole contracts", () => {
    for (const name of ["DescriptorTable", "DescriptorModal", "DescriptorLinkedRecords", "DescriptorAction"]) {
      assert.match(source, new RegExp(`\\}\\} ${name} \\*/|\\} ${name} \\*/`), name + " must be declared");
    }
    assert.match(source, /`Partial` because the callers pass fragments/);
    assert.match(source, /@typedef \{Partial<ViewActionDescriptor> & \{ modal\?: unknown, modalId\?: unknown \}\} DescriptorAction/);
  });

  /**
   * The members these renderers read that the framework descriptor does not declare. Each is a
   * finding for the descriptor contract's owner; this checkpoint repairs none of them.
   */
  it("names every member it reads that the framework descriptor does not declare", () => {
    assert.match(source, /columns\?: readonly DescriptorColumn\[\], title\?: unknown/);
    // `0.33.33.39.10` added the three the table path reads off a column: the chip list's own
    // field and label field, and the hierarchy label's depth field. The claim is unchanged.
    assert.match(source, /align\?: unknown, chipLabelField\?: unknown, chipsField\?: unknown, depthField\?: unknown,/);
    assert.match(source, /header\?: unknown, key\?: unknown/);
    assert.match(source, /Partial<.*ViewTableSecondaryRowDescriptor> & \{ title\?: unknown \}/);
    assert.match(source, /Partial<ViewLinkedRecordsDescriptor> & \{ ariaLabel\?: unknown \}/);
    assert.match(source, /recorded as findings for the descriptor contract's owner/);
  });

  /** The surface-state slot is the reason one function in this region stayed open. */
  it("records why the action dispatcher's state is left uninferred", () => {
    assert.match(source, /`state` is deliberately left uninferred/);
    assert.match(source, /transferring nullness diagnostics into\n\s+\* two functions it had not measured/);
    assert.match(source, /async function runDescriptorAction\(action = \{\}, state, recordOverride = undefined\) \{/,
      "and its signature is unchanged");
  });

  it("carries no suppression and adds no assertion", () => {
    assert.doesNotMatch(source, /@ts-(expect-error|ignore|nocheck)/);
    assert.equal((source.match(/\/\*\* @type \{[^}]*\} \*\/ \(/g) || []).length, 0, "this file asserts nothing");
  });
});
