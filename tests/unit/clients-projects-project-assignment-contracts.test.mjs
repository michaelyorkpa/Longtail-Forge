import { execFileSync } from "node:child_process";
import { setImmediate } from "node:timers/promises";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * The Clients/Projects project assignment and context cluster (`0.33.33.43.49`).
 *
 * Two contracts were traced before typing. The Add Client shortcut's `onCreated` was inferred as
 * `null` from its default - the TS2322 at its one caller and the TS2349 at the call - though it is
 * always that caller's picker refresh. Its result is the registry's `ModuleActionOutcome` or, where
 * the registry is absent, the dialog's close reason as text; the shortcut now reads it through a
 * checked reader that performs the optional chain's own reads. The context rows' `.filter(Boolean)`
 * became a narrowing `!== null` filter. What these cases pin:
 *
 * 1. **Only those two edits reach a body.**
 * 2. **The pickers, context region, rows and readers answer as their `355992d2` versions**, through
 *    the real view builder, on a hierarchy `normalizeData` builds.
 * 3. **Both dispatch paths behave as before**: a completed registry outcome reports its record id;
 *    a cancelled one, one without an id, a rejection, and every fallback close reason report
 *    nothing - and a close string is still read with the string itself as the receiver.
 *
 * The page's dialog fallback, error handler, status line and data refresh lie outside this slice;
 * each gets one identical stub in both versions.
 */

