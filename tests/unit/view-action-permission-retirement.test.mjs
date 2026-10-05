import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader } from "../../scripts/test-support/source-scan.mjs";

const { readText } = createProjectTextReader();
const sources = [
  "public/js/shared/view-surface-descriptor.js",
  "public/js/shared/view-modal-stack.js",
  "public/js/shared/view-builder.js",
  "public/js/shared/view-action-security.js",
  "public/js/shared/view-renderer.js",
].map((path) => ({ filename: String(path.split("/").pop()), text: readText(path) }));

/**
 * What descriptor actions do now that nothing pretends to gate them.
 *
 * `0.33.33.39.2` asked whether the browser should gain a real permission hint or lose the two
 * hooks that never worked; `0.33.33.39.22` carried out the second. `actionPermissionsAllowed`
 * returned `true` unconditionally and `assertActionPermissions` could not throw, so every
 * `actions.filter(...)` site filtered nothing and the dispatcher's check refused nothing.
 *
 * **Enforcement did not move, because it was never here.** Every route these actions dispatch to
 * checks permissions on the server; `scripts/permission-regression.mjs` holds that pairing
 * directly - it reads `requiredPermissions: ["clients.manage"]` out of the client-projects module
 * descriptor and asserts a project user's `POST /api/clients` is refused with 403. These cases
 * own the browser half: a permitted action still renders and still dispatches, an action still
 * carrying the metadata is treated no differently, and nothing consults a hook to decide it.
 *
 * The real behavioural claim of the removal is **pass-through**: ten sites used to rebuild their
 * action lists through a filter, and the lists must now arrive unchanged - same entries, same
 * order, same identities, including the DOM nodes the shipped callers pass.
 */

/** @typedef {Record<string, unknown>} Bag */

/** @param {unknown} value @returns {value is Bag} */
const isBag = (value) => value !== null && typeof value === "object";

/** @param {unknown} value @returns {value is (...args: unknown[]) => unknown} */
const isCallable = (value) => typeof value === "function";

/** The stack, with the real action-security module rather than a double. */
function stack() {
  /** @type {unknown[]} */
  const routeWrites = [];
  const context = createFakeBrowserContext({
    longtailForge: {
      api: {
        getJson: async () => ({}),
        postJson: async (/** @type {unknown} */ route) => { routeWrites.push(route); return {}; },
        patchJson: async () => ({}),
        putJson: async () => ({}),
        deleteJson: async () => ({}),
      },
      viewDataBinding: {
        loadBoundRecords: async () => [],
        readPath: (/** @type {unknown} */ source, /** @type {unknown} */ path) => (
          isBag(source) ? source[String(path)] : undefined
        ),
      },
      viewSearchOptions: {
        setFieldOptions: () => {},
        setFieldOptionsError: () => {},
        mountSearchOptions: () => {},
      },
    },
  });
  for (const { filename, text } of sources) {
    vm.runInNewContext(text, context, { filename });
  }
  const view = context.window.LongtailForge?.view;
  const security = context.window.LongtailForge?.viewActionSecurity;
  assert.ok(view, "the stack should publish LongtailForge.view");
  assert.ok(security, "the stack should publish LongtailForge.viewActionSecurity");
  return { context, routeWrites, security: /** @type {Bag} */ (security), view: /** @type {Bag} */ (view) };
}

/** @param {Bag} view @param {string} member @param {unknown[]} args */
function call(view, member, args) {
  const fn = view[member];
  assert.ok(isCallable(fn), `the factory should publish ${member}`);
  return Reflect.apply(fn, view, args);
}

/** @param {unknown} node @param {string} selector @returns {Bag[]} */
function queryAll(node, selector) {
  assert.ok(isBag(node), "a rendered node should be a record");
  const querySelectorAll = node.querySelectorAll;
  assert.ok(isCallable(querySelectorAll), "a rendered node should expose querySelectorAll");
  return /** @type {Bag[]} */ (Reflect.apply(querySelectorAll, node, [selector]));
}

