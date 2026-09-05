import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const writer = read("public/js/shared/settings-renderer.js");
const contracts = read("src/types/browser-contracts.d.ts");
const framework = read("src/types/framework-contracts.d.ts");

/**
 * One declaration sliced at the indentation it is written at, so a name that also appears inside
 * another function cannot be mistaken for the one wanted.
 * @param {string} opener @param {number} [indent]
 */
function slice(opener, indent = 2) {
  const pad = " ".repeat(indent);
  const start = writer.indexOf(pad + opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = writer.indexOf("\n" + pad + "}\n", start);
  assert.notEqual(end, -1, opener + " must terminate");
  return writer.slice(start, end + pad.length + 2);
}

/** @param {string} name */
function interfaceBody(name) {
  const declaration = new RegExp("^export interface " + name + "(?: extends [A-Za-z]+)? \\{$", "m");
  const found = declaration.exec(contracts);
  assert.ok(found, name + " must be declared");
  const opener = found[0];
  const start = found.index;
  const end = contracts.indexOf("\n}\n", start);
  assert.notEqual(end, -1, name + " must terminate");
  return contracts.slice(start + opener.length, end);
}

/** @param {string} body */
function declaredMembers(body) {
  return [...body.matchAll(/^ {2}([A-Za-z_][A-Za-z0-9_]*)[(?:]/gm)].map((match) => match[1]).sort();
}

/** @param {string} source @param {RegExp} pattern */
function countOf(source, pattern) {
  return (source.match(pattern) || []).length;
}

/**
 * The same text with its comments removed.
 *
 * Several of these checks assert that a construct is **gone**, and this writer's comments name the
 * constructs they replaced. Without this, the explanation would satisfy the check it explains.
 * @param {string} source
 */
function codeOnly(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** The names the writer's checked publication literal actually contains. */
function publishedMembers() {
  const opener = "  const settingsRendererApi = {";
  const start = writer.indexOf(opener);
  assert.notEqual(start, -1, "the checked publication literal must exist");
  const end = writer.indexOf("\n  };", start);
  assert.notEqual(end, -1, "the literal must terminate");
  const literal = writer.slice(start + opener.length, end);
  assert.ok(!/:/.test(literal), "shorthand throughout, so no member can hide behind an alias");
  return [...literal.matchAll(/^ {4}([A-Za-z_][A-Za-z0-9_]*),$/gm)].map((match) => match[1]).sort();
}

/**
 * The pure normalization core, lifted from the shipped writer and run for real.
 *
 * Nothing is retyped here: each function is the file's own text. A change to any of them changes
 * what these assertions see.
 */
function normalizationCore() {
  const parts = [
    writer.match(/^ {2}const SETTING_TYPES = Object\.freeze\(\[\n(?: {4}.*\n)+ {2}\]\);$/m),
  ];
  assert.ok(parts[0], "the setting-type table must be a source constant");
  return new Function([
    parts[0][0],
    slice("function isCandidateList(value) {"),
    slice("function readCandidate(value) {"),
    slice("function isCandidateRecord(value) {"),
    slice("function normalizeContributions(moduleSettings, options = {}) {"),
    slice("function normalizeFromModules(modules) {"),
    slice("function normalizeModule(candidate) {"),
    slice("function normalizeSetting(moduleDefinition, candidate) {"),
    slice("function normalizeType(type) {"),
    slice("function normalizeOptions(options) {"),
    slice("function normalizeValue(value, type) {"),
    slice("function defaultValue(type, setting, moduleDefinition) {"),
    slice("function normalizeVisibleWhen(candidate) {"),
    slice("function normalizeInputMode(inputmode) {"),
    slice("function normalizeNumberAttribute(value) {"),
    slice("function normalizeStepAttribute(value) {"),
    "return { SETTING_TYPES, normalizeContributions, normalizeType, normalizeOptions,"
    + " normalizeVisibleWhen, normalizeValue, isCandidateList, readCandidate };",
  ].join("\n"))();
}

const core = normalizationCore();

/** One usable contribution, so each negative case differs from it in exactly one way. */
const validModule = () => ({
  moduleId: "tasks",
  name: "Tasks",
  displayName: "Tasks",
  status: "enabled",
  settings: [{ id: "detail", label: "Detail", type: "text", placement: "workspace" }],
});

describe("the writer publishes exactly what the contract declares", () => {
  it("publishes nine members through a literal the compiler checks", () => {
    assert.equal(publishedMembers().length, 9);
    assert.match(writer, /@type \{BrowserSettingsRenderer\}\s*\n\s*\*\/\s*\n\s*const settingsRendererApi = \{/);
  });

  it("declares the same nine, with no tenth on either side", () => {
    assert.deepEqual(declaredMembers(interfaceBody("BrowserSettingsRenderer")), publishedMembers());
  });

  it("names each of the nine, so a rename on both sides cannot pass the set comparison", () => {
    assert.deepEqual(publishedMembers(), [
      "clearValidationErrors",
      "collectPayload",
      "normalizeContributions",
      "renderDisabledModuleRecovery",
      "renderGroupedSections",
      "renderSection",
      "renderSections",
      "showValidationErrors",
      "validate",
    ]);
  });

  it("keeps the normalizers and field builders internal", () => {
    for (const internal of [
      "normalizeModule", "normalizeSetting", "normalizeType", "normalizeOptions",
      "normalizeVisibleWhen", "createSettingField", "listSettingFields", "setFieldMessage",
      "readFieldValue", "valueMatches", "applyDependentVisibility", "requireView",
    ]) {
      assert.ok(new RegExp("function " + internal + "\\(").test(writer), internal + " must exist");
      assert.ok(!publishedMembers().includes(internal), internal + " must stay internal");
    }
  });

  it("still freezes the published object", () => {
    assert.match(writer, /root\.settingsRenderer = Object\.freeze\(settingsRendererApi\);/);
  });

  it("gave the namespace member its type, without declaring the member itself", () => {
    // This child deliberately left `LongtailForge.settingsRenderer` undeclared so that consumers
    // still read `unknown` while the writer was made honest. `0.33.33.38.2.2.9` has since
    // declared it. The guard for that ordering is spent; the fact that outlives it is that the
    // member is typed by **this** contract rather than by a looser one written to reach it.
    const namespaceBlock = contracts.slice(
      contracts.indexOf("export interface LongtailForgeBrowserNamespace {"),
      contracts.indexOf("\n}\n", contracts.indexOf("export interface LongtailForgeBrowserNamespace {")),
    );
    assert.match(namespaceBlock, /^ {2}settingsRenderer\?: BrowserSettingsRenderer;$/m);
    assert.deepEqual(
      [...contracts.matchAll(/^export (?:interface|type) (BrowserSettingsRenderer\w*)/gm)].map((m) => m[1]),
      ["BrowserSettingsRenderer"],
      "one renderer contract, so the member cannot be typed by a looser sibling",
    );
  });

  it("carries no showSaveAction anywhere in the writer or its contracts", () => {
    assert.ok(!/showSaveAction/.test(writer));
    assert.ok(!/showSaveAction/.test(interfaceBody("BrowserSettingsRenderOptions")));
    assert.ok(!/showSaveAction/.test(interfaceBody("BrowserSettingsRenderer")));
  });
});

describe("the setting type vocabulary agrees across three independent sources", () => {
  it("runs the table, the published union and the contribution input to the same nine", () => {
    const fromTable = [...core.SETTING_TYPES].sort();
    const union = contracts.slice(
      contracts.indexOf("export type BrowserSettingType ="),
      contracts.indexOf(";", contracts.indexOf("export type BrowserSettingType =")),
    );
    const fromUnion = [...union.matchAll(/"([a-z-]+)"/g)].map((match) => match[1]).sort();
    const inputType = framework.match(/^ {2}type: (.*)$/m);
    assert.ok(inputType, "the contribution input must declare its type member");
    const fromInput = [...inputType[1].matchAll(/"([a-z-]+)"/g)].map((match) => match[1]).sort();

    assert.equal(fromTable.length, 9);
    assert.deepEqual(fromUnion, fromTable);
    assert.deepEqual(fromInput, fromTable);
  });

  it("leaves the contribution input open and the resolved output closed", () => {
    const inputType = framework.match(/^ {2}type: (.*)$/m);
    assert.ok(inputType, "the contribution input must declare its type member");
    assert.match(inputType[1], /\(string & \{\}\)/, "a module may contribute a type nobody has heard of");
    const union = contracts.slice(
      contracts.indexOf("export type BrowserSettingType ="),
      contracts.indexOf(";", contracts.indexOf("export type BrowserSettingType =")),
    );
    assert.ok(!/string & \{\}/.test(union), "the renderer's answer is closed");
  });

  it("answers each known type with itself", () => {
    for (const type of core.SETTING_TYPES) {
      assert.equal(core.normalizeType(type), type);
    }
  });

  it("answers info for a tenth type, and for anything that is not a string", () => {
    assert.equal(core.normalizeType("colour-picker"), "info");
    assert.equal(core.normalizeType(""), "info");
    assert.equal(core.normalizeType(undefined), "info");
    assert.equal(core.normalizeType(null), "info");
    assert.equal(core.normalizeType(7), "info");
    assert.equal(core.normalizeType(["text"]), "info");
  });

  it("detects a tenth entry added to the table, rather than only checking the nine it expects", () => {
    const declared = new Set([...core.SETTING_TYPES]);
    const union = contracts.slice(
      contracts.indexOf("export type BrowserSettingType ="),
      contracts.indexOf(";", contracts.indexOf("export type BrowserSettingType =")),
    );
    const published = new Set([...union.matchAll(/"([a-z-]+)"/g)].map((match) => match[1]));
    for (const type of declared) {
      assert.ok(published.has(type), type + " is in the runtime table but not in the published union");
    }
    for (const type of published) {
      assert.ok(declared.has(type), type + " is published but the runtime table never answers it");
    }
    assert.equal(declared.size, published.size);
  });
});

describe("normalization is total, and each rule is executed", () => {
  it("normalizes a valid contribution to one resolved module", () => {
    const [module] = core.normalizeContributions([validModule()]);
    assert.equal(module.moduleId, "tasks");
    assert.equal(module.displayName, "Tasks");
    assert.equal(module.status, "enabled");
    assert.equal(module.canDisable, true);
    assert.equal(module.settings.length, 1);
  });

  it("falls back to the modules option when it is handed no array", () => {
    const fromModules = core.normalizeContributions(undefined, { modules: [validModule()] });
    assert.equal(fromModules.length, 1);
    assert.equal(fromModules[0].moduleId, "tasks");
    assert.deepEqual(core.normalizeContributions(undefined, {}), []);
    assert.deepEqual(core.normalizeContributions("modules", { modules: "modules" }), []);
  });

  it("drops a module with no id and a module with no surviving settings", () => {
    const noId = { ...validModule(), moduleId: undefined, id: undefined };
    assert.deepEqual(core.normalizeContributions([noId]), []);
    assert.deepEqual(core.normalizeContributions([{ ...validModule(), settings: [] }]), []);
    assert.deepEqual(core.normalizeContributions([{ ...validModule(), settings: "none" }]), []);
  });

  it("survives entries that are not records at all", () => {
    assert.deepEqual(core.normalizeContributions([null, 7, "module", [], undefined]), []);
    assert.equal(core.normalizeContributions([null, validModule()]).length, 1);
  });

  it("keeps source ordering", () => {
    const modules = core.normalizeContributions([
      { ...validModule(), moduleId: "zeta" },
      { ...validModule(), moduleId: "alpha" },
      { ...validModule(), moduleId: "middle" },
    ]);
    assert.deepEqual(modules.map((/** @type {{moduleId: string}} */ module) => module.moduleId), ["zeta", "alpha", "middle"]);
  });

  it("closes the module status to two values, whatever was contributed", () => {
    const read = (/** @type {unknown} */ status) => core.normalizeContributions([{ ...validModule(), status }])[0].status;
    assert.equal(read("enabled"), "enabled");
    assert.equal(read("disabled"), "disabled");
    assert.equal(read("paused"), "disabled");
    assert.equal(read(undefined), "disabled");
  });

  it("normalizes an unknown setting type to info", () => {
    const [module] = core.normalizeContributions([{
      ...validModule(),
      settings: [{ id: "x", label: "X", type: "colour-picker" }],
    }]);
    assert.equal(module.settings[0].type, "info");
  });

  it("rebuilds options as two strings and drops a non-array", () => {
    assert.deepEqual(core.normalizeOptions([{ value: 1, label: "One" }, { value: "two" }]), [
      { value: "1", label: "One" },
      { value: "two", label: "two" },
    ]);
    assert.deepEqual(core.normalizeOptions(undefined), []);
    assert.deepEqual(core.normalizeOptions("a,b"), []);
    assert.deepEqual(core.normalizeOptions([null]), [{ value: "", label: "" }]);
  });

  it("answers null for an incomplete dependency", () => {
    assert.equal(core.normalizeVisibleWhen(undefined), null);
    assert.equal(core.normalizeVisibleWhen({ settingId: "mode" }), null, "no equals member");
    assert.equal(core.normalizeVisibleWhen({ equals: true }), null, "no settingId");
    assert.equal(core.normalizeVisibleWhen({ settingId: "  ", equals: true }), null, "blank settingId");
    assert.equal(core.normalizeVisibleWhen("mode"), null);
  });

  it("keeps a complete dependency, including an equals value it does not interpret", () => {
    assert.deepEqual(core.normalizeVisibleWhen({ settingId: "mode", equals: false }), {
      settingId: "mode",
      equals: false,
    });
    assert.deepEqual(core.normalizeVisibleWhen({ settingId: "mode", equals: null }), {
      settingId: "mode",
      equals: null,
    });
    assert.deepEqual(core.normalizeVisibleWhen({ settingId: "mode", equals: ["a"] }).equals, ["a"]);
  });

  it("resolves the value by type and leaves the module owning what it means", () => {
    assert.equal(core.normalizeValue("yes", "boolean"), false);
    assert.equal(core.normalizeValue(true, "toggle"), true);
    assert.equal(core.normalizeValue("", "number"), "");
    assert.equal(core.normalizeValue("12", "number"), 12);
    assert.deepEqual(core.normalizeValue([1, "b"], "multi-select"), ["1", "b"]);
    assert.deepEqual(core.normalizeValue("nope", "multi-select"), []);
    assert.equal(core.normalizeValue(undefined, "text"), "");
    assert.deepEqual(core.normalizeValue({ nested: true }, "text"), { nested: true });
  });

  it("carries a benign contribution extension through to the resolved setting", () => {
    const [module] = core.normalizeContributions([{
      ...validModule(),
      settings: [{ id: "detail", label: "Detail", type: "text", handler: "tasks.detail", ownerOnly: true }],
    }]);
    assert.equal(module.settings[0].handler, "tasks.detail");
    assert.equal(module.settings[0].ownerOnly, true);
  });

  it("overwrites the members it owns even when the contribution set them", () => {
    const [module] = core.normalizeContributions([{
      ...validModule(),
      settings: [{ id: "detail", label: "Detail", type: "text", visibleWhen: "always", options: "all", min: "x" }],
    }]);
    assert.equal(module.settings[0].visibleWhen, null);
    assert.deepEqual(module.settings[0].options, []);
    assert.equal(module.settings[0].min, "");
  });

  it("normalizes the number-like attributes to strings or empty strings", () => {
    const setting = (/** @type {Record<string, unknown>} */ extra) => core.normalizeContributions([{
      ...validModule(),
      settings: [{ id: "d", label: "D", type: "number", ...extra }],
    }])[0].settings[0];
    assert.equal(setting({ min: 0 }).min, "0");
    assert.equal(setting({ max: "12" }).max, "12");
    assert.equal(setting({ rows: "abc" }).rows, "");
    assert.equal(setting({ step: "any" }).step, "any");
    assert.equal(setting({ step: 0.5 }).step, "0.5");
    assert.equal(setting({}).min, "");
  });

  it("normalizes the input mode against the modes an input accepts", () => {
    const setting = (/** @type {unknown} */ inputmode) => core.normalizeContributions([{
      ...validModule(),
      settings: [{ id: "d", label: "D", type: "text", inputmode }],
    }])[0].settings[0];
    assert.equal(setting("numeric").inputmode, "numeric");
    assert.equal(setting("NUMERIC").inputmode, "", "the DOM value is lower-case");
    assert.equal(setting("shouty").inputmode, "");
    assert.equal(setting(undefined).inputmode, "");
  });

  it("defaults a module-status toggle from the module's own status", () => {
    const read = (/** @type {unknown} */ status) => core.normalizeContributions([{
      ...validModule(),
      status,
      settings: [{ id: "enabled", label: "Enabled", type: "boolean", moduleStatus: true }],
    }])[0].settings[0].value;
    assert.equal(read("enabled"), true);
    assert.equal(read("disabled"), false);
  });

  it("prefers a present value over a default, and a default over the type fallback", () => {
    const read = (/** @type {Record<string, unknown>} */ extra) => core.normalizeContributions([{
      ...validModule(),
      settings: [{ id: "d", label: "D", type: "text", ...extra }],
    }])[0].settings[0].value;
    assert.equal(read({ value: "present", default: "fallback" }), "present");
    assert.equal(read({ default: "fallback" }), "fallback");
    assert.equal(read({}), "");
    assert.equal(read({ value: null }), "", "a present null still normalizes through the type");
  });
});

describe("the render scope admits both roots the pages use", () => {
  it("declares the scope as a document or an element", () => {
    assert.match(contracts, /^export type BrowserSettingsRenderScope = Document \| Element;$/m);
  });

  it("gives the four scoped methods that scope rather than a document", () => {
    const body = interfaceBody("BrowserSettingsRenderer");
    for (const method of ["clearValidationErrors", "collectPayload", "validate"]) {
      assert.match(body, new RegExp(method + "\\(scope\\?: BrowserSettingsRenderScope\\)"));
    }
    assert.match(body, /showValidationErrors\(scope\?: BrowserSettingsRenderScope, error\?: unknown\): number;/);
  });

  it("asks the scope whether it is an element rather than probing for a method", () => {
    for (const fn of ["function collectPayload(scope = document) {", "function listSettingFields(scope) {"]) {
      const body = codeOnly(slice(fn));
      assert.match(body, /scope instanceof Element && scope\.matches\(/);
      assert.ok(!/scope\.matches\?\./.test(body), "the optional probe answered undefined on a Document");
    }
  });

  it("keeps the containers separate from the scopes, because a container is written to", () => {
    const body = interfaceBody("BrowserSettingsRenderer");
    assert.equal(countOf(body, /container: Element \| null \| undefined,/g), 4);
  });

  it("declares the same nullable container in the writer, which method syntax would not enforce", () => {
    // `BrowserSettingsRenderer` names its members with method syntax, and TypeScript compares
    // method parameters bivariantly - so a writer that narrowed `container` to `Element` would
    // still satisfy the interface while rejecting the `container || fallback` its callers pass.
    assert.equal(countOf(writer, /@param \{Element \| null \| undefined\} container/g), 4);
    for (const fn of [
      "function renderSections(", "function renderGroupedSections(",
      "function renderSection(", "function renderDisabledModuleRecovery(",
    ]) {
      const at = writer.indexOf("  " + fn);
      assert.notEqual(at, -1, fn + " must exist");
      assert.match(writer.slice(at - 340, at), /@param \{Element \| null \| undefined\} container/);
    }
  });
});

describe("nullable section results are removed without a cast", () => {
  it("filters both render paths through one predicate", () => {
    for (const fn of [
      "function renderSections(container, moduleSettings, options = {}) {",
      "function renderGroupedSections(container, moduleSettings, options = {}) {",
    ]) {
      const body = codeOnly(slice(fn));
      assert.ok(!/\.filter\(Boolean\)/.test(body), "Boolean does not narrow, and no longer stands here");
      assert.ok(!/section !== null && section !== undefined/.test(body), "nor does an inline comparison");
      assert.match(body, /\.filter\(isRenderedSection\)/);
    }
    assert.equal(countOf(writer, /\.filter\(isRenderedSection\)/g), 2);
    assert.match(
      slice("function defaultFieldMessage(setting) {"),
      /\.filter\(Boolean\)\.join\(" "\)/,
      "the one Boolean filter that remains drops empty strings, and narrows nothing",
    );
  });

  it("removes only the declined sections, preserving order and identity", () => {
    const isRendered = new Function("return " + slice("function isRenderedSection(section) {"))();
    const a = { id: "a" };
    const b = { id: "b" };
    assert.deepEqual([a, null, b, null].filter(isRendered), [a, b]);
    assert.equal([a, null, b].filter(isRendered)[0], a, "identity, not a copy");
    assert.deepEqual([null, null].filter(isRendered), []);
    assert.deepEqual([].filter(isRendered), []);
  });

  it("declares both list returns as sections rather than nullable ones", () => {
    const body = interfaceBody("BrowserSettingsRenderer");
    assert.equal(countOf(body, /\): HTMLElement\[\];/g), 2);
    assert.equal(countOf(body, /\): HTMLElement \| null;/g), 2);
  });
});

describe("a thrown value earns each member it is read for", () => {
  it("proves the carrier before reading body, fieldErrors or message", () => {
    const body = slice("function showValidationErrors(scope = document, error = null) {");
    assert.match(body, /const errorRecord = isCandidateRecord\(error\) \? error : null;/);
    assert.match(body, /const bodyRecord = isCandidateRecord\(errorRecord\?\.body\) \? errorRecord\.body : null;/);
    assert.ok(!/\berror\?\.body\b/.test(body), "the raw value is no longer read through");
    assert.ok(!/\berror\?\.fieldErrors\b/.test(body), "the raw value is no longer read through");
    assert.ok(!/\berror\?\.message\b/.test(body), "the raw value is no longer read through");
  });

  it("narrows exactly the values the pages throw", () => {
    const isRecord = new Function("return " + slice("function isCandidateRecord(value) {"))();
    assert.equal(isRecord({ body: { fieldErrors: {} } }), true, "a BrowserApiError carrier");
    assert.equal(isRecord({ fieldErrors: {} }), true, "a direct fieldErrors carrier");
    assert.equal(isRecord(new Error("boom")), true, "an ordinary Error");
    assert.equal(isRecord(null), false);
    assert.equal(isRecord(undefined), false);
    assert.equal(isRecord("boom"), false);
    assert.equal(isRecord(["boom"]), false);
    assert.equal(isRecord(404), false);
  });

  it("declares the thrown value as unknown rather than as an error shape", () => {
    assert.match(interfaceBody("BrowserSettingsRenderer"), /error\?: unknown/);
    const at = writer.indexOf("  function showValidationErrors(");
    assert.match(writer.slice(at - 260, at), /@param \{unknown\} \[error\]/);
  });
});

describe("field values are read off the control that carries them", () => {
  it("reads each type through its own control arm", () => {
    class FakeInput {
      /** @param {string} value @param {boolean} checked */
      constructor(value, checked) {
        this.value = value;
        this.checked = checked;
        /** @type {{value: string}[] | undefined} */
        this.selectedOptions = undefined;
      }
    }
    class FakeSelect {
      /** @param {string[]} selected */
      constructor(selected) {
        this.selectedOptions = selected.map((/** @type {string} */ value) => ({ value }));
        this.value = selected[0] ?? "";
        /** @type {boolean | undefined} */
        this.checked = undefined;
      }
    }
    const readFieldValue = new Function(
      "HTMLInputElement", "HTMLSelectElement", "return " + slice("function readFieldValue(metadata) {"),
    )(FakeInput, FakeSelect);
    const meta = (/** @type {string} */ type, /** @type {unknown[]} */ controls, /** @type {unknown} */ value = undefined) => (
      { controls, setting: { type, value } }
    );

    assert.equal(readFieldValue(meta("boolean", [new FakeInput("on", true)])), true);
    assert.equal(readFieldValue(meta("toggle", [new FakeInput("on", false)])), false);
    assert.equal(readFieldValue(meta("boolean", [new FakeSelect(["on"])])), false, "a select is not checked");

    // A control that carries the other arm's member is what separates asking the control what it
    // is from probing it for a property. A blind read would answer this one's `checked`.
    const liar = new FakeSelect(["on"]);
    liar.checked = true;
    assert.equal(readFieldValue(meta("boolean", [liar])), false, "only an input's checked is read");
    assert.equal(readFieldValue(meta("radio", [liar])), "", "and only an input can be the checked radio");
    const inputWithOptions = new FakeInput("x", false);
    inputWithOptions.selectedOptions = [{ value: "x" }];
    assert.deepEqual(readFieldValue(meta("multi-select", [inputWithOptions])), [], "only a select has options");
    assert.equal(readFieldValue(meta("radio", [new FakeInput("a", false), new FakeInput("b", true)])), "b");
    assert.equal(readFieldValue(meta("radio", [new FakeInput("a", false)])), "");
    assert.deepEqual(readFieldValue(meta("multi-select", [new FakeSelect(["x", "y"])])), ["x", "y"]);
    assert.deepEqual(readFieldValue(meta("multi-select", [new FakeInput("x", false)])), [], "an input has no options");
    assert.equal(readFieldValue(meta("number", [new FakeInput("", false)])), "");
    assert.equal(readFieldValue(meta("number", [new FakeInput("12", false)])), 12);
    assert.equal(readFieldValue(meta("text", [new FakeInput("typed", false)])), "typed");
  });

  it("asks each control what it is rather than probing it for a property", () => {
    const body = codeOnly(slice("function readFieldValue(metadata) {"));
    assert.match(body, /control instanceof HTMLInputElement && control\.checked/);
    assert.match(body, /candidate instanceof HTMLInputElement && candidate\.checked/);
    assert.match(body, /control instanceof HTMLSelectElement/);
    assert.ok(!/control\?\.checked/.test(body), "no blind checked read remains");
    assert.ok(!/\?\.selectedOptions/.test(body), "no blind options read remains");
  });

  it("falls back to the resolved value and then to an empty string", () => {
    const readFieldValue = new Function(
      "HTMLInputElement", "HTMLSelectElement", "return " + slice("function readFieldValue(metadata) {"),
    )(class {}, class {});
    assert.equal(readFieldValue({ controls: [], setting: { type: "text", value: "resolved" } }), "resolved");
    assert.equal(readFieldValue({ controls: [], setting: { type: "text" } }), "");
    assert.equal(readFieldValue(undefined), "");
  });
});

describe("the writer carries no implicit or explicit any", () => {
  it("annotates every function it declares", () => {
    const declared = [...writer.matchAll(/^ {2}(?:async )?function ([A-Za-z_][A-Za-z0-9_]*)\(([^)]*)\)/gm)];
    assert.ok(declared.length > 25, "the writer must still be the file this checks");
    for (const [, name, params] of declared) {
      if (params.trim() === "") {
        continue;
      }
      const at = writer.indexOf("  function " + name + "(");
      const before = writer.slice(0, at).trimEnd();
      // Only the comment block immediately above the declaration counts. Reading a fixed window
      // back would find the previous function's annotation and pass for a function with none.
      assert.ok(before.endsWith("*/"), name + " must be preceded by its own JSDoc block");
      const opened = before.lastIndexOf("/**");
      assert.notEqual(opened, -1, name + " must have an opening JSDoc marker");
      assert.match(before.slice(opened), /@param/, name + " must carry a parameter annotation");
    }
  });

  it("names no any type", () => {
    const withoutStrings = writer.replace(/"[^"]*"/g, '""').replace(/`[^`]*`/g, "``");
    assert.ok(!/[:<,{|&]\s*any\b/.test(withoutStrings), "no any annotation");
    assert.ok(!/\bany\s*(?:\[\]|[>,}|&])/.test(withoutStrings), "no any in a compound type");
  });

  it("reuses the shared view contracts rather than inventing element records", () => {
    // Asserted where each contract is *used*, not merely where it is imported: a typedef import
    // line keeps the name in the file long after the declaration it named stopped using it.
    assert.match(writer, /@property \{BrowserViewFieldControl\[\]\} controls/);
    assert.match(writer, /@property \{BrowserViewFieldGridElement\} grid/);
    assert.match(writer, /@type \{BrowserViewFieldControl\[\]\}\s*\*\/\s*\n\s*let controls;/);
    assert.match(writer, /@param \{HTMLElement \| BrowserViewFieldElement \| null \| undefined\} field/);
    assert.ok(!/WeakMap<any/.test(writer));
    assert.ok(!/Record<string, any>/.test(writer));
    assert.ok(!/@property \{\{value: string\}/.test(writer), "no hand-rolled control record");
  });

  it("types both metadata maps by their key and their value", () => {
    assert.match(writer, /@type \{WeakMap<HTMLElement, SettingsFieldMetadata>\}\s*\*\/\s*\n\s*const fieldMetadata/);
    assert.match(writer, /@type \{WeakMap<HTMLElement, SettingsSectionMetadata>\}\s*\*\/\s*\n\s*const sectionMetadata/);
  });

  it("reuses the contribution input vocabulary instead of restating it", () => {
    assert.match(framework, /export interface ModuleSettingDefinition \{/);
    assert.ok(
      !/export interface BrowserModuleSettingDefinition/.test(contracts),
      "the input contract is not copied into browser contracts",
    );
    assert.match(interfaceBody("BrowserResolvedSetting"), /\[key: string\]: unknown;/);
    assert.match(framework.slice(framework.indexOf("export interface ModuleSettingDefinition {")), /\[key: string\]: unknown;/);
  });
});

describe("the resolved module is exact and the resolved setting is structural", () => {
  it("declares the module by the six members the normalizer reconstructs", () => {
    assert.deepEqual(declaredMembers(interfaceBody("BrowserResolvedSettingsModule")), [
      "canDisable", "displayName", "moduleId", "name", "settings", "status",
    ]);
    assert.ok(!/\[key: string\]/.test(interfaceBody("BrowserResolvedSettingsModule")), "nothing is spread into it");
    assert.match(slice("function normalizeModule(candidate) {"), /return \{\n {6}moduleId,/, "reconstructed by name");
  });

  it("declares the setting structurally, because the normalizer spreads the contribution", () => {
    assert.match(slice("function normalizeSetting(moduleDefinition, candidate) {"), /\.\.\.setting,/);
    assert.match(interfaceBody("BrowserResolvedSetting"), /\[key: string\]: unknown;/);
    assert.match(interfaceBody("BrowserResolvedSetting"), /^ {2}value: unknown;$/m);
  });

  it("promises every member the normalizer overwrites", () => {
    const body = slice("function normalizeSetting(moduleDefinition, candidate) {");
    const written = [...body.matchAll(/^ {6}([a-zA-Z]+)[:,]/gm)].map((match) => match[1]);
    const declared = new Set(declaredMembers(interfaceBody("BrowserResolvedSetting")));
    assert.ok(written.length >= 18, "the normalizer must still write the members this checks");
    for (const member of written) {
      assert.ok(declared.has(member), member + " is written by the normalizer but not declared");
    }
  });

  it("keeps the payload module-keyed and its values unowned", () => {
    assert.match(contracts, /^export type BrowserSettingsPayload = Record<string, Record<string, unknown>>;$/m);
    assert.match(interfaceBody("BrowserSettingsRenderer"), /collectPayload\(scope\?: BrowserSettingsRenderScope\): BrowserSettingsPayload;/);
  });

  it("keeps the render options closed to the seven the writer reads", () => {
    assert.deepEqual(declaredMembers(interfaceBody("BrowserSettingsRenderOptions")), [
      "append", "emptyText", "groupTitle", "hideEmpty", "settings", "title",
    ]);
    assert.match(contracts, /^export interface BrowserSettingsRenderOptions extends BrowserSettingsContributionOptions \{$/m);
    assert.ok(!/\[key: string\]/.test(interfaceBody("BrowserSettingsRenderOptions")), "an unimplemented option is told, not ignored");
  });
});

describe("the fake browser context answers the constructors this writer narrows on", () => {
  it("treats a fake element as an element and an html element", () => {
    const { Element, HTMLElement } = fakeDomConstructors();
    const document = new FakeDocument();
    const div = document.createElement("div");
    assert.equal(div instanceof Element, true);
    assert.equal(div instanceof HTMLElement, true);
    assert.equal(document instanceof Element, false, "a document is not an element");
    assert.equal({ tagName: "DIV" } instanceof Element, false, "a plain object is not one either");
    // Asked directly, because `null` is not a legal left-hand side for the operator.
    assert.equal(Element[Symbol.hasInstance](null), false);
    assert.equal(Element[Symbol.hasInstance](undefined), false);
  });

  it("tells the two control tags apart, which is what readFieldValue asks", () => {
    const { HTMLInputElement, HTMLSelectElement, HTMLTextAreaElement } = fakeDomConstructors();
    const document = new FakeDocument();
    const input = document.createElement("input");
    const select = document.createElement("select");
    const textarea = document.createElement("textarea");

    assert.equal(input instanceof HTMLInputElement, true);
    assert.equal(select instanceof HTMLInputElement, false);
    assert.equal(textarea instanceof HTMLInputElement, false);
    assert.equal(select instanceof HTMLSelectElement, true);
    assert.equal(input instanceof HTMLSelectElement, false);
    assert.equal(textarea instanceof HTMLTextAreaElement, true);
  });

  it("excludes text nodes, which carry no tag of their own", () => {
    const { Element, HTMLElement } = fakeDomConstructors();
    const document = new FakeDocument();
    const text = document.createTextNode("copy");
    assert.equal(text instanceof Element, false);
    assert.equal(text instanceof HTMLElement, false);
  });
});
