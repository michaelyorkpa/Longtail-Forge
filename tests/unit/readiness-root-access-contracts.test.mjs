import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/**
 * The eleven direct `workspaceContextReady` root reads `0.33.33.38.2.6.7` adopted.
 *
 * The whole checkpoint turns on one distinction: **the root is checked and the member is not.**
 * A missing root failed at the property read before and must still fail there; a present root
 * that publishes no `workspaceContextReady` never failed, because `await undefined` is a real
 * state every one of these pages has always tolerated. A helper that required the member would
 * satisfy the compiler and break that second case, so the matrix below tests it directly.
 */

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

/** The eight pages this checkpoint touched, and how many readiness awaits each carries. */
const ADOPTED = Object.freeze({
  "public/js/audit-log.js": 1,
  "public/js/clients-projects.js": 1,
  "public/js/lists.js": 2,
  "public/js/notes.js": 3,
  "public/js/stop-watch.js": 1,
  "public/js/support-view-audit.js": 1,
  "public/js/tasks.js": 1,
  "public/js/time-entries.js": 1,
});

/** Pages that read readiness optionally and must keep doing so. */
const OPTIONAL = Object.freeze([
  "public/js/calendar-settings.js",
  "public/js/calendar.js",
  "public/js/clients-projects.js",
  "public/js/files.js",
  "public/js/lists.js",
]);

