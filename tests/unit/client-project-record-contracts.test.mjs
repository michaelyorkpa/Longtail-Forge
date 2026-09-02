// Runtime proof for the client and project create-response records.
//
// **These come from the write-payload normaliser, not the read shaper**, and getting that wrong is
// what this checkpoint had to correct against the live flow. `clientsService.createClient` answers
// `normalizeClientPayload(payload)`, which runs `normalizeClientProjectData` over a spread of the
// caller's own body and hands the result straight back - so the record carries `childScopeIds` and
// `projects` and **no timestamps at all**, because nothing has been read back from the row.
// `clientRowToAppClient` is a different producer for a different route.
//
// Because the normaliser spreads the request payload, these are **structural minimums**: every
// member named is reconstructed by name, and a body may legitimately carry more.
//
// They are also not the normalised option records `clientProjectOptions` builds, and not the
// Task-catalog subsets `0.33.33.38.4.3.8` built. Three vocabularies, three producers.

import { describe, it } from "vitest";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const { readText } = createProjectTextReader();

const clientsServiceSource = readText("src/modules/client-projects/clients.service.js");
const normalizersSource = readText("src/utils/normalizers.js");
const optionsSource = readText("public/js/shared/client-project-options.js");
const declarationSource = readText("src/types/browser-contracts.d.ts");
const page = readText("public/js/clients-projects.js");

const parser = sandbox(page,
  ["isResponseRecord", "isClientBillingContact", "hasRecordBillingShape", "isClientRecord",
    "isProjectRecord", "readClientRecord", "readProjectRecord", "requireSavedRecord"],
  ["CLIENT_CONTACT_TEXT", "CLIENT_TEXT", "CLIENT_STATUSES", "PROJECT_TEXT", "PROJECT_STATUSES",
    "RECORD_TAG_MEMBERS", "RECORD_BILLABLE"]);

/** The client half of the aggregate normaliser, which is what the create route answers. */
const aggregate = extractFunctionBlock(normalizersSource, "normalizeClientProjectData");
const clientBuilt = literalMembers(aggregate.slice(aggregate.indexOf("return {")), 8);
const projectBuilt = literalMembers(aggregate.slice(aggregate.indexOf("projects.map((project)")), 16);

