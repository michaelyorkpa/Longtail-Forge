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
  "public/js/shared/view-renderer.js",
].map((path) => ({ filename: String(path.split("/").pop()), text: readText(path) }));

/**
 * What the renderer's surface slot actually holds, and what each operation requires of it.
 *
 * `0.33.33.39.21` settled the question `0.33.33.39.9` escalated. `renderSurface` creates the
 * element, stores it in `state.surface`, renders through it, and installs `refresh`, `openModal`
 * and `viewState` only afterwards - so for most of this file's work the slot holds a surface
 * **under construction**, not the completed `BrowserViewSurfaceElement` the factory returns.
 *
 * The policy: the completed return contract stays truthful and keeps being earned, while each
 * helper requires only the capability its own operation uses. A behaviour that needs no refresh
 * is not refused because refresh is absent; a modal needs somewhere to append and nothing else;
 * and a route action - whose normal completion **includes** the reload - establishes that it can
 * refresh before it sends the write.
 *
 * Every case below runs the real four-file stack under the DOM double and reaches the renderer
 * through published entry points only. Nothing is lifted, so each capability check is exercised
 * exactly where a browser reaches it. The partial slot is reproduced by writing the surface slot
 * back to a capability-less stand-in, which is the window `renderSurface` itself passes through.
 */

/** @typedef {Record<string, unknown>} Bag */

/** @param {unknown} value @returns {value is Bag} */
const isBag = (value) => value !== null && typeof value === "object";

/** @param {unknown} value @returns {value is (...args: unknown[]) => unknown} */
const isCallable = (value) => typeof value === "function";

/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));

/**
 * A thrown value read across the sandbox boundary.
 *
 * The renderer builds its errors inside the vm realm, so `instanceof Error` is false here however
 * ordinary the throw was. Name and message are what survive the crossing, and they are what these
 * cases are actually asserting about.
 * @param {unknown} value
 * @returns {{ name: string, message: string }}
 */
function thrown(value) {
  assert.ok(isBag(value), "a reported failure should be an object");
  return { name: String(value.name), message: String(value.message) };
}

/** A slot value that answers every read this file makes of it, and carries no capability. */
const unfinishedSurface = () => ({ querySelector: () => null, firstChild: null });

/**
 * The stack, with every namespace dependency answerable and every call recorded.
 * @param {{ records?: unknown[], routeFails?: Error }} [options]
 */
function stack({ records = [{ id: "r1", title: "One" }], routeFails } = {}) {
  /** @type {string[]} */
  const calls = [];
  /** @type {unknown[]} */
  const routeWrites = [];
  /** @type {unknown[]} */
  const optionErrors = [];
  const context = createFakeBrowserContext({
    longtailForge: {
      api: {
        getJson: async () => ({}),
        postJson: async () => ({}),
        patchJson: async () => ({}),
        putJson: async () => ({}),
        deleteJson: async () => ({}),
      },
      viewActionSecurity: {
        confirmDescriptorAction: async () => true,
        runRouteAction: async (/** @type {unknown} */ action) => {
          calls.push("runRouteAction");
          routeWrites.push(action);
          if (routeFails) {
            throw routeFails;
          }
          return {};
        },
      },
      viewDataBinding: {
        loadBoundRecords: async () => {
          calls.push("loadBoundRecords");
          return records;
        },
        readPath: (/** @type {unknown} */ source, /** @type {unknown} */ path) => (
          isBag(source) ? source[String(path)] : undefined
        ),
      },
      viewSearchOptions: {
        setFieldOptions: () => {},
        setFieldOptionsError: (/** @type {unknown} */ _control, /** @type {unknown} */ message) => {
          optionErrors.push(message);
        },
        mountSearchOptions: () => {},
      },
    },
  });
  for (const { filename, text } of sources) {
    vm.runInNewContext(text, context, { filename });
  }
  const view = context.window.LongtailForge?.view;
  assert.ok(view, "the four-file stack should publish LongtailForge.view");
  return { calls, context, optionErrors, routeWrites, view: /** @type {Bag} */ (view) };
}