/** @param {string} source @param {string} opener */
function slice(source, opener) {
  const start = source.indexOf("  " + opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf("\n  }\n", start);
  assert.notEqual(end, -1, opener + " must terminate");
  return source.slice(start, end + 4);
}

/**
 * One page's shipped `requireNamespace`, over a window the test controls.
 * @param {string} path @param {unknown} root
 */
function accessor(path, root) {
  const build = new Function("window", [
    slice(read(path), "function requireNamespace() {"),
    "return requireNamespace;",
  ].join("\n"));
  return build({ LongtailForge: root });
}

/**
 * A site-shaped caller: acquire, await readiness, then run the continuation - which is exactly
 * the shape every adopted site has, with the await left where it was.
 * @param {string} path @param {unknown} root @param {() => void} continuation
 */
function siteShapedCaller(path, root, continuation) {
  const build = new Function("window", "continuation", [
    slice(read(path), "function requireNamespace() {"),
    "return async () => {",
    "  await requireNamespace().workspaceContextReady;",
    "  continuation();",
    "};",
  ].join("\n"));
  return build({ LongtailForge: root }, continuation);
}

describe("every direct readiness read was adopted, and every optional one was left alone", () => {
  it("adopts eleven sites across eight pages", () => {
    let total = 0;
    for (const [path, expected] of Object.entries(ADOPTED)) {
      const source = read(path);
      const adopted = (source.match(/await requireNamespace\(\)\.workspaceContextReady;/g) || []).length;
      assert.equal(adopted, expected, path + " should await readiness through the accessor");
      assert.ok(!/await window\.LongtailForge\.workspaceContextReady/.test(source),
        path + " must keep no direct root read");
      total += adopted;
    }
    assert.equal(total, 11);
  });

  it("awaits readiness unconditionally at every adopted site", () => {
    // A conditional await - skipping it when the member is absent - would remove an asynchronous
    // continuation these pages have always had, changing when initialization proceeds.
    for (const path of Object.keys(ADOPTED)) {
      const source = read(path);
      assert.ok(!/const ready = requireNamespace\(\)\.workspaceContextReady/.test(source),
        path + " must not hoist readiness into a variable to guard the await");
      assert.ok(!/if \([a-zA-Z]*[Rr]eady\) \{[\s\S]{0,40}?await /.test(source),
        path + " must not make the await conditional");
    }
  });

  it("leaves the optional readiness reads optional", () => {
    for (const path of OPTIONAL) {
      assert.match(read(path), /await (Promise\.resolve\()?window\.LongtailForge\?\.workspaceContextReady/,
        path + " tolerates an absent root and must keep doing so");
    }
  });

  it("leaves the guarded footer read and the publication alone", () => {
    const footer = read("public/js/footer.js");
    assert.match(footer, /if \(!window\.LongtailForge\?\.workspaceContextReady \|\| !document\.querySelector\(/,
      "the footer proves the member before reading it, so its root read is already narrowed");
    assert.ok(!/requireNamespace/.test(footer), "and it needed no accessor");
    assert.match(read("public/js/navigation.js"),
      /window\.LongtailForge\.workspaceContextReady = loadAppShellBootstrap\(\);/,
      "the publication is a write and belongs to the publication cohort");
  });

  it("keeps each accessor beside the page's own require helpers, with its own wording", () => {
    for (const path of Object.keys(ADOPTED)) {
      const body = slice(read(path), "function requireNamespace() {");
      assert.match(body, /const namespace = window\.LongtailForge;/, "reads the root per call");
      assert.match(body, /requires the LongtailForge namespace\./, path + " names itself in the error");
      assert.ok(!/workspaceContextReady/.test(body),
        path + "'s accessor must not check the readiness member");
    }
  });
});

describe("the accessor checks the root and nothing else", () => {
  it("throws a named error when the root is absent, on every page", () => {
    for (const [path, page] of [
      ["public/js/audit-log.js", "Audit Log"],
      ["public/js/clients-projects.js", "Clients and Projects"],
      ["public/js/lists.js", "Lists"],
      ["public/js/notes.js", "Notes"],
      ["public/js/stop-watch.js", "The Time Tracker stopwatch"],
      ["public/js/support-view-audit.js", "Support View audit"],
      ["public/js/tasks.js", "Tasks"],
      ["public/js/time-entries.js", "Time Entries"],
    ]) {
      assert.throws(() => accessor(path, undefined)(),
        new RegExp(page.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " requires the LongtailForge namespace\\."));
    }
  });

  it("returns the very root it was given, by identity", () => {
    const root = { workspaceContextReady: Promise.resolve(null) };
    assert.equal(accessor("public/js/tasks.js", root)(), root);
  });

  it("does NOT throw when the root is present but publishes no readiness member", () => {
    // The fail-first case. A helper written as `requireWorkspaceContextReady()` would satisfy the
    // compiler and fail here, because these pages have always tolerated an absent member.
    for (const path of Object.keys(ADOPTED)) {
      const root = {};
      assert.doesNotThrow(() => accessor(path, root)(), path + " must not require the member");
      assert.equal(accessor(path, root)(), root);
    }
  });

  it("rejects a helper that requires the readiness member", () => {
    // Written here as the thing the shipped accessor must not be, and shown to fail the case above.
    const wrong = new Function("window", [
      "return function requireWorkspaceContextReady() {",
      "  const ready = window.LongtailForge?.workspaceContextReady;",
      '  if (!ready) { throw new Error("Page requires LongtailForge.workspaceContextReady."); }',
      "  return ready;",
      "};",
    ].join("\n"))({ LongtailForge: {} });
    assert.throws(() => wrong(), /requires LongtailForge\.workspaceContextReady/,
      "which is exactly the behaviour the present-root case forbids");
  });

  it("reads the current root on every call, rather than caching one", () => {
    /** @type {{ LongtailForge: unknown }} */
    const win = { LongtailForge: { id: "first" } };
    const requireNamespace = new Function("window", [
      slice(read("public/js/lists.js"), "function requireNamespace() {"),
      "return requireNamespace;",
    ].join("\n"))(win);
    assert.equal(requireNamespace(), win.LongtailForge);
    const replaced = { id: "second" };
    win.LongtailForge = replaced;
    assert.equal(requireNamespace(), replaced, "a replaced root is seen by the next call");
  });
});

describe("the await keeps its timing, its results and its failures", () => {
  it("still continues when the root publishes no readiness member", async () => {
    let ran = false;
    await siteShapedCaller("public/js/notes.js", {}, () => { ran = true; })();
    assert.equal(ran, true, "await undefined resolves, and the page carries on");
  });

  it("does not run the continuation before a pending readiness settles", async () => {
    /** @type {(value?: unknown) => void} */
    let release = () => {};
    const pending = new Promise((resolve) => { release = resolve; });
    let ran = false;
    const running = siteShapedCaller("public/js/lists.js",
      { workspaceContextReady: pending }, () => { ran = true; })();

    // A barrier, not a timeout: several microtask turns pass and the continuation must not have
    // run, because the promise it awaits has not settled.
    for (let turn = 0; turn < 8; turn += 1) {
      await Promise.resolve();
    }
    assert.equal(ran, false, "the continuation waited");

    release();
    await running;
    assert.equal(ran, true, "and ran once readiness settled");
  });

  it("continues for every value the readiness promise may resolve", async () => {
    for (const resolved of [{ workspaceContext: {} }, null, undefined]) {
      let ran = false;
      await siteShapedCaller("public/js/tasks.js",
        { workspaceContextReady: Promise.resolve(resolved) }, () => { ran = true; })();
      assert.equal(ran, true, JSON.stringify(resolved) + " still continues");
    }
  });

  it("propagates a rejected readiness promise instead of swallowing it", async () => {
    const boom = new Error("bootstrap failed");
    let ran = false;
    await assert.rejects(
      siteShapedCaller("public/js/time-entries.js",
        { workspaceContextReady: Promise.reject(boom) }, () => { ran = true; })(),
      /bootstrap failed/,
    );
    assert.equal(ran, false, "and the continuation does not run");
  });

  it("fails on an absent root before the continuation, as the property read did", async () => {
    let ran = false;
    await assert.rejects(
      siteShapedCaller("public/js/support-view-audit.js", undefined, () => { ran = true; })(),
      /Support View audit requires the LongtailForge namespace\./,
    );
    assert.equal(ran, false);
  });

  it("keeps the acquisition inside the caller, so the caller's own catch still sees it", async () => {
    // The accessor is synchronous and the await is unchanged, so a site that wraps the await in
    // `try` catches the acquisition failure exactly where it caught the property read.
    let caught = null;
    const guarded = async () => {
      try {
        await siteShapedCaller("public/js/audit-log.js", undefined, () => {})();
      } catch (error) {
        caught = error;
      }
    };
    await guarded();
    assert.match(String(caught), /Audit Log requires the LongtailForge namespace\./);
  });
});

describe("the sites that wrap the await keep their own error handling", () => {
  it("keeps the two initialize sites inside their try blocks", () => {
    for (const [path, opener] of [
      ["public/js/lists.js", "async function initialize() {"],
      ["public/js/notes.js", "async function initialize() {"],
    ]) {
      const body = slice(read(path), opener);
      const tryAt = body.indexOf("try {");
      const awaitAt = body.indexOf("await requireNamespace().workspaceContextReady;");
      const catchAt = body.indexOf("} catch (error) {");
      assert.notEqual(tryAt, -1, path + " must still open a try");
      assert.notEqual(awaitAt, -1, path + " must await through the accessor");
      assert.notEqual(catchAt, -1, path + " must still catch");
      assert.ok(tryAt < awaitAt && awaitAt < catchAt, path + " keeps the await inside the try");
    }
  });

  it("keeps the two dialog preparers inside their rejection handlers", () => {
    for (const [path, opener] of [
      ["public/js/lists.js", "async function prepareListDialogData() {"],
      ["public/js/notes.js", "async function prepareNoteDialogData() {"],
    ]) {
      const body = slice(read(path), opener);
      const awaitAt = body.indexOf("await requireNamespace().workspaceContextReady;");
      const catchAt = body.indexOf("})().catch((error) => {");
      assert.notEqual(awaitAt, -1, path + " must await through the accessor");
      assert.notEqual(catchAt, -1, path + " must still attach its catch");
      assert.ok(awaitAt < catchAt, path + " keeps the await inside the guarded IIFE");
    }
  });

  it("leaves the awaits that were already first in their function first", () => {
    for (const [path, opener] of [
      ["public/js/clients-projects.js", "async function loadClientProjectDialogData() {"],
      ["public/js/stop-watch.js", "async function initializeTimeTracker() {"],
    ]) {
      const body = slice(read(path), opener);
      const lines = body.split("\n").map((line) => line.trim()).filter(Boolean);
      assert.equal(lines[1], "await requireNamespace().workspaceContextReady;",
        path + " still awaits readiness first");
    }
  });

  it("leaves the awaits that followed a timezone load still following it", () => {
    for (const path of ["public/js/audit-log.js", "public/js/support-view-audit.js",
      "public/js/time-entries.js"]) {
      const source = read(path);
      const timezoneAt = source.indexOf("await requireTimezones().loadSessionTimezone();");
      const readinessAt = source.indexOf("await requireNamespace().workspaceContextReady;");
      assert.notEqual(timezoneAt, -1, path + " must still load its session timezone");
      assert.notEqual(readinessAt, -1, path + " must still await readiness");
      assert.ok(timezoneAt < readinessAt, path + " keeps the established order");
    }
  });
});