const reader = createProjectTextReader();
const current = reader.readText("public/js/clients-projects.js");
const baseline = execFileSync("git", ["show", "355992d2:public/js/clients-projects.js"], {
  cwd: process.cwd(),
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
const builderSource = reader.readText("public/js/shared/view-builder.js");
const modalStackSource = reader.readText("public/js/shared/view-modal-stack.js");

/** @type {ReadonlyArray<readonly [string, string]>} */
const VERSIONS = [["current", current], ["355992d2", baseline]];

const CLUSTER = [
  "createProjectClientAssignment", "createProjectParentAssignment", "populateParentProjectSelect",
  "createAddProjectClientAssignment", "createProjectClientContextRegion", "createProjectClientContextRows",
  "createProjectContextActionStrip", "createAddClientShortcutButton", "getDefaultProjectClientId",
  "getProjectTargetClient", "getProjectClientName", "selectedProjectClientFilterValue",
];
const CLOSURE = [
  ...CLUSTER, "normalizeData", "openClientProjectModuleAction", "normalizeProjects", "normalizeClientRecord",
  "buildWorkspaceProjectsGrouping", "canCreateTopLevelClient", "clientsEnabledForWorkspace", "canManageProjectClientScope",
  "createOption", "sortClientTree", "getRealClients", "isActiveStatus", "treeIndent", "getClientDepth",
  "getProjectDescendantIds", "sortProjectsForClient", "getProjectDepth", "canCreateProjectForClient",
  "workspaceProjectsLabel", "requireView", "canCreateChildClient", "getProjectClientLabel", "isRealClient",
  "getWorkspaceProjectClient", "usesProjectRoundingOnly", "normalizeBillableFlag", "normalizeBillingRate",
  "normalizeOptionalBillingPeriod", "normalizeOptionalBillingRounding", "normalizeProjectTaskDefaults",
  "normalizeTaskReminderPolicy", "normalizeTags", "normalizeBillingContact", "requirePageController",
  "getClientTreeSortKey", "compareProjectsByName", "isWorkspaceGrouping", "normalizeBillingPeriod",
  "normalizeBillingRounding", "vocabularyHas", "normalizeProjectTaskSortOrder", "normalizeReminderOffsetList",
  "parseJsonArray",
];
const ARRAYS = [
  "clientStatuses", "projectStatuses", "taskDefaultStatuses", "taskDefaultPriorities", "taskDefaultAssigneeModes",
  "defaultProjectTaskSortOrder", "billingContactFields",
];

/** @param {string} text @param {string} opener @param {string} close */
function declaration(text, opener, close) {
  const at = text.indexOf(opener);
  expect(at, opener).toBeGreaterThan(-1);
  return text.slice(at, text.indexOf(close, at) + close.length);
}

/** @param {boolean} topLevel */
const wire = (topLevel) => ({
  capabilities: { can_create_top_level_client: topLevel, can_create_workspace_project: true, can_manage_workspace_projects: true },
  clients: [
    {
      id: "c-a", name: "Acme", status: "Active", can_manage: true, can_create_project: true, can_manage_projects: true, can_create_child: true,
      projects: [
        { id: "p-1", name: "Launch", status: "Active", can_manage: true },
        { id: "p-2", name: "Launch child", parent_project_id: "p-1", status: "Active", can_manage: false },
        { id: "p-3", name: "Archive", status: "Inactive" },
      ],
    },
    { id: "c-b", name: "Beta", parent_client_id: "c-a", status: "Active", can_create_project: true },
    { id: "c-x", name: "Closed", status: "Inactive", can_create_project: true },
  ],
  workspaceProjects: [{ id: "w-1", name: "Internal", status: "Active" }],
});

/** @param {unknown} node @returns {unknown} */
function serialize(node) {
  if (!node || typeof node !== "object") return node ?? null;
  const tag = Reflect.get(node, "tagName");
  const children = Reflect.get(node, "children");
  return {
    tag,
    className: Reflect.get(node, "className") ?? "",
    attributes: [...(Reflect.get(node, "attributes") || new Map())].map(([name, value]) => `${name}=${value}`).sort(),
    hidden: Reflect.get(node, "hidden") ?? null,
    disabled: Reflect.get(node, "disabled") ?? null,
    value: tag === "SELECT" || tag === "OPTION" ? Reflect.get(node, "value") : null,
    text: tag === "#TEXT" || !children?.length ? Reflect.get(node, "textContent") ?? null : null,
    children: Array.from(children || [], serialize),
  };
}

/**
 * One version's cluster in a fake page, with the registry either stubbed or absent.
 * @param {string} text
 * @param {{ topLevel?: boolean, workspaceType?: string, registry?: (() => Promise<unknown>) | null, fallback?: () => Promise<unknown> }} [options]
 */
function pageFrom(text, options = {}) {
  /** @type {unknown[]} */
  const errors = [];
  const context = createFakeBrowserContext({
    window: {
      Event: class {
        /** @param {string} type @param {{ bubbles?: boolean }} [init] */
        constructor(type, init = {}) { this.type = type; this.bubbles = Boolean(init.bubbles); }
      },
    },
    globals: {
      isProjectsPage: true,
      activeClientProjectsReadSurface: null,
      clientProjectData: { capabilities: {}, clients: [] },
      wire: wire(options.topLevel !== false),
      openClientProjectActionFallback: options.fallback || (() => Promise.resolve("closed")),
      handleClientProjectActionError: (/** @type {unknown} */ error) => { errors.push(`${Reflect.get(Object(error), "message")}`); },
      setStatus: () => undefined,
      refreshClientProjectData: () => Promise.resolve(),
    },
  });
  const namespace = context.window.LongtailForge;
  Reflect.set(namespace, "pageController", {
    /** @param {unknown} value @param {unknown} label */
    createOption(value, label) {
      const option = context.document.createElement("option");
      option.value = String(value);
      option.textContent = label === undefined ? "" : String(label);
      return option;
    },
  });
  if (options.registry) {
    Reflect.set(namespace, "moduleActions", { open: options.registry });
  }
  vm.runInNewContext(modalStackSource, context, { filename: "view-modal-stack.js" });
  vm.runInNewContext(builderSource, context, { filename: "view-builder.js" });
  for (const name of ARRAYS) vm.runInContext(declaration(text, `  const ${name} = [`, "];"), context);
  vm.runInContext(declaration(text, "  let workspaceSettings = {", "\n  };"), context);
  vm.runInContext(`workspaceSettings.workspaceType = ${JSON.stringify(options.workspaceType || "business")};`, context);
  for (const name of CLOSURE) vm.runInContext(extractFunctionBlock(text, name), context);
  if (text.includes("  function readActionResultMember(")) {
    vm.runInContext(extractFunctionBlock(text, "readActionResultMember"), context);
  }
  vm.runInContext("clientProjectData = normalizeData(wire);", context);
  return { context, errors };
}

/** @param {vm.Context} context @param {string} expression */
const run = (context, expression) => vm.runInContext(expression, context);

/**
 * Everything the cluster renders and answers for one version, as plain data.
 * @param {string} text
 * @param {{ topLevel?: boolean, workspaceType?: string }} options
 */
function renderedFrom(text, options) {
  const { context } = pageFrom(text, options);
  const rendered = run(context, `(() => {
    const [grouping, acme] = [clientProjectData.clients[0], getRealClients()[0]];
    const [p1, p2] = acme.projects;
    const nullSelect = populateParentProjectSelect(null, { clientId: "c-a" });
    const add = createAddProjectClientAssignment(acme);
    const addForGrouping = createAddProjectClientAssignment(grouping);
    return {
      clientPicker: createProjectClientAssignment(p2),
      parentPicker: createProjectParentAssignment(p2, acme),
      stubParentPicker: createProjectParentAssignment({ id: "", client_id: "c-a", parent_project_id: "p-1" }, acme),
      nullSelect: nullSelect === undefined,
      add: add && add.element,
      addValue: add && add.select.value,
      addForGrouping: addForGrouping && addForGrouping.element,
      region: createProjectClientContextRegion(p2),
      rows: [p1, p2, grouping.projects[0]].map((project) => createProjectClientContextRows(project)
        .map((row) => [row.type, row.label, row.actions.map((action) => [action.label, action.action])])),
      defaults: [grouping, acme].map((entry) => getDefaultProjectClientId(entry)),
      targets: ["c-a", "", "c-missing"].map((id) => getProjectTargetClient(id).id),
      names: ["c-b", "", "c-missing"].map((id) => getProjectClientName(id)),
      filter: selectedProjectClientFilterValue(),
    };
  })()`);
  return JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(rendered).map(([key, value]) => [
    key, value && typeof value === "object" && Reflect.get(value, "tagName") ? serialize(value) : value,
  ]))));
}

