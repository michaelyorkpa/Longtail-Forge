import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { FakeDocument, createFakeEvent, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * The Clients/Projects settings reader and rounding snapshot (`0.33.33.43.57`).
 *
 * The operator approved checked wire reads and a single read of the rounding increment. The
 * settings body and the rounding rule are now `unknown`, read through `readWireMember`, and a
 * collection's `find` goes through `callWireMethod`. Proved beside `8f82a7d8` through the callers:
 * - the reads, their order and their receivers are the same for every settings body, logged
 *   through a proxy;
 * - so are the answers, the page state the load leaves and the text it displays;
 * - the rounding rule answers the same for every plain rule its producers hand it.
 *
 * Two message changes are expected, and each is named where it is asserted:
 * - a required read of a nullish value, which the operator approved;
 * - a `find` that cannot be called, which is the same rule applied to a call.
 *
 * One read-count change is expected: the increment is read once, not twice. It shows only through
 * an accessor, and the accessor case below records it.
 */

const BASE = "8f82a7d8";
const current = createProjectTextReader().readText("public/js/clients-projects.js");
const baseline = execFileSync("git", ["show", `${BASE}:public/js/clients-projects.js`], {
  cwd: process.cwd(),
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

/** @type {ReadonlyArray<readonly [string, string]>} */
const VERSIONS = [["current", current], [BASE, baseline]];
const WIRE_READERS = ["readWireMember", "callWireMethod"];
const SETTINGS_READERS = ["normalizeSettings", "readModuleSettingValue", "normalizeBillingPeriod", "normalizeBillingRounding", "vocabularyHas"];

/** A function block without its comments, so only an annotation or a note can differ. @param {string} block */
const withoutComments = (block) => block.replace(/[ \t]*\/\*\*[\s\S]*?\*\/\n/g, "").replace(/\/\*\*[\s\S]*?\*\/ ?/g, "").replace(/[ \t]*\/\/[^\n]*\n/g, "");

/** @param {string} text @param {string} opener @param {string} closer */
function declaration(text, opener, closer) {
  const at = text.indexOf(opener);
  expect(at, opener).toBeGreaterThan(-1);
  return text.slice(at, text.indexOf(closer, at) + closer.length);
}

/**
 * Lifts functions from one version into a fresh sandbox, with the wire readers when that version
 * has them.
 * @param {string} text @param {string[]} names @param {Record<string, unknown>} [globals]
 */
function liftFrom(text, names, globals = {}) {
  const context = vm.createContext({ ...globals });
  for (const name of WIRE_READERS) {
    if (text.includes(`  function ${name}(`)) {
      vm.runInContext(extractFunctionBlock(text, name), context);
    }
  }
  for (const name of names) {
    vm.runInContext(extractFunctionBlock(text, name), context);
  }
  return context;
}

/**
 * A value wrapped so every member read, own-property check and `in` test it answers is logged, with
 * the path it was reached by. Nested objects are wrapped as they are read.
 * @param {unknown} value @param {string[]} log @param {string} [path]
 * @returns {unknown}
 */
function logged(value, log, path = "body") {
  if (value === null || typeof value !== "object") {
    return value;
  }
  return new Proxy(value, {
    get(target, key, receiver) {
      const name = String(key);
      log.push(`get ${path}.${name}${receiver === proxyOf.get(target) ? "" : " (other receiver)"}`);
      const member = Reflect.get(target, key, receiver);
      return typeof member === "function" ? member : logged(member, log, `${path}.${name}`);
    },
    getOwnPropertyDescriptor(target, key) {
      log.push(`own ${path}.${String(key)}`);
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
    has(target, key) {
      log.push(`has ${path}.${String(key)}`);
      return Reflect.has(target, key);
    },
  });
}
/** Each wrapped target's own proxy, so the log can say when a read used another receiver. */
const proxyOf = new WeakMap();
/** @param {unknown} value @param {string[]} log */
function loggedBody(value, log) {
  const wrapped = logged(value, log);
  if (value !== null && typeof value === "object") {
    // Only the top-level body is checked for its receiver; nested members are wrapped afresh on
    // every read, so their receivers are compared through the log's paths instead.
    proxyOf.set(value, wrapped);
  }
  return wrapped;
}

/**
 * What one call answered or threw, in a form that compares across realms.
 * @param {() => unknown} call
 */
function outcome(call) {
  try {
    return { value: JSON.parse(JSON.stringify(call() ?? null)) };
  } catch (error) {
    const thrown = /** @type {{ name?: unknown, message?: unknown }} */ (Object(error));
    return { threw: String(thrown.name), message: String(thrown.message) };
  }
}

/**
 * A settings body shaped like the one `settings.service` `readInternal` answers.
 * @param {{ workspaceType?: unknown, periodType?: unknown, startDay?: unknown, rate?: unknown, enabled?: unknown, increment?: unknown }} [values]
 */
function settingsBody(values = {}) {
  const { workspaceType = "business", periodType = "custom", startDay = 15, rate = "140", enabled = true, increment = "nearestHalfHour" } = values;
  return {
    workspaceId: "ws-1",
    workspaceName: "Acme",
    workspaceType,
    enabledModules: ["notes", "client-projects", "time-tracking"],
    frameworkSettings: { timezone: "UTC" },
    moduleSettings: [
      { moduleId: "notes", name: "Notes", settings: [{ id: "defaultNoteKind", type: "select", default: "note", value: "note" }] },
      {
        moduleId: "client-projects",
        name: "Clients & Projects",
        settings: [
          { id: "billingPeriodType", type: "select", placement: "workspace", default: "calendarMonth", value: periodType },
          { id: "billingPeriodStartDay", type: "number", placement: "workspace", default: 1, value: startDay },
          { id: "defaultBillingRate", type: "text", placement: "workspace", default: "", value: rate },
        ],
      },
      {
        moduleId: "time-tracking",
        name: "Time Tracking",
        settings: [
          { id: "billingRoundingEnabled", type: "boolean", placement: "workspace", default: false, value: enabled },
          { id: "billingRoundingIncrement", type: "select", placement: "workspace", default: "nearestQuarterHour", value: increment },
        ],
      },
    ],
  };
}

/**
 * Every settings body the comparison runs, each built fresh. `wording` names the one message
 * change a case is expected to show, and `same` means none.
 * @returns {Array<{ name: string, wording: "same" | "nullish-read" | "not-callable", body: () => unknown }>}
 */
function settingsCases() {
  const realBody = settingsBody();
  return [
    { name: "a real body", wording: "same", body: () => settingsBody() },
    ...["business", "personal", "family"].map((workspaceType) => ({
      name: `a ${workspaceType} workspace`, wording: /** @type {const} */ ("same"), body: () => settingsBody({ workspaceType }),
    })),
    ...["nearestHour", "nearestHalfHour", "nearestQuarterHour", "nearestMinute", "", 15, null].map((increment) => ({
      name: `increment ${JSON.stringify(increment)}`, wording: /** @type {const} */ ("same"), body: () => settingsBody({ increment }),
    })),
    ...[false, 0, "", null, "yes", 1].map((enabled) => ({
      name: `enabled ${JSON.stringify(enabled)}`, wording: /** @type {const} */ ("same"), body: () => settingsBody({ enabled }),
    })),
    { name: "a calendar-month period with a text start day", wording: "same", body: () => settingsBody({ periodType: "calendarMonth", startDay: "7" }) },
    { name: "a numeric rate", wording: "same", body: () => settingsBody({ rate: 95 }) },
    ...["enterprise", 5, null, ["business"], { value: "business" }].map((workspaceType) => ({
      name: `workspace type ${JSON.stringify(workspaceType)}`, wording: /** @type {const} */ ("same"), body: () => settingsBody({ workspaceType }),
    })),
    { name: "an empty body", wording: "same", body: () => ({}) },
    { name: "a null body", wording: "same", body: () => null },
    { name: "an absent body", wording: "same", body: () => undefined },
    ...[0, "", "text", 5, true, false, []].map((body) => ({
      name: `the primitive or list body ${JSON.stringify(body)}`, wording: /** @type {const} */ ("same"), body: () => body,
    })),
    { name: "no module settings", wording: "same", body: () => ({ workspaceType: "personal" }) },
    { name: "an empty module list", wording: "same", body: () => ({ moduleSettings: [] }) },
    { name: "a module with no settings", wording: "same", body: () => ({ moduleSettings: [{ moduleId: "client-projects" }] }) },
    {
      name: "settings with no value, which fall back",
      wording: "same",
      body: () => ({ moduleSettings: [{ moduleId: "time-tracking", settings: [{ id: "billingRoundingIncrement" }, { id: "billingRoundingEnabled", default: true }] }] }),
    },
    {
      name: "extra members everywhere",
      wording: "same",
      body: () => ({ ...settingsBody(), extra: 1, moduleSettings: settingsBody().moduleSettings.map((module) => ({ ...module, extra: true })) }),
    },
    { name: "a body inheriting everything", wording: "same", body: () => Object.create(realBody) },
    {
      name: "a setting whose value is only inherited",
      wording: "same",
      body: () => ({ moduleSettings: [{ moduleId: "time-tracking", settings: [Object.assign(Object.create({ value: "nearestHour" }), { id: "billingRoundingIncrement" })] }] }),
    },
    {
      name: "getter-backed members",
      wording: "same",
      body: () => ({
        get workspaceType() { return "family"; },
        get moduleSettings() { return settingsBody({ increment: "nearestHour" }).moduleSettings; },
      }),
    },
    { name: "a primitive module entry", wording: "same", body: () => ({ moduleSettings: [5, "client-projects", settingsBody().moduleSettings[1]] }) },
    { name: "a null module entry", wording: "nullish-read", body: () => ({ moduleSettings: [null] }) },
    { name: "an absent module entry", wording: "nullish-read", body: () => ({ moduleSettings: [undefined, settingsBody().moduleSettings[1]] }) },
    { name: "a null setting entry", wording: "nullish-read", body: () => ({ moduleSettings: [{ moduleId: "client-projects", settings: [null] }] }) },
    ...["text", 5, true, {}].map((moduleSettings) => ({
      name: `module settings ${JSON.stringify(moduleSettings)}`, wording: /** @type {const} */ ("not-callable"), body: () => ({ moduleSettings }),
    })),
    { name: "a module's settings that are not a list", wording: "not-callable", body: () => ({ moduleSettings: [{ moduleId: "client-projects", settings: {} }] }) },
    {
      name: "a collection carrying its own find",
      wording: "same",
      body: () => ({
        moduleSettings: {
          /** @param {(item: unknown) => boolean} test */
          find(test) {
            const modules = settingsBody().moduleSettings;
            return modules.find((item) => test(item));
          },
        },
      }),
    },
  ];
}

/** @param {string} text */
function settingsReaderFrom(text) {
  const context = liftFrom(text, SETTINGS_READERS);
  /** @type {(settings: unknown) => unknown} */
  const normalizeSettings = vm.runInContext("normalizeSettings", context);
  return normalizeSettings;
}

describe("The wire reader reads as a property access does", () => {
  const context = liftFrom(current, []);
  /** @type {(value: unknown, key: string, options?: { optional?: boolean }) => unknown} */
  const readWireMember = vm.runInContext("readWireMember", context);
  /** @type {(value: unknown, key: string, args: unknown[]) => unknown} */
  const callWireMethod = vm.runInContext("callWireMethod", context);

  it("answers own and inherited members, with the value itself as a getter's receiver", () => {
    const record = { name: "Acme", get self() { return this; } };
    expect(readWireMember(record, "name")).toBe("Acme");
    expect(readWireMember(record, "self")).toBe(record);
    expect(readWireMember(Object.create({ inherited: 3 }), "inherited")).toBe(3);
    expect(readWireMember(record, "absent")).toBeUndefined();
    expect(readWireMember("text", "length")).toBe(4);
  });

  it("hands a primitive to a strict getter as the primitive, as a property access does", () => {
    // The probe lives on the sandbox's own `String.prototype`, the one its `Object()` boxes into.
    vm.runInContext(`Object.defineProperty(String.prototype, "receiverKind", {
      configurable: true, get() { "use strict"; return typeof this; } })`, context);
    expect(readWireMember("text", "receiverKind")).toBe(vm.runInContext(`"text".receiverKind`, context));
    expect(readWireMember("text", "receiverKind")).toBe("string");
  });

  it("answers undefined for an optional read of a nullish value, reading nothing", () => {
    expect(readWireMember(null, "anything", { optional: true })).toBeUndefined();
    expect(readWireMember(undefined, "anything", { optional: true })).toBeUndefined();
    expect(readWireMember({ present: 1 }, "present", { optional: true })).toBe(1);
  });

  it("throws its own TypeError for a required read of a nullish value, naming the member", () => {
    expect(outcome(() => readWireMember(null, "moduleId"))).toEqual({
      threw: "TypeError", message: 'Clients/Projects cannot read "moduleId" from null loaded data.',
    });
    expect(outcome(() => readWireMember(undefined, "id"))).toEqual({
      threw: "TypeError", message: 'Clients/Projects cannot read "id" from undefined loaded data.',
    });
  });

  it("calls a member with the value as its receiver, a list's own method included", () => {
    const list = [1, 2, 3];
    expect(callWireMethod(list, "find", [(/** @type {unknown} */ item) => item === 2])).toBe(2);
    const carrier = { find() { return this; } };
    expect(callWireMethod(carrier, "find", [])).toBe(carrier);
  });

  it("fails at the call, with its own TypeError, when the member cannot be called", () => {
    for (const value of ["text", 5, true, {}, { find: "not a function" }]) {
      expect(outcome(() => callWireMethod(value, "find", [])), JSON.stringify(value)).toEqual({
        threw: "TypeError", message: 'Clients/Projects cannot call "find" on loaded data where it is not a function.',
      });
    }
    expect(outcome(() => callWireMethod(null, "find", [])).message).toBe('Clients/Projects cannot read "find" from null loaded data.');
  });
});

describe(`The settings reader answers what ${BASE} answered`, () => {
  it("with the same reads, in the same order, and the same answer or failure for every body", () => {
    const [now, before] = VERSIONS.map(([, text]) => settingsReaderFrom(text));
    for (const { name, wording, body } of settingsCases()) {
      /** @type {string[]} */
      const nowLog = [];
      /** @type {string[]} */
      const beforeLog = [];
      const nowOutcome = outcome(() => now(loggedBody(body(), nowLog)));
      const beforeOutcome = outcome(() => before(loggedBody(body(), beforeLog)));

      expect(nowLog, `${name}: the reads`).toEqual(beforeLog);
      if (wording === "same") {
        expect(nowOutcome, name).toEqual(beforeOutcome);
        continue;
      }
      // The two named message changes: the failure is the same TypeError at the same read or call,
      // after the same reads, and only its wording is now this file's.
      expect(beforeOutcome.threw, `${name}: it failed before`).toBe("TypeError");
      expect(nowOutcome.threw, `${name}: it fails now`).toBe("TypeError");
      expect(nowOutcome.message, name).toMatch(wording === "nullish-read"
        ? /^Clients\/Projects cannot read "(moduleId|id)" from (null|undefined) loaded data\.$/
        : /^Clients\/Projects cannot call "find" on loaded data where it is not a function\.$/);
    }
  });

  it("still defaults a nullish body, which the approval requires", () => {
    const normalizeSettings = settingsReaderFrom(current);
    const defaults = {
      defaultBillingRate: "",
      billingPeriod: { type: "calendarMonth", startDay: 1 },
      billingRounding: { enabled: false, increment: "nearestQuarterHour" },
      workspaceType: "business",
    };
    expect(outcome(() => normalizeSettings(null))).toEqual({ value: defaults });
    expect(outcome(() => normalizeSettings(undefined))).toEqual({ value: defaults });
  });

  it("reads the real body into the page's own shape", () => {
    expect(outcome(() => settingsReaderFrom(current)(settingsBody({ workspaceType: "family", increment: "nearestHour" })))).toEqual({
      value: {
        defaultBillingRate: "140",
        billingPeriod: { type: "custom", startDay: 15 },
        billingRounding: { enabled: true, increment: "nearestHour" },
        workspaceType: "family",
      },
    });
  });
});

/**
 * One version's load path, lifted with the real settings reader and stand-ins for everything else.
 * @param {string} text @param {unknown} settingsResponse
 */
function loadPathFrom(text, settingsResponse) {
  /** @type {unknown[][]} */
  const log = [];
  const context = liftFrom(text, [...SETTINGS_READERS, "loadPageData", "loadClientProjectDialogData"], {
    log,
    requireApi: () => ({
      /** @param {string} url */
      getJson: async (url) => (url.startsWith("/api/settings") ? settingsResponse : { clients: [] }),
    }),
    requireNamespace: () => ({ workspaceContextReady: Promise.resolve() }),
    loadTagOptions: async () => ["tag"],
    applyClientProjectQueryActions: () => log.push(["query actions"]),
    /** @param {unknown} message */
    setStatus: (message) => log.push(["status", message]),
    console: {
      /** @param {unknown} error */
      error: (error) => log.push(["console.error", String(Object(error).name)]),
    },
    normalizeData: () => {
      log.push(["normalizeData"]);
      return { capabilities: {}, clients: ["loaded"] };
    },
  });
  vm.runInContext(declaration(text, "  let clientProjectData = {", "\n  };"), context);
  vm.runInContext(declaration(text, "  let workspaceSettings = {", "\n  };"), context);
  vm.runInContext("let tagOptions = [];", context);
  /** @type {{ loadPageData: () => Promise<void>, loadClientProjectDialogData: () => Promise<void>, state: () => unknown }} */
  const page = vm.runInContext("({ loadPageData, loadClientProjectDialogData, state: () => ({ workspaceSettings, clientProjectData, tagOptions }) })", context);
  return { page, log };
}

describe("The load paths leave the page as they did", () => {
  const bodies = [
    ["a real body", () => settingsBody({ workspaceType: "personal", increment: "nearestHour" })],
    ["a nullish body", () => null],
    ["a malformed module entry", () => ({ moduleSettings: [null] })],
    ["a malformed module list", () => ({ moduleSettings: "text" })],
  ];

  it("in the page state, the status it shows and what it logs", async () => {
    for (const [name, body] of /** @type {Array<[string, () => unknown]>} */ (bodies)) {
      const results = [];
      for (const [, text] of VERSIONS) {
        const { page, log } = loadPathFrom(text, body());
        await page.loadPageData();
        results.push(JSON.parse(JSON.stringify({ state: page.state(), log })));
      }
      expect(results[0], name).toEqual(results[1]);
    }
  });

  it("shows the page's own text when the settings cannot be read, and does no later work", async () => {
    const { page, log } = loadPathFrom(current, { moduleSettings: [null] });
    await page.loadPageData();
    expect(log).toEqual([
      ["status", "Loading clients and projects..."],
      ["status", "Client and project data could not be loaded."],
      ["console.error", "TypeError"],
    ]);
    expect(JSON.parse(JSON.stringify(page.state()))).toMatchObject({
      workspaceSettings: { workspaceType: "business" }, clientProjectData: { clients: [] }, tagOptions: [],
    });
  });

  it("rejects a dialog's data load with the same kind of failure, leaving the state untouched", async () => {
    for (const [name, body] of /** @type {Array<[string, () => unknown]>} */ (bodies)) {
      const results = [];
      for (const [, text] of VERSIONS) {
        const { page, log } = loadPathFrom(text, body());
        const rejected = await page.loadClientProjectDialogData().then(() => "resolved", (error) => String(Object(error).name));
        results.push(JSON.parse(JSON.stringify({ rejected, state: page.state(), log })));
      }
      expect(results[0], name).toEqual(results[1]);
    }
  });
});

/** @param {string} text */
function roundingReadersFrom(text) {
  const context = liftFrom(text, ["normalizeBillingRounding", "normalizeOptionalBillingRounding", "vocabularyHas"]);
  /** @type {{ normalizeBillingRounding: (rounding?: unknown) => unknown, normalizeOptionalBillingRounding: (rounding?: unknown) => unknown }} */
  const readers = vm.runInContext("({ normalizeBillingRounding, normalizeOptionalBillingRounding })", context);
  return readers;
}

/** Every plain rounding rule the producers can hand over, and the malformed ones around them. */
function roundingRules() {
  return [
    ...["nearestHour", "nearestHalfHour", "nearestQuarterHour"].flatMap((increment) => [
      { enabled: true, increment }, { enabled: false, increment }, { increment },
    ]),
    ...["nearestMinute", "", "NEARESTHOUR", " nearestHour"].map((increment) => ({ enabled: true, increment })),
    ...[5, null, true, ["nearestHour"], { value: "nearestHour" }].map((increment) => ({ enabled: true, increment })),
    ...[1, 0, "yes", "", "false", null].map((enabled) => ({ enabled, increment: "nearestHour" })),
    {}, { type: "custom", enabled: true, increment: "nearestHalfHour" }, { type: "inherit", enabled: true },
    Object.create({ enabled: true, increment: "nearestHour" }),
    null, undefined, "nearestHour", 5, true, 0, "",
  ];
}

describe("The rounding reader, reading its increment once", () => {
  it("answers every plain rule exactly as before, through both readers", () => {
    const [now, before] = VERSIONS.map(([, text]) => roundingReadersFrom(text));
    for (const rule of roundingRules()) {
      expect(outcome(() => now.normalizeBillingRounding(rule)), JSON.stringify(rule)).toEqual(outcome(() => before.normalizeBillingRounding(rule)));
      expect(outcome(() => now.normalizeOptionalBillingRounding(rule)), JSON.stringify(rule)).toEqual(outcome(() => before.normalizeOptionalBillingRounding(rule)));
    }
  });

  it("differs only in reading an accepted increment once, then enabled, as approved", () => {
    const [now, before] = VERSIONS.map(([, text]) => roundingReadersFrom(text));
    for (const rule of [{ enabled: true, increment: "nearestHour" }, { enabled: false, increment: "bogus" }, {}]) {
      /** @type {string[]} */
      const nowLog = [];
      /** @type {string[]} */
      const beforeLog = [];
      now.normalizeBillingRounding(loggedBody(rule, nowLog));
      before.normalizeBillingRounding(loggedBody(rule, beforeLog));
      expect(nowLog, JSON.stringify(rule)).toEqual(["get body.increment", "get body.enabled"]);
      expect(beforeLog, JSON.stringify(rule)).toEqual(rule.increment === "nearestHour"
        ? ["get body.increment", "get body.increment", "get body.enabled"]
        : ["get body.increment", "get body.enabled"]);
    }
  });

  it("returns the increment it tested: the approved difference, visible only through an accessor", () => {
    // Not an equivalence claim for changing getters: this case exists to record what changed.
    const [now, before] = VERSIONS.map(([, text]) => roundingReadersFrom(text));
    const shifting = () => {
      let reads = 0;
      return { enabled: true, get increment() { reads += 1; return reads === 1 ? "nearestHour" : "bogus"; } };
    };
    expect(outcome(() => now.normalizeBillingRounding(shifting()))).toEqual({ value: { enabled: true, increment: "nearestHour" } });
    expect(outcome(() => before.normalizeBillingRounding(shifting()))).toEqual({ value: { enabled: true, increment: "bogus" } });
  });
});

/**
 * One version's rounding editor, lifted with the page's own option builder and readers.
 * @param {string} text
 */
function roundingEditorFrom(text) {
  const document = new FakeDocument();
  const context = liftFrom(text, [
    "requirePageController", "createOption", "vocabularyHas", "normalizeBillingRounding", "formatBillingRounding", "createBillingRoundingEditor",
  ], {
    document,
    ...fakeDomConstructors(),
    window: {
      LongtailForge: {
        pageController: {
          /** @param {unknown} value @param {unknown} label */
          createOption(value, label) {
            const option = document.createElement("option");
            option.value = String(value);
            option.textContent = label === undefined ? "" : String(label);
            return option;
          },
        },
      },
    },
  });
  vm.runInContext(declaration(text, "  const billingRoundingEditorsByField = ", ";"), context);
  /** @type {(options: object) => { element: import("../../scripts/test-support/fake-dom.mjs").FakeElement, getValue: () => unknown, setBillableMode: (isBillable: unknown) => void }} */
  const createBillingRoundingEditor = vm.runInContext("createBillingRoundingEditor", context);
  return createBillingRoundingEditor;
}

/**
 * What an editor shows, then what it saves in each mode and increment.
 * @param {(options: object) => { element: import("../../scripts/test-support/fake-dom.mjs").FakeElement, getValue: () => unknown }} create
 * @param {unknown} value @param {unknown} inheritedRounding
 */
function renderAndSave(create, value, inheritedRounding) {
  const editor = create({ legend: "Rounding", inheritLabel: "Use workspace rounding", value, inheritedRounding });
  const [modeSelect, incrementSelect] = editor.element.querySelectorAll("select");
  const roundHours = editor.element.querySelector("input");
  const hint = editor.element.querySelector("p");
  const shown = {
    mode: modeSelect.value, increment: incrementSelect.value, roundHours: roundHours.checked, hint: hint.textContent,
    incrementHidden: incrementSelect.parentNode?.hidden, saved: editor.getValue(),
  };
  /** @type {unknown[]} */
  const saves = [];
  for (const mode of ["inherit", "exact", "round"]) {
    modeSelect.value = mode;
    modeSelect.dispatchEvent(createFakeEvent("change", { target: modeSelect }));
    for (const increment of ["nearestQuarterHour", "nearestHalfHour", "nearestHour"]) {
      incrementSelect.value = increment;
      saves.push([mode, increment, roundHours.checked, hint.textContent, editor.getValue()]);
    }
  }
  return JSON.parse(JSON.stringify({ shown, saves }));
}

describe("The rounding editor renders and saves as before", () => {
  it("for every increment the record or the workspace carries", () => {
    const [now, before] = VERSIONS.map(([, text]) => roundingEditorFrom(text));
    const rules = ["nearestQuarterHour", "nearestHalfHour", "nearestHour"].flatMap((increment) => [
      { enabled: true, increment }, { enabled: false, increment },
    ]);
    for (const inherited of rules) {
      for (const value of [null, ...rules]) {
        const label = `${JSON.stringify(value)} over ${JSON.stringify(inherited)}`;
        expect(renderAndSave(now, value, inherited), label).toEqual(renderAndSave(before, value, inherited));
      }
    }
    expect(renderAndSave(now, null, { enabled: true, increment: "nearestHour" }).shown).toMatchObject({
      mode: "inherit", increment: "nearestHour", roundHours: true, hint: "Effective rounding: Nearest hour",
    });
  });
});

describe("Only the settings and rounding readers changed", () => {
  it(`keeps every other function touched here the ${BASE} body`, () => {
    // LATER: `0.33.33.43.58` typed the record normalisers, `normalizeData` and the optional rounding
    // reader under the operator's approval, so they leave this list;
    // `clients-projects-record-normaliser-contracts` proves them against `1c78eaf0`.
    for (const name of ["createBillingRoundingEditor", "formatBillingRounding", "normalizeBillingPeriod", "vocabularyHas"]) {
      expect(withoutComments(extractFunctionBlock(current, name)), name).toBe(withoutComments(extractFunctionBlock(baseline, name)));
    }
    expect(declaration(current, "  let workspaceSettings = {", "\n  };")).toBe(declaration(baseline, "  let workspaceSettings = {", "\n  };"));
  });

  it("held the record normalisers and normalizeData until 0.33.33.43.58 discharged both decisions", () => {
    for (const name of ["normalizeData", "normalizeClientRecord", "normalizeProjects"]) {
      const at = current.indexOf(`  function ${name}(`);
      const doc = current.slice(current.lastIndexOf("/**", at), at);
      expect(doc, name).not.toMatch(/pending an\s+(?:\*\s+)?operator decision/);
      expect(doc, name).toMatch(/@param \{unknown\}/);
    }
  });
});
