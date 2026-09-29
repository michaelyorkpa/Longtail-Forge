import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * The Clients/Projects record writers (`0.33.33.43.50`).
 *
 * Seven writers gained annotations from their callers and nothing else. They are the page's write
 * paths, so what these cases pin is the request each one sends and everything it does around it:
 * every writer runs through the real `persistClientProjectChange` beside its `f966eb38` version,
 * against a capturing API that records each request's method, URL and body in key order, and the
 * merged-back draft, the action, the view state, the open-row globals, the refresh, flash and
 * status calls and the host completion are compared too. Responses are built from the page's own
 * lifted member lists, so the real response readers accept them.
 */

const reader = createProjectTextReader();
const current = reader.readText("public/js/clients-projects.js");
const baseline = execFileSync("git", ["show", "f966eb38:public/js/clients-projects.js"], {
  cwd: process.cwd(),
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

/** @type {ReadonlyArray<readonly [string, string]>} */
const VERSIONS = [["current", current], ["f966eb38", baseline]];

const WRITERS = [
  "createClientRecord", "saveClientRecord", "createProjectRecord", "saveProjectRecord",
  "archiveProjectRecord", "withOptionalTagPayload", "withoutTagPayload",
];
const CLOSURE = [
  ...WRITERS, "persistClientProjectChange", "requireSavedRecord", "readClientRecord", "readProjectRecord",
  "signalClientProjectModuleAction", "isResponseRecord", "isClientRecord", "isProjectRecord",
  "completeClientProjectAction", "isClientBillingContact", "hasRecordBillingShape",
];
const CONSTANTS = [
  "CLIENT_TEXT", "CLIENT_STATUSES", "PROJECT_TEXT", "PROJECT_STATUSES", "CLIENT_CONTACT_TEXT",
  "RECORD_TAG_MEMBERS", "RECORD_BILLABLE",
];

/** @param {string} text @param {string} name */
function frozenList(text, name) {
  const opener = `  const ${name} = Object.freeze([`;
  const at = text.indexOf(opener);
  expect(at, name).toBeGreaterThan(-1);
  return text.slice(at, text.indexOf("]);", at) + 3);
}

/**
 * One version's writers in a sandbox with a capturing API, and a runner for one scenario.
 * @param {string} text
 * @param {{ reject?: boolean }} [options]
 */
function writersFrom(text, options = {}) {
  /** @type {unknown[]} */
  const log = [];
  const context = vm.createContext({
    log,
    rejectWrites: Boolean(options.reject),
    openClientId: "",
    openBillingClientId: "",
    openClientBillingSettingsId: "",
    console: { error: () => undefined },
  });
  for (const name of CONSTANTS) vm.runInContext(frozenList(text, name), context);
  vm.runInContext(`
    function setStatus(message) { log.push(["status", message]); }
    async function refreshClientProjectData() { log.push(["refresh"]); }
    async function refreshActiveClientProjectsReadSurface() { log.push(["surface"]); }
    function flashSavedButton(selector) { log.push(["flash", selector === undefined ? "(none)" : selector]); }
    function requireErrors() {
      return { caughtMessage: (error, fallback) => (error && error.message) || fallback };
    }
    function savedClient(id, name) {
      const client = Object.fromEntries(CLIENT_TEXT.map((member) => [member, ""]));
      Object.assign(client, { id, name, status: "Active", childScopeIds: [], projects: [],
        billing_contact: Object.fromEntries(CLIENT_CONTACT_TEXT.map((member) => [member, ""])),
        billable: "yes", billing_rate: "100", billing_period: null, billing_rounding: null });
      return client;
    }
    function savedProject(id, name, clientId) {
      const project = Object.fromEntries(PROJECT_TEXT.map((member) => [member, ""]));
      Object.assign(project, { id, name, client_id: clientId, status: "Active", taskDefaults: {},
        billable: "no", billing_rate: null, billing_period: null, billing_rounding: null });
      return project;
    }
    function record(method, url, body) {
      log.push(["request", method, url, body === undefined ? "(no body)" : JSON.stringify(body)]);
      if (rejectWrites) return Promise.reject(new Error("Write refused."));
      if (method === "POST" && url === "/api/clients") return Promise.resolve({ client: savedClient("c-new", body.name) });
      if (method === "POST") return Promise.resolve({ project: savedProject("p-new", body.name, "c-new") });
      return Promise.resolve({ ok: true });
    }
    function requireApi() {
      return {
        postJson: (url, body) => record("POST", url, body),
        putJson: (url, body) => record("PUT", url, body),
        deleteJson: (url) => record("DELETE", url),
      };
    }
  `, context);
  for (const name of CLOSURE) vm.runInContext(extractFunctionBlock(text, name), context);

  /** @param {string} script */
  return async (script) => {
    log.length = 0;
    const outcome = await vm.runInContext(`(async () => {
      const hostContext = { complete: (detail) => log.push(["complete", JSON.stringify(detail)]) };
      ${script}
    })()`, context);
    return JSON.parse(JSON.stringify({
      outcome,
      log,
      open: [context.openClientId, context.openBillingClientId, context.openClientBillingSettingsId],
    }));
  };
}

/** @type {Record<string, string>} */
const SCENARIOS = {
  "create client with tags": `
    const client = { name: "New client", parent_client_id: "", billable: "yes", billing_rate: "100", billing_period: null,
      billing_rounding: null, billing_contact: {}, tagIds: ["t1"], projects: [] };
    const action = { action: "client_created", client_id: "", client_name: "New client", parent_client_id: "", project_id: "", project_name: "", details: "initial_project_created=false" };
    const viewState = { hostContext };
    const saved = await createClientRecord(client, action, viewState);
    return { saved, client, action, openClientId: viewState.openClientId };`,
  "create client without tags": `
    const client = { name: "Child", parent_client_id: "c-parent", billable: "yes", billing_rate: "", billing_period: null,
      billing_rounding: null, billing_contact: {}, projects: [] };
    const action = { action: "client_created", client_id: "", client_name: "Child", details: "initial_project_created=false" };
    return { saved: await createClientRecord(client, action, {}), client, action };`,
  "create client with an initial project": `
    const client = { name: "Seeded", parent_client_id: "", projects: [{ name: "First", status: "Active" }] };
    const action = { action: "client_created", details: "initial_project_created=true" };
    return { saved: await createClientRecord(client, action, { hostContext }), client, action };`,
  "save client that owns tags": `
    const client = { id: "c-1", name: "Acme", status: "Active", tagIds: ["t1", "t2"] };
    return { saved: await saveClientRecord(client, { action: "client_settings_updated", client_id: "c-1" }, { flashSelector: "[data-save]", openClientBillingSettingsId: "c-1", hostContext }) };`,
  "save client through withoutTagPayload": `
    const client = { id: "c-1", name: "Acme", tagIds: ["t1"], tag_ids: ["t1"] };
    const stripped = withoutTagPayload(client);
    const saved = await saveClientRecord(stripped, { action: "client_billing_contact_updated", client_id: "c-1" }, { openBillingClientId: "c-1" });
    return { saved, stripped, client };`,
  "save client with no tag payload": `
    return { saved: await saveClientRecord({ id: "c-2", name: "Beta" }, { action: "client_settings_updated", client_id: "c-2" }) };`,
  "create workspace project": `
    const target = { isWorkspaceScope: true, id: "__workspace_projects__", projects: [] };
    const project = { client_id: "", parent_project_id: "", name: "Internal", billable: "no", tagIds: ["t3"] };
    const action = { action: "project_created", client_id: "", project_name: "Internal" };
    const saved = await createProjectRecord(target, project, action, { openClientId: "__workspace_projects__", hostContext });
    return { saved, project, action };`,
  "create client project": `
    const target = { id: "c-1", name: "Acme", projects: [] };
    const project = { client_id: "c-1", name: "Launch", status: "Active" };
    const action = { action: "project_created", client_id: "c-1" };
    return { saved: await createProjectRecord(target, project, action, { openClientId: "c-1", flashSelector: "[data-add-project-button]" }), project, action };`,
  "save project with tags and confirmation": `
    const project = { id: "p-1", client_id: "c-1", name: "Launch", tagIds: [] };
    return { saved: await saveProjectRecord(project, { action: "project_updated", client_id: "c-1", project_id: "p-1", confirm_downstream_update: true }, { hostContext }) };`,
  "save project without tags or confirmation": `
    return { saved: await saveProjectRecord({ id: "p-2", name: "Other" }, { action: "project_updated", project_id: "p-2" }) };`,
  "archive project": `
    return { saved: await archiveProjectRecord({ id: "p-1", name: "Launch" }, { action: "project_archived", client_id: "c-1", project_id: "p-1" }, { hostContext }) };`,
  "direct tag payload": `
    return {
      owned: withOptionalTagPayload({ id: "x", tagIds: ["a"] }, { action: { action: "a" } }),
      absent: withOptionalTagPayload({ id: "x" }, { action: { action: "a" } }),
      inherited: withOptionalTagPayload(Object.create({ tagIds: ["proto"] }), {}),
    };`,
};

/** A function block without its JSDoc, so only an annotation can differ. @param {string} block */
const withoutJsDoc = (block) => block.replace(/[ \t]*\/\*\*[\s\S]*?\*\/\n/g, "").replace(/\/\*\*[\s\S]*?\*\/ ?/g, "");

describe("The writers changed only their annotations", () => {
  it("keeps every writer's body the f966eb38 body once JSDoc is removed", () => {
    for (const name of WRITERS) {
      const expected = withoutJsDoc(extractFunctionBlock(baseline, name))
        // `0.33.33.43.58` made the sinks' existing conversions explicit, with the operator's approval at each route.
        .replace("        `/api/clients/${encodeURIComponent(client.id)}`,", "        `/api/clients/${encodeURIComponent(`${client.id}`)}`,")
        .replace("        : `/api/clients/${encodeURIComponent(client.id)}/projects`;", "        : `/api/clients/${encodeURIComponent(`${client.id}`)}/projects`;")
        .replace("        `/api/projects/${encodeURIComponent(project.id)}`,", "        `/api/projects/${encodeURIComponent(`${project.id}`)}`,");
      expect(withoutJsDoc(extractFunctionBlock(current, name)), name).toBe(expected);
    }
  });
});

describe("Every write sends and does exactly what it did", () => {
  it("sends the same requests and makes the same changes for create, save and archive", async () => {
    const runs = VERSIONS.map(([, text]) => writersFrom(text));
    for (const [name, script] of Object.entries(SCENARIOS)) {
      const [now, before] = await Promise.all(runs.map((run) => run(script)));
      expect(now, name).toEqual(before);
    }
  });

  it("reports a refused write the same way, without refreshing or completing", async () => {
    const runs = VERSIONS.map(([, text]) => writersFrom(text, { reject: true }));
    for (const name of ["create client with tags", "save client that owns tags", "archive project"]) {
      const [now, before] = await Promise.all(runs.map((run) => run(SCENARIOS[name])));
      expect(now, name).toEqual(before);
      expect(now.outcome.saved, name).toBe(false);
    }
  });

  it("covers what the tag payload keeps and strips", async () => {
    const run = writersFrom(current);
    const owned = await run(SCENARIOS["save client that owns tags"]);
    expect(owned.log.find((/** @type {unknown[]} */ entry) => entry[0] === "request")[3]).toMatch(/"tagIds":\["t1","t2"\].*"action":/);
    const stripped = await run(SCENARIOS["save client through withoutTagPayload"]);
    expect(stripped.log.find((/** @type {unknown[]} */ entry) => entry[0] === "request")[3]).not.toMatch(/tagIds|tag_ids/);
    expect(stripped.outcome.client, "the original client keeps its tags").toMatchObject({ tagIds: ["t1"], tag_ids: ["t1"] });
    const created = await run(SCENARIOS["create client with tags"]);
    expect(created.log.filter((/** @type {unknown[]} */ entry) => entry[0] === "complete")).toEqual([
      ["complete", JSON.stringify({ actionId: "clients.add", recordId: "c-new" })],
    ]);
    const direct = await run(SCENARIOS["direct tag payload"]);
    expect(Object.keys(direct.outcome.owned)).toEqual(["id", "tagIds", "action"]);
    expect(Object.keys(direct.outcome.absent)).toEqual(["id", "action"]);
  });
});
