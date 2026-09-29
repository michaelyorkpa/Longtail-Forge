import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * The Clients/Projects related-projects region and the hierarchy tail (`0.33.33.43.48`).
 *
 * The region's seven functions gained annotations from their callers, and one dead argument -
 * `options`, handed to a table list that declares two parameters - was dropped. The tree sort key's
 * walker gained an annotated alias so its `find` callback no longer captures the binding the loop
 * reassigns. What these cases pin:
 *
 * 1. **Only those two edits reach a body**; everything else differs by JSDoc alone.
 * 2. **The real builders render the same DOM as their `097ac0cc` versions**, through the real view
 *    builder, for every variant the region selects between - collapsible table, bare table, editor
 *    rows, flat editor rows - with and without projects, on a hierarchy `normalizeData` builds.
 * 3. **The walker reads each parent id exactly as before**: inside the callback, once per candidate,
 *    never for an empty search, and re-read each time so a changing getter answers the same.
 *
 * `createProjectEditor`, the module-action opener and its error handler lie outside this slice; each
 * gets one identical stub in both versions.
 */

const reader = createProjectTextReader();
const current = reader.readText("public/js/clients-projects.js");
const baseline = execFileSync("git", ["show", "097ac0cc:public/js/clients-projects.js"], {
  cwd: process.cwd(),
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
const builderSource = reader.readText("public/js/shared/view-builder.js");
const modalStackSource = reader.readText("public/js/shared/view-modal-stack.js");

/** @type {ReadonlyArray<readonly [string, string]>} */
const VERSIONS = [["current", current], ["097ac0cc", baseline]];

const REGION = [
  "createRelatedProjectsRegion", "createRelatedProjectEditorList", "createRelatedProjectTableList",
  "createRelatedProjectsDataTable", "createRelatedProjectNameCell", "relatedProjectRow", "formatProjectTaskDefaultsSummary",
];
const CLOSURE = [
  ...REGION, "normalizeData", "sortProjectsForClient", "requireView", "normalizeProjects", "normalizeClientRecord",
  "buildWorkspaceProjectsGrouping", "canCreateTopLevelClient", "compareProjectsByName", "createRelatedProjectsEmptyState",
  "usesProjectRoundingOnly", "normalizeBillableFlag", "normalizeBillingRate", "normalizeOptionalBillingPeriod",
  "normalizeOptionalBillingRounding", "normalizeProjectTaskDefaults", "normalizeTaskReminderPolicy", "normalizeTags",
  "normalizeBillingContact", "workspaceProjectsLabel", "createRelatedProjectActionStrip", "clientsEnabledForWorkspace",
  "normalizeBillingPeriod", "normalizeBillingRounding", "vocabularyHas", "normalizeProjectTaskSortOrder",
  "normalizeReminderOffsetList", "getProjectDepth", "formatProjectBillingSummary", "appendTagChips", "parseJsonArray",
  "formatBillingPeriod", "getEffectiveProjectBillingPeriod", "formatBillingRounding", "getEffectiveProjectBillingRounding",
  "formatToken", "requireNamespace", "formatOrdinal", "getEffectiveClientBillingPeriod", "getEffectiveClientBillingRounding",
];
const ARRAYS = [
  "clientStatuses", "projectStatuses", "taskDefaultStatuses", "taskDefaultPriorities", "taskDefaultAssigneeModes",
  "defaultProjectTaskSortOrder", "billingContactFields",
];

/** One top-level declaration of a version, lifted rather than restated. @param {string} text @param {string} opener @param {string} close */
function declaration(text, opener, close) {
  const at = text.indexOf(opener);
  expect(at, opener).toBeGreaterThan(-1);
  return text.slice(at, text.indexOf(close, at) + close.length);
}

/** A client with a project hierarchy, on the wire, for the page's own normaliser. */
const WIRE = {
  capabilities: { can_create_top_level_client: true },
  clients: [{
    id: "c-1", name: "Acme", status: "Active", billable: "yes", billing_rate: "120",
    tags: [], projects: [
      { id: "p-b", name: "beta", status: "Active", billable: "yes", billing_rate: "90", tags: [{ tag_id: "t1", name: "Urgent" }] },
      { id: "p-a", name: "Alpha", status: "Inactive", billable: "no" },
      { id: "p-a1", name: "Alpha child", parent_project_id: "p-a", status: "Completed", task_defaults: { status: "blocked", priority: "high" } },
      { id: "p-orphan", name: "orphan", parent_project_id: "p-missing", status: "Active" },
    ],
  }, { id: "c-empty", name: "Empty", status: "Active", projects: [] }],
};

/** @param {unknown} node @returns {unknown} */
function serialize(node) {
  if (!node || typeof node !== "object") return node ?? null;
  const tag = Reflect.get(node, "tagName");
  const children = Reflect.get(node, "children");
  return {
    tag,
    className: Reflect.get(node, "className") ?? "",
    attributes: [...(Reflect.get(node, "attributes") || new Map())].map(([name, value]) => `${name}=${value}`).sort(),
    dataset: JSON.stringify(Reflect.get(node, "dataset") || {}),
    hidden: Reflect.get(node, "hidden") ?? null,
    open: Reflect.get(node, "open") ?? null,
    text: tag === "#TEXT" || !children?.length ? Reflect.get(node, "textContent") ?? null : null,
    children: Array.from(children || [], serialize),
  };
}

/**
 * Every region variant one version renders, serialised.
 * @param {string} text
 */
function renderedFrom(text) {
  const context = createFakeBrowserContext({
    longtailForge: {
      tags: {
        renderTagList: (/** @type {{ textContent: string }} */ list, /** @type {{ name: string }[]} */ tags) => {
          list.textContent = tags.map((tag) => tag.name).join(", ");
        },
      },
    },
    globals: {
      isProjectsPage: false,
      clientProjectData: { capabilities: {}, clients: [] },
      wire: WIRE,
      createProjectEditor: (/** @type {{ id: string }} */ _client, /** @type {{ id: string, name: string }} */ project) => {
        const stub = context.document.createElement("article");
        stub.setAttribute("data-stub-project-editor", project.id);
        stub.textContent = project.name;
        return stub;
      },
      openClientProjectModuleAction: () => Promise.resolve(),
      handleClientProjectActionError: () => undefined,
    },
  });
  vm.runInNewContext(modalStackSource, context, { filename: "view-modal-stack.js" });
  vm.runInNewContext(builderSource, context, { filename: "view-builder.js" });
  for (const name of ARRAYS) vm.runInContext(declaration(text, `  const ${name} = [`, "];"), context);
  vm.runInContext(declaration(text, "  const projectTaskAssigneeModeLabels = {", "\n  };"), context);
  vm.runInContext(declaration(text, "  let workspaceSettings = {", "\n  };"), context);
  for (const name of CLOSURE) vm.runInContext(extractFunctionBlock(text, name), context);
  // `0.33.33.43.57` reads the rounding rule through the page's wire reader, so it joins the
  // sandbox for any version that has one.
  if (text.includes("  function readWireMember(")) vm.runInContext(extractFunctionBlock(text, "readWireMember"), context);
  const variants = vm.runInContext(`(() => {
    clientProjectData = normalizeData(wire);
    const [client, empty] = clientProjectData.clients;
    return [
      ["default", createRelatedProjectsRegion(client)],
      ["bare table", createRelatedProjectsRegion(client, { collapsible: false })],
      ["editor rows", createRelatedProjectsRegion(client, { editorRows: true })],
      ["flat editor rows", createRelatedProjectsRegion(client, { editorRows: true, flat: true, collapsible: false })],
      ["empty table", createRelatedProjectsRegion(empty)],
      ["empty editor rows", createRelatedProjectsRegion(empty, { editorRows: true })],
      ["task defaults", formatProjectTaskDefaultsSummary(client.projects[2])],
      ["rows", createRelatedProjectsDataTable(client, sortProjectsForClient(client)) && sortProjectsForClient(client).map((project) => {
        const row = relatedProjectRow(client, project);
        return [row.id, row.depth, row.parentProjectId, row.billingSummary, row.taskDefaultsSummary];
      })],
    ];
  })()`, context);
  return JSON.parse(JSON.stringify(Array.from(variants, ([name, value]) => [name, typeof value === "object" && value && Reflect.get(value, "tagName") ? serialize(value) : value])));
}

/** A function block without its JSDoc, so only an annotation can differ. @param {string} block */
const withoutJsDoc = (block) => block.replace(/[ \t]*\/\*\*[\s\S]*?\*\/\n/g, "").replace(/\/\*\*[\s\S]*?\*\/ ?/g, "");

describe("Only the two approved edits reach a body", () => {
  it("leaves the region's bodies as they were, but for the dropped dead argument", () => {
    for (const name of REGION) {
      const expected = withoutJsDoc(extractFunctionBlock(baseline, name)).replace(
        "createRelatedProjectTableList(client, relatedProjects, options)",
        "createRelatedProjectTableList(client, relatedProjects)",
      // `0.33.33.43.58` made the sinks' existing conversions explicit, with the operator's approval.
      ).replace("    wrapper.textContent = row.name;", "    wrapper.textContent = `${row.name ?? \"\"}`;");
      expect(withoutJsDoc(extractFunctionBlock(current, name)), name).toBe(expected);
    }
  });

  it("changes the tree sort key only by aliasing the client it searches with", () => {
    const expected = withoutJsDoc(extractFunctionBlock(baseline, "getClientTreeSortKey")).replace(
      "      currentClient = getRealClients().find((item) => item.id === currentClient.parent_client_id);",
      "      const lookupClient = currentClient;\n      currentClient = getRealClients().find((item) => item.id === lookupClient.parent_client_id);",
    );
    expect(withoutJsDoc(extractFunctionBlock(current, "getClientTreeSortKey"))).toBe(expected);
  });
});

describe("The region renders exactly as before", () => {
  it("renders every variant the region selects between, through the real view builder", () => {
    const [now, before] = VERSIONS.map(([, text]) => renderedFrom(text));
    expect(now).toEqual(before);

    const rendered = Object.fromEntries(now);
    expect(rendered.default.className).toMatch(/client-projects-related-region/);
    expect(JSON.stringify(rendered["bare table"])).not.toMatch(/client-projects-related-region/);
    expect(JSON.stringify(rendered["editor rows"])).toMatch(/data-stub-project-editor=p-a1/);
    expect(JSON.stringify(rendered["flat editor rows"])).toMatch(/project-list-flat/);
    expect(JSON.stringify(rendered["empty editor rows"])).toMatch(/client-projects-related-empty/);
    expect(rendered.rows.map((/** @type {unknown[]} */ row) => row.slice(0, 3))).toEqual([
      ["p-a", 0, ""], ["p-a1", 1, "p-a"], ["p-b", 0, ""], ["p-orphan", 0, "p-missing"],
    ]);
  });
});

describe("The tree sort key reads each parent id exactly as before", () => {
  /**
   * One version's walker over clients whose `parent_client_id` getters log every read.
   * @param {string} text
   * @param {"chain" | "empty search" | "changing getter"} scenario
   */
  function readsFrom(text, scenario) {
    /** @type {string[]} */
    const reads = [];
    /** @param {string} id @param {string} name @param {() => string} parent */
    const client = (id, name, parent) => ({
      id,
      name,
      get parent_client_id() {
        const value = parent();
        reads.push(`${id}.parent -> ${value}`);
        return value;
      },
    });
    let flips = 0;
    const clients = scenario === "changing getter"
      ? [client("a", "A", () => ""), client("b", "B", () => (flips++ % 2 === 0 ? "zzz" : "a")), client("c", "C", () => "b")]
      : [client("a", "A", () => ""), client("b", "B", () => "a"), client("c", "C", () => "b")];
    const context = vm.createContext({ realClients: scenario === "empty search" ? [] : clients });
    vm.runInContext("function getRealClients() { return realClients; }", context);
    vm.runInContext(extractFunctionBlock(text, "getClientTreeSortKey"), context);
    const key = Reflect.apply(vm.runInContext("getClientTreeSortKey", context), undefined, [clients[2]]);
    return { key, reads };
  }

  it("reads inside the callback once per candidate, never for an empty search, and afresh each time", () => {
    for (const scenario of /** @type {const} */ (["chain", "empty search", "changing getter"])) {
      const [now, before] = VERSIONS.map(([, text]) => readsFrom(text, scenario));
      expect(now, scenario).toEqual(before);
    }
    const chain = readsFrom(current, "chain");
    expect(chain.key).toBe("A/B/C");
    expect(chain.reads.filter((read) => read.startsWith("c.")), "one read per candidate searched").toHaveLength(2);
    expect(readsFrom(current, "empty search").reads, "no candidate, no read").toEqual([]);
  });
});
