import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/footer.js");

/**
 * Values built inside the sandbox carry that realm's prototypes, so a structural comparison
 * against a literal declared out here fails on identity alone. A JSON round trip compares what
 * the values hold.
 * @param {unknown} value
 */
const plain = (value) => JSON.parse(JSON.stringify(value));

/**
 * The two channels this host hands the module registry. Restated here because the page declares
 * them inside its own IIFE, where no suite can import them.
 * @typedef {object} QuickActionHostChannels
 * @property {(detail?: unknown) => void} refresh
 * @property {(message?: unknown, options?: { isError?: unknown }) => void} setStatus
 */

/**
 * A script element as the loader built it. The shared fake stores `src` and `async` as ordinary
 * properties rather than declaring them, so the probe below names what it reads.
 * @param {unknown} node
 * @returns {{ async: boolean, src: string, tagName: string }}
 */
const asScriptElement = (node) => /** @type {{ async: boolean, src: string, tagName: string }} */ (node);

/**
 * These aim at **what this checkpoint actually changed at runtime**, which is a short list.
 *
 * Nineteen of the twenty-seven diagnostics were parameter annotations, and an annotation is
 * proved by the compiler rather than by a test. What gained real behaviour is the four contract
 * decisions - the completed fallback rect, the narrowed outside-click target, the extracted
 * script-tag promise and the two `{}`-inferring defaults - plus the coercions that now stand
 * between a stored quick action and the surfaces that render it. Three of those coercions are
 * claimed to answer exactly what the untyped page answered, and a claim like that is worth
 * holding still rather than asserting once in a comment.
 */

const LIFTED = [
  "footerRecord", "footerText", "updateFooterMetrics", "readQuickActions",
  "createQuickActionItem", "decorateQuickActionButton", "notifyQuickActionHostRefresh",
  "setQuickActionStatus", "setQuickActionDrawerOpen", "appendQuickActionScriptTag",
  "activateQuickAction",
];

/**
 * @param {object} [options]
 * @param {boolean} [options.withRect] whether the footer element reports a layout box
 * @param {unknown} [options.quickActions] what the workspace context publishes
 * @param {boolean} [options.withIcons] whether the icon surface is present
 * @param {string} [options.openThrows] the message the registry rejects with, when it should
 * @param {number} [options.innerHeight] the viewport height the page reports
 * @param {string} [options.pageSource] the footer source to lift from, for side-by-side probes
 * @param {{ bottom?: number, top?: number }} [options.rect] the layout box the footer reports
 */