/**
 * @param {{ context: Bag, view: Bag }} harness
 * @param {unknown} descriptor
 */
function render(harness, descriptor) {
  const renderSurface = harness.view.renderSurface;
  assert.ok(isCallable(renderSurface), "the renderer should publish renderSurface");
  const document = /** @type {Bag} */ (harness.context.document);
  const host = Reflect.apply(/** @type {never} */ (document.createElement), document, ["main"]);
  const surface = Reflect.apply(renderSurface, harness.view, [descriptor, host]);
  assert.ok(isBag(surface), "renderSurface should return an element");
  return { host: /** @type {Bag} */ (host), state: /** @type {Bag} */ (surface.viewState), surface };
}

/** @param {unknown} node @param {string} selector @returns {Bag[]} */
function queryAll(node, selector) {
  assert.ok(isBag(node), "a rendered node should be a record");
  const querySelectorAll = node.querySelectorAll;
  assert.ok(isCallable(querySelectorAll), "a rendered node should expose querySelectorAll");
  return /** @type {Bag[]} */ (Reflect.apply(querySelectorAll, node, [selector]));
}

/** The one rendered control that dispatches a named action. @param {unknown} root @param {string} name */
function actionButton(root, name) {
  const matches = queryAll(root, `[data-surface-action="${name}"]`);
  assert.equal(matches.length, 1, `the surface should render exactly one control for "${name}"`);
  return matches[0];
}

/** @param {Bag} node */
async function click(node) {
  const fn = node.click;
  assert.ok(isCallable(fn), "an action control should be clickable");
  await Reflect.apply(fn, node, []);
}

/** Let the surface's own initial load settle. */
const settle = () => new Promise((resolve) => { setTimeout(resolve, 0); });

/** The published data source every bound descriptor below shares. */
const boundSource = { route: "/api/records", fieldBindings: { title: "title" } };

/** @param {boolean} bound */
const routeDescriptor = (bound) => ({
  id: "surface",
  ...(bound ? { dataSource: boundSource } : {}),
  actions: [{ id: "archive", label: "Archive", route: "/api/records/archive", method: "POST" }],
});

/** @param {string} behavior */
const behaviorDescriptor = (behavior, extra = {}) => ({
  id: "surface",
  actions: [{ id: "note", label: "Note", behavior }],
  ...extra,
});

describe("A completed surface carries its published channels, bound or not", () => {
  it("installs all three channels on a bound surface and loads through its data source", async () => {
    const f = stack();
    const { host, state, surface } = render(f, { id: "bound", dataSource: boundSource });

    assert.equal(typeof surface.refresh, "function");
    assert.equal(typeof surface.openModal, "function");
    assert.ok(isBag(surface.viewState), "the completed surface publishes its state");
    assert.deepEqual(host.children, [surface], "and is appended to the host it was given");

    await settle();
    assert.deepEqual(f.calls.filter((name) => name === "loadBoundRecords"), ["loadBoundRecords"]);
    assert.deepEqual(plain(state.records), [{ id: "r1", title: "One" }]);
    assert.equal(state.loading, false);
  });

  it("installs all three channels on an unbound surface, which loads nothing", async () => {
    const f = stack();
    const { state, surface } = render(f, { id: "unbound" });

    assert.equal(typeof surface.refresh, "function");
    assert.equal(typeof surface.openModal, "function");
    assert.ok(isBag(surface.viewState), "an unbound surface publishes its state too");

    await settle();
    assert.equal(f.calls.includes("loadBoundRecords"), false, "there is no data source to load");
    assert.equal(state.loading, false, "and it never enters the loading state");
    assert.deepEqual(plain(state.records), []);
  });

  it("keeps the three channels off the element's own enumerable shape", () => {
    const f = stack();
    const { surface } = render(f, { id: "channels" });
    for (const channel of ["refresh", "openModal", "viewState"]) {
      assert.ok(channel in surface, `a completed surface answers ${channel}`);
      assert.equal(Object.keys(surface).includes(channel), false, `${channel} stays non-enumerable`);
    }
  });
});