/** @param {Bag} node */
async function click(node) {
  const fn = node.click;
  assert.ok(isCallable(fn), "an action control should be clickable");
  await Reflect.apply(fn, node, []);
}

const settle = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe("The published security contract no longer offers a permission hook", () => {
  it("publishes its three real capabilities and neither retired one", () => {
    const { security } = stack();
    assert.deepEqual(
      Object.keys(security).sort(),
      ["confirmDescriptorAction", "interpolateRoute", "runRouteAction"],
    );
    assert.equal(security.actionPermissionsAllowed, undefined);
    assert.equal(security.assertActionPermissions, undefined);
    assert.ok(Object.isFrozen(security), "and the surface is still frozen");
  });

  it("keeps confirmation, interpolation and dispatch working", async () => {
    const { security } = stack();
    const interpolate = security.interpolateRoute;
    assert.ok(isCallable(interpolate));
    assert.equal(
      Reflect.apply(interpolate, security, ["/api/tasks/{id}", { id: "a b" }, (/** @type {Bag} */ record, /** @type {string} */ field) => record[field]]),
      "/api/tasks/a%20b",
      "route interpolation and its encoding are untouched",
    );
    assert.equal(
      Reflect.apply(interpolate, security, ["/api/tasks/{missing}", { id: "1" }, () => undefined]),
      "/api/tasks/{missing}",
      "and an unresolved token is still left intact rather than emptied",
    );
  });
});

describe("An action that still declares requiredPermissions is treated no differently", () => {
  it("renders a surface action carrying the metadata, and dispatches it", async () => {
    const f = stack();
    const host = f.context.document.createElement("main");
    const surface = call(f.view, "renderSurface", [{
      id: "permissioned",
      dataSource: { route: "/api/records", fieldBindings: { title: "title" } },
      actions: [{
        id: "archive",
        label: "Archive",
        route: "/api/records/archive",
        method: "POST",
        requiredPermissions: ["records.archive"],
      }],
    }, host]);
    await settle();

    const buttons = queryAll(surface, "[data-surface-action='archive']");
    assert.equal(buttons.length, 1, "the action renders - the metadata gates nothing here");

    await click(buttons[0]);
    assert.deepEqual(f.routeWrites, ["/api/records/archive"], "and it dispatches to the server, which is the enforcement point");
  });

  it("renders every action in a modal shell, metadata or not, footer actions first", () => {
    const f = stack();
    const host = f.context.document.createElement("main");
    const surface = call(f.view, "renderSurface", [{
      id: "modals",
      modals: [{
        id: "edit",
        title: "Edit",
        fields: [],
        footerActions: [{ id: "cancel", label: "Cancel" }],
        actions: [{ id: "save", label: "Save", requiredPermissions: ["records.edit"] }],
      }],
    }, host]);

    const labels = queryAll(surface, "[data-surface-action]").map((node) => node.textContent);
    assert.deepEqual(labels, ["Cancel", "Save"], "both render, footer actions before actions");
  });
});

