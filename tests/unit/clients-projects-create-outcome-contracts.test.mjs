import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * What creating a project does when it works, and what it does when it does not.
 *
 * `0.33.33.43.35` fixed three defects on this page's create path under an explicit ruling. Each
 * was the same mistake in a different place: **treating an unsaved draft as a saved project.**
 *
 * 1. The draft was pushed into `targetClient.projects` before the request went out. On success
 *    that was invisible, because the refresh replaces the whole collection; on failure the refresh
 *    never ran, so an unsaved draft stayed in the saved-project collection.
 * 2. `onSaved` was called unconditionally, so a failed create closed the dialog and discarded what
 *    had been typed - while every other write on this page already gated on its result.
 * 3. A successful write followed by a failed refresh reported "were not saved", which is the
 *    message most likely to make someone create the record a second time.
 *
 * The first two are pinned against the source, because they are the presence and absence of one
 * statement each inside a submit listener. The third is executed.
 */

const source = createProjectTextReader().readText("public/js/clients-projects.js");

/**
 * The persistence wrapper, lifted with the surroundings it does not own.
 * @param {Record<string, unknown>} [overrides]
 */
function liftPersist(overrides = {}) {
  /** @type {unknown[][]} */
  const log = [];
  const sandbox = vm.createContext({
    console: { error: (/** @type {unknown} */ value) => log.push(["console.error", String(value)]) },
    /** @param {unknown} message */
    setStatus: (message) => log.push(["status", message]),
    requireErrors: () => ({
      /** @param {{ message?: string } | null} value @param {string} fallback */
      caughtMessage: (value, fallback) => (value && value.message) || fallback,
    }),
    refreshClientProjectData: async () => { log.push(["refresh"]); },
    refreshActiveClientProjectsReadSurface: async () => { log.push(["refreshSurface"]); },
    /** @param {unknown} selector */
    flashSavedButton: (selector) => log.push(["flash", selector]),
    /** @param {{ action?: string }} action */
    signalClientProjectModuleAction: (action) => log.push(["signal", action.action]),
    openClientId: "",
    openBillingClientId: "",
    openClientBillingSettingsId: "",
    ...overrides,
  });
  vm.runInContext(extractFunctionBlock(source, "persistClientProjectChange"), sandbox);

  return { log, persist: vm.runInContext("persistClientProjectChange", sandbox) };
}

/**
 * Every status message the run set, in order.
 * @param {unknown[][]} log
 */
function statuses(log) {
  return log.filter(([kind]) => kind === "status").map(([, message]) => message);
}

describe("A create that the server accepts", () => {
  it("answers true, refreshes, clears the status, flashes and tells the host it finished", async () => {
    const { log, persist } = liftPersist();

    assert.equal(await persist({ action: "project_created" }, { flashSelector: "#add" }, async () => {}), true);
    assert.deepEqual(log.map(([kind]) => kind),
      ["status", "refresh", "refreshSurface", "status", "flash", "signal"]);
    assert.deepEqual(statuses(log), ["Saving clients and projects...", ""]);
  });
});

describe("A create the server refuses", () => {
  it("answers false, so every caller that gates on it keeps its form open", async () => {
    const { persist } = liftPersist();

    assert.equal(await persist({ action: "project_created" }, {}, async () => { throw new Error("offline"); }), false);
  });

  it("does not refresh, does not flash, and does not tell the host anything finished", async () => {
    const { log, persist } = liftPersist();
    await persist({ action: "project_created" }, { flashSelector: "#add" }, async () => { throw new Error("offline"); });

    for (const kind of ["refresh", "refreshSurface", "flash", "signal"]) {
      assert.ok(!log.some(([entry]) => entry === kind), `nothing ${kind}ed after a refused write`);
    }
  });

  it("shows what went wrong, and falls back when the failure carries no message", async () => {
    const withMessage = liftPersist();
    await withMessage.persist({}, {}, async () => { throw new Error("offline"); });
    assert.equal(statuses(withMessage.log).at(-1), "offline");

    const bare = liftPersist();
    await bare.persist({}, {}, async () => { throw null; });
    assert.equal(statuses(bare.log).at(-1),
      "Clients and projects were not saved. Start the local server and try again.");
  });
});