describe("A partial context runs a behaviour that needs no missing capability", () => {
  it("runs the handler with refresh absent, and records no failure", async () => {
    const f = stack();
    /** @type {Bag[]} */
    const handled = [];
    Reflect.apply(/** @type {never} */ (f.view.registerBehavior), f.view, [
      "surface.note",
      async (/** @type {Bag} */ ctx) => { handled.push(ctx); },
    ]);
    const { state, surface } = render(f, behaviorDescriptor("surface.note"));
    state.surface = unfinishedSurface();

    await click(actionButton(surface, "surface.note"));

    assert.equal(handled.length, 1, "a behaviour needing no refresh is not refused for its absence");
    assert.equal(handled[0].refresh, undefined, "and is handed the absent capability as absent");
    assert.equal(state.actionError, null, "with nothing recorded as a failure");
  });

  it("hands a behaviour the surface's own refresh once construction has finished", async () => {
    const f = stack();
    /** @type {Bag[]} */
    const handled = [];
    Reflect.apply(/** @type {never} */ (f.view.registerBehavior), f.view, [
      "surface.note",
      async (/** @type {Bag} */ ctx) => { handled.push(ctx); },
    ]);
    const { surface } = render(f, behaviorDescriptor("surface.note"));

    await click(actionButton(surface, "surface.note"));
    assert.equal(handled[0].refresh, surface.refresh, "the finished surface passes its own channel through");
  });
});

describe("An operation that requires a capability establishes it before its write", () => {
  it("refuses a route action before anything is sent when the surface cannot refresh", async () => {
    const f = stack();
    const { state, surface } = render(f, routeDescriptor(true));
    await settle();
    f.calls.length = 0;
    state.surface = unfinishedSurface();

    await click(actionButton(surface, "archive"));

    assert.deepEqual(f.routeWrites, [], "nothing is sent when the reload that completes it cannot run");
    // `0.33.33.39.22` retired the two permission hooks, so nothing is consulted before the write
    // at all. The refusal is still a capability report rather than a denial - now because there
    // is no gate left to deny, which the message below is what distinguishes it.
    assert.deepEqual(f.calls, [], "the action security module is not consulted before the refusal");
    const error = thrown(state.actionError);
    assert.equal(error.name, "Error", "the failure travels the existing action-error path");
    assert.match(error.message, /refresh is unavailable/);
    assert.match(error.message, /has not finished initialising/);
  });

  it("sends a route action when the surface can refresh", async () => {
    const f = stack();
    const { state, surface } = render(f, routeDescriptor(true));
    await settle();
    f.calls.length = 0;

    await click(actionButton(surface, "archive"));
    await settle();

    assert.equal(f.routeWrites.length, 1, "the write is sent");
    assert.deepEqual(f.calls.filter((name) => name === "loadBoundRecords"), ["loadBoundRecords"], "and the reload follows it");
    assert.equal(state.actionError, null, "with no failure recorded");
  });

  it("opens a modal on a surface that cannot refresh, because a modal refreshes nothing", () => {
    const f = stack();
    const { state, surface } = render(f, {
      id: "modal-surface",
      modals: [{ id: "edit", title: "Edit", fields: [{ field: "title", type: "text", label: "Title" }] }],
    });
    state.surface = unfinishedSurface();

    const openModal = surface.openModal;
    assert.ok(isCallable(openModal));
    const dialog = Reflect.apply(openModal, surface, ["edit"]);

    assert.ok(isBag(dialog), "the modal opens with no refresh anywhere in sight");
    assert.deepEqual(queryAll(f.context.document.body, "dialog"), [dialog], "and is appended to the document body");
  });

  it("reports a described capability failure when nothing can host a modal", () => {
    const f = stack();
    const { state, surface } = render(f, {
      id: "hostless",
      modals: [{ id: "edit", title: "Edit", fields: [] }],
    });
    state.surface = unfinishedSurface();

    const window = /** @type {Bag} */ (f.context.window);
    const document = window.document;
    try {
      window.document = undefined;
      assert.throws(
        () => Reflect.apply(/** @type {never} */ (surface.openModal), surface, ["edit"]),
        /modals require a host that can append/,
        "a missing host is a described capability failure, not a silent success",
      );
    } finally {
      window.document = document;
    }
  });
});

