import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * What a Clients/Projects bulk update touches, and what it writes to each record.
 *
 * `0.33.33.43.39` typed the bulk update and selection path. It is annotation only - no executable
 * line changed - so the compiler proves the types. What these cases hold is the behaviour the new
 * types describe, on the path where a wrong assumption costs the most: **a bulk write reaches every
 * selected record at once.** So the cases aim at two questions. Which records does a bulk change
 * reach? And what does each one receive?
 *
 * The sharpest case is moving projects between clients. `""` is a real destination there - the
 * workspace - so it cannot also mean "leave the client alone". `shouldChangeClient` is what tells
 * the two apart, and the cases below pin that distinction from both sides.
 */

const source = createProjectTextReader().readText("public/js/clients-projects.js");

/** @param {unknown} value */
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

describe("Which records a selection names", () => {
  function unique() {
    const sandbox = vm.createContext({});
    vm.runInContext(extractFunctionBlock(source, "uniqueSelectionIds"), sandbox);
    return vm.runInContext("uniqueSelectionIds", sandbox);
  }

  it("names each record once, in the order it was first selected", () => {
    assert.deepEqual(plain(unique()(["p2", "p1", "p2", "p3", "p1"])), ["p2", "p1", "p3"]);
  });

  it("does not let surrounding space make one record two", () => {
    assert.deepEqual(plain(unique()(["p1", " p1", "p1 "])), ["p1"]);
  });

  it("drops a checkbox that carries no identifier rather than naming a blank record", () => {
    assert.deepEqual(plain(unique()(["p1", "", "   ", undefined, null])), ["p1"]);
  });

  it("names nothing when nothing is selected", () => {
    assert.deepEqual(plain(unique()([])), []);
  });
});

/**
 * The project bulk writer, lifted with a recording API and a fixed set of projects.
 * @param {{ clientsEnabled?: boolean, failIds?: string[] }} [options]
 */
function liftProjectBulk(options = {}) {
  /** @type {Record<string, Record<string, unknown>>} */
  const projects = {
    p1: { id: "p1", name: "Alpha", client_id: "c1", status: "Active", billable: "yes" },
    p2: { id: "p2", name: "Beta", client_id: "c1", status: "Active", billable: "yes" },
    p3: { id: "p3", name: "Gamma", client_id: "", status: "Inactive", billable: "no" },
  };
  /** @type {{ url: string, body: Record<string, unknown> }[]} */
  const writes = [];
  /** @type {unknown[]} */
  const statuses = [];
  let refreshed = 0;

  const sandbox = vm.createContext({
    clientsEnabledForWorkspace: () => options.clientsEnabled !== false,
    setStatus: (/** @type {unknown} */ message) => statuses.push(message),
    findProjectById: (/** @type {string} */ id) => projects[id] || null,
    getProjectClientName: (/** @type {string} */ id) => (id ? `Client ${id}` : ""),
    refreshClientProjectsAfterBulkUpdate: async () => { refreshed += 1; },
    console: { error: () => {} },
    requireApi: () => ({
      /** @param {string} url @param {Record<string, unknown>} body */
      putJson: async (url, body) => {
        const id = decodeURIComponent(url.split("/").pop() || "");
        if ((options.failIds || []).includes(id)) throw new Error(`refused ${id}`);
        writes.push({ url, body: plain(body) });
        return body;
      },
    }),
  });
  for (const name of ["formatBulkResultMessage", "applyBulkProjectUpdate"]) {
    vm.runInContext(extractFunctionBlock(source, name), sandbox);
  }

  return {
    apply: vm.runInContext("applyBulkProjectUpdate", sandbox),
    writes,
    statuses,
    get refreshed() { return refreshed; },
  };
}

/** A project change that leaves everything alone, to be overridden one member at a time. */
const NO_CHANGE = { status: "", clientId: "", shouldChangeClient: false, billable: "" };

describe("Which projects a bulk change reaches", () => {
  it("writes each selected project exactly once, to its own address", async () => {
    const bulk = liftProjectBulk();
    await bulk.apply({ ...NO_CHANGE, selectedProjectIds: ["p1", "p3"], status: "Inactive" });

    assert.deepEqual(bulk.writes.map((write) => write.url), ["/api/projects/p1", "/api/projects/p3"]);
  });

  it("does not touch a project that was not selected", async () => {
    const bulk = liftProjectBulk();
    await bulk.apply({ ...NO_CHANGE, selectedProjectIds: ["p1"], status: "Inactive" });

    assert.ok(!bulk.writes.some((write) => write.url.endsWith("/p2")), "p2 was not selected");
  });

  it("counts a selected project it cannot find as a failure rather than skipping it silently", async () => {
    const bulk = liftProjectBulk();
    await bulk.apply({ ...NO_CHANGE, selectedProjectIds: ["p1", "gone"], status: "Inactive" });

    assert.equal(bulk.writes.length, 1);
    assert.equal(bulk.statuses.at(-1), "Updated 1 selected projects; 1 could not be updated.");
  });

  it("writes nothing when nothing is selected", async () => {
    const bulk = liftProjectBulk();
    await bulk.apply({ ...NO_CHANGE, selectedProjectIds: [], status: "Inactive" });

    assert.equal(bulk.writes.length, 0);
    assert.equal(bulk.statuses.at(-1), "Select at least one project.");
  });

  it("writes nothing when no change was chosen", async () => {
    const bulk = liftProjectBulk();
    await bulk.apply({ ...NO_CHANGE, selectedProjectIds: ["p1", "p2"] });

    assert.equal(bulk.writes.length, 0);
    assert.equal(bulk.statuses.at(-1), "Choose a bulk change before applying.");
  });
});

