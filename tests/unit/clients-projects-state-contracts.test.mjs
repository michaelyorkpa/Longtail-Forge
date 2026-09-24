import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock, scannableSource } from "../../scripts/test-support/source-scan.mjs";

/**
 * What the Clients/Projects page state holds, and what the workspace grouping is.
 *
 * `0.33.33.43.32` measured two obstacles to declaring this page's state and recorded both as
 * deferrals rather than guessing at them. `0.33.33.43.33` discharged them under an explicit
 * ruling, and these cases replace those pins with proof of the behaviour that was approved:
 *
 * 1. **"Workspace projects" is a synthetic grouping, not a client.** It gathers the projects that
 *    belong directly to the workspace so the projects surface can list them beside real clients.
 *    It is not editable as a client, creates no child clients and takes no part in the
 *    parent-client hierarchy - and the types now say so, rather than the two shapes being forced
 *    into one record because they share an array.
 * 2. **The snapshot's workspace project count was always zero.** It read a member the normaliser
 *    never wrote. That was a bug, and it is fixed here as a bug rather than annotated around.
 *
 * The first group is proved by running the shipped builders; the second by evaluating the shipped
 * counting expression, taken verbatim out of the source, against data those builders produced.
 */

const source = createProjectTextReader().readText("public/js/clients-projects.js");

const READERS = [
  "normalizeBillingRate",
  "normalizeOptionalBillingPeriod",
  "normalizeOptionalBillingRounding",
  "normalizeBillingContact",
  "normalizeReminderOffsetList",
  "normalizeTaskReminderPolicy",
  "normalizeTags",
  "normalizeBillableFlag",
  "buildWorkspaceProjectsGrouping",
  "normalizeClientRecord",
  "isRealClient",
];

/**
 * One `const <name> = [...]` list, lifted from the source rather than restated here.
 * @param {string} name
 */
function declaration(name) {
  const at = source.indexOf(`  const ${name} = `);
  return source.slice(at, source.indexOf("];", at) + 2);
}

/**
 * The two record builders and everything they reach for.
 *
 * Only the page's own surroundings are supplied: the workspace settings the builders read, the two
 * labels they call, and `normalizeProjects`, which is a pass-through here because these cases are
 * about which members each record carries rather than about project normalisation.
 */
function lift() {
  const sandbox = vm.createContext({
    workspaceSettings: { defaultBillingRate: "125", billingPeriod: null, billingRounding: null },
    usesProjectRoundingOnly: () => false,
    workspaceProjectsLabel: () => "Workspace projects",
    normalizeProjects: (/** @type {unknown[]} */ list) => list,
  });

  for (const name of ["clientStatuses", "billingContactFields"]) {
    vm.runInContext(declaration(name), sandbox);
  }
  for (const name of READERS) {
    vm.runInContext(extractFunctionBlock(source, name), sandbox);
  }

  return vm.runInContext(`({ ${READERS.join(", ")} })`, sandbox);
}

/** The four members that belong to a real client and to no grouping. */
const CLIENT_ONLY = ["parent_client_id", "canCreateChild", "canManage", "tags"];

describe("A real client and the workspace grouping are different records", () => {
  it("gives the grouping none of the four members that make a client a client", () => {
    const { buildWorkspaceProjectsGrouping } = lift();
    const grouping = buildWorkspaceProjectsGrouping([], {});

    for (const member of CLIENT_ONLY) {
      // `in`, not truthiness: the ruling was that these are **absent because the grouping has none
      // of them**, not present-and-false. A grouping carrying `canManage: false` would pass a
      // truthiness check and still be the wrong record.
      assert.equal(member in grouping, false, `the grouping still carries no ${member}`);
    }
  });

  it("gives a real client all four", () => {
    const { normalizeClientRecord } = lift();
    const client = normalizeClientRecord({ id: "c1", name: "Acme", projects: [] });

    for (const member of CLIENT_ONLY) {
      assert.equal(member in client, true, `a real client still carries ${member}`);
    }
  });

  it("marks only the grouping, and the predicate reads that mark", () => {
    const { buildWorkspaceProjectsGrouping, normalizeClientRecord, isRealClient } = lift();
    const grouping = buildWorkspaceProjectsGrouping([], {});
    const client = normalizeClientRecord({ id: "c1", name: "Acme", projects: [] });

    assert.equal(grouping.isWorkspaceScope, true);
    assert.equal("isWorkspaceScope" in client, false, "a real client is not marked at all");

    assert.equal(isRealClient(grouping), false);
    assert.equal(isRealClient(client), true);
  });
});