describe("A write that succeeds and a reload that fails stay distinguishable", () => {
  it("sends the write exactly once and keeps the reload's failure", async () => {
    const f = stack();
    const { state, surface } = render(f, routeDescriptor(true));
    await settle();
    f.calls.length = 0;

    const reloadFailure = new Error("Reload failed.");
    let refreshes = 0;
    state.surface = {
      ...unfinishedSurface(),
      refresh: async () => { refreshes += 1; throw reloadFailure; },
    };

    await click(actionButton(surface, "archive"));

    assert.equal(f.routeWrites.length, 1, "the write is sent once");
    assert.equal(refreshes, 1, "the reload is attempted once");
    assert.equal(state.actionError, reloadFailure, "and the reload's failure is what is reported");
    assert.deepEqual(f.calls.filter((name) => name === "runRouteAction"), ["runRouteAction"], "the write is never replayed");
  });

  it("calls refresh on the surface itself, not on a copy of it", async () => {
    const f = stack();
    const { state, surface } = render(f, routeDescriptor(true));
    await settle();

    /** @type {unknown[]} */
    const receivers = [];
    const slot = {
      ...unfinishedSurface(),
      refresh() { receivers.push(this); },
    };
    state.surface = slot;

    await click(actionButton(surface, "archive"));

    assert.deepEqual(receivers, [slot], "the surface stays its own receiver across the capability check");
    assert.equal(state.actionError, null);
  });
});

describe("Module-owned content survives an action the framework does not own", () => {
  it("leaves an unbound surface's body untouched after a behaviour runs", async () => {
    const f = stack();
    Reflect.apply(/** @type {never} */ (f.view.registerBehavior), f.view, ["surface.note", async () => {}]);
    const { state, surface } = render(f, behaviorDescriptor("surface.note"));
    const body = /** @type {Bag} */ (state.body);
    const mounted = f.context.document.createElement("div");
    mounted.setAttribute("data-module-owned", "yes");
    Reflect.apply(/** @type {never} */ (body.appendChild), body, [mounted]);

    await click(actionButton(surface, "surface.note"));

    assert.equal(state.actionError, null);
    assert.deepEqual(
      queryAll(body, "[data-module-owned]"),
      [mounted],
      "with no data source the module owns the body, so the framework must not render over it",
    );
  });

  it("re-renders a bound surface, whose data the framework does own", async () => {
    const f = stack();
    Reflect.apply(/** @type {never} */ (f.view.registerBehavior), f.view, ["surface.note", async () => {}]);
    const { state, surface } = render(f, behaviorDescriptor("surface.note", { dataSource: boundSource }));
    await settle();
    const body = /** @type {Bag} */ (state.body);
    const stale = f.context.document.createElement("div");
    stale.setAttribute("data-module-owned", "yes");
    Reflect.apply(/** @type {never} */ (body.appendChild), body, [stale]);

    await click(actionButton(surface, "surface.note"));

    assert.equal(state.actionError, null);
    assert.deepEqual(
      queryAll(body, "[data-module-owned]"),
      [],
      "the framework owns a bound surface's body and re-renders it, exactly as before",
    );
  });

  it("does not render over a module-owned body when a route action fails its reload", async () => {
    const f = stack();
    const { state, surface } = render(f, routeDescriptor(false));
    const body = /** @type {Bag} */ (state.body);
    const mounted = f.context.document.createElement("div");
    mounted.setAttribute("data-module-owned", "yes");
    Reflect.apply(/** @type {never} */ (body.appendChild), body, [mounted]);
    state.surface = unfinishedSurface();

    await click(actionButton(surface, "archive"));

    assert.match(thrown(state.actionError).message, /refresh is unavailable/, "the refused action is still reported");
    assert.deepEqual(f.routeWrites, [], "and still sent nothing");
    assert.deepEqual(
      queryAll(body, "[data-module-owned]"),
      [mounted],
      "an unbound surface's module-owned body survives the failure report",
    );
  });
});

