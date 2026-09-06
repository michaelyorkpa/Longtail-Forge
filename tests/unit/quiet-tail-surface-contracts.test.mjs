import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/**
 * The seven quiet-tail surfaces `0.33.33.38.2.3.2` declared.
 *
 * They share an owner and a batch, not a shape: one is a scalar, one a function, one a frozen
 * record of two, one a frozen record of three, one an unfrozen record of one, one a frozen
 * controller with a promise lifetime, and one a frozen preference object. These assertions are
 * organised by surface for that reason, and each exercises what its own members really do.
 */

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const navigation = read("public/js/navigation.js");
const bootstrap = read("public/js/shared/app-shell-bootstrap.js");
const dashboardEntry = read("public/js/dashboard.entry.js");
const notifications = read("public/js/notifications.js");
const quickActionRefresh = read("public/js/shared/quick-action-refresh.js");
const recovery = read("public/js/shared/browser-recovery.js");
const reporting = read("public/js/reporting.js");
const workbench = read("public/js/workbench.js");
const contracts = read("src/types/browser-contracts.d.ts");

/** @param {string} source @param {string} opener @param {string} [pad] */
function slice(source, opener, pad = "  ") {
  const start = source.indexOf(pad + opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf("\n" + pad + "}\n", start);
  assert.notEqual(end, -1, opener + " must terminate");
  return source.slice(start, end + pad.length + 2);
}

/** @param {string} interfaceName */
function interfaceBody(interfaceName) {
  const at = contracts.indexOf("export interface " + interfaceName + " ");
  assert.notEqual(at, -1, interfaceName + " must exist");
  return contracts.slice(at, contracts.indexOf("\n}\n", at));
}

/** @param {string} member */
function namespaceMember(member) {
  const at = contracts.indexOf("export interface LongtailForgeBrowserNamespace {");
  const body = contracts.slice(at, contracts.indexOf("\n}\n", at));
  const found = body.match(new RegExp("^  " + member + "\\?: .*$", "m"));
  assert.ok(found, member + " must be declared on the namespace");
  return found[0];
}

describe("userPreferences carries the one scalar its adapter already validated", () => {
  /** The adapter's own reader, then the publication expression, then the consumer's choice. */
  /** @param {unknown} bootstrapBody */
  function preferenceChain(bootstrapBody) {
    const normalize = new Function([
      slice(bootstrap, "function asRecord(value) {"),
      slice(bootstrap, "function stringValue(value) {"),
      slice(bootstrap, "function stringArray(value) {"),
      slice(bootstrap, "function objectArray(value) {"),
      slice(bootstrap, "function searchTarget(value) {"),
      slice(bootstrap, "function normalize(value) {"),
      "return normalize;",
    ].join("\n"))();
    const shell = normalize(bootstrapBody);

    // The publication literal, lifted rather than retyped.
    const at = navigation.indexOf("      window.LongtailForge.userPreferences = Object.freeze({");
    assert.notEqual(at, -1, "the publication must exist");
    const closer = navigation.indexOf("\n      });", at);
    assert.notEqual(closer, -1, "the publication must terminate");
    const literal = navigation.slice(at + "      window.LongtailForge.userPreferences = ".length,
      closer + "\n      })".length);
    const published = new Function("shell", "return " + literal.trim().replace(/;$/, "") + ";")(shell);

    // The consumer's own choice of view, lifted from the dashboard entry.
    const route = slice(dashboardEntry, "function dashboardPanelRoute(panel = {}) {", "");
    const chooseView = new Function("namespace", "window", [
      "const preferredOf = () => {",
      route.slice(route.indexOf("  const preferred ="), route.indexOf("  const range =")),
      "  return view;",
      "};",
      "return preferredOf;",
    ].join("\n"))({ userPreferences: published }, { matchMedia: () => ({ matches: false }) });

    return { published, view: chooseView() };
  }

  /** @param {unknown} preferredCalendarView */
  const body = (preferredCalendarView) => ({
    user: { user_id: "u1", username: "ada", preferredCalendarView },
    enabledModules: [], navigation: [], quickActions: [], searchTargets: [], viewSurfaces: [],
    workspaceContext: {},
  });

  it("carries a recognised view through the adapter to the consumer", () => {
    for (const view of ["day", "week", "month"]) {
      const chain = preferenceChain(body(view));
      assert.equal(chain.published.preferredCalendarView, view);
      assert.equal(chain.view, view, view + " is the view the consumer uses");
    }
  });

  it("keeps an unrecognised view a string at this boundary, and lets the consumer fall back", () => {
    // The point of the string contract: nothing here closes the vocabulary, and the consumer's
    // own membership test is what refuses an unknown view.
    const chain = preferenceChain(body("fortnight"));
    assert.equal(chain.published.preferredCalendarView, "fortnight", "the boundary keeps the string");
    assert.equal(chain.view, "month", "and the consumer falls back to its own default");
  });

  it("answers null for anything that is not a non-empty string", () => {
    for (const value of [null, undefined, "", 7, {}, [], true]) {
      const chain = preferenceChain(body(value));
      assert.equal(chain.published.preferredCalendarView, null, JSON.stringify(value) + " is no preference");
      assert.equal(chain.view, "month", "and the consumer keeps its default");
    }
  });

  it("answers null when the shell carries no user at all", () => {
    const chain = preferenceChain({ enabledModules: [], navigation: [], quickActions: [],
      searchTargets: [], viewSurfaces: [], workspaceContext: {} });
    assert.equal(chain.published.preferredCalendarView, null);
  });

  it("uses the narrow viewport default when there is no preference", () => {
    const route = slice(dashboardEntry, "function dashboardPanelRoute(panel = {}) {", "");
    assert.match(route, /window\.matchMedia\?\.\("\(max-width: 700px\)"\)\?\.matches \? "day" : "month"/,
      "the established default is unchanged");
  });

  it("declares the one member as a string or null, and nothing narrower", () => {
    const declared = interfaceBody("BrowserUserPreferences");
    assert.match(declared, /readonly preferredCalendarView: string \| null;/);
    assert.equal([...declared.matchAll(/^ {2}(readonly )?[a-zA-Z]+:/gm)].length, 1, "one member");
    assert.ok(!/"day"|"week"|"month"/.test(declared), "no closed vocabulary is claimed");
  });

  it("keeps the namespace member optional, because it is absent until bootstrap resolves", () => {
    assert.equal(namespaceMember("userPreferences"), "  userPreferences?: BrowserUserPreferences;");
    const at = navigation.indexOf("window.LongtailForge.userPreferences = ");
    const loader = navigation.lastIndexOf("const shell = bootstrapAdapter.normalize(await response.json());", at);
    assert.notEqual(loader, -1, "the publication must still follow the bootstrap response");
    assert.ok(loader < at, "so nothing publishes it earlier");
  });
});

describe("navigationIntent keeps its guard and promise lifetimes", () => {
  /** The shipped controller, over a fake window and document. */
  function controller() {
    /** @type {{ assigned: string[], clicks: ((event: unknown) => void)[] }} */
    const host = { assigned: [], clicks: [] };
    const fakeWindow = {
      URL,
      location: { origin: "https://app.example", href: "https://app.example/now",
        /** @param {string} href */ assign: (href) => host.assigned.push(href) },
      navigation: undefined,
    };
    const fakeDocument = {
      baseURI: "https://app.example/",
      /** @param {string} name @param {(event: unknown) => void} handler */
      addEventListener: (name, handler) => {
        if (name === "click") {
          host.clicks.push(handler);
        }
      },
    };
    const build = new Function("window", "document", [
      'const SESSION_LOGIN_PATH = "/login.html";',
      slice(navigation, "function createNavigationIntentController() {"),
      "return createNavigationIntentController();",
    ].join("\n"));
    return { ...host, intent: build(fakeWindow, fakeDocument) };
  }

  it("continues immediately when no guard is registered", async () => {
    const host = controller();
    assert.equal(host.intent.shouldHold({ href: "https://app.example/next" }), false);
    assert.equal(await host.intent.request({ continue: () => "went" }), "went",
      "and hands the caller its own result back, which is why the contract resolves unknown");
  });

  it("holds, runs beforeContinue, then commits, in that order", async () => {
    const host = controller();
    /** @type {string[]} */
    const order = [];
    host.intent.registerExitGuard({
      shouldHold: () => true,
      beforeContinue: async () => { order.push("beforeContinue"); },
      onCommitted: () => order.push("onCommitted"),
    });
    const result = await host.intent.request({ continue: () => { order.push("continue"); return 42; } });
    assert.deepEqual(order, ["beforeContinue", "continue", "onCommitted"]);
    assert.equal(result, 42);
  });

  it("commits before continuing when the intent says so", async () => {
    const host = controller();
    /** @type {string[]} */
    const order = [];
    host.intent.registerExitGuard({
      shouldHold: () => true,
      beforeContinue: async () => { order.push("beforeContinue"); },
      onCommitted: () => order.push("onCommitted"),
    });
    await host.intent.request({ commitBeforeContinue: true, continue: () => { order.push("continue"); } });
    assert.deepEqual(order, ["beforeContinue", "onCommitted", "continue"],
      "the workspace-switch and logout ordering");
  });

  it("reports a continue failure to the guard and still rejects", async () => {
    const host = controller();
    /** @type {unknown[]} */
    const errors = [];
    host.intent.registerExitGuard({
      shouldHold: () => true,
      onContinueError: (/** @type {unknown} */ _intent, /** @type {unknown} */ error) => errors.push(error),
    });
    const boom = new Error("nope");
    await assert.rejects(host.intent.request({ continue: () => { throw boom; } }), /nope/);
    assert.deepEqual(errors, [boom], "by identity");
  });

  it("hands every caller the same pending promise while an intent is held", async () => {
    const host = controller();
    /** @type {(value?: unknown) => void} */
    let release = () => {};
    host.intent.registerExitGuard({
      shouldHold: () => true,
      beforeContinue: () => new Promise((resolve) => { release = resolve; }),
    });
    let continues = 0;
    const first = host.intent.request({ continue: () => { continues += 1; return "one"; } });
    const second = host.intent.request({ continue: () => { continues += 1; return "two"; } });
    assert.equal(first, second, "the same promise, by identity");
    release();
    assert.equal(await first, "one");
    assert.equal(continues, 1, "and only the first intent ran");
  });

  it("accepts a new intent once the held one has settled", async () => {
    const host = controller();
    host.intent.registerExitGuard({ shouldHold: () => true });
    assert.equal(await host.intent.request({ continue: () => "first" }), "first");
    assert.equal(await host.intent.request({ continue: () => "second" }), "second",
      "the pending slot is cleared in the finally");
  });

  it("lets a stale unregister run without disarming the guard that replaced it", () => {
    const host = controller();
    const unregisterFirst = host.intent.registerExitGuard({ shouldHold: () => true });
    host.intent.registerExitGuard({ shouldHold: () => true });
    unregisterFirst();
    assert.equal(host.intent.shouldHold({}), true, "the newer guard is still armed");
  });

  it("unregisters the guard it registered", () => {
    const host = controller();
    const unregister = host.intent.registerExitGuard({ shouldHold: () => true });
    assert.equal(host.intent.shouldHold({}), true);
    unregister();
    assert.equal(host.intent.shouldHold({}), false);
  });

  it("never holds navigation to the login path", () => {
    const host = controller();
    host.intent.registerExitGuard({ shouldHold: () => true });
    assert.equal(host.intent.shouldHold({ href: "https://app.example/login.html" }), false);
    assert.equal(host.intent.shouldHold({ href: "https://app.example/tasks.html" }), true);
  });

  it("treats a guard that throws as not holding", () => {
    const host = controller();
    host.intent.registerExitGuard({ shouldHold: () => { throw new Error("guard broke"); } });
    assert.equal(host.intent.shouldHold({}), false);
  });

  it("assigns the location for an href intent and stops holding afterwards", async () => {
    const host = controller();
    host.intent.registerExitGuard({ shouldHold: () => true });
    await host.intent.navigate("/tasks.html");
    assert.deepEqual(host.assigned, ["https://app.example/tasks.html"], "resolved against the base URI");
    assert.equal(host.intent.shouldHold({ href: "https://app.example/other" }), false,
      "committing navigation stops the guard holding a second time");
  });

  it("leaves modifier clicks, downloads, new tabs and other origins to the browser", () => {
    const clickHandler = slice(navigation, "function createNavigationIntentController() {");
    assert.match(clickHandler, /event\.button !== 0 \|\| event\.metaKey \|\| event\.ctrlKey \|\| event\.shiftKey \|\| event\.altKey/);
    assert.match(clickHandler, /link\.target === "_blank" \|\| link\.hasAttribute\("download"\)/);
    assert.match(clickHandler, /url\.origin !== window\.location\.origin \|\| url\.href === window\.location\.href/);
  });

  it("declares four members, and request is not declared to discard its result", () => {
    const declared = interfaceBody("BrowserNavigationIntent");
    assert.equal([...declared.matchAll(/^ {2}[a-zA-Z]+\(/gm)].length, 4);
    for (const member of ["navigate", "registerExitGuard", "request", "shouldHold"]) {
      assert.match(declared, new RegExp("\\n  " + member + "\\("), member + " must be declared");
    }
    assert.ok(!/Promise<void>/.test(declared), "no member claims to throw the caller's result away");
    assert.match(declared, /registerExitGuard\(guard\?: BrowserNavigationExitGuard \| null\): \(\) => void;/);
  });

  it("leaves request synchronous, so its promise identity and URL failures are unchanged", () => {
    assert.match(navigation, /\n {4}function request\(intent = \{\}\) \{/,
      "request must not become async");
  });
});

describe("the readiness, refresh and record surfaces keep their own shapes", () => {
  it("publishes notificationsPageReady as a boolean, not a promise", () => {
    assert.match(notifications, /window\.LongtailForge\.notificationsPageReady = true;/);
    assert.equal(namespaceMember("notificationsPageReady"), "  notificationsPageReady?: boolean;");
  });

  it("publishes refreshNotifications as a function resolving nothing", () => {
    assert.match(navigation, /window\.LongtailForge\.refreshNotifications = refreshNotificationCount;/);
    const body = slice(navigation, "async function refreshNotificationCount() {");
    assert.ok(!/\n {4}return [^;]/.test(body), "it returns no value");
    assert.equal(namespaceMember("refreshNotifications"), "  refreshNotifications?: () => Promise<void>;");
  });

  it("publishes quickActionRefresh with its event name and a subscribe that always answers a function", () => {
    const at = quickActionRefresh.indexOf("  namespace.quickActionRefresh = Object.freeze({");
    const published = quickActionRefresh.slice(at, quickActionRefresh.indexOf("\n  });", at));
    assert.deepEqual([...published.matchAll(/^ {4}([a-zA-Z]+)[,:]/gm)].map((m) => m[1]).sort(),
      ["eventName", "subscribe"]);

    const build = new Function("global", [
      slice(quickActionRefresh, "function normalizeValues(value) {"),
      'const EVENT_NAME = "longtailforge:quick-action-refresh";',
      slice(quickActionRefresh, "function subscribe(options = {}) {"),
      "return subscribe;",
    ].join("\n"));
    /** @type {[string, unknown][]} */
    const added = [];
    /** @type {[string, unknown][]} */
    const removed = [];
    const subscribe = build({
      /** @param {string} name @param {unknown} listener */
      addEventListener: (name, listener) => added.push([name, listener]),
      /** @param {string} name @param {unknown} listener */
      removeEventListener: (name, listener) => removed.push([name, listener]),
    });

    const unsubscribe = subscribe({ recordTypes: ["task"], onRefresh: () => {} });
    assert.equal(typeof unsubscribe, "function", "subscribing answers an unsubscribe function");
    assert.equal(added.length, 1);
    unsubscribe();
    assert.deepEqual(removed, added, "which removes the very listener it added");

    assert.throws(() => subscribe({ onRefresh: () => {} }), /record type or action id/,
      "and a subscription with no filter throws rather than answering undefined");
    assert.throws(() => subscribe({ recordTypes: ["task"] }), /callback/);

    // TypeScript accepts a value-returning function for a void-returning signature, so the
    // declaration itself is the only place this claim can be held.
    assert.match(interfaceBody("BrowserQuickActionRefresh"),
      /subscribe\(options\?: BrowserQuickActionRefreshSubscription\): \(\) => void;/);
    assert.match(interfaceBody("BrowserQuickActionRefresh"), /readonly eventName: string;/);
  });

  it("publishes recovery with three members whose promises resolve differently", () => {
    const at = recovery.indexOf("  namespace.recovery = Object.freeze({");
    const published = recovery.slice(at, recovery.indexOf("\n  });", at));
    assert.deepEqual([...published.matchAll(/^ {4}([a-zA-Z]+)[,:]/gm)].map((m) => m[1]).sort(),
      ["permissionDenied", "present", "render"]);
    assert.match(published, /permissionDenied: showPermissionDenied/, "the published name differs from the writer's");

    const declared = interfaceBody("BrowserRecovery");
    assert.match(declared, /permissionDenied\(\): Promise<void>;/);
    assert.match(declared, /render\(options\?: unknown\): Promise<HTMLElement \| null>;/);
    assert.match(declared, /present\(error\?: unknown, options\?: unknown\): Promise<HTMLElement \| null \| void>;/);
    const renderBody = slice(recovery, "function render(options = {}) {");
    assert.match(renderBody, /return Promise\.resolve\(null\);/, "null when a surface is already showing");
    assert.match(renderBody, /return main;/, "and the element it built otherwise");
  });

  it("publishes reporting unfrozen, with one member that answers nothing", () => {
    assert.match(reporting, /namespace\.reporting = \{\n {6}registerRenderer,\n {4}\};/,
      "an object literal, not Object.freeze");
    const declared = interfaceBody("BrowserReporting");
    assert.equal([...declared.matchAll(/^ {2}[a-zA-Z]+\(/gm)].length, 1);
    assert.match(declared, /registerRenderer\(rendererId\?: unknown, registration\?: unknown\): void;/);
  });

  it("keeps every one of the seven members optional on the namespace", () => {
    for (const member of ["userPreferences", "navigationIntent", "notificationsPageReady",
      "refreshNotifications", "quickActionRefresh", "recovery", "reporting"]) {
      assert.match(namespaceMember(member), /^ {2}[a-zA-Z]+\?: /, member + " stays optional");
    }
  });

  it("declares no shared quiet-tail interface and no unknown-valued catch-all", () => {
    assert.ok(!/export interface BrowserQuietTail/.test(contracts));
    for (const name of ["BrowserUserPreferences", "BrowserNavigationIntent", "BrowserQuickActionRefresh",
      "BrowserRecovery", "BrowserReporting"]) {
      assert.match(contracts, new RegExp("export interface " + name + "\\b"), name + " is its own contract");
    }
  });
});

describe("the two adopting consumers keep their behaviour", () => {
  it("reads the preference once, and still falls back exactly as before", () => {
    const route = slice(dashboardEntry, "function dashboardPanelRoute(panel = {}) {", "");
    assert.match(route, /const preferred = namespace\.userPreferences\?\.preferredCalendarView \|\| "";/,
      "optional at the root, because the surface arrives with the bootstrap");
    assert.match(route, /\["day", "week", "month"\]\.includes\(preferred\)/);
    assert.ok(!/namespace\.userPreferences\.preferredCalendarView/.test(route),
      "and never reads the member off an unchecked root");
  });

  it("reads the guard's caught error through the contract the estate already has", () => {
    const guard = workbench.slice(workbench.indexOf("navigationIntent?.registerExitGuard({"));
    const body = guard.slice(0, guard.indexOf("\n    });"));
    assert.match(body, /requireErrors\(\)\.caughtMessage\(error, "Navigation could not continue\."\)/);
    assert.ok(!/error\?\.message/.test(body), "rather than reading a property off an unchecked value");
    assert.match(body, /onCommitted\(\) \{[\s\S]*taskFocusExitCommitted = true;/, "and its ordering is unchanged");
  });
});