/**
 * One click of the Add Client shortcut under one dispatch path, as plain data.
 * @param {string} text
 * @param {{ registry?: (() => Promise<unknown>) | null, fallback?: () => Promise<unknown> }} dispatch
 */
async function clickFrom(text, dispatch) {
  const { context, errors } = pageFrom(text, dispatch);
  /** @type {unknown[]} */
  const created = [];
  /** @type {string[]} */
  const receivers = [];
  run(context, `Object.defineProperty(String.prototype, "completed", {
    configurable: true,
    get() { "use strict"; receiverLog.push(typeof this); return undefined; },
  });`.replace("receiverLog", "__receivers"));
  Reflect.set(context, "__receivers", receivers);
  const button = run(context, "createAddClientShortcutButton")({
    onCreated: (/** @type {unknown} */ clientId) => { created.push(clientId); },
  });
  await button.click();
  for (let turn = 0; turn < 5; turn += 1) await setImmediate();
  run(context, "delete String.prototype.completed;");
  return { created, errors, receivers, disabledAfter: button.disabled };
}

/** A function block without its JSDoc, so only an annotation can differ. @param {string} block */
const withoutJsDoc = (block) => block.replace(/[ \t]*\/\*\*[\s\S]*?\*\/\n/g, "").replace(/\/\*\*[\s\S]*?\*\/ ?/g, "");