describe("A create that succeeded, followed by a refresh that did not", () => {
  /** @param {string} failing */
  function afterWriteFailure(failing) {
    return liftPersist({ [failing]: async () => { throw new Error("Failed to fetch"); } });
  }

  it("answers true, because the record exists", async () => {
    const { persist } = afterWriteFailure("refreshClientProjectData");

    assert.equal(await persist({ action: "project_created" }, {}, async () => {}), true);
  });

  it("leads with the save having succeeded, and never says the change was not saved", async () => {
    const { log, persist } = afterWriteFailure("refreshClientProjectData");
    await persist({ action: "project_created" }, {}, async () => {});
    const message = String(statuses(log).at(-1));

    // This is the whole point of the split. "were not saved" after a committed write is the
    // message most likely to produce a duplicate record.
    assert.ok(message.startsWith("Saved,"), `the message leads with the save: ${message}`);
    assert.doesNotMatch(message, /were not saved/);
    assert.match(message, /Reload the page/, "and says what to do about the stale view");
    assert.match(message, /\(Failed to fetch\)/, "while still reporting what failed");
  });

  it("treats the whole post-write phase the same way, not just the first step", async () => {
    // The read-surface refresh runs after the data refresh; a failure there is equally a stale
    // view rather than a lost record, so it must not be reported as a failed save either.
    const { log, persist } = afterWriteFailure("refreshActiveClientProjectsReadSurface");

    assert.equal(await persist({ action: "project_created" }, {}, async () => {}), true);
    assert.ok(String(statuses(log).at(-1)).startsWith("Saved,"));
  });

  it("is distinguishable from a refused write by both answer and wording", async () => {
    const refused = liftPersist();
    const stale = afterWriteFailure("refreshClientProjectData");

    const refusedAnswer = await refused.persist({}, {}, async () => { throw new Error("Failed to fetch"); });
    const staleAnswer = await stale.persist({}, {}, async () => {});

    // Identical underlying failure, opposite meaning - which is exactly what was conflated before.
    assert.equal(refusedAnswer, false);
    assert.equal(staleAnswer, true);
    assert.notEqual(statuses(refused.log).at(-1), statuses(stale.log).at(-1));
  });
});

describe("The create submit listener", () => {
  /** The listener body, taken from the add-project form builder. */
  function submitListener() {
    const at = source.indexOf("function createAddProjectForm(");
    assert.notEqual(at, -1, "the add-project form builder is still here");
    const listener = source.indexOf("form.addEventListener(\"submit\"", at);
    assert.notEqual(listener, -1, "and still submits");

    return source.slice(listener, source.indexOf("\n    });", listener));
  }

  it("no longer puts the draft into the saved-project collection", () => {
    assert.doesNotMatch(submitListener(), /\.projects\.push\(/,
      "an unsaved draft is not a project; the refresh brings the saved record instead");
    assert.doesNotMatch(source, /targetClient\.projects\.push\(/,
      "and nothing else on this page pushes one either");
  });

  it("calls the completion callback only when the create succeeded", () => {
    const listener = submitListener();

    assert.match(listener, /const created = await createProjectRecord\(/,
      "the result is captured rather than discarded");
    assert.match(listener, /if \(created\) \{[\s\S]*?onSaved\?\.\(\);/,
      "and gates the callback on it");
    assert.doesNotMatch(listener, /\n\s+onSaved\?\.\(\);\n\s+\}\);/,
      "with no unconditional call left behind");
  });

  it("gates the same way the page's other writes already did", () => {
    // The project editor's save, the archive action and client creation were all already gated.
    // Create was the only one that was not, which is why this reads as a consistency fix.
    assert.match(source, /const saved = await saveProjectRecord\(/);
    assert.match(source, /const saved = await createClientRecord\(/);
    assert.match(source, /const archived = await /);
  });
});
