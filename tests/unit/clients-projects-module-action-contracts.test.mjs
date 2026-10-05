import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * Which record a Clients/Projects module action opens, and what it reports when it cannot.
 *
 * `0.33.33.43.41` typed the module-action and query-opener paths. These decide which record's
 * editor opens when a request arrives from a URL query or another module's action, so a mistake
 * can open the wrong record or show an action the user cannot take. Two executable reads changed,
 * and both are proved here **against the implementation they replaced**, not against a restatement:
 *
 * 1. `clientProjectActionParams` reads `id` and `recordId` with `Reflect.get`, because narrowing the
 *    record to `object` names no member. **`id` must still win over `recordId`.**
 * 2. `handleClientProjectActionError` reads `message` off an `unknown` thrown value. **A thrown
 *    string must still fall back to the generic message**, not be shown.
 *
 * The baseline functions are lifted from the commit before this change and run beside the new
 * ones over the same inputs, so any divergence - in the answer or in what was read - fails.
 */

const source = createProjectTextReader().readText("public/js/clients-projects.js");
const baseline = execFileSync("git", ["show", "5b663b10:public/js/clients-projects.js"], {
  cwd: process.cwd(),
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

/** @param {string} text @param {string} name @param {Record<string, unknown>} [globals] */
function liftFrom(text, name, globals = {}) {
  const sandbox = vm.createContext({ ...globals });
  vm.runInContext(extractFunctionBlock(text, name), sandbox);
  return vm.runInContext(name, sandbox);
}

/** @param {unknown} value */
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

/** Records every member read, so "what was read" can be compared as well as "what came back". */
function readTracking(/** @type {Record<string, unknown>} */ target) {
  /** @type {string[]} */
  const reads = [];
  const proxy = new Proxy(target, {
    get(object, key, receiver) {
      reads.push(String(key));
      return Reflect.get(object, key, receiver);
    },
    ownKeys(object) { return Reflect.ownKeys(object); },
    getOwnPropertyDescriptor(object, key) { return Reflect.getOwnPropertyDescriptor(object, key); },
  });
  return { proxy, reads };
}

describe("Which record a module action opens", () => {
  const RECORDS = [
    { id: "c1" },
    { recordId: "c2" },
    { id: "c1", recordId: "c2" },
    { id: "", recordId: "c2" },
    { id: 0, recordId: "c2" },
    { id: null, recordId: "c2" },
    {},
    { name: "no identifier" },
    { id: "c1", name: "Acme", status: "Active" },
  ];
  const CONTEXTS = [
    ...RECORDS.map((record) => ({ record })),
    { record: null },
    { record: "c1" },
    { record: 7 },
    { record: undefined },
    {},
    undefined,
  ];

  it("answers exactly what the baseline answered, for every record shape", () => {
    const before = liftFrom(baseline, "clientProjectActionParams");
    const after = liftFrom(source, "clientProjectActionParams");

    for (const context of CONTEXTS) {
      assert.deepEqual(plain(after(context)), plain(before(context)), JSON.stringify(context));
    }
  });

  it("reads the same members, in the same order, as the baseline", () => {
    const before = liftFrom(baseline, "clientProjectActionParams");
    const after = liftFrom(source, "clientProjectActionParams");

    for (const record of RECORDS) {
      const a = readTracking({ ...record });
      const b = readTracking({ ...record });
      before({ record: a.proxy });
      after({ record: b.proxy });
      assert.deepEqual(b.reads, a.reads, JSON.stringify(record));
    }
  });

  it("opens by id when a record carries both, and by recordId only when id is absent or falsy", () => {
    const params = liftFrom(source, "clientProjectActionParams");

    assert.equal(params({ record: { id: "c1", recordId: "c2" } }).recordId, "c1", "id wins");
    assert.equal(params({ record: { recordId: "c2" } }).recordId, "c2");
    assert.equal(params({ record: { id: "", recordId: "c2" } }).recordId, "c2", "an empty id is not an id");
    assert.equal(params({ record: {} }).recordId, "", "neither present opens nothing in particular");
  });

  it("treats a record that is not an object as no record at all", () => {
    const params = liftFrom(source, "clientProjectActionParams");

    for (const record of [null, undefined, "c1", 7, true]) {
      assert.deepEqual(plain(params({ record })), { recordId: "" }, `${JSON.stringify(record)} contributes nothing`);
    }
  });

  it("keeps the record's own members beside the identifier it derives", () => {
    const params = liftFrom(source, "clientProjectActionParams");

    assert.deepEqual(plain(params({ record: { id: "c1", name: "Acme" } })), { id: "c1", name: "Acme", recordId: "c1" });
  });
});

describe("What an action that cannot open reports", () => {
  /** @param {string} text */
  function liftHandler(text) {
    /** @type {unknown[]} */
    const statuses = [];
    const handler = liftFrom(text, "handleClientProjectActionError", {
      setStatus: (/** @type {unknown} */ message) => statuses.push(message),
      console: { error: () => {} },
    });
    return { handler, statuses };
  }

  const THROWN = [
    () => new Error("Registry offline"),
    () => ({ message: "Plain object message" }),
    () => ({ message: "" }),
    () => ({ message: 0 }),
    () => ({}),
    () => "a thrown string",
    () => 42,
    () => true,
    () => null,
    () => undefined,
    () => Object.create({ message: "Inherited message" }),
  ];

  it("reports exactly what the baseline reported, for every kind of thrown value", () => {
    for (const make of THROWN) {
      const before = liftHandler(baseline);
      const after = liftHandler(source);
      before.handler(make());
      after.handler(make());

      assert.deepEqual(after.statuses, before.statuses, String(make));
    }
  });

  it("still falls back for a thrown string rather than showing the string", () => {
    const { handler, statuses } = liftHandler(source);
    handler("internal detail");

    assert.deepEqual(statuses, ["Client/Project action could not be opened."]);
  });

  it("reads a message getter once, with the thrown value as its receiver", () => {
    const { handler, statuses } = liftHandler(source);
    let reads = 0;
    const thrown = {
      get message() {
        assert.equal(this, thrown, "the thrown value itself is the receiver");
        reads += 1;
        return "From a getter";
      },
    };
    handler(thrown);

    assert.equal(reads, 1);
    assert.deepEqual(statuses, ["From a getter"]);
  });

  it("reads nothing at all for a nullish thrown value, even with a polluted prototype", () => {
    // Why the explicit nullish test exists. Boxing `null` would still walk `Object.prototype`, so a
    // `message` getter planted there would run - `error?.message` never looked. The sandbox has its
    // own `Object.prototype`, so this pollutes nothing outside it.
    /** @type {unknown[]} */
    const statuses = [];
    const sandbox = vm.createContext({
      setStatus: (/** @type {unknown} */ message) => statuses.push(message),
      console: { error: () => {} },
    });
    vm.runInContext(extractFunctionBlock(source, "handleClientProjectActionError"), sandbox);
    vm.runInContext(`Object.defineProperty(Object.prototype, "message", {
      configurable: true,
      get() { throw new Error("a polluted prototype was read"); },
    });`, sandbox);

    for (const thrown of [null, undefined]) {
      assert.doesNotThrow(() => vm.runInContext("handleClientProjectActionError", sandbox)(thrown));
    }
    assert.deepEqual(statuses, ["Client/Project action could not be opened.", "Client/Project action could not be opened."]);
  });
});

describe("The real opener path, from a registered behaviour to the editor it opens", () => {
  /** @param {{ registry?: boolean }} [options] */
  function liftOpeners(options = {}) {
    /** @type {Record<string, Function>} */
    const behaviours = {};
    /** @type {unknown[][]} */
    const opened = [];
    const sandbox = vm.createContext({
      requireDescriptorRenderers: () => ({
        /** @param {string} id @param {Function} handler */
        registerBehavior: (id, handler) => { behaviours[id] = handler; },
      }),
      window: {
        LongtailForge: options.registry ? {
          moduleActions: {
            /** @param {string} actionId @param {unknown} params */
            open: (actionId, params) => { opened.push(["registry", actionId, plain(params)]); return Promise.resolve("opened"); },
          },
        } : {},
      },
      refreshClientProjectData: async () => {},
      setStatus: () => {},
      openAddClientAction: (/** @type {unknown} */ params) => { opened.push(["clients.add", plain(params)]); return Promise.resolve("ok"); },
      openEditClientAction: (/** @type {unknown} */ params) => { opened.push(["clients.edit", plain(params)]); return Promise.resolve("ok"); },
      openAddProjectAction: (/** @type {unknown} */ params) => { opened.push(["projects.add", plain(params)]); return Promise.resolve("ok"); },
      openEditProjectAction: (/** @type {unknown} */ params) => { opened.push(["projects.edit", plain(params)]); return Promise.resolve("ok"); },
    });
    for (const name of ["clientProjectActionParams", "openClientProjectActionFallback", "openClientProjectModuleAction",
      "registerClientProjectsModuleActionBehavior"]) {
      vm.runInContext(extractFunctionBlock(source, name), sandbox);
    }
    const register = vm.runInContext("registerClientProjectsModuleActionBehavior", sandbox);

    return { behaviours, opened, register, open: vm.runInContext("openClientProjectModuleAction", sandbox) };
  }

  it("opens the editor for exactly the record the behaviour was handed", async () => {
    const openers = liftOpeners();
    openers.register("client-projects.clients.edit", "clients.edit");
    await openers.behaviours["client-projects.clients.edit"]({ record: { id: "c7", name: "Acme" } });

    assert.deepEqual(openers.opened, [["clients.edit", { id: "c7", name: "Acme", recordId: "c7" }]]);
  });

  it("dispatches each owned action to its own opener when the registry is not loaded", async () => {
    const openers = liftOpeners();
    for (const actionId of ["clients.add", "clients.edit", "projects.add", "projects.edit"]) {
      await openers.open(actionId, { recordId: "r1" });
    }

    assert.deepEqual(openers.opened.map(([actionId]) => actionId), ["clients.add", "clients.edit", "projects.add", "projects.edit"]);
  });

  it("refuses an action it does not own rather than opening nothing", async () => {
    const openers = liftOpeners();

    await assert.rejects(openers.open("tasks.edit", {}), /Client\/Project action 'tasks\.edit' is not registered\./);
    assert.deepEqual(openers.opened, []);
  });

  it("hands the action to the shared registry when it is loaded, and not to its own openers", async () => {
    const openers = liftOpeners({ registry: true });
    openers.register("client-projects.projects.edit", "projects.edit");
    await openers.behaviours["client-projects.projects.edit"]({ record: { id: "p3" } });

    assert.deepEqual(openers.opened, [["registry", "projects.edit", { id: "p3", recordId: "p3" }]]);
  });
});
