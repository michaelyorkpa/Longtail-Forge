// Runtime proof for the role and role-assignment response contracts.
//
// `0.33.33.38.4.4.3` grouped roles, assignments and sessions as one cluster. The producer trace
// found four routes and, inside the assignment half, **two different assignment records**:
// `decorateAssignment` builds seven members for the administrator view and
// `decorateDelegatedAssignment` builds three for the delegated paths, withholding the assignment
// identity and the permission overrides. Reusing one record for both would have claimed four
// members the server deliberately does not send.
//
// Producer authority is read from `src/services/permissions.service.js` and
// `src/repositories/permissions.repo.js`; contract authority from the browser declaration. Breaking
// either leaves the other standing, as `0.33.33.38.4.11` established.

import { describe, it } from "vitest";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const { readText } = createProjectTextReader();

const serviceSource = readText("src/services/permissions.service.js");
const repositorySource = readText("src/repositories/permissions.repo.js");
const declarationSource = readText("src/types/browser-contracts.d.ts");
const assignmentsPage = readText("public/js/role-assignments.js");
const adminPage = readText("public/js/user-admin.js");

const roles = sandbox(assignmentsPage,
  ["isResponseRecord", "isRoleScope", "isRoleOption", "readRoleOptions", "isDelegatedAssignment", "readAssignmentUpdate"],
  ["ROLE_TEXT_MEMBERS"]);
const admin = sandbox(adminPage, ["isResponseRecord", "isRoleAssignment", "readRoleAssignments"], []);

describe("the assignable role record", () => {
  it("describes the columns the role query selects, and no others", () => {
    const selected = selectedRoleColumns();
    assert.deepEqual(selected.slice().sort(), ["assignable_scope_type", "description", "role_id", "role_name"],
      "the role query selects four columns plus the sort key");
    const declared = declaredMembers("BrowserRoleOption");
    for (const column of selected) {
      assert.ok(declared.includes(column), `${column} is selected and sent`);
    }
    assert.ok(!declared.includes("sort_order"), "sort_order orders the query and is not sent");
    assert.deepEqual(declared.slice().sort(),
      [...selected, "assignment_scope_type", "scopes"].sort(),
      "the contract is the selected columns plus the two members the service computes");
  });

  it("never acquires permission storage the query does not select", () => {
    const block = declarationBlock("BrowserRoleOption");
    for (const forbidden of ["permissions", "permission_overrides", "capabilities", "permissions_json"]) {
      assert.doesNotMatch(block, new RegExp(`\\n  ${forbidden}\\??:`),
        `${forbidden} is not part of the role query and must never be a member of the role contract`);
    }
  });

  it("accepts a role the service could build and rejects one it could not", () => {
    assert.equal(roles.isRoleOption(roleFixture()), true);
    assert.equal(roles.isRoleOption({ ...roleFixture(), scopes: [] }), true, "a role may legitimately carry no scope here");
    for (const member of plain(roles.ROLE_TEXT_MEMBERS)) {
      assert.equal(roles.isRoleOption(omit(roleFixture(), member)), false, `${member} must be present`);
      assert.equal(roles.isRoleOption({ ...roleFixture(), [member]: null }), false, `${member} is NOT NULL`);
      assert.equal(roles.isRoleOption({ ...roleFixture(), [member]: 4 }), false);
    }
    assert.equal(roles.isRoleOption({ ...roleFixture(), role_id: "" }), false);
    assert.equal(roles.isRoleOption({ ...roleFixture(), scopes: "all" }), false, "scopes is an array the service built");
    assert.equal(roles.isRoleOption({ ...roleFixture(), scopes: [{ scopeId: "s" }] }), false,
      "a scope without a label is not one canAssignRole kept");
    for (const malformed of [null, undefined, 0, "role", true, [], [roleFixture()]]) {
      assert.equal(roles.isRoleOption(malformed), false);
    }
  });

  it("checks elements rather than the container", () => {
    const valid = roleFixture();
    assert.deepEqual(plain(roles.readRoleOptions({ roles: [valid, { role_id: "r-2" }, null, "role"] })), [valid],
      "an array of roles does not make its entries roles");
    for (const empty of [null, undefined, "body", {}, { roles: null }, { roles: "all" }]) {
      assert.deepEqual(plain(roles.readRoleOptions(empty)), [],
        "both consumers already answered an absent list with none, and still do");
    }
  });
});