describe("What each project receives", () => {
  it("treats an empty status or billable as unchanged, not as a value to write", async () => {
    const bulk = liftProjectBulk();
    await bulk.apply({ ...NO_CHANGE, selectedProjectIds: ["p1"], status: "Inactive" });
    const body = bulk.writes[0].body;

    assert.equal(body.status, "Inactive");
    assert.equal(body.billable, "yes", "billable was empty, so the project keeps its own");
    assert.equal(body.client_id, "c1", "and no client change was asked for");
  });

  it("leaves the client alone when no client change was asked for, even with an empty client id", async () => {
    // `clientId: ""` is also how the workspace is named. Without the flag, it means nothing.
    const bulk = liftProjectBulk();
    await bulk.apply({ ...NO_CHANGE, selectedProjectIds: ["p1"], status: "Inactive", clientId: "" });
    const body = bulk.writes[0].body;

    assert.equal(body.client_id, "c1");
    assert.equal(body.confirm_downstream_update, false);
  });

  it("moves projects to the workspace when a client change names it", async () => {
    for (const clientId of ["", "__workspace__"]) {
      const bulk = liftProjectBulk();
      await bulk.apply({ ...NO_CHANGE, selectedProjectIds: ["p1", "p2"], clientId, shouldChangeClient: true });

      assert.deepEqual(bulk.writes.map((write) => write.body.client_id), ["", ""], `${JSON.stringify(clientId)} is the workspace`);
      assert.ok(bulk.writes.every((write) => write.body.confirm_downstream_update === true));
    }
  });

  it("moves projects to another client, and confirms the downstream update", async () => {
    const bulk = liftProjectBulk();
    await bulk.apply({ ...NO_CHANGE, selectedProjectIds: ["p3"], clientId: "c2", shouldChangeClient: true });
    const body = bulk.writes[0].body;

    assert.equal(body.client_id, "c2");
    assert.equal(body.confirm_downstream_update, true);
    assert.equal(/** @type {Record<string, unknown>} */ (body.action).client_name, "Client c2");
  });

  it("never changes a client in a workspace that has none, whatever it is asked", async () => {
    const bulk = liftProjectBulk({ clientsEnabled: false });
    await bulk.apply({ ...NO_CHANGE, selectedProjectIds: ["p1"], status: "Inactive", clientId: "c2", shouldChangeClient: true, billable: "yes" });
    const body = bulk.writes[0].body;

    assert.equal(body.client_id, "c1", "the client is untouched");
    assert.equal(body.confirm_downstream_update, false);
    // Measured, not assumed - a first draft expected the project to keep "yes". Without clients the
    // chosen billable is replaced by "no" before it is applied, and "no" is truthy, so `|| billable`
    // never falls back to the project's own value: every selected project is written as unbillable.
    assert.equal(body.billable, "no", "billable is forced to no whatever was chosen");
  });

  it("still writes in a workspace without clients when no change was chosen", async () => {
    // The "choose a change first" guard only applies when clients are enabled, so here an empty
    // change still reaches every selected project - carrying the forced "no" above.
    const bulk = liftProjectBulk({ clientsEnabled: false });
    await bulk.apply({ ...NO_CHANGE, selectedProjectIds: ["p1", "p2"] });

    assert.equal(bulk.writes.length, 2);
    assert.ok(bulk.writes.every((write) => write.body.billable === "no"));
  });
});

describe("What a partly failed bulk change reports", () => {
  it("reports the split, and refreshes only because something was written", async () => {
    const bulk = liftProjectBulk({ failIds: ["p2"] });
    await bulk.apply({ ...NO_CHANGE, selectedProjectIds: ["p1", "p2"], status: "Inactive" });

    assert.equal(bulk.statuses.at(-1), "Updated 1 selected projects; 1 could not be updated.");
    assert.equal(bulk.refreshed, 1);
  });

  it("does not refresh when nothing was written", async () => {
    const bulk = liftProjectBulk({ failIds: ["p1"] });
    await bulk.apply({ ...NO_CHANGE, selectedProjectIds: ["p1"], status: "Inactive" });

    assert.equal(bulk.refreshed, 0);
    assert.equal(bulk.statuses.at(-1), "Selected projects were not updated.");
  });
});

describe("The result message", () => {
  function format() {
    const sandbox = vm.createContext({});
    vm.runInContext(extractFunctionBlock(source, "formatBulkResultMessage"), sandbox);
    return vm.runInContext("formatBulkResultMessage", sandbox);
  }

  it("distinguishes all updated, some failed and none updated, for either record type", () => {
    const message = format();

    assert.equal(message("client", 3, 0), "Updated selected clients.");
    assert.equal(message("project", 2, 1), "Updated 2 selected projects; 1 could not be updated.");
    assert.equal(message("project", 0, 4), "Selected projects were not updated.");
    assert.equal(message("client", 0, 0), "Selected clients were not updated.");
  });
});
