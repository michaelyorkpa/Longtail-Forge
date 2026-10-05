import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/**
 * The last two required declared-member acquisitions, adopted by `0.33.33.38.2.6.11`.
 *
 * Two surfaces, two different lifetimes, and the point of this checkpoint is that neither moved.
 *
 * `pageController` is **captured once during module evaluation** in three lazily loaded dialogs.
 * That capture never threw when the member was absent - it bound `undefined` and the first method
 * call failed. The check now happens at that first call, against the same captured binding, so
 * the dialog neither fails earlier nor acquires a live dependency it never had.
 *
 * `cachedFetch` is required on **one branch only**. `loadDashboardManifest` goes straight to
 * `BrowserApi` when there is no usable workspace id and never touches the cache; the check sits
 * at the cached invocation point, read per call exactly as the property access was.
 */

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

/** @type {Record<string, { message: string, wrapper: string }>} */
const DIALOGS = ({
  "task-dialog": { message: "Task dialog requires LongtailForge.pageController.", wrapper: "function option(value, label) {" },
  "time-entry-dialog": { message: "The time entry dialog requires LongtailForge.pageController.", wrapper: "function createOption(value, text) {" },
  "time-tracking-timer-dialog": { message: "The time tracking timer dialog requires LongtailForge.pageController.", wrapper: "function createOption(value, text) {" },
});

/** @type {Record<string, string>} */
const sources = {};
for (const name of Object.keys(DIALOGS)) sources[name] = read(`public/js/${name}.js`);
const entrySource = read("public/js/dashboard.entry.js");

