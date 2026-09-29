import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * The Clients/Projects hierarchy readers (`0.33.33.43.47`).
 *
 * Ten readers - depth, descendants, tree order, labels and lookup - gained parameter and return
 * annotations taken from what their callers pass, and nothing else. What these cases pin is that
 * claim: every body is the `c89cdcab` body once JSDoc is removed, and the real readers answer
 * exactly as their `c89cdcab` versions on hierarchies the page's own `normalizeData` builds -
 * deep, orphaned, cyclic, sibling ties and unnamed records included.
 *
 * `getClientTreeSortKey` was held back here and typed at `0.33.33.43.48`, through an annotated alias
 * that keeps its parent read inside the `find` callback. Its one body edit - the alias - is allowed
 * below; its parent-read sequence is pinned in `clients-projects-related-projects-contracts`.
 */

const reader = createProjectTextReader();
const current = reader.readText("public/js/clients-projects.js");
const baseline = execFileSync("git", ["show", "c89cdcab:public/js/clients-projects.js"], {
  cwd: process.cwd(),
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

/** @type {ReadonlyArray<readonly [string, string]>} */
const VERSIONS = [["current", current], ["c89cdcab", baseline]];

const READERS = [
  "getProjectClientLabel", "findProjectById", "getClientDepth", "getProjectDepth", "treeIndent",
  "sortClientTree", "sortProjectsForClient", "compareProjectsByName", "getClientTreeSortKey",
  "getClientDescendantIds", "getProjectDescendantIds",
];
const SUPPORT = [
  "normalizeData", "normalizeProjects", "normalizeClientRecord", "buildWorkspaceProjectsGrouping",
  "canCreateTopLevelClient", "isRealClient", "isWorkspaceGrouping", "workspaceProjectsLabel", "usesProjectRoundingOnly",
  "normalizeBillableFlag", "normalizeBillingRate", "normalizeOptionalBillingPeriod", "normalizeOptionalBillingRounding",
  "normalizeProjectTaskDefaults", "normalizeTaskReminderPolicy", "normalizeTags", "normalizeBillingContact",
  "clientsEnabledForWorkspace", "normalizeBillingPeriod", "normalizeBillingRounding", "vocabularyHas",
  "normalizeProjectTaskSortOrder", "normalizeReminderOffsetList", "parseJsonArray", "getAllProjects", "getRealClients",
];
const CONSTANTS = [
  "clientStatuses", "projectStatuses", "taskDefaultStatuses", "taskDefaultPriorities", "taskDefaultAssigneeModes",
  "defaultProjectTaskSortOrder",
];

/** One `const <name> = [...]` declaration of a version, lifted rather than restated. @param {string} text @param {string} name */
function arrayDeclaration(text, name) {
  const at = text.indexOf(`  const ${name} = [`);
  expect(at, `${name} is declared`).toBeGreaterThan(-1);
  return text.slice(at, text.indexOf("];", at) + 2);
}

/** A client/project hierarchy on the wire, covering every shape the readers branch on. */
const WIRE = {
  capabilities: { can_create_top_level_client: true, can_create_workspace_project: true },
  clients: [
    {
      id: "c-root-b", name: "beta", status: "Active", projects: [
        { id: "p-zeta", name: "Zeta", status: "Active" },
        { id: "p-a", name: "alpha", status: "Active" },
        { id: "p-child", name: "child", parent_project_id: "p-a", status: "Active" },
        { id: "p-grand", name: "Grand", parent_project_id: "p-child", status: "Active" },
        { id: "p-orphan", name: "orphan", parent_project_id: "p-missing", status: "Active" },
        { id: "p-cyc-1", name: "loop one", parent_project_id: "p-cyc-2", status: "Active" },
        { id: "p-cyc-2", name: "loop two", parent_project_id: "p-cyc-1", status: "Active" },
        { id: "p-tie-1", name: "Same", status: "Active" },
        { id: "p-tie-2", name: "same", status: "Active" },
        { id: "p-tie-3", name: "Sàme", status: "Active" },
        { id: "p-noname", status: "Active" },
      ],
    },
    { id: "c-root-a", name: "Alpha", status: "Active" },
    { id: "c-child", name: "child", parent_client_id: "c-root-a", status: "Active" },
    { id: "c-grand", name: "Grand", parent_client_id: "c-child", status: "Active" },
    { id: "c-orphan", name: "orphan", parent_client_id: "c-missing", status: "Active" },
    { id: "c-cyc-1", name: "loop one", parent_client_id: "c-cyc-2", status: "Active" },
    { id: "c-cyc-2", name: "loop two", parent_client_id: "c-cyc-1", status: "Active" },
    { id: "c-tie-1", name: "Tie", status: "Active" },
    { id: "c-tie-2", name: "tie", status: "Active" },
    { id: "c-tie-3", name: "Tïe", status: "Active" },
    { id: "c-noname", status: "Active" },
  ],
  workspaceProjects: [
    { id: "w-b", name: "Workspace B", status: "Active" },
    { id: "w-a", name: "workspace a", parent_project_id: "w-b", status: "Active" },
  ],
};

/**
 * Every reader's answer for one version, over the whole hierarchy, as plain data.
 * @param {string} text
 */
function answersFrom(text) {
  const context = vm.createContext({
    window: { LongtailForge: { getWorkspaceProjectsLabel: () => "Workspace Work" } },
    isProjectsPage: true,
    workspaceSettings: { workspaceType: "business" },
    clientProjectData: { capabilities: {}, clients: [] },
    wire: WIRE,
  });
  for (const name of CONSTANTS) vm.runInContext(arrayDeclaration(text, name), context);
  vm.runInContext(text.slice(text.indexOf("  const billingContactFields = ["), text.indexOf("];", text.indexOf("  const billingContactFields = [")) + 2), context);
  // `0.33.33.43.58` reads the wire records through the page's wire reader, so it joins the
  // sandbox for any version that has one.
  if (text.includes("  function readWireMember(")) vm.runInContext(extractFunctionBlock(text, "readWireMember"), context);
  for (const name of [...SUPPORT, ...READERS]) vm.runInContext(extractFunctionBlock(text, name), context);
  const script = `(() => {
    clientProjectData = normalizeData(wire);
    const entries = clientProjectData.clients;
    const real = getRealClients();
    const owner = real.find((client) => client.id === "c-root-b");
    const grouping = entries.find((entry) => entry.isWorkspaceScope);
    const ids = (list) => list.map((item) => item.id);
    return JSON.stringify({
      labels: entries.map((entry) => getProjectClientLabel(entry)),
      found: ["p-a", "p-grand", "w-a", "p-missing", ""].map((id) => findProjectById(id)?.id ?? null),
      clientDepths: real.map((client) => [client.id, getClientDepth(client)]),
      projectDepths: [owner, grouping].flatMap((entry) => entry.projects.map((project) => [project.id, getProjectDepth(project, entry)])),
      indents: [0, 1, 2, 3].map(treeIndent),
      clientTree: ids(sortClientTree(real)),
      projectTrees: entries.map((entry) => ids(sortProjectsForClient(entry))),
      clientKeys: real.map((client) => getClientTreeSortKey(client)),
      clientDescendants: ["c-root-a", "c-child", "c-cyc-1", "c-orphan", "", "c-missing"].map((id) => [id, getClientDescendantIds(id)]),
      projectDescendants: ["p-a", "p-cyc-1", "p-zeta", "", "p-missing"].map((id) => [id, getProjectDescendantIds(id, owner)]),
      comparisons: [["Same", "same"], ["Same", "Sàme"], ["alpha", "Zeta"], [undefined, "a"]]
        .map(([left, right]) => Math.sign(compareProjectsByName({ name: left }, { name: right }))),
    });
  })()`;
  return JSON.parse(vm.runInContext(script, context));
}

/** A function block without its JSDoc, so only an annotation can differ. @param {string} block */
const withoutJsDoc = (block) => block.replace(/[ \t]*\/\*\*[\s\S]*?\*\/\n/g, "").replace(/\/\*\*[\s\S]*?\*\/ ?/g, "");

describe("The hierarchy readers changed only their annotations", () => {
  it("keeps every body the c89cdcab body once JSDoc is removed", () => {
    for (const name of READERS) {
      let expected = withoutJsDoc(extractFunctionBlock(baseline, name));
      if (name === "getClientTreeSortKey") {
        // The one approved body edit, from `0.33.33.43.48`.
        expected = expected.replace(
          "      currentClient = getRealClients().find((item) => item.id === currentClient.parent_client_id);",
          "      const lookupClient = currentClient;\n      currentClient = getRealClients().find((item) => item.id === lookupClient.parent_client_id);",
        );
      }
      expect(withoutJsDoc(extractFunctionBlock(current, name)), name).toBe(expected);
    }
  });

  it("answers every reader exactly as c89cdcab on a normalised hierarchy", () => {
    const [now, before] = VERSIONS.map(([, text]) => answersFrom(text));
    expect(now).toEqual(before);
  });

  it("covers the cases the readers branch on - depth, cycles, orphans, ties and self-exclusion", () => {
    const answers = answersFrom(current);
    const depth = Object.fromEntries(answers.clientDepths);
    expect([depth["c-root-a"], depth["c-child"], depth["c-grand"]]).toEqual([0, 1, 2]);
    expect(depth["c-orphan"], "a missing parent ends the walk").toBe(0);
    expect(depth["c-cyc-1"], "a cycle stops at the first revisit").toBe(2);

    const projectDepth = Object.fromEntries(answers.projectDepths);
    expect([projectDepth["p-a"], projectDepth["p-child"], projectDepth["p-grand"], projectDepth["p-orphan"]]).toEqual([0, 1, 2, 0]);

    const descendants = Object.fromEntries(answers.clientDescendants);
    expect(descendants["c-root-a"].sort()).toEqual(["c-child", "c-grand"]);
    expect(descendants["c-root-a"]).not.toContain("c-root-a");
    expect(descendants[""], "an empty id has no descendants").toEqual([]);
    expect(Object.fromEntries(answers.projectDescendants)["p-cyc-1"].sort(), "in a cycle the start is reached again")
      .toEqual(["p-cyc-1", "p-cyc-2"]);

    expect(answers.projectTrees[1].indexOf("p-orphan"), "an orphan sorts among the roots")
      .toBeLessThan(answers.projectTrees[1].indexOf("p-zeta"));
    expect(answers.projectTrees[1].slice(-2), "a cycle-only branch is appended in original order").toEqual(["p-cyc-1", "p-cyc-2"]);
    expect(answers.comparisons.slice(0, 2), "base sensitivity ties case and accents").toEqual([0, 0]);
    expect(answers.labels[0]).toBe("Workspace Work");
  });
});