describe("the create records against their real producer", () => {
  it("answers the write-payload normaliser rather than the read shaper", () => {
    const create = extractFunctionBlock(clientsServiceSource, "createClient");
    assert.match(create, /const client = normalizeClientPayload\(payload,/,
      "the record the route answers is the normalised payload");
    assert.doesNotMatch(create, /clientRowToAppClient/,
      "nothing is read back from the row, which is why there are no timestamps");
    assert.match(extractFunctionBlock(clientsServiceSource, "normalizeClientPayload"),
      /\.\.\.fallback,\s+\.\.\.payload,/,
      "and it spreads the request, which is why this contract is a structural minimum");
  });

  it("describes exactly what the aggregate normaliser reconstructs for a client", () => {
    assert.deepEqual(clientBuilt.slice().sort(),
      ["billable", "billing_contact", "billing_period", "billing_rate", "billing_rounding",
        "childScopeIds", "id", "name", "parent_client_id", "projects", "status", "workspace_id"],
      "the client branch reconstructs twelve members by name");
    const declared = declaredMembers("BrowserClientRecord")
      .filter((member) => !plain(parser.RECORD_TAG_MEMBERS).includes(member));
    assert.deepEqual(declared.slice().sort(), clientBuilt.slice().sort(),
      "and the contract is those twelve plus the optional tag members");
    for (const readOnly of ["created_at", "updated_at"]) {
      assert.doesNotMatch(declarationBlock("BrowserClientRecord"), new RegExp(`\\n  ${readOnly}\\??:`),
        `${readOnly} belongs to the read shaper, and this route never reads the row back`);
    }
  });

  it("describes exactly what it reconstructs for a project", () => {
    const declared = declaredMembers("BrowserProjectRecord")
      .filter((member) => !plain(parser.RECORD_TAG_MEMBERS).includes(member));
    assert.deepEqual(declared.slice().sort(), projectBuilt.slice().sort(),
      "the project contract is exactly the project branch of the same normaliser");
    assert.ok(projectBuilt.includes("taskDefaults"), "a project carries task defaults");
    assert.ok(!projectBuilt.includes("billing_contact") && !projectBuilt.includes("childScopeIds"),
      "and neither the billing contact nor the child scopes the client carries");
    assert.ok(!projectBuilt.includes("client_name"),
      "nor a resolved client name, which only the read shaper supplies");
  });

  it("will not let one record stand in for the other", () => {
    assert.equal(parser.isClientRecord(projectRecord()), false, "a project has no billing contact");
    assert.equal(parser.isProjectRecord(clientRecord()), false, "and a client has no task defaults");
  });

  it("gives the runtime tables authority of their own", () => {
    assert.deepEqual(
      [...plain(parser.CLIENT_TEXT), "billable", "billing_contact", "billing_period", "billing_rate",
        "billing_rounding", "childScopeIds", "projects", "status"].sort(),
      declaredMembers("BrowserClientRecord")
        .filter((member) => !plain(parser.RECORD_TAG_MEMBERS).includes(member)).slice().sort(),
      "the browser checks every member the client contract declares");
    assert.deepEqual(
      [...plain(parser.PROJECT_TEXT), "billable", "billing_period", "billing_rate",
        "billing_rounding", "status", "taskDefaults"].sort(),
      declaredMembers("BrowserProjectRecord")
        .filter((member) => !plain(parser.RECORD_TAG_MEMBERS).includes(member)).slice().sort(),
      "and every member the project contract declares");
    assert.deepEqual(plain(parser.CLIENT_CONTACT_TEXT).slice().sort(),
      declaredMembers("BrowserClientBillingContact").slice().sort(),
      "and every billing-contact member");
  });

  it("does not forbid the extras the spread carries", () => {
    assert.equal(parser.isClientRecord({ ...clientRecord(), tagIds: ["t-1"], action: {} }), true,
      "the request payload is spread through, so a structural minimum is a floor and not a fence");
  });
});

describe("the three vocabularies", () => {
  it("keeps the wire record apart from the normalised option", () => {
    const normalizer = extractFunctionBlock(optionsSource, "normalizeClient");
    assert.match(normalizer, /\.\.\.client,/,
      "the option normaliser spreads, so it could never have been an exact wire contract");
    for (const camel of ["billingRate", "billingPeriod", "billingRounding"]) {
      assert.match(normalizer, new RegExp(`${camel}:`), `the option record builds ${camel}`);
      assert.doesNotMatch(declarationBlock("BrowserClientRecord"), new RegExp(`\\n  ${camel}\\??:`),
        `${camel} is the normalised vocabulary and must not appear on the wire record`);
    }
  });

  it("does not borrow the Task-catalog subset", () => {
    const block = declarationBlock("BrowserClientRecord");
    for (const taskOnly of ["optionLabel", "displayName", "hierarchyDepth"]) {
      assert.doesNotMatch(block, new RegExp(`\\n  ${taskOnly}\\??:`),
        `${taskOnly} belongs to BrowserTaskClientOption, which a different builder constructs`);
    }
    assert.match(declarationBlock("BrowserTaskClientOption"), /\n  hierarchyDepth: number;/,
      "that record still exists and still means something else");
  });
});

describe("the scalars", () => {
  it("closes both status vocabularies because their normalisers do", () => {
    assert.match(extractFunctionBlock(normalizersSource, "normalizeClientStatus"),
      /\["Active", "Inactive"\]\.includes\(status\) \? status : "Active"/,
      "a client is active or inactive and nothing else");
    assert.match(extractFunctionBlock(normalizersSource, "normalizeStatus"),
      /\["Active", "Inactive", "Completed"\]\.includes\(status\) \? status : "Active"/,
      "and a project can also be completed, which is why the two unions are separate");
    assert.match(declarationSource, /export type BrowserClientStatus = "Active" \| "Inactive";/);
    assert.match(declarationSource, /export type BrowserProjectStatus = "Active" \| "Completed" \| "Inactive";/);
    assert.equal(parser.isClientRecord({ ...clientRecord(), status: "Completed" }), false,
      "a client is never completed, even though a project may be");
    assert.equal(parser.isProjectRecord({ ...projectRecord(), status: "Completed" }), true,
      "which is why the two unions are separate");
    assert.equal(parser.isProjectRecord({ ...projectRecord(), status: "Archived" }), false);
  });

  it("closes the billable vocabulary because the normaliser does", () => {
    const block = extractFunctionBlock(normalizersSource, "normalizeBillableFlag");
    assert.match(block, /return fallback === "no" \? "no" : "yes";/,
      "even the fallback answers one of the two");
    assert.match(declarationSource, /export type BrowserClientBillable = "no" \| "yes";/);
    for (const value of plain(parser.RECORD_BILLABLE)) {
      assert.equal(parser.isClientRecord({ ...clientRecord(), billable: value }), true);
    }
    assert.equal(parser.isClientRecord({ ...clientRecord(), billable: true }), false,
      "the normaliser converts booleans, so the browser sees only the two words");
  });

  it("treats the billing rate as trimmed text or null", () => {
    assert.match(extractFunctionBlock(normalizersSource, "normalizeBillingRate"),
      /return text \|\| null;/, "an empty rate becomes null rather than the empty string");
    assert.equal(parser.isClientRecord({ ...clientRecord(), billing_rate: null }), true);
    assert.equal(parser.isClientRecord({ ...clientRecord(), billing_rate: "125.00" }), true);
    assert.equal(parser.isClientRecord({ ...clientRecord(), billing_rate: 125 }), false,
      "the normaliser stringifies, so a number is not what arrives");
  });

  it("requires the two nullable billing records without naming their shapes", () => {
    for (const member of ["billing_period", "billing_rounding"]) {
      assert.match(declarationBlock("BrowserClientRecord"), new RegExp(`\\n  ${member}: unknown;`),
        `${member} is another normaliser's record and its shape is not this boundary's to name`);
      assert.equal(parser.isClientRecord({ ...clientRecord(), [member]: null }), true,
        `${member} is null when nothing was given, which is a value rather than an absence`);
      assert.equal(parser.isClientRecord(omit(clientRecord(), member)), false,
        `${member} is always reconstructed`);
    }
  });
});

describe("the records", () => {
  it("rejects what the routes could not send", () => {
    assert.equal(parser.isClientRecord(clientRecord()), true);
    assert.equal(parser.isProjectRecord(projectRecord()), true);
    for (const member of plain(parser.CLIENT_TEXT)) {
      assert.equal(parser.isClientRecord(omit(clientRecord(), member)), false, `${member} is reconstructed`);
      assert.equal(parser.isClientRecord({ ...clientRecord(), [member]: null }), false, `${member} is text`);
    }
    for (const member of ["id", "name"]) {
      assert.equal(parser.isClientRecord({ ...clientRecord(), [member]: "" }), false,
        `the service throws 400 without ${member}, so an empty one never arrives`);
    }
    for (const member of ["childScopeIds", "projects"]) {
      assert.equal(parser.isClientRecord({ ...clientRecord(), [member]: {} }), false, `${member} is a list`);
    }
    for (const member of plain(parser.CLIENT_CONTACT_TEXT)) {
      assert.equal(parser.isClientBillingContact(omit(billingContact(), member)), false,
        `${member} has a total fallback and is always present`);
    }
    assert.equal(parser.isClientRecord({ ...clientRecord(), billing_contact: {} }), false,
      "a partial contact is not one");
  });

  it("treats the tag members as optional because the decorator skips them", () => {
    assert.match(extractFunctionBlock(clientsServiceSource, "createClient"),
      /tagsService\.decorateRecordsForTarget\(session, "client", \[client\]\)/,
      "the create route decorates before it answers");
    assert.equal(parser.isClientRecord(omitAll(clientRecord(), plain(parser.RECORD_TAG_MEMBERS))), true,
      "a workspace with tags disabled still receives a usable client");
    for (const member of plain(parser.RECORD_TAG_MEMBERS)) {
      assert.match(declarationBlock("BrowserClientRecord"), new RegExp(`\\n  ${member}\\?: unknown\\[\\];`),
        `${member} is optional, and the runtime condition is why`);
      assert.equal(parser.isClientRecord({ ...clientRecord(), [member]: "tag" }), false,
        `${member} is still checked when it is present`);
    }
  });
});

describe("the envelopes and the consumers", () => {
  it("reads the member each route actually sends", () => {
    assert.match(extractFunctionBlock(clientsServiceSource, "createClient"), /return \{ client:/);
    assert.match(extractFunctionBlock(clientsServiceSource, "createProject"), /return \{ project:/);
    assert.deepEqual(plain(parser.readClientRecord({ client: clientRecord() })), clientRecord());
    assert.deepEqual(plain(parser.readProjectRecord({ project: projectRecord() })), projectRecord());
    assert.equal(parser.readClientRecord({ project: projectRecord() }), null,
      "the member names are not interchangeable");
    for (const empty of [null, undefined, "body", 4, {}, { client: null }, { client: "c-1" }]) {
      assert.equal(parser.readClientRecord(empty), null);
      assert.equal(parser.readProjectRecord(empty), null);
    }
    assert.equal(parser.readClientRecord({ client: { id: "c-1", name: "Acme" } }), null,
      "a partial client is not a client, even inside a well-formed envelope");
  });

  it("preserves the failure the raw reads already produced", () => {
    assert.throws(() => parser.requireSavedRecord(null, "client"), /did not return a usable client record/,
      "the raw identifier read already threw for an absent client, and that path is kept");
    assert.deepEqual(plain(parser.requireSavedRecord(clientRecord(), "client")), clientRecord());
  });

  it("narrows every owned read through the parser", () => {
    for (const raw of [
      "Object.assign(client, result.client",
      "result.client.id",
      "result.client.name",
      "Object.assign(project, result.project)",
      "result.project.id",
      "Object.assign(initialProject, projectResult.project)",
    ]) {
      assert.ok(!page.includes(raw), `clients-projects.js must no longer read ${raw} off an unknown body`);
    }
    assert.match(page, /const savedClient = requireSavedRecord\(readClientRecord\(result\), "client"\);/,
      "the client create must narrow before it reads");
    assert.match(page, /const savedProject = requireSavedRecord\(readProjectRecord\(result\), "project"\);/,
      "and the project create must narrow before it reads");
    assert.match(declarationSource, /postJson\([^)]*\): Promise<unknown>;/,
      "BrowserApi keeps returning a promise of unknown");
  });
});

/** @param {string} source @param {readonly string[]} functions @param {readonly string[]} tables */
function sandbox(source, functions, tables) {
  const context = vm.createContext({});
  for (const table of tables) {
    const match = source.match(new RegExp(`const ${table} = Object\\.freeze\\(\\[[\\s\\S]*?\\]\\);`));
    assert.ok(match, `${table} must remain a frozen table this owner can read`);
    vm.runInContext(match[0], context, { filename: table });
  }
  for (const name of functions) {
    vm.runInContext(extractFunctionBlock(source, name), context, { filename: name });
  }
  return vm.runInContext(`({ ${[...functions, ...tables].join(", ")} })`, context);
}

/** @param {string} literal @param {number} indent @returns {string[]} */
function literalMembers(literal, indent) {
  return [...new Set([...literal.matchAll(new RegExp(`^\\s{${indent}}([a-zA-Z_]\\w*):`, "gm"))]
    .map((entry) => entry[1]))];
}

/** @param {string} name @returns {string} */
function declarationBlock(name) {
  const match = declarationSource.match(new RegExp(`export interface ${name}\\b[^{]*\\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `${name} must be declared`);
  return match[0];
}

/** @param {string} name @returns {string[]} */
function declaredMembers(name) {
  return [...declarationBlock(name).matchAll(/^  (\w+)\??:/gm)].map((entry) => entry[1]);
}

/** @returns {Record<string, unknown>} */
function billingContact() {
  /** @type {Record<string, unknown>} */
  const contact = {};
  for (const member of plain(parser.CLIENT_CONTACT_TEXT)) contact[member] = `${member}-value`;
  return contact;
}

/** @returns {Record<string, unknown>} */
function billingShape() {
  /** @type {Record<string, unknown>} */
  const shape = { billable: "yes", billing_period: null, billing_rate: null, billing_rounding: null };
  for (const member of plain(parser.RECORD_TAG_MEMBERS)) shape[member] = [];
  return shape;
}

/** @returns {Record<string, unknown>} */
function clientRecord() {
  /** @type {Record<string, unknown>} */
  const client = {
    ...billingShape(),
    billing_contact: billingContact(),
    childScopeIds: [],
    projects: [],
    status: "Active",
  };
  for (const member of plain(parser.CLIENT_TEXT)) client[member] = `${member}-value`;
  return client;
}

/** @returns {Record<string, unknown>} */
function projectRecord() {
  /** @type {Record<string, unknown>} */
  const project = { ...billingShape(), status: "Active", taskDefaults: {} };
  for (const member of plain(parser.PROJECT_TEXT)) project[member] = `${member}-value`;
  return project;
}

/** @param {Record<string, unknown>} record @param {string} member */
function omit(record, member) {
  const { [member]: _removed, ...rest } = record;
  return rest;
}

/** @param {Record<string, unknown>} record @param {readonly string[]} members */
function omitAll(record, members) {
  return members.reduce((carried, member) => omit(carried, member), record);
}

/** @template T @param {T} value @returns {T} */
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}