/** @param {string} source @param {string} opener */
function slice(source, opener) {
  const start = source.indexOf("  " + opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf("\n  }\n", start);
  assert.notEqual(end, -1, opener + " must terminate");
  return source.slice(start, end + 4);
}

/**
 * Lift the shipped capture, the shipped accessor and the shipped wrapper together, in that order,
 * so the test drives the real capture-check-use chain rather than a stub of it.
 * @param {string} key @param {Record<string, unknown>} namespaceValue
 */
function liftDialogChain(key, namespaceValue) {
  const source = sources[key];
  const { wrapper } = DIALOGS[key];
  const built = new Function("namespace", [
    "  const pageController = namespace.pageController;",
    slice(source, "function requirePageController() {"),
    slice(source, wrapper),
    "  return " + wrapper.replace(/^function /, "").replace(/\(.*$/, "") + ";",
  ].join("\n"));
  return built(namespaceValue);
}

/**
 * Evaluate one shipped dialog against a controlled global, and hand back the namespace it
 * published into. The bare globals these files touch during evaluation are injected as
 * parameters rather than hung off the fake window, because that is how the files reach them.
 * @param {string} key @param {Record<string, unknown>} namespaceValue
 */
function evaluateDialog(key, namespaceValue) {
  const fakeWindow = { LongtailForge: namespaceValue, addEventListener() {}, location: { search: "" } };
  const fakeDocument = {
    addEventListener() {},
    body: { appendChild() {} },
    createElement: () => ({ appendChild() {}, classList: { add() {} }, dataset: {}, setAttribute() {}, style: {} }),
    querySelector: () => null,
    querySelectorAll: () => [],
    readyState: "complete",
  };
  new Function("global", "window", "document", "CustomEvent", "fetch", sources[key])(
    fakeWindow, fakeWindow, fakeDocument, class {}, async () => ({ json: async () => ({}), ok: true }));
  return /** @type {Record<string, unknown>} */ (fakeWindow.LongtailForge);
}

/** A page-controller stand-in that records how it was called. */
function recordingController() {
  /** @type {{ receivers: unknown[], args: unknown[][] }} */
  const log = { args: [], receivers: [] };
  const controller = {
    createOption(/** @type {unknown[]} */ ...args) {
      log.receivers.push(this);
      log.args.push(args);
      return { option: args[0] };
    },
    log,
    sortByName(/** @type {unknown[]} */ ...args) {
      log.receivers.push(this);
      log.args.push(args);
      return args[0];
    },
  };
  return controller;
}

describe("pageController is checked where it is used, not where it is captured", () => {
  for (const [key, { message }] of Object.entries(DIALOGS)) {
    it(`${key}.js evaluates without throwing when the member is absent`, () => {
      // The capture bound `undefined` before this checkpoint and still does. A dialog that threw
      // during module evaluation would break the lazy import itself, not just its option builders.
      assert.doesNotThrow(() => evaluateDialog(key, {}));
    });

    it(`${key}.js still publishes its surface when the member is absent`, () => {
      const namespace = evaluateDialog(key, {});
      const published = key === "task-dialog" ? "tasksDialog"
        : key === "time-entry-dialog" ? "timeEntryDialog" : "timeTrackingTimerDialog";
      assert.ok(namespace[published], `${key}.js must still publish ${published}`);
    });

    it(`${key}.js fails at the first required use, with a named delivery error`, () => {
      const option = liftDialogChain(key, {});
      assert.throws(() => option("value", "label"), (/** @type {unknown} */ error) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, message);
        return true;
      });
    });

    it(`${key}.js calls through on the captured object, with the same arguments`, () => {
      const controller = recordingController();
      const option = liftDialogChain(key, { pageController: controller });
      const answer = option("v1", "Label one");

      assert.deepEqual(controller.log.args, [["v1", "Label one"]], "arguments reach the method unchanged");
      assert.equal(controller.log.receivers[0], controller, "the method keeps its own receiver");
      assert.deepEqual(answer, { option: "v1" }, "the return value is passed straight back");
    });

    it(`${key}.js keeps the object it captured when the namespace member is replaced`, () => {
      const captured = recordingController();
      /** @type {Record<string, unknown>} */
      const namespace = { pageController: captured };
      const option = liftDialogChain(key, namespace);

      const replacement = recordingController();
      namespace.pageController = replacement;
      option("v2", "Label two");

      assert.equal(captured.log.args.length, 1, "the captured controller is still the one used");
      assert.equal(replacement.log.args.length, 0, "a replacement does not take over an existing capture");
    });

    it(`${key}.js does not start working when a controller arrives after the capture`, () => {
      // Publishing the helper late is a lifetime this dialog has never supported. Silently
      // starting to work would be a new behaviour, not a narrowing.
      /** @type {Record<string, unknown>} */
      const namespace = {};
      const option = liftDialogChain(key, namespace);
      namespace.pageController = recordingController();

      // Compared whole rather than turned into a pattern: escaping a message into a regex is
      // both weaker than an equality check and easy to get subtly wrong.
      assert.throws(() => option("v3", "Label three"), (/** @type {unknown} */ error) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, message);
        return true;
      });
    });
  }

  it("time-entry-dialog routes sortByName through the same checked capture", () => {
    const source = sources["time-entry-dialog"];
    const built = new Function("namespace", [
      "  const pageController = namespace.pageController;",
      slice(source, "function requirePageController() {"),
      slice(source, "function sortByName(items) {"),
      "  return sortByName;",
    ].join("\n"));

    assert.throws(() => built({})([{ name: "a" }]),
      /^Error: The time entry dialog requires LongtailForge\.pageController\.$/);

    const controller = recordingController();
    const items = [{ name: "b" }, { name: "a" }];
    assert.equal(built({ pageController: controller })(items), items, "the array is handed back unchanged");
    assert.equal(controller.log.receivers[0], controller);
  });

  it("re-reads nothing: the accessor tests the captured binding, not the namespace", () => {
    for (const key of Object.keys(DIALOGS)) {
      const accessor = slice(sources[key], "function requirePageController() {");
      assert.match(accessor, /if \(!pageController\) \{/, `${key}.js must check the captured binding`);
      assert.ok(!/namespace\.pageController|window\.LongtailForge/.test(accessor),
        `${key}.js must not re-read the member and give itself a live dependency`);
      assert.match(accessor, /return pageController;/, `${key}.js returns the captured object itself`);
    }
  });

  it("checks at the call site rather than at the capture", () => {
    for (const key of Object.keys(DIALOGS)) {
      const source = sources[key];
      const capture = source.indexOf("const pageController = namespace.pageController;");
      const accessorAt = source.indexOf("function requirePageController() {");
      assert.notEqual(capture, -1);
      assert.notEqual(accessorAt, -1);
      assert.ok(capture < accessorAt, `${key}.js binds before it declares the check`);

      // Compare against the real call sites, not the accessor's own body.
      const afterAccessor = source.slice(source.indexOf("\n  }\n", accessorAt));
      const calls = (afterAccessor.match(/requirePageController\(\)\./g) || []).length;
      assert.ok(calls > 0, `${key}.js must call the accessor at a use site`);
      assert.ok(!/(?<!require)(?<!\.)\bpageController\.(createOption|sortByName)/.test(afterAccessor),
        `${key}.js must have no unchecked method call left`);
      // A use site that reads the member again would give the dialog a live dependency even
      // though the accessor itself only tests the capture. The member is read once, at capture.
      assert.ok(!/namespace\.pageController/.test(afterAccessor),
        `${key}.js must not read the member again below the capture`);
    }
  });

  it("is delivered by the page before any dialog that captures it is imported", () => {
    // The dialogs are lazily imported by `module-actions.js`; `page-controller.js` is a plain
    // page script. Every page that carries a dialog loads the helper above it, which is why the
    // capture succeeds in normal operation and why checking at capture time would be wrong.
    for (const page of ["calendar", "tasks", "time-entries"]) {
      const html = read(`views/protected/${page}.html`);
      const helper = html.indexOf("js/shared/page-controller.js");
      const dialog = Math.min(...["task-dialog.js", "time-entry-dialog.js", "time-tracking-timer-dialog.js"]
        .map((file) => html.indexOf(file))
        .filter((at) => at !== -1));
      assert.notEqual(helper, -1, `${page}.html must deliver page-controller.js`);
      assert.ok(Number.isFinite(dialog), `${page}.html must carry a dialog`);
      assert.ok(helper < dialog, `${page}.html must deliver the helper before the dialog`);
    }
  });
});