function footerCase(options = {}) {
  const {
    withRect = true, quickActions = [], withIcons = false, openThrows,
    innerHeight = 900, pageSource = source, rect = {},
  } = options;
  const fakeDocument = new FakeDocument();
  const documentElement = fakeDocument.createElement("html");
  const cssProperties = documentElement.style.customProperties;

  // The page reads `documentElement` and `baseURI`, which the shared fake does not model, and
  // the footer element is only ever asked for its box. Both are given as plain shapes rather
  // than by widening the fake, which every other suite also uses.
  const document = {
    baseURI: "https://example.test/",
    body: fakeDocument.body,
    documentElement,
    /** @param {string} tagName */
    createElement: (tagName) => fakeDocument.createElement(tagName),
  };
  const footer = withRect ? { getBoundingClientRect: () => ({ bottom: 700, top: 600, ...rect }) } : {};

  /** @type {{ detail: Record<string, unknown> }[]} */
  const dispatched = [];
  /** @type {Record<string, unknown>[]} */
  const iconCalls = [];
  const location = { href: "", pathname: "/now.html", search: "?a=1" };
  /** @type {{ actionId: unknown, hostChannels: QuickActionHostChannels, params: unknown }[]} */
  const opened = [];

  const sandbox = vm.createContext({
    document,
    ...fakeDomConstructors(),
    footer,
    console: { error: () => {} },
    quickActionScriptLoads: new Map(),
    CustomEvent: class {
      /** @param {string} type @param {{ detail: Record<string, unknown> }} init */
      constructor(type, init) { this.type = type; this.detail = init?.detail; }
    },
    requireErrors: () => ({
      /** @param {unknown} value @param {string} fallback */
      caughtMessage: (value, fallback) => (value instanceof Error && value.message ? value.message : fallback),
    }),
    // Stubbed rather than lifted: this suite is about what `activateQuickAction` does with a
    // stored action, not about the loader, which has cases of its own below.
    ensureQuickActionDependencies: async () => ({
      /** @param {unknown} actionId @param {unknown} params @param {QuickActionHostChannels} hostChannels */
      open: async (actionId, params, hostChannels) => {
        if (openThrows) throw new Error(openThrows);
        opened.push({ actionId, params, hostChannels });
      },
    }),
    readQuickActionPageContext: () => ({ path: location.pathname }),
  });
  sandbox.window = {
    innerHeight,
    location,
    URL,
    /** @param {{ detail: Record<string, unknown> }} event */
    dispatchEvent: (event) => { dispatched.push(event); },
    /** @param {() => void} run */
    setTimeout: (run) => { run(); },
    LongtailForge: {
      workspaceContext: { quickActions },
      moduleActions: { list: () => [{ actionId: "tasks.add", recordType: "task" }] },
      ...(withIcons
        ? {
          icons: {
            /** @param {unknown} button @param {Record<string, unknown>} iconOptions */
            decorateButton: (button, iconOptions) => { iconCalls.push(iconOptions); return button; },
          },
        }
        : {}),
    },
  };

  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(pageSource, name), sandbox);
  return {
    api: vm.runInContext(`({ ${LIFTED.join(", ")} })`, sandbox),
    cssProperties, dispatched, document, iconCalls, location, opened,
  };
}

/**
 * A shell whose members are the elements the drawer helpers set attributes on.
 *
 * The list answers `querySelector` itself because the fake DOM's selector engine does not
 * implement `:not(:disabled)`, and widening that shared engine for one caller would be a change
 * to every suite that uses it. The stub answers what the real selector answers: the first
 * button that is not disabled.
 * @param {object} [options]
 * @param {unknown[]} [options.actions] what the list holds
 */
function drawerCase(options = {}) {
  const document = new FakeDocument();
  const actions = options.actions ?? [];
  const list = {
    /** @param {string} selector */
    querySelector: (selector) => {
      assert.equal(selector, "button:not(:disabled)");
      return actions.find((entry) => !(/** @type {{ disabled?: boolean }} */ (entry).disabled)) ?? null;
    },
  };
  const shell = {
    drawer: document.createElement("div"),
    list,
    root: document.createElement("section"),
    status: document.createElement("p"),
    toggle: document.createElement("button"),
  };
  return { document, shell };
}

