import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const navigation = createProjectTextReader().readText("public/js/navigation.js");

/**
 * The app-shell chrome `0.33.33.39.33` typed, through the shipped functions.
 *
 * The intent controller now resolves a clicked link through a realm-independent element check
 * and the anchor's own `target` and `href`, and a guard that unregisters itself while it is
 * consulted fails as a `TypeError`; `isAppApiRequest` reads a request's URL as the optional
 * member access did; and the nav renderers read each wire item member by member. The drawer,
 * menu toggle and header parts run in the browser suites, which exercise every one of them.
 */

/** @typedef {Record<string, unknown>} Bag */

/** @param {unknown} value @returns {value is Bag} */
const isBag = (value) => value !== null && typeof value === "object";

/** @param {unknown} value @returns {value is (...args: unknown[]) => unknown} */
const isCallable = (value) => typeof value === "function";

/** @param {unknown} error */
const nameOf = (error) => (isBag(error) ? String(error.name) : String(error));

/** The controller, lifted as the other suites lift it, with its click listener captured. */
function controller() {
  /** @type {string[]} */
  const assigned = [];
  /** @type {((event: unknown) => void)[]} */
  const clicks = [];
  const fakeWindow = {
    URL,
    location: { origin: "https://app.example", href: "https://app.example/tasks.html", assign: (/** @type {string} */ href) => assigned.push(href) },
  };
  const fakeDocument = {
    baseURI: "https://app.example/",
    /** @param {string} name @param {(event: unknown) => void} handler */
    addEventListener: (name, handler) => { if (name === "click") clicks.push(handler); },
  };
  const build = new Function("window", "document", [
    'const SESSION_LOGIN_PATH = "/login.html";',
    extractFunctionBlock(navigation, "createNavigationIntentController"),
    "return createNavigationIntentController();",
  ].join("\n"));
  const intent = build(fakeWindow, fakeDocument);
  assert.ok(isBag(intent) && isCallable(intent.registerExitGuard) && isCallable(intent.navigate));
  const [click] = clicks;
  assert.ok(click, "the controller listens for clicks");
  return { assigned, click, intent };
}

/**
 * A click on `target`, recording whether the controller took it over.
 * @param {(event: unknown) => void} click
 * @param {unknown} target
 */
function clickOn(click, target) {
  const taken = { prevented: false };
  click({
    target, button: 0, defaultPrevented: false, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false,
    preventDefault: () => { taken.prevented = true; },
    stopImmediatePropagation: () => {},
  });
  return taken.prevented;
}

/** An element whose `closest("a[href]")` answers `link`. @param {unknown} link */
const elementIn = (link) => ({ nodeType: 1, closest: (/** @type {string} */ selector) => (selector === "a[href]" ? link : null) });

/** @param {Bag} [overrides] */
const anchor = (overrides = {}) => ({ target: "", href: "https://app.example/dashboard.html", hasAttribute: () => false, ...overrides });

describe("the intent controller's click handler", () => {
  it("takes over a same-origin link while a guard holds, resolving href through its ToString", async () => {
    const { assigned, click, intent } = controller();
    Reflect.apply(/** @type {(...args: unknown[]) => unknown} */ (intent.registerExitGuard), intent, [{ shouldHold: () => true }]);
    assert.equal(clickOn(click, elementIn(anchor())), true);
    // An SVG anchor's `href` is an object the URL constructor converts; the template converts it the same way.
    assert.equal(clickOn(click, elementIn(anchor({ href: { toString: () => "/files.html" } }))), true);
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    assert.deepEqual(assigned, ["https://app.example/dashboard.html"],
      "the first held navigation commits, and a committing controller stops holding the second");
  });

  it("leaves non-elements, new tabs, downloads and other origins to the browser", () => {
    const { click, intent } = controller();
    Reflect.apply(/** @type {(...args: unknown[]) => unknown} */ (intent.registerExitGuard), intent, [{ shouldHold: () => true }]);
    assert.equal(clickOn(click, { nodeType: 3 }), false, "a text node has no closest");
    assert.equal(clickOn(click, null), false);
    assert.equal(clickOn(click, elementIn(null)), false, "no link");
    assert.equal(clickOn(click, elementIn(anchor({ target: "_blank" }))), false);
    assert.equal(clickOn(click, elementIn(anchor({ hasAttribute: (/** @type {string} */ name) => name === "download" }))), false);
    assert.equal(clickOn(click, elementIn(anchor({ href: "https://elsewhere.example/" }))), false);
  });

  it("still fails as a TypeError when a guard unregisters itself while it holds", async () => {
    const { intent } = controller();
    let consulted = 0;
    /** @type {unknown} */
    let unregister = null;
    unregister = Reflect.apply(/** @type {(...args: unknown[]) => unknown} */ (intent.registerExitGuard), intent, [{
      shouldHold: () => {
        consulted += 1;
        if (consulted === 2 && isCallable(unregister)) unregister();
        return true;
      },
    }]);
    const pending = Reflect.apply(/** @type {(...args: unknown[]) => unknown} */ (intent.navigate), intent, ["/tasks.html"]);
    await assert.rejects(async () => { await pending; }, (error) => nameOf(error) === "TypeError");
  });
});