describe("the two assignment records", () => {
  it("keeps the administrator record and the delegated record apart", () => {
    const full = shapedMembers("decorateAssignment");
    const delegated = shapedMembers("decorateDelegatedAssignment");
    assert.deepEqual(full.slice().sort(),
      ["assignment_id", "client_id", "permission_overrides", "project_id", "role_id", "scope_id", "scope_type"],
      "the administrator shaper builds seven members");
    assert.deepEqual(delegated.slice().sort(), ["role_id", "scope_id", "scope_type"],
      "the delegated shaper builds three");
    for (const withheld of ["assignment_id", "permission_overrides", "client_id", "project_id"]) {
      assert.ok(full.includes(withheld), `${withheld} is in the administrator record`);
      assert.ok(!delegated.includes(withheld), `${withheld} is withheld from the delegated record`);
      assert.doesNotMatch(declarationBlock("BrowserDelegatedRoleAssignment"), new RegExp(`\\n  ${withheld}\\??:`),
        `${withheld} must never appear in the delegated contract`);
    }
    assert.deepEqual(declaredMembers("BrowserRoleAssignment").slice().sort(), full.slice().sort());
    assert.deepEqual(declaredMembers("BrowserDelegatedRoleAssignment").slice().sort(), delegated.slice().sort());
  });

  it("will not let one record stand in for the other", () => {
    assert.equal(admin.isRoleAssignment(delegatedFixture()), false,
      "a delegated assignment is missing the identity the administrator record requires");
    assert.equal(roles.isDelegatedAssignment(assignmentFixture()), true,
      "an administrator record does carry the delegated members, which is why only the narrow direction fails");
  });

  it("rejects an assignment it cannot vouch for", () => {
    assert.equal(admin.isRoleAssignment(assignmentFixture()), true);
    assert.equal(admin.isRoleAssignment({ ...assignmentFixture(), scope_id: null, client_id: null, project_id: null }), true,
      "the three nullable columns are passed through as null");
    for (const member of ["assignment_id", "role_id", "scope_type"]) {
      assert.equal(admin.isRoleAssignment({ ...assignmentFixture(), [member]: null }), false, `${member} is NOT NULL`);
      assert.equal(admin.isRoleAssignment(omit(assignmentFixture(), member)), false);
    }
    assert.equal(admin.isRoleAssignment(omit(assignmentFixture(), "permission_overrides")), false,
      "the administrator shaper always parses the overrides member, even when it parses to nothing");
    assert.equal(admin.isRoleAssignment({ ...assignmentFixture(), client_id: 7 }), false);
    assert.deepEqual(plain(admin.readRoleAssignments({ assignments: [assignmentFixture(), { role_id: "r" }] })),
      [assignmentFixture()], "a malformed entry is dropped rather than trusted");
    for (const empty of [null, undefined, "body", {}, { assignments: 4 }]) {
      assert.deepEqual(plain(admin.readRoleAssignments(empty)), []);
    }
  });

  it("treats the revision as the producer's union rather than a defensive read", () => {
    const delegatedBody = { assignmentRevision: "rev-1", assignments: [delegatedFixture()] };
    assert.deepEqual(plain(roles.readAssignmentUpdate(delegatedBody)), delegatedBody);
    const administratorBody = { assignments: [delegatedFixture()] };
    const read = plain(roles.readAssignmentUpdate(administratorBody));
    assert.equal("assignmentRevision" in read, false,
      "a full administrator receives no revision, and the contract says so rather than inventing one");
    assert.deepEqual(read.assignments, [delegatedFixture()]);
    for (const malformed of [7, null, {}, ["rev"]]) {
      assert.equal("assignmentRevision" in plain(roles.readAssignmentUpdate({ assignmentRevision: malformed, assignments: [] })), false,
        "a revision that is not text is absent, which is the empty string the consumer already produced");
    }
    assert.deepEqual(plain(roles.readAssignmentUpdate({ assignments: [delegatedFixture(), { scope_type: "client" }] })).assignments,
      [delegatedFixture()]);
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

/** The columns the role query selects, read from the repository. @returns {string[]} */
function selectedRoleColumns() {
  const block = extractFunctionBlock(repositorySource, "readRoles");
  const match = block.match(/SELECT ([^\n]+)\nFROM roles/);
  assert.ok(match, "readRoles must remain a readable single-line select");
  return match[1].split(",").map((column) => column.trim()).filter(Boolean);
}

/** The members one shaper constructs, read from the service. @param {string} fn @returns {string[]} */
function shapedMembers(fn) {
  const block = extractFunctionBlock(serviceSource, fn);
  const literal = block.slice(block.indexOf("return {"), block.indexOf("};"));
  return [...new Set([...literal.matchAll(/^\s{4,}([a-zA-Z_]\w*):/gm)].map((entry) => entry[1]))];
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
function roleFixture() {
  /** @type {Record<string, unknown>} */
  const role = { scopes: [{ label: "Workspace", scopeId: "w-1" }] };
  for (const member of plain(roles.ROLE_TEXT_MEMBERS)) role[member] = `${member}-value`;
  return role;
}

/** @returns {Record<string, unknown>} */
function assignmentFixture() {
  return {
    assignment_id: "a-1",
    client_id: "c-1",
    permission_overrides: {},
    project_id: "p-1",
    role_id: "client_admin",
    scope_id: "c-1",
    scope_type: "client",
  };
}

/** @returns {Record<string, unknown>} */
function delegatedFixture() {
  return { role_id: "client_admin", scope_id: "c-1", scope_type: "client" };
}

/** @param {Record<string, unknown>} record @param {string} member */
function omit(record, member) {
  const { [member]: _removed, ...rest } = record;
  return rest;
}

/** @template T @param {T} value @returns {T} */
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}