describe("Footer metrics fallback rect", () => {
  /**
   * **The claim this checkpoint makes is that completing the fallback changed no number.**
   * The fallback used to carry only `top`, so `bottom` was `undefined`, failed `Number.isFinite`
   * and collapsed to `footerTop`. Naming `bottom` must answer the same thing, and the only way
   * to know is to run both shapes and compare.
   */
  it("sets the same visible offset whether or not the footer reports a layout box", () => {
    // A 900px viewport with the footer's box spanning 600 to 700 leaves 100px of it visible.
    const measured = footerCase({ withRect: true });
    measured.api.updateFooterMetrics();
    assert.equal(measured.cssProperties["--site-footer-visible-offset"], "100px");

    const fallback = footerCase({ withRect: false });
    fallback.api.updateFooterMetrics();
    // No layout box means the footer is treated as sitting at the bottom edge, so none of it
    // is visible. That was the answer before `bottom` was named and it is the answer now.
    assert.equal(fallback.cssProperties["--site-footer-visible-offset"], "0px");
  });

  /**
   * **The equivalence claim, held still rather than asserted.** A comment saying "this changed
   * no number" is worth nothing on its own, so the pre-checkpoint fallback is reconstructed from
   * this same source by patching the one literal, and both are run side by side. Patching a
   * single literal is declared here rather than hidden: the assertion below fails if the literal
   * this checkpoint wrote is not there to patch, so the probe cannot silently test nothing.
   */
  it("answers exactly what the pre-checkpoint fallback answered, at every viewport", () => {
    const pageSource = source.replace(
      "{ bottom: viewportHeight, top: viewportHeight }",
      "{ top: viewportHeight }",
    );
    assert.notEqual(pageSource, source, "the completed fallback literal must be there to patch");

    for (const innerHeight of [0, 1, 320, 900, 4000]) {
      const now = footerCase({ innerHeight, withRect: false });
      now.api.updateFooterMetrics();
      const before = footerCase({ innerHeight, pageSource, withRect: false });
      before.api.updateFooterMetrics();
      assert.equal(
        now.cssProperties["--site-footer-visible-offset"],
        before.cssProperties["--site-footer-visible-offset"],
        `viewport: ${innerHeight}`,
      );
    }
  });

  /**
   * **A footer below the fold is the ordinary state of an unscrolled page**, and its box then
   * sits past the viewport, so the subtraction goes negative before the clamp catches it. An
   * earlier version of this case used the on-screen box and proved nothing.
   */
  it("reports no visible offset for a footer entirely below the fold", () => {
    const testCase = footerCase({ rect: { bottom: 1100, top: 1000 }, withRect: true });
    testCase.api.updateFooterMetrics();
    assert.equal(testCase.cssProperties["--site-footer-visible-offset"], "0px");
  });

  it("reports only the visible part of a footer straddling the fold", () => {
    const testCase = footerCase({ rect: { bottom: 1000, top: 850 }, withRect: true });
    testCase.api.updateFooterMetrics();
    assert.equal(testCase.cssProperties["--site-footer-visible-offset"], "50px");
  });

  /** A footer scrolled above the viewport is clamped from the other side. */
  it("counts a footer that starts above the viewport from the top edge", () => {
    const testCase = footerCase({ rect: { bottom: 200, top: -100 }, withRect: true });
    testCase.api.updateFooterMetrics();
    assert.equal(testCase.cssProperties["--site-footer-visible-offset"], "200px");
  });
});

describe("Footer value readers", () => {
  it("reads a record as itself and everything else as nothing", () => {
    const { api } = footerCase();
    assert.deepEqual(plain(api.footerRecord({ a: 1 })), { a: 1 });
    for (const value of [null, undefined, "text", 5, true, [1, 2]]) {
      assert.equal(api.footerRecord(value), null, `value: ${JSON.stringify(value)}`);
    }
  });

  /**
   * **This is the asymmetry the checkpoint had to get right.** `textContent` is a nullable IDL
   * attribute, so an absent value empties the element; `title` and `dataset` are not, so an
   * absent value renders the word "undefined". Coercing both through `String` would have put
   * "undefined" into a label the untyped page left blank.
   */
  it("converts an absent value the way textContent does, not the way String does", () => {
    const { api } = footerCase();
    assert.equal(api.footerText(undefined), null);
    assert.equal(api.footerText(null), null);
    assert.equal(api.footerText("Timer"), "Timer");
    assert.equal(api.footerText(5), "5");
    assert.equal(api.footerText(""), "");
    assert.notEqual(api.footerText(undefined), String(undefined));
  });
});

describe("Footer quick action list", () => {
  it("reads each published action as a record", () => {
    const { api } = footerCase({ quickActions: [{ id: "timer", label: "Timer" }] });
    assert.deepEqual(plain(api.readQuickActions()), [{ id: "timer", label: "Timer" }]);
  });

  /**
   * **A malformed entry is kept, not dropped**, which is what the untyped page did: it read
   * `entry.label` off whatever the list held, got `undefined`, and drew the button anyway.
   * Dropping would remove an affordance the footer has always shown. The same decision is
   * recorded in `time-tracking-dashboard.js`.
   */
  it("keeps a malformed entry as an empty record rather than dropping it", () => {
    const { api } = footerCase({ quickActions: [{ id: "timer" }, "nonsense", null, 7, ["x"]] });
    const actions = plain(api.readQuickActions());
    assert.equal(actions.length, 5, "every published entry must still produce a button");
    assert.deepEqual(actions[0], { id: "timer" });
    for (const index of [1, 2, 3, 4]) assert.deepEqual(actions[index], {});
  });

  it("answers an empty list when the context holds no array at all", () => {
    for (const quickActions of [undefined, null, "actions", { length: 2 }]) {
      const { api } = footerCase({ quickActions });
      // Non-throwing first: a guard that stops refusing a non-array crashes on `.map` rather
      // than answering the wrong list, and a crash is not the same evidence as a wrong answer.
      assert.doesNotThrow(() => api.readQuickActions(), `quickActions: ${JSON.stringify(quickActions)}`);
      assert.deepEqual(plain(api.readQuickActions()), [], `quickActions: ${JSON.stringify(quickActions)}`);
    }
  });
});

