import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { describe, it } from "vitest";
import { listModuleViewSurfaces } from "../../src/core/modules/registry.js";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * What the Clients/Projects view descriptor delivers, after the four stages that shape it.
 *
 * `0.33.33.43.42` typed the descriptor pipeline: the Projects-only client-query default, then the
 * client-field, billing-field and unavailable-action filters, composed in that order inside
 * `clientProjectsViewSurfaceDescriptor`. The descriptor is opaque below its root - `viewSurfaces`
 * arrives as `unknown[]` - so every nested read became a checked read, and a malformed section still
 * fails rather than being quietly treated as absent.
 *
 * **These cases run the real composed function against the real descriptors**, read through the
 * module registry and round-tripped through JSON as the browser receives them. Composition order is
 * therefore tested by construction rather than restated. And **the baseline implementation runs
 * beside the new one over the whole grid**, comparing both what comes back and every member read, in
 * order - so an equivalence is measured, not argued.
 */

const source = createProjectTextReader().readText("public/js/clients-projects.js");
const baseline = execFileSync("git", ["show", "bafe14b6:public/js/clients-projects.js"], {
  cwd: process.cwd(),
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

const STAGES = ["withoutUnavailableTopLevelActions", "withoutUnsupportedClientFields", "withoutUnsupportedBillingFields",
  "withInitialProjectClientFilter", "clientProjectsViewSurfaceDescriptor"];
const SHARED = ["isResponseRecord", "vocabularyHas"];
const NEW_HELPERS = ["descriptorList", "descriptorField"];

/**
 * The members of a real surface these cases read. The descriptors come from the module registry, not
 * from this typedef; it names only what the assertions reach for.
 * @typedef {{
 *   id: string,
 *   filters: { id: string, field?: string, default?: unknown }[],
 *   dataSource: { fieldBindings: Record<string, unknown> },
 *   [key: string]: unknown,
 * }} RealSurface
 */

/**
 * The two real surfaces, exactly as the browser receives them.
 * @returns {RealSurface[]}
 */
function realSurfaces() {
  return JSON.parse(JSON.stringify(listModuleViewSurfaces().filter((surface) => surface.moduleId === "client-projects")));
}

/**
 * One contributed surface, asserted present - the registry contributes both, and a missing one is a
 * failure of this suite's premise rather than something to step around.
 * @param {"clients" | "projects"} page
 * @returns {RealSurface}
 */
function contributedSurface(page) {
  const surface = realSurfaces().find((real) => real.id === `client-projects.${page}`);
  assert.ok(surface, `the registry contributes the ${page} surface`);
  return surface;
}

/**
 * @typedef {object} Scenario
 * @property {"clients" | "projects"} page
 * @property {string} workspaceType
 * @property {"context" | "settings"} typeSource where the workspace type is read from
 * @property {boolean} canCreate the create permission the surface's primary action needs
 * @property {string} query the page's `?client=` value
 */

/**
 * The composed pipeline, from one implementation, under one scenario.
 * @param {string} text @param {Scenario} scenario @param {unknown[]} surfaces
 */
function liftPipeline(text, scenario, surfaces) {
  const names = [...SHARED, ...(text === source ? NEW_HELPERS : []), ...STAGES];
  const sandbox = vm.createContext({
    URLSearchParams,
    isClientsPage: scenario.page === "clients",
    isProjectsPage: scenario.page === "projects",
    workspaceSettings: { workspaceType: scenario.typeSource === "settings" ? scenario.workspaceType : "business" },
    window: {
      location: { search: scenario.query ? `?client=${scenario.query}` : "" },
      LongtailForge: {
        workspaceContext: {
          ...(scenario.typeSource === "context" ? { workspaceType: scenario.workspaceType } : {}),
          viewSurfaces: surfaces,
        },
      },
    },
    canCreateTopLevelClient: () => scenario.canCreate,
    canCreateAnyProject: () => scenario.canCreate,
  });
  for (const name of names) {
    vm.runInContext(extractFunctionBlock(text, name), sandbox);
  }
  return vm.runInContext("clientProjectsViewSurfaceDescriptor", sandbox);
}

/** Every scenario the pipeline distinguishes. */
function* scenarios() {
  for (const page of /** @type {const} */ (["clients", "projects"]))
    for (const workspaceType of ["business", "personal", "family"])
      for (const typeSource of /** @type {const} */ (["context", "settings"]))
        for (const canCreate of [true, false])
          for (const query of ["", "c1"])
            yield { page, workspaceType, typeSource, canCreate, query };
}

/**
 * A descriptor wrapped so every member read is recorded, in order, by path.
 * @param {unknown} value @param {string} path @param {string[]} log
 * @returns {unknown}
 */
function tracked(value, path, log) {
  if (value === null || typeof value !== "object") return value;
  return new Proxy(/** @type {object} */ (value), {
    get(target, key, receiver) {
      const name = `${path}.${String(key)}`;
      log.push(name);
      return tracked(Reflect.get(target, key, receiver), name, log);
    },
    ownKeys(target) {
      log.push(`${path}[keys]`);
      return Reflect.ownKeys(target);
    },
  });
}

/** @param {unknown} value */
function plain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

describe("The typed pipeline is the baseline pipeline", () => {
  it("delivers exactly what the baseline delivered, in every scenario", () => {
    let checked = 0;
    for (const scenario of scenarios()) {
      const before = liftPipeline(baseline, scenario, realSurfaces())();
      const after = liftPipeline(source, scenario, realSurfaces())();

      assert.deepEqual(plain(after), plain(before), JSON.stringify(scenario));
      checked += 1;
    }
    assert.equal(checked, 48, "two pages, three workspace types, two type sources, two permissions, two queries");
  });

  it("reads the same members, in the same order, in every scenario", () => {
    for (const scenario of scenarios()) {
      /** @type {string[]} */ const beforeReads = [];
      /** @type {string[]} */ const afterReads = [];
      liftPipeline(baseline, scenario, realSurfaces().map((surface, index) => tracked(surface, `s${index}`, beforeReads)))();
      liftPipeline(source, scenario, realSurfaces().map((surface, index) => tracked(surface, `s${index}`, afterReads)))();

      assert.deepEqual(afterReads, beforeReads, JSON.stringify(scenario));
      assert.ok(afterReads.length > 0, "the proxy recorded reads, so the comparison is not vacuous");
    }
  });

  it("delivers the same for malformed sections that do not throw", () => {
    // A truthy non-object section is spread rather than rejected; that must stay so.
    const scenario = /** @type {Scenario} */ ({ page: "projects", workspaceType: "personal", typeSource: "context", canCreate: false, query: "" });
    for (const malformed of [{ indexPanel: "x" }, { indexPanel: 7 }, { pageHeader: "x" }, { table: true }, { dataSource: "ab" }]) {
      const surfaces = () => realSurfaces().map((surface) => ({ ...surface, ...malformed }));
      const before = liftPipeline(baseline, scenario, surfaces())();
      const after = liftPipeline(source, scenario, surfaces())();
      assert.deepEqual(plain(after), plain(before), JSON.stringify(malformed));
    }
  });

  it("still fails, as the baseline did, for a list that is not an array or an entry that is null", () => {
    const scenario = /** @type {Scenario} */ ({ page: "projects", workspaceType: "personal", typeSource: "context", canCreate: true, query: "" });
    for (const malformed of [{ filters: {} }, { filters: "x" }, { filters: [null] }, { table: { columns: {} } }, { table: { columns: [null] } }]) {
      const surfaces = () => realSurfaces().map((surface) => ({ ...surface, ...malformed }));
      // By name, not by constructor: the error is created inside the sandbox, so it is not an
      // instance of this realm's `TypeError`.
      assert.throws(() => liftPipeline(baseline, scenario, surfaces())(), { name: "TypeError" }, `baseline throws for ${JSON.stringify(malformed)}`);
      assert.throws(() => liftPipeline(source, scenario, surfaces())(), { name: "TypeError" }, `typed version throws for ${JSON.stringify(malformed)}`);
    }
  });
});

/** Run the new pipeline once and return its delivered descriptor. @param {Partial<Scenario>} overrides */
function deliver(overrides) {
  const scenario = { page: "projects", workspaceType: "business", typeSource: "context", canCreate: true, query: "", ...overrides };
  return plain(liftPipeline(source, /** @type {Scenario} */ (scenario), realSurfaces())());
}

/** The ids of a delivered list, in order. */
const ids = (/** @type {{ id: string }[]} */ list) => (list || []).map((entry) => entry.id);

describe("Exactly what survives", () => {
  it("delivers a business workspace's descriptors untouched", () => {
    for (const page of /** @type {const} */ (["clients", "projects"])) {
      const real = realSurfaces().find((surface) => surface.id === `client-projects.${page}`);
      assert.deepEqual(deliver({ page }), real, `${page} is delivered exactly as contributed`);
    }
  });

  it("removes every client field from the Projects surface in a workspace without clients", () => {
    for (const workspaceType of ["personal", "family"]) {
      const surface = deliver({ workspaceType });

      assert.deepEqual(ids(surface.filters), ["project-status-filter", "project-tag-filter"], `${workspaceType}: client filter gone`);
      assert.equal("itemSubtitleField" in surface.indexPanel, false, "the client-name subtitle is gone");
      assert.deepEqual(ids(surface.table.columns), ["project-name", "project-status"], "client and billable columns gone");
      const expectedBindings = Object.keys(contributedSurface("projects").dataSource.fieldBindings).filter((key) => key !== "clientId" && key !== "clientName");
      assert.deepEqual(Object.keys(surface.dataSource.fieldBindings), expectedBindings,
        "exactly clientId and clientName are removed, and every other binding is kept in order");
      assert.deepEqual(surface.indexPanel.itemMetaFields, ["status", "tagSummary"], "billing meta gone, the rest kept in order");
    }
  });

  it("leaves the Clients surface's client fields alone, and removes only its billing in a non-business workspace", () => {
    const surface = deliver({ page: "clients", workspaceType: "personal" });

    assert.deepEqual(ids(surface.filters), ["client-status-filter", "client-tag-filter"], "no client filter to remove on this surface");
    assert.equal(surface.indexPanel.itemSubtitleField, "status", "its own subtitle is untouched");
    assert.deepEqual(ids(surface.table.columns), ["client-name", "client-status"], "only the billable column goes");
    assert.deepEqual(surface.indexPanel.itemMetaFields, ["tagSummary"]);
  });

  it("drops the page's primary action only when the user cannot create", () => {
    for (const page of /** @type {const} */ (["clients", "projects"])) {
      assert.ok(deliver({ page, canCreate: true }).pageHeader.primaryAction, `${page}: kept when permitted`);
      const denied = deliver({ page, canCreate: false });
      assert.equal("primaryAction" in denied.pageHeader, false, `${page}: removed when not`);
      assert.ok(denied.pageHeader.title || Object.keys(denied.pageHeader).length > 0, "and the rest of the header is kept");
    }
  });

  it("defaults the client filter from the query only on the Projects page of a business workspace", () => {
    // The contributed filters carry defaults of their own - "Active", "", "All" - so the claim is
    // that exactly one of them changes, not that none carries a default.
    const contributed = (/** @type {"clients" | "projects"} */ page) => contributedSurface(page).filters;
    const applied = deliver({ page: "projects", workspaceType: "business", query: "c1" });
    const expected = contributed("projects").map((/** @type {{ id: string }} */ filter) => (
      filter.id === "project-client-filter" ? { ...filter, default: "c1" } : filter
    ));
    assert.deepEqual(applied.filters, expected, "the client filter's own \"All\" becomes c1; every other filter keeps its own default");

    assert.deepEqual(deliver({ page: "clients", workspaceType: "business", query: "c1" }).filters, contributed("clients"),
      "never on the Clients page: its filters are delivered exactly as contributed");

    for (const workspaceType of ["personal", "family"]) {
      const surface = deliver({ page: "projects", workspaceType, query: "c1" });
      assert.ok(!ids(surface.filters).includes("project-client-filter"), `${workspaceType}: the filter it would default is removed`);
    }
  });

  it("reads the workspace type from the settings when the context carries none", () => {
    assert.deepEqual(deliver({ workspaceType: "personal", typeSource: "settings" }), deliver({ workspaceType: "personal", typeSource: "context" }));
    assert.deepEqual(deliver({ workspaceType: "business", typeSource: "settings" }), deliver({ workspaceType: "business", typeSource: "context" }));
  });
});

describe("What the pipeline must not do", () => {
  it("returns the contributed surface itself when every stage passes it through", () => {
    for (const page of /** @type {const} */ (["clients", "projects"])) {
      const surfaces = realSurfaces();
      const contributed = surfaces.find((surface) => surface.id === `client-projects.${page}`);
      const delivered = liftPipeline(source, { page, workspaceType: "business", typeSource: "context", canCreate: true, query: "" }, surfaces)();

      assert.equal(delivered, contributed, `${page}: by identity, not a copy`);
    }
  });

  it("never mutates the contributed descriptor or anything nested in it", () => {
    for (const scenario of scenarios()) {
      const surfaces = realSurfaces();
      const before = JSON.stringify(surfaces);
      liftPipeline(source, scenario, surfaces)();

      assert.equal(JSON.stringify(surfaces), before, JSON.stringify(scenario));
    }
  });

  it("hides the create action without granting or withholding the permission itself", () => {
    // Presentation filtering only: the stage reads the existing permission answers and removes a
    // header action. It does not touch the permission functions, and the server still refuses a
    // create the user cannot make - hiding the action is not the check.
    const stage = extractFunctionBlock(source, "withoutUnavailableTopLevelActions");
    assert.match(stage, /canCreateTopLevelClient\(\)/);
    assert.match(stage, /canCreateAnyProject\(\)/);
    assert.doesNotMatch(stage, /canCreate\w*\s*=/, "it only reads the permission answers");
  });
});