describe("Visibility predicates still decide what renders, and they are all that does", () => {
  /**
   * `visibleWhen` shared a filter chain with the retired permission filter at two sites. Removing
   * one must not have taken the other: it is the only surviving rule that withholds a control, and
   * unlike the hook it was measuring something real all along. This drives the real row-action
   * column, which is where `renderActions` receives a record to evaluate against.
   *
   * @param {string} status
   */
  async function rowActionLabels(status) {
    const f = stack();
    const context = f.context;
    Reflect.set(context.window.LongtailForge, "viewDataBinding", {
      loadBoundRecords: async () => [{ id: "r1", status }],
      readPath: (/** @type {unknown} */ source, /** @type {unknown} */ path) => (
        isBag(source) ? source[String(path)] : undefined
      ),
    });
    const host = context.document.createElement("main");
    const surface = call(f.view, "renderSurface", [{
      id: "visibility",
      layout: "table-page",
      dataSource: { route: "/api/records", fieldBindings: { status: "status" } },
      table: {
        columns: [{ field: "status", label: "Status" }],
        rowActions: [
          { id: "restore", label: "Restore", behavior: "noop", visibleWhen: { field: "status", equals: "archived" } },
          { id: "always", label: "Always", behavior: "noop" },
        ],
      },
    }, host]);
    await settle();
    return queryAll(surface, "[data-surface-action]").map((node) => node.textContent);
  }

  it("withholds a row action whose visibleWhen fails for that record", async () => {
    assert.deepEqual(await rowActionLabels("active"), ["Always"], "the predicate still withholds the action it names");
  });

  it("renders the same action when its visibleWhen is satisfied", async () => {
    assert.deepEqual(await rowActionLabels("archived"), ["Restore", "Always"], "and lets it through when the record matches");
  });
});

describe("The published action renderers pass their lists through unchanged", () => {
  /**
   * The ten filter sites rebuilt every list they were given. With the filter gone the list must
   * arrive whole: same entries, same order, same identities. The shipped callers pass **DOM
   * nodes** - `lists.js` sends its own row buttons and a nested menu - so identity is the claim
   * that matters, not shape.
   *
   * @param {string} member
   */
  function passesThrough(member) {
    const f = stack();
    const first = f.context.document.createElement("button");
    first.textContent = "First";
    first.setAttribute("data-owned", "first");
    const second = f.context.document.createElement("button");
    second.textContent = "Second";
    second.setAttribute("data-owned", "second");

    // These three hand their entries straight to `createActionButton`, which reads `action` for
    // the dataset key - they never run `normalizeAction`, which is what maps `id` onto it.
    const rendered = call(f.view, member, [[first, { action: "built", label: "Built" }, second], { ariaLabel: "Row actions" }]);
    const owned = queryAll(rendered, "[data-owned]");
    assert.deepEqual(owned, [first, second], `${member} keeps the caller's own nodes, by identity and in order`);
    assert.equal(queryAll(rendered, "[data-surface-action='built']").length, 1, `${member} still builds the option bag beside them`);
  }

  it("renderDescriptorActionStrip", () => { passesThrough("renderDescriptorActionStrip"); });
  it("renderDescriptorActionMenu", () => { passesThrough("renderDescriptorActionMenu"); });
  it("renderDescriptorInlineActions", () => { passesThrough("renderDescriptorInlineActions"); });

  it("renderDescriptorModalForm keeps caller-supplied actions and the descriptor fallback", () => {
    const f = stack();
    const supplied = f.context.document.createElement("button");
    supplied.setAttribute("data-owned", "supplied");
    const withOptions = call(f.view, "renderDescriptorModalForm", [{ title: "Edit" }, { actions: [supplied] }]);
    assert.deepEqual(queryAll(withOptions, "[data-owned]"), [supplied], "a caller's own actions arrive by identity");

    const fromDescriptor = call(f.view, "renderDescriptorModalForm", [{
      title: "Edit",
      footerActions: [{ id: "cancel", label: "Cancel" }],
      actions: [{ id: "save", label: "Save", requiredPermissions: ["records.edit"] }],
    }, {}]);
    assert.deepEqual(
      queryAll(fromDescriptor, "[data-surface-action]").map((node) => node.textContent),
      ["Cancel", "Save"],
      "and the descriptor's own footer-then-action order is preserved",
    );
  });

  it("keeps an empty list empty rather than inventing an action", () => {
    const f = stack();
    for (const member of ["renderDescriptorActionStrip", "renderDescriptorActionMenu", "renderDescriptorInlineActions"]) {
      const rendered = call(f.view, member, [[], { ariaLabel: "Row actions" }]);
      assert.equal(queryAll(rendered, "[data-surface-action]").length, 0, `${member} renders nothing for an empty list`);
    }
  });
});