describe("Footer quick action button", () => {
  const action = {
    actionType: "module-action", description: "Start an active timer.", icon: "start",
    id: "timer", label: "Timer", moduleActionId: "time-tracking.timer.create",
  };

  /**
   * The label and description are read off the built elements rather than off the button's own
   * `textContent`, because `decorateQuickActionButton` writes the button's text first and the
   * fake DOM's getter answers that stored string in preference to its children.
   * @param {{ children: { children: { textContent: string }[] }[] }} button
   */
  const bodyTexts = (button) => button.children[0].children.map((child) => child.textContent);

  it("renders the label, description, title and dataset a published action carries", () => {
    const testCase = footerCase();
    const button = testCase.api.createQuickActionItem(action, drawerCase().shell);
    assert.equal(button.dataset.quickActionId, "timer");
    assert.equal(button.dataset.quickActionType, "module-action");
    assert.equal(button.title, "Start an active timer.");
    assert.deepEqual(plain(bodyTexts(button)), ["Timer", "Start an active timer."]);
  });

  it("prefers the temporary label for a temporary fallback action", () => {
    const testCase = footerCase();
    const button = testCase.api.createQuickActionItem({
      ...action, actionType: "fallback-link", temporaryFallback: true, temporaryLabel: "Opens Files for now.",
    }, drawerCase().shell);
    assert.equal(button.title, "Opens Files for now.");
  });

  /**
   * The empty record `readQuickActions` produces for a malformed entry has to survive this far,
   * because that is the path the decision above created. It renders the same button the untyped
   * page rendered: "undefined" where the DOM stringifies, empty where it nulls.
   */
  it("renders an empty record exactly as the untyped page did", () => {
    const testCase = footerCase();
    const button = testCase.api.createQuickActionItem({}, drawerCase().shell);
    assert.equal(button.dataset.quickActionId, "undefined", "dataset stringifies an absent id");
    assert.equal(button.dataset.quickActionType, "undefined");
    assert.equal(button.title, "undefined", "title stringifies an absent label");
    assert.deepEqual(plain(bodyTexts(button)), [""], "textContent empties rather than writing the word");
  });

  it("falls back to the add icon and passes the label through to the icon surface", () => {
    const testCase = footerCase({ withIcons: true });
    testCase.api.createQuickActionItem({ ...action, icon: "" }, drawerCase().shell);
    assert.deepEqual(plain(testCase.iconCalls[0]), {
      icon: "add", iconOnly: true, label: "Timer", text: "", title: "Timer",
    });
  });

  /** An action with no label leaves the label absent, so the icon writer still refuses it. */
  it("leaves an absent label absent rather than naming it", () => {
    const testCase = footerCase({ withIcons: true });
    testCase.api.createQuickActionItem({ ...action, label: undefined }, drawerCase().shell);
    assert.equal(testCase.iconCalls[0].label, undefined);
    assert.ok(!("undefined" === testCase.iconCalls[0].label), "an absent label must not become the word");
  });
});