describe("cachedFetch is required only on the branch that uses it", () => {
  /**
   * Lift the shipped manifest loader with both of its shipped accessors.
   * @param {Record<string, unknown>} namespaceValue
   * @param {() => string} [assetVersion]
   */
  function liftManifestLoader(namespaceValue, assetVersion = () => "v1") {
    const body = [
      entrySource.slice(entrySource.indexOf("function requireApi() {"),
        entrySource.indexOf("\n}\n", entrySource.indexOf("function requireApi() {")) + 3),
      entrySource.slice(entrySource.indexOf("function requireCachedFetch() {"),
        entrySource.indexOf("\n}\n", entrySource.indexOf("function requireCachedFetch() {")) + 3),
      entrySource.slice(entrySource.indexOf("async function loadDashboardManifest() {"),
        entrySource.indexOf("\n}\n", entrySource.indexOf("async function loadDashboardManifest() {")) + 3),
      "return loadDashboardManifest;",
    ].join("\n");
    return new Function("namespace", "dashboardAssetVersion", body)(namespaceValue, assetVersion);
  }

  it("takes the direct API path when there is no workspace id, with no cache present", async () => {
    /** @type {unknown[][]} */
    const calls = [];
    const load = liftManifestLoader({
      api: {
        getJson: (/** @type {unknown[]} */ ...args) => {
          calls.push(args);
          return Promise.resolve({ manifest: true });
        },
      },
      workspaceContext: { workspaceId: "   " },
    });
    const result = await load();

    assert.deepEqual(calls, [["/api/dashboard", { cache: "no-store" }]]);
    assert.deepEqual(result.data, { manifest: true });
    assert.equal(result.fromCache, false);
    assert.ok(result.revalidated instanceof Promise, "the in-flight promise is still handed back");
  });

  it("fails in the cached branch, and only there, when the cache is unpublished", async () => {
    const withoutWorkspace = liftManifestLoader({
      api: { getJson: () => Promise.resolve({ manifest: true }) },
      workspaceContext: {},
    });
    await assert.doesNotReject(() => withoutWorkspace(),
      "no workspace id means the cache is never consulted");

    const withWorkspace = liftManifestLoader({
      api: { getJson: () => Promise.resolve({ manifest: true }) },
      workspaceContext: { workspaceId: "ws-1" },
    });
    await assert.rejects(() => withWorkspace(),
      /^Error: The Dashboard bridge requires LongtailForge\.cachedFetch\.$/);
  });

  it("sends the exact route and cache key, and returns the cached result untouched", async () => {
    /** @type {unknown[][]} */
    const calls = [];
    const cached = { data: { manifest: true }, fromCache: true, revalidated: Promise.resolve(null) };
    const cache = {
      getJson: (/** @type {unknown[]} */ ...args) => {
        calls.push([this, ...args]);
        return Promise.resolve(cached);
      },
    };
    const load = liftManifestLoader({
      api: { getJson: () => Promise.resolve({}) },
      cachedFetch: cache,
      workspaceContext: { workspaceId: "ws-9" },
    }, () => "assets-42");
    const result = await load();

    assert.equal(calls.length, 1, "one request, as before");
    assert.equal(calls[0][1], "/api/dashboard");
    assert.deepEqual(calls[0][2], { cacheKey: "ws-9:dashboard:assets-42:manifest" });
    assert.equal(result, cached, "the cached result is returned by identity, not rebuilt");
    assert.equal(result.fromCache, true);
  });

  it("calls the cache on the cache object, and never touches the API on that branch", async () => {
    /** @type {unknown[]} */
    const receivers = [];
    let apiCalls = 0;
    const cache = {
      getJson() {
        receivers.push(this);
        return Promise.resolve({ data: {}, fromCache: true, revalidated: null });
      },
    };
    const load = liftManifestLoader({
      api: { getJson: () => { apiCalls += 1; return Promise.resolve({}); } },
      cachedFetch: cache,
      workspaceContext: { workspaceId: "ws-2" },
    });
    await load();

    assert.deepEqual(receivers, [cache], "the method keeps its own receiver");
    assert.equal(apiCalls, 0, "the cached branch issues no additional request");
  });

  it("looks the cache up per call, so a replacement between loads is seen", async () => {
    // This member was read at the invocation point before this checkpoint and still is; that is
    // the opposite of the dialogs' captured binding, and both are preserved deliberately.
    const first = { getJson: () => Promise.resolve({ which: "first" }) };
    const second = { getJson: () => Promise.resolve({ which: "second" }) };
    /** @type {Record<string, unknown>} */
    const namespace = {
      api: { getJson: () => Promise.resolve({}) },
      cachedFetch: first,
      workspaceContext: { workspaceId: "ws-3" },
    };
    const load = liftManifestLoader(namespace);

    assert.deepEqual(await load(), { which: "first" });
    namespace.cachedFetch = second;
    assert.deepEqual(await load(), { which: "second" });
  });

  it("keeps the requirement below the workspace-id test in the shipped source", () => {
    const body = entrySource.slice(entrySource.indexOf("async function loadDashboardManifest() {"));
    const loader = body.slice(0, body.indexOf("\n}\n"));
    const idTest = loader.indexOf("if (!workspaceId) {");
    const requirement = loader.indexOf("requireCachedFetch()");

    assert.notEqual(idTest, -1, "the workspace-id test must still exist");
    assert.notEqual(requirement, -1, "the cached branch must acquire the cache");
    assert.ok(idTest < requirement, "the uncached path must not depend on the cache");
    assert.ok(!/requireCachedFetch/.test(loader.slice(0, idTest)),
      "nothing acquires the cache before the branch that needs it");
  });

  it("reads the member at the invocation point rather than capturing it at module scope", () => {
    const accessor = entrySource.slice(entrySource.indexOf("function requireCachedFetch() {"));
    const body = accessor.slice(0, accessor.indexOf("\n}\n"));
    assert.match(body, /const cache = namespace\.cachedFetch;/,
      "the member is read inside the accessor, on every call");
    assert.ok(!/^const cachedFetch = /m.test(entrySource),
      "nothing binds the cache at module scope");
  });
});