describe("isAppApiRequest reads a request's URL as the member access did", () => {
  const isAppApiRequest = new Function("window", [
    extractFunctionBlock(navigation, "isAppApiRequest"),
    "return isAppApiRequest;",
  ].join("\n"))({ URL, location: { origin: "https://app.example", href: "https://app.example/tasks.html" } });

  it("answers for strings, requests and anything with a url", () => {
    assert.ok(isCallable(isAppApiRequest));
    assert.equal(isAppApiRequest("/api/tasks"), true);
    assert.equal(isAppApiRequest({ url: "https://app.example/api/notes" }), true);
    assert.equal(isAppApiRequest({ url: { toString: () => "/api/files" } }), true, "the URL constructor's ToString");
    assert.equal(isAppApiRequest("/tasks.html"), false);
    assert.equal(isAppApiRequest("https://elsewhere.example/api/x"), false);
    assert.equal(isAppApiRequest(new URL("https://app.example/api/x")), false, "a URL has no url member");
    assert.equal(isAppApiRequest(null), false);
    assert.equal(isAppApiRequest({ url: Symbol("u") }), false, "a failed conversion is still caught");
  });
});

describe("the nav renderers read each wire item member by member", () => {
  function renderers() {
    const context = createFakeBrowserContext();
    const names = ["requiredMember", "requiredCall", "createNavItem", "createNavMenu", "createNavLink", "createLogoutButton"];
    vm.runInNewContext([
      "function logOut() {}",
      ...names.map((name) => extractFunctionBlock(navigation, name)),
      `this.navigation = { ${names.join(", ")} };`,
    ].join("\n"), context);
    const api = context.navigation;
    assert.ok(isBag(api) && isCallable(api.createNavItem));
    /** @param {unknown} item @param {string} currentPage */
    return (item, currentPage) => Reflect.apply(/** @type {(...args: unknown[]) => unknown} */ (api.createNavItem), api, [item, currentPage]);
  }

  /** @param {Bag} fields */
  function counted(fields) {
    /** @type {Record<string, number>} */
    const reads = {};
    /** @type {Bag} */
    const item = {};
    for (const [key, value] of Object.entries(fields)) {
      Object.defineProperty(item, key, { enumerable: true, get() { reads[key] = (reads[key] || 0) + 1; return value; } });
    }
    return { item, reads };
  }

  it("builds a link and a menu, reading each member as often as before", () => {
    const createNavItem = renderers();
    const link = counted({ label: "Tasks", href: "tasks.html" });
    const built = createNavItem(link.item, "tasks.html");
    assert.ok(isBag(built));
    assert.equal(built.textContent, "Tasks");
    assert.equal(isCallable(built.getAttribute) && Reflect.apply(built.getAttribute, built, ["aria-current"]), "page");
    assert.deepEqual(link.reads, { href: 3, label: 1 }, "a link has no items getter to count");

    const menu = counted({ label: "Settings", items: [{ label: "User", href: "user-settings.html" }] });
    const builtMenu = createNavItem(menu.item, "dashboard.html");
    assert.ok(isBag(builtMenu));
    assert.equal(builtMenu.tagName, "DETAILS");
    assert.deepEqual(menu.reads, { items: 2, label: 3 });
    assert.ok(isCallable(builtMenu.querySelector) && Reflect.apply(builtMenu.querySelector, builtMenu, [".nav-logout"]),
      "the Settings menu still carries the logout button");
  });

  it("still fails as a TypeError for a missing item or an item list without forEach", () => {
    const createNavItem = renderers();
    for (const item of [null, { label: "Broken", items: "ab" }, { label: "Broken", items: { forEach: 5 } }]) {
      assert.throws(() => createNavItem(item, "x"), (error) => nameOf(error) === "TypeError");
    }
  });
});