describe("Footer quick action activation", () => {
  const action = { actionType: "module-action", id: "task", label: "Task", moduleActionId: "tasks.add" };

  it("opens a module action through the registry", async () => {
    const testCase = footerCase();
    const { shell } = drawerCase();
    await testCase.api.activateQuickAction(action, testCase.document.createElement("button"), shell);
    assert.equal(testCase.opened.length, 1);
    assert.equal(testCase.opened[0].actionId, "tasks.add");
  });

  it("follows a fallback link rather than opening a dialog", async () => {
    const testCase = footerCase();
    const { shell } = drawerCase();
    await testCase.api.activateQuickAction(
      { actionType: "fallback-link", href: "files.html", id: "file", label: "File" },
      testCase.document.createElement("button"), shell,
    );
    assert.equal(testCase.location.href, "files.html");
    assert.equal(testCase.opened.length, 0);
  });

  /** A non-string href still navigates where assigning it navigated, coercion and all. */
  it("navigates to a non-string href exactly as the assignment coerced it", async () => {
    const testCase = footerCase();
    const { shell } = drawerCase();
    await testCase.api.activateQuickAction(
      { actionType: "fallback-link", href: 5, id: "file", label: "File" },
      testCase.document.createElement("button"), shell,
    );
    assert.equal(testCase.location.href, "5");
  });

  it("does not follow a fallback link with no href at all", async () => {
    const testCase = footerCase();
    const { shell } = drawerCase();
    await testCase.api.activateQuickAction(
      { actionType: "fallback-link", href: "", id: "file", label: "File" },
      testCase.document.createElement("button"), shell,
    );
    assert.equal(testCase.location.href, "");
    assert.equal(shell.status.textContent, "This quick action is not available yet.");
  });

  /**
   * **The host channels are the reason this file names a shape the registry declined to name.**
   * They are handed to `open` and called back by the module dialog, so what they do when called
   * is the contract - and `options = {}` inferring `{}` was one of this checkpoint's four
   * decisions. These exercise them as the dialog would.
   */
  it("hands the registry a status channel that marks and clears its own error state", async () => {
    const testCase = footerCase();
    const { shell } = drawerCase();
    await testCase.api.activateQuickAction(action, testCase.document.createElement("button"), shell);
    const { setStatus } = testCase.opened[0].hostChannels;

    setStatus("Working", { isError: true });
    assert.equal(shell.status.textContent, "Working");
    assert.ok(shell.status.classList.contains("is-error"));

    setStatus("Done");
    assert.equal(shell.status.textContent, "Done");
    assert.ok(!shell.status.classList.contains("is-error"), "an absent options bag means no error");
  });

  it("hands the registry a refresh channel that announces the dialog's record", async () => {
    const testCase = footerCase();
    const { shell } = drawerCase();
    await testCase.api.activateQuickAction(action, testCase.document.createElement("button"), shell);
    testCase.opened[0].hostChannels.refresh({ taskId: "t9" });
    assert.deepEqual(plain(testCase.dispatched[0].detail), {
      actionId: "tasks.add", quickActionId: "task", recordType: "task", taskId: "t9",
    });
  });

  /**
   * **The one divergence on this path, stated rather than buried.** `open` takes the action id
   * as a `string`, and the truthiness check alone never proved one. A truthy non-string id used
   * to be handed to the registry; it now reports the same refusal an absent id always got. The
   * producer emits `""` or a string literal, so no shipped action reaches this.
   */
  it("refuses a truthy non-string action id instead of handing it to the registry", async () => {
    const testCase = footerCase();
    const { shell } = drawerCase();
    await testCase.api.activateQuickAction({ ...action, moduleActionId: 7 }, testCase.document.createElement("button"), shell);
    assert.equal(testCase.opened.length, 0, "a non-string id must not reach open()");
    assert.equal(shell.status.textContent, "This quick action is not available yet.");
  });

  it("still refuses the shapes it always refused", async () => {
    for (const moduleActionId of ["", undefined, null]) {
      const testCase = footerCase();
      const { shell } = drawerCase();
      await testCase.api.activateQuickAction({ ...action, moduleActionId }, testCase.document.createElement("button"), shell);
      assert.equal(testCase.opened.length, 0, `moduleActionId: ${String(moduleActionId)}`);
      assert.equal(shell.status.textContent, "This quick action is not available yet.");
    }
  });

  it("re-enables the button and reports a readable message when opening throws", async () => {
    const testCase = footerCase({ openThrows: "Registry is unavailable." });
    const { shell } = drawerCase();
    const button = testCase.document.createElement("button");
    await testCase.api.activateQuickAction(action, button, shell);
    assert.equal(button.disabled, false, "the button must be usable again");
    assert.equal(shell.status.textContent, "Registry is unavailable.");
    assert.ok(shell.status.classList.contains("is-error"));
  });

  /** A thrown value carrying no readable message still names the action that failed. */
  it("falls back to naming the action when the failure carries no message", async () => {
    const testCase = footerCase({ openThrows: " " });
    const { shell } = drawerCase();
    await testCase.api.activateQuickAction(action, testCase.document.createElement("button"), shell);
    assert.equal(shell.status.textContent, " ");
  });

  it("clears the status once the dialog settles without error", async () => {
    const testCase = footerCase();
    const { shell } = drawerCase();
    await testCase.api.activateQuickAction(action, testCase.document.createElement("button"), shell);
    assert.equal(shell.status.textContent, "");
  });
});

