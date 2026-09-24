import assert from "node:assert/strict";
import vm from "node:vm";
import { it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
const reader = createProjectTextReader();
const source = reader.readText("public/js/workbench.js");
function fixture() {
  const storage = new Map();
  const scope = vm.createContext({ window: { sessionStorage: { getItem: (/** @type {string} */ key) => storage.get(key) ?? null, setItem: (/** @type {string} */ key, /** @type {string} */ value) => storage.set(key, value) }, LongtailForge: { workspaceContext: { workspaceId: "workspace" } } } });
  vm.runInContext(reader.readText("public/js/shared/cached-fetch.js"), scope);
  for (const name of ["workbenchCacheKey", "readCachedWorkbenchRegistry", "readWorkbenchCardRoute", "writeCachedWorkbenchRegistry", "workbenchFocusEnvelope", "renderWarmWorkbench", "isBootstrapRecord", "isWorkbenchContribution", "readWorkbenchRegistry", "workbenchCardField", "workbenchCardPropertyKey", "loadWorkbenchSourceData", "mergeWorkbenchSourceData", "workbenchSourceFields", "workbenchSourceField"])
    vm.runInContext(extractFunctionBlock(source, name), scope);
  scope.state = { clients: [], focusModes: [], registry: { workbenchCards: [] }, selectedClientId: "", selectedProjectId: "", focusModeId: "guided" };
  scope.updateCalendarWeekLinkVisibility = () => {};
  scope.currentWorkspaceType = () => "personal";
  scope.resolveFocusModeSelection = (/** @type {unknown} */ value) => value;
  scope.resolveClientSelection = (/** @type {unknown} */ value) => value;
  scope.resolveProjectSelection = (/** @type {unknown} */ value) => value;
  scope.restoreCardState = () => {};
  scope.renderWorkbench = () => {};
  scope.normalizeClientProjectOptions = (/** @type {unknown} */ value) => value;
  scope.curateFocusModes = (/** @type {unknown} */ value) => value;
  return { scope, storage };
}
it("scopes cache keys and preserves writer receiver, opaque identity and falsy fallback", () => {
  const { scope: s } = fixture();
  const service = s.window.LongtailForge.cachedFetch;
  const value = Symbol("opaque");
  service.writeCached = function (/** @type {string} */ key, /** @type {unknown} */ data) { assert.equal(this, service); assert.equal(key, "workspace:workbench:registry"); assert.equal(data, value); };
  s.writeCachedWorkbenchRegistry(value);
  service.writeCached = (/** @type {string} */ key, /** @type {unknown} */ data) => assert.equal(JSON.stringify(data), "{}");
  for (const value of [null, undefined, 0, false, ""]) s.writeCachedWorkbenchRegistry(value);
  s.window.LongtailForge = undefined;
  assert.equal(s.workbenchCacheKey("registry"), ":workbench:registry");
  assert.equal(s.readCachedWorkbenchRegistry(), null);
  s.writeCachedWorkbenchRegistry(value);
});
it("reads modes once with the original getter receiver and keeps warm render ordering", () => {
  const { scope: s } = fixture();
  /** @type {string[]} */ const calls = [];
  const modes = {};
  const cached = Object.create({ get modes() { assert.equal(this, cached); calls.push("modes"); return modes; } });
  s.window.LongtailForge.cachedFetch.readCached = (/** @type {string} */ key) => { calls.push(key); return key.endsWith("focus-modes") ? cached : null; };
  s.updateCalendarWeekLinkVisibility = () => calls.push("calendar");
  s.curateFocusModes = (/** @type {unknown} */ value) => { assert.equal(value, modes); calls.push("curate"); return value; };
  s.restoreCardState = () => calls.push("restore"); s.renderWorkbench = () => calls.push("render");
  s.renderWarmWorkbench();
  assert.equal(s.state.focusModes, modes);
  assert.deepEqual(calls, ["calendar", "workspace:workbench:client-project-options", "workspace:workbench:focus-modes", "workspace:workbench:registry", "modes", "curate", "restore", "render"]);
});
it("retains primitive boxing and getter failures before state replacement", () => {
  const { scope: s } = fixture();
  vm.runInContext('Object.defineProperty(Number.prototype, "modes", { get() { "use strict"; globalThis.receiver = this; return ["boxed"]; } });', s);
  s.window.LongtailForge.cachedFetch.readCached = (/** @type {string} */ key) => key.endsWith("focus-modes") ? 7 : null;
  s.renderWarmWorkbench(); assert.equal(s.receiver, 7); assert.equal(JSON.stringify(s.state.focusModes), '["boxed"]');
  const failure = new Error("cached getter"); const before = s.state;
  s.window.LongtailForge.cachedFetch.readCached = (/** @type {string} */ key) => key.endsWith("focus-modes") ? { get modes() { throw failure; } } : null;
  assert.throws(() => s.renderWarmWorkbench(), error => error === failure); assert.equal(s.state, before);
});
// The reconciled registry stays opaque: the cache returns its raw data member.
// This case protects that tolerance against substitution of fresh-response validation.
it("pins raw cached registry forwarding against the fresh reader's different answer", async () => {
  const { scope: s } = fixture();
  s.writeCachedWorkbenchRegistry({ workbenchCards: [{ renderer: "probe", listRoute: "/probe" }] });
  const cached = s.readCachedWorkbenchRegistry();
  assert.equal(cached.workbenchCards.length, 1);
  assert.equal(s.readWorkbenchRegistry(cached).workbenchCards.length, 0);
  let received;
  s.workbenchCardDataLoaders = { probe: (/** @type {unknown} */ card) => { received = card; return {}; } };
  await s.loadWorkbenchSourceData(cached);
  assert.equal(received, cached.workbenchCards[0]);
  s.window.LongtailForge.cachedFetch.writeCached(s.workbenchCacheKey("registry"), 7);
  assert.equal(s.readCachedWorkbenchRegistry(), 7);
  assert.equal(s.readWorkbenchRegistry(7), null);
  s.renderWarmWorkbench(); assert.equal(s.state.registry, 7);
});
it("keeps cached absence and malformed-wrapper recovery without requiring the service", () => {
  const { scope: s, storage } = fixture(); const before = s.state;
  s.renderWarmWorkbench(); assert.equal(s.state.focusModes, before.focusModes); assert.equal(s.state.registry, before.registry);
  storage.set("lf_cached_fetch:workspace:workbench:registry", "{"); assert.equal(s.readCachedWorkbenchRegistry(), null);
  storage.set("lf_cached_fetch:workspace:workbench:registry", '{"data":false}'); assert.equal(s.readCachedWorkbenchRegistry(), null);
  s.window.LongtailForge.cachedFetch = undefined;
  s.renderWarmWorkbench(); assert.equal(s.state.registry, before.registry);
});

it("treats corrupt cached routes as misses in both direct reads and warm rendering", () => {
  const { scope: s } = fixture();
  const before = s.state;
  let renders = 0;
  s.renderWorkbench = () => { renders++; };
  for (const listRoute of [null, 0, false, 7, [], {}]) {
    s.writeCachedWorkbenchRegistry({ workbenchCards: [{ renderer: "probe", listRoute }] });
    assert.equal(s.readCachedWorkbenchRegistry(), null);
    s.renderWarmWorkbench();
    assert.equal(s.state.registry, before.registry);
  }
  assert.equal(renders, 6);
});

it("preserves the valid cached registry, cards and missing or empty route members by identity", () => {
  const { scope: s } = fixture();
  for (const listRoute of [undefined, "", " /unchanged "]) {
    const card = { renderer: "probe", listRoute, metadata: {} };
    const registry = { workbenchCards: [card] };
    s.window.LongtailForge.cachedFetch.readCached = () => registry;
    assert.equal(s.readCachedWorkbenchRegistry(), registry);
    assert.equal(registry.workbenchCards[0], card);
    assert.equal(card.listRoute, listRoute);
  }
});

it("matches the manifest's actual optionalString acceptance without widening its vocabulary", () => {
  const { scope: s } = fixture();
  const manifest = reader.readText("src/core/modules/manifest-contract.js");
  for (const name of ["formatFieldName", "optionalString"]) vm.runInContext(extractFunctionBlock(manifest, name), s);
  for (const listRoute of [undefined, "", " /literal ", null, 0, false, 7, [], {}, Symbol("route")]) {
    /** @type {string[]} */ const errors = [];
    s.optionalString({ listRoute }, "listRoute", errors);
    if (errors.length) {
      assert.throws(() => s.readWorkbenchCardRoute({ listRoute }), { name: "TypeError", message: "Workbench card configuration: listRoute must be a string." });
    } else {
      assert.equal(s.readWorkbenchCardRoute({ listRoute }), listRoute === "" ? undefined : listRoute);
    }
  }
});

it("loads authoritative routes after a corrupt cache miss and rewrites the stored copy without an error status", async () => {
  const { scope: s } = fixture();
  for (const name of ["loadWorkbench", "readWorkbenchBootstrap", "readWorkbenchModuleStates", "isWorkbenchModuleState", "loadTimerCardData", "loadTaskOptionsData"])
    vm.runInContext(extractFunctionBlock(source, name), s);
  const timers = [{}];
  const registry = { workbenchCards: [{ moduleId: "time-tracking", renderer: "active-work-timers", listRoute: "/authoritative" }] };
  /** @type {string[]} */ const requests = [];
  /** @type {unknown[][]} */ const statuses = [];
  s.requireApi = () => ({ getJson: async (/** @type {string} */ route) => {
    requests.push(route);
    if (route === "/api/workbench/bootstrap") return { registry };
    assert.equal(route, "/authoritative");
    return { timers };
  } });
  s.workbenchCardDataLoaders = { "active-work-timers": s.loadTimerCardData };
  s.restoreFocusState = () => {};
  s.loadFocusCandidatesForState = async () => ({});
  s.loadClientProjectData = async () => [];
  s.loadFocusModes = async () => ({ modes: [] });
  s.normalizeModuleStateMap = (/** @type {unknown} */ value) => value;
  s.startTicking = () => {};
  s.applyTaskFocusDeepLink = async () => false;
  s.recoverPendingTaskFocusDrift = async () => false;
  s.requireErrors = () => ({ caughtMessage: (/** @type {Error} */ error) => error.message });
  s.setStatus = (/** @type {unknown} */ message, /** @type {unknown} */ options) => statuses.push([message, options]);
  for (const listRoute of [null, 0, false, 7]) {
    s.writeCachedWorkbenchRegistry({ workbenchCards: [{ renderer: "active-work-timers", listRoute }] });
    requests.length = 0; statuses.length = 0;
    await s.loadWorkbench();
    assert.deepEqual(requests, ["/api/workbench/bootstrap", "/authoritative"]);
    assert.deepEqual(statuses, [["Loading Workbench...", undefined], ["", undefined]]);
    assert.equal(s.state.timers[0], timers[0]);
    assert.equal(s.readCachedWorkbenchRegistry().workbenchCards[0].listRoute, "/authoritative");
  }
  s.writeCachedWorkbenchRegistry({ workbenchCards: [{ listRoute: 7 }] });
  s.requireApi = () => ({ getJson: async (/** @type {string} */ route) => {
    assert.equal(route, "/api/workbench/bootstrap");
    return { registry: { workbenchCards: [{ moduleId: "time-tracking", renderer: "active-work-timers", listRoute: 7 }] } };
  } });
  statuses.length = 0;
  await s.loadWorkbench();
  assert.deepEqual(JSON.parse(JSON.stringify(statuses.at(-1))), ["Workbench card configuration: listRoute must be a string.", { isError: true }]);
  assert.equal(s.readCachedWorkbenchRegistry(), null);
});