describe("The grouping does not become a client anywhere it is listed", () => {
  it("is filtered out of the clients every hierarchy and editor reader works from", () => {
    assert.match(source, /function getRealClients\(\) \{\r?\n\s+return clientProjectData\.clients\.filter\(isRealClient\);/,
      "the real-client reader still filters by the predicate rather than by a spelling of the id");
  });

  it("is refused a parent-client row, because that row is only offered to a real client", () => {
    assert.match(source, /isRealClient\(client\) && client\.canCreateChild === true/,
      "creating a child client still asks the predicate first");
  });

  it("is refused the manage path a project's own client is offered", () => {
    // `project.client_id` is `""` for a workspace project, so this already short-circuited before
    // reaching a grouping; the predicate makes that explicit rather than changing it.
    assert.match(source, /project\.client_id && isRealClient\(targetClient\) && targetClient\.canManage/,
      "the project's manage path still requires a real client");
  });
});

describe("Project permissions inside the grouping are preserved", () => {
  it("still grants create and manage from the workspace capabilities the wire sends", () => {
    const { buildWorkspaceProjectsGrouping } = lift();
    const grouping = buildWorkspaceProjectsGrouping([], {
      can_create_workspace_project: true,
      can_manage_workspace_projects: true,
    });

    assert.equal(grouping.canCreateProject, true, "projects can still be created inside the grouping");
    assert.equal(grouping.canManageProjects, true, "and still managed");
  });

  it("still withholds both when the wire does not grant them", () => {
    const { buildWorkspaceProjectsGrouping } = lift();

    for (const capabilities of [{}, { can_create_workspace_project: false, can_manage_workspace_projects: false }, null, undefined]) {
      const grouping = buildWorkspaceProjectsGrouping([], capabilities);

      assert.equal(grouping.canCreateProject, false, `no create permission for ${JSON.stringify(capabilities)}`);
      assert.equal(grouping.canManageProjects, false, `no manage permission for ${JSON.stringify(capabilities)}`);
    }
  });

  it("grants nothing on a truthy value that is not the boolean true", () => {
    const { buildWorkspaceProjectsGrouping } = lift();
    const grouping = buildWorkspaceProjectsGrouping([], { can_create_workspace_project: "yes" });

    assert.equal(grouping.canCreateProject, false, "=== true, as it always was");
  });
});

/**
 * The counting expression the snapshot ships, taken out of the source rather than restated.
 * @returns {string}
 */
function countExpression() {
  const label = "workspaceProjectCount: ";
  const at = source.indexOf(label);
  assert.notEqual(at, -1, "the snapshot still reports a workspace project count");

  return source.slice(at + label.length, source.indexOf("workspaceType:", at)).trim().replace(/,$/, "");
}

/** @param {string} expression @param {unknown} clientProjectData */
function evaluate(expression, clientProjectData) {
  return vm.runInNewContext(`(${expression})`, { clientProjectData });
}

describe("The workspace project count, corrected", () => {
  /** Two workspace projects, one client with a project of its own - built by the shipped builders. */
  function pageData() {
    const { buildWorkspaceProjectsGrouping, normalizeClientRecord } = lift();

    return {
      capabilities: {},
      clients: [
        buildWorkspaceProjectsGrouping([{ id: "w1" }, { id: "w2" }], {}),
        normalizeClientRecord({ id: "c1", name: "Acme", projects: [{ id: "p1" }] }),
      ],
    };
  }

  it("counts the workspace's own projects, and the count is not zero", () => {
    assert.equal(evaluate(countExpression(), pageData()), 2);
  });

  it("is the correction: the superseded read answered zero for the same data", () => {
    // This is what the snapshot used to ask for. `normalizeData` returns `{ capabilities, clients }`
    // and folds the wire's workspace projects into the grouping, so the member was never there and
    // `?.length || 0` answered 0 on every page, every time.
    assert.equal(evaluate("clientProjectData.workspaceProjects?.length || 0", pageData()), 0);

    // Scanned with comments and string bodies blanked, so the explanation of the old spelling
    // that sits beside the corrected read cannot satisfy this on its own.
    assert.doesNotMatch(scannableSource(source), /clientProjectData\.workspaceProjects/,
      "and no code reads that member any more");
  });

  it("excludes projects that belong to a client", () => {
    const data = pageData();
    const client = data.clients[1];

    assert.equal(client.projects.length, 1, "the client has a project of its own");
    assert.equal(evaluate(countExpression(), data), 2, "which the workspace count does not include");
  });

  it("answers zero when the page holds no grouping at all", () => {
    const { normalizeClientRecord } = lift();
    const data = { capabilities: {}, clients: [normalizeClientRecord({ id: "c1", name: "Acme", projects: [{ id: "p1" }] })] };

    // The projects page only unshifts a grouping when there are workspace projects or no clients,
    // so a clients-only page has none, and the optional call answers 0 rather than throwing.
    assert.equal(evaluate(countExpression(), data), 0);
  });

  it("counts from the grouping itself rather than from a second collection kept for counting", () => {
    assert.match(countExpression(), /clientProjectData\.clients[\s\r\n]+\.find\(\(client\) => client\.isWorkspaceScope\)\?\.projects\.length \|\| 0/,
      "the grouping is the collection");
  });
});

describe("What did land", () => {
  it("derives the page state from the normaliser that fills it", () => {
    assert.match(source, /@type \{ReturnType<typeof normalizeData>\}\r?\n\s+\*\/\r?\n\s+let clientProjectData = \{/,
      "derived rather than restated, so the slot and its normaliser cannot drift");
  });

  it("derives the tag options from the loader that fills them", () => {
    assert.match(source, /@type \{Awaited<ReturnType<typeof loadTagOptions>>\}\r?\n\s+\*\/\r?\n\s+let tagOptions = \[\];/,
      "derived rather than restated, so the slot and its loader cannot drift");
    assert.match(source, /tagOptions = loadedTags;/, "and the loader still fills it");
  });

  it("leaves the read surface with the cluster its consumers belong to", () => {
    // Discharged by the read-surface cluster's own checkpoint: declaring the slot closes three
    // evolving-`any` reads and opens five that assume more than `Element` carries.
    const at = source.indexOf("let activeClientProjectsReadSurface = null;");
    const block = source.slice(source.lastIndexOf("/**", at), at);

    assert.match(block, /opens five member\r?\n\s+\* reads that assume more than `Element` carries/);
    assert.doesNotMatch(block, /@type \{/, "the surface is annotated; that deferral is discharged and this pin should go");
  });
});