describe("Footer quick action refresh announcement", () => {
  const action = { id: "task", label: "Task", moduleActionId: "tasks.add" };

  it("carries the action identifiers and the dialog's own record", () => {
    const testCase = footerCase();
    testCase.api.notifyQuickActionHostRefresh(action, { taskId: "t1" });
    assert.deepEqual(plain(testCase.dispatched[0].detail), {
      actionId: "tasks.add", quickActionId: "task", recordType: "task", taskId: "t1",
    });
  });

  it("announces the action alone when the dialog hands back nothing", () => {
    for (const detail of [undefined, null, 0, false]) {
      const testCase = footerCase();
      testCase.api.notifyQuickActionHostRefresh(action, detail);
      assert.deepEqual(plain(testCase.dispatched[0].detail), {
        actionId: "tasks.add", quickActionId: "task", recordType: "task",
      }, `detail: ${String(detail)}`);
    }
  });

  /**
   * **The guard matches what a spread already does**, which is why an array still contributes
   * its indices: `{...[1, 2]}` really is `{0: 1, 1: 2}`. A record-only check would have dropped
   * these silently, and this case is what keeps the guard honest about that.
   */
  it("keeps contributing an array's indices, as spreading one always did", () => {
    const testCase = footerCase();
    testCase.api.notifyQuickActionHostRefresh(action, ["a", "b"]);
    assert.deepEqual(plain(testCase.dispatched[0].detail), {
      0: "a", 1: "b", actionId: "tasks.add", quickActionId: "task", recordType: "task",
    });
  });

  /**
   * **The one value whose treatment moves.** Spreading a string scattered its character indices
   * into the event detail; it now contributes nothing. None of the four in-tree callers of
   * `refresh` sends a string - they send a saved record - so this is a divergence on a path no
   * caller takes, named rather than left to be discovered.
   */
  it("no longer scatters a string detail's character indices", () => {
    const testCase = footerCase();
    testCase.api.notifyQuickActionHostRefresh(action, "ab");
    assert.deepEqual(plain(testCase.dispatched[0].detail), {
      actionId: "tasks.add", quickActionId: "task", recordType: "task",
    });
  });

  it("falls back to the quick action's own id when it names no module action", () => {
    const testCase = footerCase();
    testCase.api.notifyQuickActionHostRefresh({ id: "task" }, {});
    assert.equal(testCase.dispatched[0].detail.actionId, "task");
    assert.equal(testCase.dispatched[0].detail.recordType, "");
  });
});

