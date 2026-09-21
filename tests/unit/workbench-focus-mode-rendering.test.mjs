import assert from "node:assert/strict";
import vm from "node:vm";
import { it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const read = createProjectTextReader().readText;
const source = read("public/js/workbench.js");

function fixture() {
  const browser = createFakeBrowserContext();
  const list = browser.document.createElement("div");
  /** @type {unknown[]} */ const reads = [];
  const scope = vm.createContext({ ...browser, focusModeList: list, reads, populateFocusScopeOptions: () => reads.push("scope") });
  vm.runInContext(read("public/js/shared/view-builder.js"), scope);
  scope.requireView = () => scope.window.LongtailForge.view;
  for (const name of ["PROJECT_FOCUS_MODE_ID", "DEFAULT_FOCUS_MODE_ID", "WORKBENCH_VIEW_STATE_FOCUS_SELECTION", "GUIDED_FOCUS_MODE_IDS", "FOCUS_QUESTION_COPY"]) {
    const start = source.indexOf(`const ${name} =`);
    assert.ok(start >= 0);
    vm.runInContext(source.slice(start, source.indexOf(";", start) + 1), scope);
  }
  const start = source.indexOf("  let state = {");
  const end = source.indexOf("  let tickIntervalId", start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(source.slice(start, end), scope);
  for (const name of ["requireWorkbenchElement", "renderFocusModes", "curateFocusModes", "resolveFocusModeSelection"]) {
    vm.runInContext(extractFunctionBlock(source, name), scope);
  }
  return { scope, list, reads, state: vm.runInContext("state", scope), copy: vm.runInContext("FOCUS_QUESTION_COPY", scope) };
}

it("retains the real service descriptors by identity in guided order and preserves selection fallback", () => {
  const service = read("src/services/work-focus-modes.service.js");
  const producer = vm.createContext({});
  for (const name of ["FOCUS_MODE_IDS", "FOCUS_SCOPES"]) {
    const start = service.indexOf(`const ${name} =`);
    vm.runInContext(service.slice(start, service.indexOf(";", start) + 1), producer);
  }
  const start = service.indexOf("const FOCUS_MODE_DEFINITIONS =");
  const end = service.indexOf("const FOCUS_MODE_BY_ID", start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(service.slice(start, end) + extractFunctionBlock(service, "focusModeDescriptor"), producer);
  const modes = vm.runInContext("FOCUS_MODE_DEFINITIONS.map(focusModeDescriptor)", producer);
  const f = fixture(), curated = f.scope.curateFocusModes([...modes].reverse());
  assert.deepEqual(Array.from(curated, (/** @type {{id:string}} */ mode) => mode.id), ["pick-up-where-left-off", "whats-due-next", "work-this-week", "review-blocked-work", "project-focus"]);
  for (const mode of curated) {
    assert.equal(mode, modes.find((/** @type {{id:string}} */ entry) => entry.id === mode.id));
    assert.equal(typeof mode.id, "string"); assert.equal(typeof mode.label, "string"); assert.equal(typeof mode.description, "string");
  }
  f.state.focusModes = curated;
  f.state.focusModeId = "work-this-week";
  f.scope.renderFocusModes();
  assert.equal(f.list.children.length, 5);
  assert.equal(f.list.children[2].getAttribute("aria-pressed"), "true");
  assert.match(f.list.children[2].textContent, /Work this week/);
  assert.equal(f.scope.resolveFocusModeSelection("work-this-week", curated), "work-this-week");
  assert.equal(f.scope.resolveFocusModeSelection("absent", curated), "pick-up-where-left-off");
  assert.equal(f.scope.resolveFocusModeSelection("absent", [curated[2]]), "work-this-week");
  assert.equal(f.scope.resolveFocusModeSelection("absent"), "pick-up-where-left-off");
});

it("keeps key conversion, repeated id reads and copy-getter receivers", () => {
  const f = fixture();
  const copy = { get label() { assert.equal(this, copy); f.reads.push("label"); return "Converted label"; }, get description() { assert.equal(this, copy); f.reads.push("description"); return "Converted description"; } };
  Object.defineProperty(f.copy, "converted", { get() { assert.equal(this, f.copy); f.reads.push("copy"); return copy; } });
  const key = { [Symbol.toPrimitive](/** @type {string} */ hint) { f.reads.push(hint); return "converted"; } };
  f.state.focusModes = [{ get id() { f.reads.push("id"); return key; }, label: "Fallback" }];
  f.scope.renderFocusModes();
  assert.deepEqual(f.reads, ["scope", "id", "string", "copy", "id", "id", "label", "description", "string"]);
  assert.equal(f.list.children[0].dataset.workbenchFocusMode, "converted");
  assert.match(f.list.textContent, /Converted label/);
  assert.match(f.list.textContent, /Converted description/);
});

it("preserves inherited and symbol copy keys instead of introducing own-key rejection", () => {
  const f = fixture(), key = Symbol("focus");
  Object.setPrototypeOf(f.copy, { inherited: { label: "Inherited", description: "Inherited detail" } });
  f.copy[key] = { label: "Symbol label", description: "Symbol detail" };
  f.state.focusModes = [{ id: "inherited", label: "Fallback" }, { id: key, label: "Fallback" }];
  f.scope.renderFocusModes();
  assert.match(f.list.children[0].textContent, /Inherited detail/);
  assert.match(f.list.children[1].textContent, /Symbol label/);
});

it("preserves primitive copy receivers and falsy copy/text fallbacks", () => {
  const f = fixture();
  vm.runInContext('Object.defineProperty(Number.prototype, "label", { get() { "use strict"; reads.push(this); return "Numeric copy"; } }); FOCUS_QUESTION_COPY.numeric = 7;', f.scope);
  f.copy.empty = { label: "", description: false };
  f.copy.falsy = 0;
  f.state.focusModes = [{ id: "numeric", label: "Fallback", description: "Native fallback" }, { id: "empty", label: "Empty fallback", description: "Own detail" }, { id: "falsy", label: "Falsy fallback" }];
  f.scope.renderFocusModes();
  assert.deepEqual(f.reads, ["scope", 7]);
  assert.match(f.list.children[0].textContent, /Numeric copy.*Native fallback/);
  assert.match(f.list.children[1].textContent, /Empty fallback.*Own detail/);
  assert.match(f.list.children[2].textContent, /Falsy fallback/);
});

it("propagates conversion and copy-getter failures after clearing and scope population", () => {
  for (const stage of ["key", "label", "description"]) {
    const f = fixture(), failure = new Error(stage);
    f.list.appendChild(f.scope.document.createElement("span"));
    const key = { [Symbol.toPrimitive]() { throw failure; } };
    Object.defineProperty(f.copy, "throwing", { value: {
      get label() { if (stage === "label") throw failure; return "Label"; },
      get description() { throw failure; },
    } });
    f.state.focusModes = [{ id: stage === "key" ? key : "throwing", label: "Fallback" }];
    assert.throws(() => f.scope.renderFocusModes(), error => error === failure);
    assert.equal(f.list.children.length, 0);
    assert.deepEqual(f.reads, ["scope"]);
  }
});