describe("Only the two approved edits reach a body", () => {
  it("leaves every body as it was, but for the narrowing filter and the checked result reads", () => {
    for (const name of CLUSTER) {
      const expected = withoutJsDoc(extractFunctionBlock(baseline, name))
        .replace("].filter(Boolean),", "].filter((action) => action !== null),")
        .replace(
          "const clientId = result?.completed ? result.detail?.recordId || \"\" : \"\";",
          "const clientId = readActionResultMember(result, \"completed\")\n          ? readActionResultMember(readActionResultMember(result, \"detail\"), \"recordId\") || \"\"\n          : \"\";",
        )
        // `0.33.33.43.53` narrowed the read surface, and with it this lookup of its client filter.
        .replace(
          "const control = activeClientProjectsReadSurface?.querySelector?.('[name=\"clientId\"]');",
          "const control = activeClientProjectsReadSurface\n      ? requireCheckedDom().find(activeClientProjectsReadSurface, '[name=\"clientId\"]', HTMLSelectElement)\n      : null;",
        );
      expect(withoutJsDoc(extractFunctionBlock(current, name)), name).toBe(expected);
    }
  });
});

describe("The pickers, context and readers answer as before", () => {
  it("renders and answers identically, with and without top-level client creation, and outside Business", () => {
    for (const options of [{ topLevel: true }, { topLevel: false }, { workspaceType: "personal" }]) {
      const [now, before] = VERSIONS.map(([, text]) => renderedFrom(text, options));
      expect(now, JSON.stringify(options)).toEqual(before);
    }
    const business = renderedFrom(current, { topLevel: true });
    expect(business.rows[1][0][2], "a managed client's row offers Edit then Add Client, with no null left")
      .toEqual([["Edit", "edit-client"], ["Add Client", "add-client"]]);
    expect(renderedFrom(current, { topLevel: false }).rows[1][0][2].map((/** @type {string[]} */ action) => action[1]))
      .toEqual(["edit-client", "add-child-client"]);
    expect(business.targets).toEqual(["c-a", "__workspace_projects__", "__workspace_projects__"]);
    expect(business.nullSelect).toBe(true);
  });
});

describe("Both dispatch paths behave as before", () => {
  const OUTCOMES = {
    "registry: completed with an id": { registry: () => Promise.resolve({ actionId: "clients.add", completed: true, detail: { actionId: "clients.add", recordId: "c-new" } }) },
    "registry: cancelled": { registry: () => Promise.resolve({ actionId: "clients.add", completed: false, detail: {} }) },
    "registry: completed without an id": { registry: () => Promise.resolve({ actionId: "clients.add", completed: true, detail: {} }) },
    "registry: completed with no detail": { registry: () => Promise.resolve({ actionId: "clients.add", completed: true, detail: null }) },
    "registry: rejected": { registry: () => Promise.reject(new Error("Add Client could not be opened.")) },
    "fallback: complete": { registry: null, fallback: () => Promise.resolve("complete") },
    "fallback: cancel": { registry: null, fallback: () => Promise.resolve("cancel") },
    "fallback: closed": { registry: null, fallback: () => Promise.resolve("closed") },
  };

  it("reports a created id only for a completed registry outcome that carries one", async () => {
    for (const [name, dispatch] of Object.entries(OUTCOMES)) {
      const [now, before] = await Promise.all(VERSIONS.map(([, text]) => clickFrom(text, dispatch)));
      expect(now, name).toEqual(before);
    }
    expect((await clickFrom(current, OUTCOMES["registry: completed with an id"])).created).toEqual(["c-new"]);
    const fallback = await clickFrom(current, OUTCOMES["fallback: complete"]);
    expect(fallback.created, "a close string is never read as a creation").toEqual([]);
    expect(fallback.receivers, "and it is read with the string itself as the receiver").toEqual(["string"]);
    expect((await clickFrom(current, OUTCOMES["registry: rejected"])).errors).toEqual(["Add Client could not be opened."]);
    expect(fallback.disabledAfter).toBe(false);
  });
});