describe("Footer quick action status", () => {
  /** Every value answers what assigning it to `textContent` answered before the coercion. */
  it("writes the same text the untyped assignment wrote", () => {
    const { api } = footerCase();
    const { shell } = drawerCase();
    for (const [message, expected] of [["Saved", "Saved"], ["", ""], [undefined, ""], [null, ""], [5, "5"], [0, ""]]) {
      api.setQuickActionStatus(shell.status, message);
      assert.equal(shell.status.textContent, expected, `message: ${String(message)}`);
    }
  });

  it("marks and clears the error class from any truthy or falsy flag", () => {
    const { api } = footerCase();
    const { shell } = drawerCase();
    api.setQuickActionStatus(shell.status, "Broken", 1);
    assert.ok(shell.status.classList.contains("is-error"));
    api.setQuickActionStatus(shell.status, "Fine", 0);
    assert.ok(!shell.status.classList.contains("is-error"));
  });

  it("does nothing at all without a status element", () => {
    const { api } = footerCase();
    assert.doesNotThrow(() => api.setQuickActionStatus(null, "Saved", true));
    assert.doesNotThrow(() => api.setQuickActionStatus(undefined, "Saved", true));
  });
});

describe("Footer quick action drawer", () => {
  it("opens and closes the drawer through its aria state", () => {
    const { api } = footerCase();
    const { shell } = drawerCase();
    api.setQuickActionDrawerOpen(shell, true);
    assert.equal(shell.toggle.getAttribute("aria-expanded"), "true");
    assert.equal(shell.drawer.hidden, false);
    assert.equal(shell.drawer.getAttribute("aria-hidden"), "false");

    api.setQuickActionDrawerOpen(shell, false);
    assert.equal(shell.toggle.getAttribute("aria-expanded"), "false");
    assert.equal(shell.drawer.hidden, true);
  });

  /** Three of the four callers hand over only the two elements, which is why `list` is optional. */
  it("works from the two elements its callers actually pass", () => {
    const { api } = footerCase();
    const { shell } = drawerCase();
    assert.doesNotThrow(() => api.setQuickActionDrawerOpen({ drawer: shell.drawer, toggle: shell.toggle }, true));
    assert.equal(shell.toggle.getAttribute("aria-expanded"), "true");
  });

  it("returns focus to the toggle on close, unless the caller declines it", () => {
    const { api } = footerCase();
    const closed = drawerCase();
    api.setQuickActionDrawerOpen(closed.shell, false);
    assert.equal(closed.document.activeElement, closed.shell.toggle);

    const declined = drawerCase();
    api.setQuickActionDrawerOpen(declined.shell, false, { returnFocus: false });
    assert.equal(declined.document.activeElement, null);
  });

  /** The narrowing refuses nothing the drawer can hold: the selector already asks for a button. */
  it("focuses the first enabled action when the drawer opens", () => {
    const { api } = footerCase();
    const { document } = drawerCase();
    const disabled = document.createElement("button");
    disabled.disabled = true;
    const enabled = document.createElement("button");
    const { shell } = drawerCase({ actions: [disabled, enabled] });
    api.setQuickActionDrawerOpen(shell, true);
    assert.equal(document.activeElement, enabled, "the first enabled action takes focus");
  });

  /**
   * **The narrowing is what makes this a no-op rather than a crash.** `querySelector` answers an
   * `Element`, and only an `HTMLElement` carries `focus`; a match that is neither is refused
   * here instead of throwing inside the timeout, where nothing would have reported it.
   */
  it("does nothing when the list answers something that cannot take focus", () => {
    const { api } = footerCase();
    const { shell } = drawerCase({ actions: [{ disabled: false }] });
    assert.doesNotThrow(() => api.setQuickActionDrawerOpen(shell, true));
  });

  it("opens without an action list to focus", () => {
    const { api } = footerCase();
    const { shell } = drawerCase();
    assert.doesNotThrow(() => api.setQuickActionDrawerOpen({ drawer: shell.drawer, toggle: shell.toggle }, true));
  });
});

