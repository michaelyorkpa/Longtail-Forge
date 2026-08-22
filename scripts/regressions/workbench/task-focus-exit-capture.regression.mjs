export const regressionMeta = Object.freeze({
  id: "workbench.task-focus-exit-capture",
  area: "workbench",
  tier: "focused",
  tags: ["app-shell", "navigation", "resume-context", "tasks", "workbench"],
  description: "Proves one deduplicated app-shell navigation intent holds eligible non-blocked Task Focus exits for reusable resume-note capture and hard exits use a bounded content-free session marker.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

/** The held handler the controller hands to an intercepted navigation. */
/** @typedef {() => Promise<void> | void} InterceptHandler */
/** One exit signal the controller arbitrates. */
/** @typedef {{ kind: string, continue: () => unknown }} ExitIntent */
/** The navigate event the controller intercepts, as this harness emits it. */
/** @typedef {{ canIntercept: boolean, destination: { url: string }, intercept: (options: { handler: InterceptHandler }) => void, navigationType: string }} NavigateEvent */
/** @typedef {(event: NavigateEvent) => void} NavigateListener */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const navigationSource = await fs.readFile(path.join(root, "public/js/navigation.js"), "utf8");
const workbenchSource = await fs.readFile(path.join(root, "public/js/workbench.js"), "utf8");

assert.match(navigationSource, /createNavigationIntentController\(\)[\s\S]*navigationIntent =/, "the app shell should own one navigation-intent controller");
assert.match(navigationSource, /document\.addEventListener\("click"[\s\S]*a\[href\][\s\S]*request\(intent\)/, "same-origin app-shell and notification links should converge on the intent controller");
assert.match(navigationSource, /window\.navigation\.addEventListener\("navigate"[\s\S]*navigationType === "traverse"[\s\S]*event\.intercept/, "browser back and forward should use the same held navigation intent when the Navigation API can intercept");
assert.match(navigationSource, /pathname === SESSION_LOGIN_PATH/, "expired-session redirects should bypass optional Task Focus capture");
assert.match(navigationSource, /navigationIntent\.navigate\([\s\S]*kind: "global-search"/, "global Search should use the shared intent");
assert.match(navigationSource, /kind: "workspace-switch"[\s\S]*continue: \(\) => switchWorkspace\(workspaceId\)/, "workspace switching should preserve its exact action through capture");
assert.match(navigationSource, /kind: "logout"[\s\S]*continue: performLogout/, "account logout should use the shared intent");

assert.match(workbenchSource, /installTaskFocusExitGuard\(\)/, "Workbench should register its bounded exit guard");
assert.match(workbenchSource, /function taskFocusExitSnapshot[\s\S]*resolvedWorkbenchViewState\(\)[\s\S]*\["open", "in_progress"\][\s\S]*blocked_reason/, "loaded Open and In Progress Task Focus without blocked context should hold an exit");
assert.doesNotMatch(extractFunctionSource(workbenchSource, "taskFocusExitSnapshot"), /currentTaskFocusTimer|timer_status/, "Task Focus exit capture must not depend on timer state");
assert.match(workbenchSource, /function offerTaskResumeNoteBeforeExit[\s\S]*await window\.LongtailForge\.taskResumeNoteCapture\?\.offer/, "interceptable exits should await the existing Tasks-owned capture before continuing");
assert.match(workbenchSource, /kind: "workbench-change-focus"[\s\S]*continue: continueChangeFocus/, "Change Focus should preserve its exact state transition through the intent controller");
assert.match(workbenchSource, /function navigateFromWorkbench[\s\S]*navigationIntent\.navigate/, "scripted Workbench page fallbacks should use the shared intent");
assert.match(workbenchSource, /addEventListener\("beforeunload", writePendingTaskFocusDrift\)[\s\S]*addEventListener\("pagehide", writePendingTaskFocusDrift\)/, "refresh and hard exit should persist the bounded drift marker best-effort");
assert.match(workbenchSource, /addEventListener\("pageshow"[\s\S]*event\.persisted[\s\S]*recoverPendingTaskFocusDrift/, "a restored back-forward-cache Workbench should consume the same bounded recovery marker");
assert.match(workbenchSource, /JSON\.stringify\(\{\s*taskId: snapshot\.taskId,\s*timestamp: Date\.now\(\),?\s*\}\)/, "the drift marker should contain only Task ID and timestamp");
assert.doesNotMatch(extractFunctionSource(workbenchSource, "writePendingTaskFocusDrift"), /resume_note|next_action|title|description|task:/, "the hard-exit marker must not duplicate Task content or note text");
assert.match(workbenchSource, /WORKBENCH_TASK_FOCUS_DRIFT_MAX_AGE_MS = 12 \* 60 \* 60 \* 1000/, "drift recovery should be time-bounded");
assert.match(workbenchSource, /function recoverPendingTaskFocusDrift[\s\S]*clearPendingTaskFocusDrift\(\)[\s\S]*api\.getJson[\s\S]*\["open", "in_progress"\][\s\S]*blocked_reason[\s\S]*resume_note[\s\S]*taskResumeNoteCapture\?\.offer/, "recovery should clear once, then re-check readability, non-blocked lifecycle, Blocked Reason, and current resume-note state");
assert.doesNotMatch(extractFunctionSource(workbenchSource, "recoverPendingTaskFocusDrift"), /activeOrPausedTimers|taskTimerMatches/, "hard-exit recovery must not require a timer");
assert.match(workbenchSource, /function consumeTaskFocusResumeNote[\s\S]*taskResumeNoteCapture\?\.consume/, "successful Task Focus entry should consume the prior resume note");
assert.match(workbenchSource, /text: `Resume note: \$\{resumeNote\}`/, "Start here should label a candidate handoff with the exact Resume note prefix");

await assertControllerDeduplication();
await assertHistoryTraversalInterception();

console.log("Workbench Task Focus exit-capture regression passed.");

async function assertControllerDeduplication() {
  const harness = createControllerHarness();
  /** @type {(() => void) | undefined} */
  let releaseCapture;
  let beforeCalls = 0;
  let commitCalls = 0;
  let continueCalls = 0;
  let errorCalls = 0;
  const captureGate = new Promise((resolve) => { releaseCapture = () => resolve(undefined); });

  harness.controller.registerExitGuard({
    shouldHold: () => true,
    beforeContinue: async () => {
      beforeCalls += 1;
      await captureGate;
    },
    onCommitted: () => { commitCalls += 1; },
    onContinueError: () => { errorCalls += 1; },
  });

  const first = harness.controller.request({ kind: "first", continue: () => { continueCalls += 1; } });
  const duplicate = harness.controller.request({ kind: "duplicate", continue: () => { continueCalls += 100; } });
  assert.equal(first, duplicate, "concurrent exit signals should share one pending intent");
  await Promise.resolve();
  assert.equal(beforeCalls, 1, "one drift should open one capture");
  assert.ok(releaseCapture, "the capture gate should expose its release");
  releaseCapture();
  await first;
  assert.equal(continueCalls, 1, "only the first exact destination should continue once");
  assert.equal(commitCalls, 1);
  assert.equal(errorCalls, 0);
}

async function assertHistoryTraversalInterception() {
  const harness = createControllerHarness();
  let captures = 0;
  let commits = 0;
  // The controller hands its held handler to `intercept`, which the checker
  // cannot see running, so it is captured on a record whose declared shape
  // survives the callback boundary and is then proven present.
  /** @type {{ handler: InterceptHandler | null }} */
  const intercepted = { handler: null };
  harness.controller.registerExitGuard({
    /** @param {ExitIntent} intent */
    shouldHold: (intent) => intent.kind === "history-traversal",
    beforeContinue: async () => { captures += 1; },
    onCommitted: () => { commits += 1; },
  });

  harness.navigationListener({
    canIntercept: true,
    destination: { url: "http://longtail.local/tasks.html" },
    /** @param {{ handler: InterceptHandler }} options */
    intercept(options) { intercepted.handler = options.handler; },
    navigationType: "traverse",
  });
  assert.ok(intercepted.handler, "history traversal should be held before its destination commits");
  await intercepted.handler();
  assert.equal(captures, 1);
  assert.equal(commits, 1);
}

function createControllerHarness() {
  /** @type {Map<string, (event: unknown) => void>} */
  const documentListeners = new Map();
  /** @type {NavigateListener | null} */
  let navigationListener = null;
  const browserWindow = {
    URL,
    location: {
      assign() {},
      href: "http://longtail.local/workbench.html",
      origin: "http://longtail.local",
    },
    navigation: {
      /** @param {string} type @param {NavigateListener} listener */
      addEventListener(type, listener) {
        if (type === "navigate") navigationListener = listener;
      },
    },
  };
  const browserDocument = {
    baseURI: browserWindow.location.href,
    /** @param {string} type @param {(event: unknown) => void} listener */
    addEventListener(type, listener) { documentListeners.set(type, listener); },
  };
  const factory = vm.runInNewContext(`(${extractFunctionSource(navigationSource, "createNavigationIntentController")})`, {
    document: browserDocument,
    SESSION_LOGIN_PATH: "/login.html",
    window: browserWindow,
  });
  const controller = factory();
  return {
    controller,
    /** @param {NavigateEvent} event */
    navigationListener(event) {
      assert.ok(navigationListener, "the controller should subscribe to navigate events");
      return navigationListener(event);
    },
  };
}

/** @param {string} source @param {string} name @returns {string} */
function extractFunctionSource(source, name) {
  const start = source.indexOf(`function ${name}(`) >= 0
    ? source.indexOf(`function ${name}(`)
    : source.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1, `Missing function ${name}`);
  const openBrace = source.indexOf("{", start);
  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not extract function ${name}`);
}