describe("A mount failure shows the message it was handed", () => {
  /**
   * `0.33.33.39.21` replaced three copies of `error?.message ||` with one reader. These are the
   * values a `catch` really hands over, and each answers exactly what the expression answered.
   * The `String` is the coercion the dataset write and the `text` option already performed.
   *
   * @param {unknown} thrownValue
   */
  async function mountFailure(thrownValue) {
    const f = stack();
    Reflect.apply(/** @type {never} */ (f.view.registerBehavior), f.view, [
      "surface.options",
      () => { throw thrownValue; },
    ]);
    const { state, surface } = render(f, { id: "options", dataSource: boundSource });
    await settle();
    const control = f.context.document.createElement("select");
    /** @type {unknown[]} */ (state.pendingMounts).push({
      region: { id: "opts", behavior: "surface.options" },
      mountType: "fieldOptions",
      control,
    });
    f.optionErrors.length = 0;
    await Reflect.apply(/** @type {never} */ (surface.refresh), surface, []);
    return f.optionErrors;
  }

  it("shows a thrown record's own message", async () => {
    assert.deepEqual(await mountFailure(new Error("Upstream refused.")), ["Upstream refused."]);
  });

  it("falls back for a thrown value that carries no message", async () => {
    assert.deepEqual(await mountFailure("Upstream refused."), ["Options could not be loaded."]);
    assert.deepEqual(await mountFailure(404), ["Options could not be loaded."]);
    assert.deepEqual(await mountFailure(null), ["Options could not be loaded."]);
    assert.deepEqual(await mountFailure({ message: "" }), ["Options could not be loaded."]);
  });

  it("shows a truthy non-string message as its own digits, which is what reached the page before", async () => {
    assert.deepEqual(await mountFailure({ message: 404 }), ["404"]);
  });
});

describe("A region mount requires the container it appends into", () => {
  it("reports a described failure when a queued region mount has no container", async () => {
    const f = stack();
    Reflect.apply(/** @type {never} */ (f.view.registerBehavior), f.view, ["surface.note", async () => {}]);
    const { state, surface } = render(f, behaviorDescriptor("surface.note", { dataSource: boundSource }));
    await settle();
    // A module reaches this queue through the surface's published state, so a mount missing the
    // element it appends into is reachable - and used to fail as a native property read.
    /** @type {unknown[]} */ (state.pendingMounts).push({ region: { id: "orphan", behavior: "surface.absent" } });

    await click(actionButton(surface, "surface.note"));

    assert.match(thrown(state.actionError).message, /View region mounts require a container element/);
  });
});

describe("The completed return contract is earned, not asserted", () => {
  it("refuses to publish a surface whose element did not take a channel", () => {
    const f = stack();
    const namespace = /** @type {Bag} */ (/** @type {Bag} */ (f.context.window).LongtailForge);
    const real = /** @type {Bag} */ (namespace.view);
    const createElement = real.createElement;
    assert.ok(isCallable(createElement));
    // A view primitive that hands back an element refusing one channel. `renderSurface` installs
    // all three with defineProperty and then checks for them; without that check a surface would
    // be published carrying two.
    namespace.view = {
      ...real,
      createElement: (/** @type {string} */ tag, /** @type {Bag} */ options = {}) => {
        const element = Reflect.apply(createElement, real, [tag, options]);
        const className = options.className;
        const isSurface = Array.isArray(className) && className.includes("view-renderer-surface");
        if (!isSurface || !isBag(element)) {
          return element;
        }
        return new Proxy(element, {
          defineProperty: (target, property, descriptor) => (
            property === "viewState" ? true : Reflect.defineProperty(target, property, descriptor)
          ),
        });
      },
    };

    assert.throws(
      () => render({ context: f.context, view: real }, { id: "incomplete" }),
      /View surfaces must carry their refresh, modal, and state channels/,
    );
  });
});