describe("Footer quick action script tag", () => {
  /**
   * The extracted helper exists for its declared `Promise<void>`, and **it must stay a
   * function**: hoisting the `new Promise` into an annotated local would build the tag, and
   * append it, even for the `import()` branch that never wants one. These cases hold the
   * helper's own behaviour; the source assertion below holds the call site.
   */
  it("appends the versioned script and resolves with nothing once it loads", async () => {
    const testCase = footerCase();
    const settled = testCase.api.appendQuickActionScriptTag({ src: "js/shared/tags.js" }, "js/shared/tags.js?v=2");
    assert.equal(testCase.document.body.children.length, 1, "the tag must reach the document");
    const script = asScriptElement(testCase.document.body.children[0]);
    assert.equal(script.tagName, "SCRIPT");
    assert.equal(script.src, "js/shared/tags.js?v=2");
    assert.equal(script.async, false, "load order must stay deterministic");
    testCase.document.body.children[0].dispatchEvent({ type: "load" });
    assert.equal(await settled, undefined);
  });

  it("rejects naming the dependency when the script fails", async () => {
    const testCase = footerCase();
    const settled = testCase.api.appendQuickActionScriptTag({ src: "js/shared/tags.js" }, "js/shared/tags.js?v=2");
    assert.equal(testCase.document.body.children.length, 1);
    testCase.document.body.children[0].dispatchEvent({ type: "error" });
    await assert.rejects(settled, /Could not load js\/shared\/tags\.js\./);
  });
});

describe("Footer shapes this file states rather than invents", () => {
  /** The estate publishes no quick-action record, so this file names what it reads. */
  it("names the quick action as a record rather than claiming a published type", () => {
    assert.match(source, /@typedef \{Record<string, unknown>\} FooterQuickAction/);
    assert.doesNotMatch(source, /BrowserQuickAction\b/);
  });

  it("names the host channels the module registry declines to name", () => {
    assert.match(source, /@typedef \{object\} QuickActionHostChannels/);
    assert.match(source, /@property \{\(detail\?: unknown\) => void\} refresh/);
  });

  /** The pinned arrow spellings survive because the object is annotated, not each parameter. */
  it("keeps the registry call site spelled as the regression pins it", () => {
    assert.match(source, /refresh: \(detail\) => notifyQuickActionHostRefresh\(action, detail\),/);
    assert.match(source, /setStatus: \(message, options = \{\}\) => setQuickActionStatus\(shell\.status, message, options\.isError\),/);
  });

  /** The drawer helper takes the controls its callers pass, not the whole shell. */
  it("separates the drawer controls from the mounted shell", () => {
    assert.match(source, /@typedef \{object\} QuickActionDrawerControls/);
    assert.match(source, /@property \{HTMLElement\} \[list\]/);
  });

  /** A hoisted promise would append the script tag on the module branch too. */
  it("builds the script-tag promise only on the branch that wants one", () => {
    assert.match(source, /\? import\(key\)\n\s*: appendQuickActionScriptTag\(dependency, versionedSrc\);/);
    assert.match(source, /function appendQuickActionScriptTag\(dependency, versionedSrc\) \{\n\s*return new Promise\(/);
  });

  it("completes the fallback rect rather than reading a member it does not carry", () => {
    assert.match(source, /: \{ bottom: viewportHeight, top: viewportHeight \};/);
  });

  /**
   * The outside-click target is narrowed before `contains` sees it. This is pinned by the quick
   * action capture regression too; it is repeated here so a mutation run against this suite can
   * see the narrowing disappear.
   */
  it("narrows the outside-click target to a node before asking about containment", () => {
    assert.match(source, /const clickedNode = event\.target instanceof Node \? event\.target : null;/);
    assert.match(source, /root\.contains\(clickedNode\)/);
    assert.doesNotMatch(source, /root\.contains\(event\.target\)/);
  });

  /** The href assignment keeps its own coercion rather than refusing a non-string. */
  it("coerces the fallback link rather than narrowing it away", () => {
    assert.match(source, /window\.location\.href = String\(action\.href\);/);
  });

  it("carries no suppression and no cast beyond the one the record check earns", () => {
    assert.doesNotMatch(source, /@ts-(expect-error|ignore|nocheck)/);
    const casts = source.match(/\/\*\* @type \{[^}]*\} \*\/ \(/g) || [];
    assert.equal(casts.length, 1, "only footerRecord asserts, and only behind a proved check");
    assert.match(source, /typeof value === "object" && value !== null && !Array\.isArray\(value\)\n\s*\? \/\*\* @type \{Record<string, unknown>\} \*\/ \(value\)/);
  });
});
