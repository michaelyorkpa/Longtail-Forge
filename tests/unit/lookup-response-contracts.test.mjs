// Runtime proof for the two lookup response contracts.
//
// `POST /api/users/lookup` and `POST /api/role-assignments/lookup` both answer a body with a
// `match` member, and that is where the resemblance ends. The account lookup finds an account with
// `usersRepository.readByUsername` - a global search across the installation - and discloses three
// members. The assignment lookup uses `readExactActiveMemberByUsername`, which joins
// `user_workspaces` and can only identify an *active member of the caller's own workspace*, and
// discloses six. **Two routes, two disclosure rules, two records**, so there is no shared envelope
// and no generic lookup vocabulary here.
//
// Producer authority is read from the two services and the repository; contract authority from the
// browser declaration. Breaking either leaves the other standing.

import { describe, it } from "vitest";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const { readText } = createProjectTextReader();

const usersService = readText("src/services/users.service.js");
const permissionsService = readText("src/services/permissions.service.js");
const usersRepository = readText("src/repositories/users.repo.js");
const declarationSource = readText("src/types/browser-contracts.d.ts");
const adminPage = readText("public/js/user-admin.js");
const assignmentsPage = readText("public/js/role-assignments.js");

const admin = sandbox(adminPage, ["isResponseRecord", "isAccountLookupMatch", "readAccountLookup"]);
const assignments = sandbox(assignmentsPage,
  ["isResponseRecord", "isDelegatedAssignment", "isAssignmentLookupTarget", "readAssignmentLookup"]);

describe("the account lookup", () => {
  it("describes the three members the service builds, and no more", () => {
    const built = matchMembers(usersService, "lookupAddUserAccount");
    assert.deepEqual(built, ["alreadyActive", "displayName", "username"],
      "lookupAddUserAccount builds exactly three members");
    assert.deepEqual(declaredMembers("BrowserAccountLookupMatch").slice().sort(), built.slice().sort());
    assert.deepEqual(declaredMembers("BrowserAccountLookup").slice().sort(), ["match", "workspaceId"],
      "the envelope carries the resolved workspace beside the match");
  });

  it("never acquires the identifiers this route deliberately withholds", () => {
    const block = declarationBlock("BrowserAccountLookupMatch");
    for (const withheld of ["userId", "user_id", "altEmail", "userStatus", "password", "assignments"]) {
      assert.doesNotMatch(block, new RegExp(`\\n  ${withheld}\\??:`),
        `${withheld} is not built by lookupAddUserAccount and must never appear in its record`);
    }
  });

  it("accepts a match the service could send and rejects one it could not", () => {
    assert.equal(admin.isAccountLookupMatch(accountMatch()), true);
    assert.equal(admin.isAccountLookupMatch({ ...accountMatch(), alreadyActive: true }), true);
    assert.equal(admin.isAccountLookupMatch({ ...accountMatch(), alreadyActive: 0 }), false,
      "alreadyActive is a membership status comparison, which is a real boolean");
    assert.equal(admin.isAccountLookupMatch({ ...accountMatch(), alreadyActive: "true" }), false);
    for (const member of ["displayName", "username"]) {
      assert.equal(admin.isAccountLookupMatch(omit(accountMatch(), member)), false, `${member} is always built`);
      assert.equal(admin.isAccountLookupMatch({ ...accountMatch(), [member]: null }), false, `${member} is text`);
    }
    assert.equal(admin.isAccountLookupMatch({ ...accountMatch(), username: "" }), false);
    for (const malformed of [null, undefined, 0, "match", true, [accountMatch()]]) {
      assert.equal(admin.isAccountLookupMatch(malformed), false);
    }
  });

  it("reports no match as null on every path, and fails closed on a malformed one", () => {
    const body = { match: accountMatch(), workspaceId: "w-1" };
    assert.deepEqual(plain(admin.readAccountLookup(body)), body);
    for (const empty of [null, undefined, "body", 4, [], {}, { match: null, workspaceId: "w-1" }]) {
      assert.equal(admin.readAccountLookup(empty).match, null,
        "the service's own no-match branch sends a null match, so null is the answer rather than undefined");
    }
    for (const malformed of ["someone@example.com", 7, true, { username: "someone@example.com" }]) {
      assert.equal(admin.readAccountLookup({ match: malformed, workspaceId: "w-1" }).match, null,
        "a truthy malformed match used to render an account found with an undefined name; it now reads as no match");
    }
    assert.equal(admin.readAccountLookup({ match: accountMatch() }).workspaceId, "",
      "the resolved workspace is text or it is absent");
  });
});

describe("the assignment-target lookup", () => {
  it("describes the six members the service builds, and no more", () => {
    const built = matchMembers(permissionsService, "lookupDelegatedRoleAssignmentAccount");
    assert.deepEqual(built,
      ["activeMembership", "assignmentRevision", "assignments", "displayName", "userId", "username"],
      "lookupDelegatedRoleAssignmentAccount builds exactly six members");
    assert.deepEqual(declaredMembers("BrowserAssignmentLookupTarget").slice().sort(), built.slice().sort());
    assert.deepEqual(declaredMembers("BrowserAssignmentLookup"), ["match"],
      "this route works only in the caller's workspace and reports no workspace beside the match");
  });

  it("discloses only the three columns its query selects", () => {
    const block = extractFunctionBlock(usersRepository, "readExactActiveMemberByUsername");
    const selected = [...block.matchAll(/^\s+users\.(\w+),?$/gm)].map((entry) => entry[1]);
    assert.deepEqual(selected.slice().sort(), ["display_name", "user_id", "username"],
      "the member query selects three columns - no password, no status, no verification state");
    assert.match(block, /user_workspaces\.status = .active./,
      "the active-membership join is what makes this route narrower than the account lookup");
    assert.match(block, /users\.user_status = .active./);
    const contract = declarationBlock("BrowserAssignmentLookupTarget");
    for (const withheld of ["password", "user_status", "altEmail", "permission_overrides"]) {
      assert.doesNotMatch(contract, new RegExp(`\\n  ${withheld}\\??:`), `${withheld} is not selected and not sent`);
    }
  });

  it("reuses the delegated assignment record because the producer is the same helper", () => {
    const block = extractFunctionBlock(permissionsService, "lookupDelegatedRoleAssignmentAccount");
    assert.match(block, /assignments: manageableAssignments\.map\(decorateDelegatedAssignment\)/,
      "the same shaper 0.33.33.38.4.4.3.1 derived BrowserDelegatedRoleAssignment from");
    assert.match(block, /canAssignExistingRole\(activeSession, assignment\)/,
      "and the per-assignment filter runs first, so narrowing never widens what a delegate may see");
    assert.match(declarationBlock("BrowserAssignmentLookupTarget"),
      /\n  assignments: BrowserDelegatedRoleAssignment\[\];/,
      "producer identity is the reason for the reuse, not the shared word");
    assert.doesNotMatch(declarationBlock("BrowserAssignmentLookupTarget"), /BrowserRoleAssignment\[\]/,
      "the administrator record must never stand in here");
  });

  it("will not let either lookup record stand in for the other", () => {
    assert.equal(admin.isAccountLookupMatch(assignmentTarget()), false,
      "the assignment target carries no alreadyActive, which the account record requires");
    assert.equal(assignments.isAssignmentLookupTarget(accountMatch()), false,
      "and the account match carries none of the six the assignment target requires");
  });

  it("rejects a target it cannot vouch for", () => {
    assert.equal(assignments.isAssignmentLookupTarget(assignmentTarget()), true);
    for (const member of ["assignmentRevision", "displayName", "userId", "username"]) {
      assert.equal(assignments.isAssignmentLookupTarget({ ...assignmentTarget(), [member]: 4 }), false, `${member} is text`);
      assert.equal(assignments.isAssignmentLookupTarget(omit(assignmentTarget(), member)), false);
    }
    assert.equal(assignments.isAssignmentLookupTarget({ ...assignmentTarget(), userId: "" }), false);
    assert.equal(assignments.isAssignmentLookupTarget({ ...assignmentTarget(), activeMembership: "true" }), false,
      "the service writes a literal boolean");
    assert.equal(assignments.isAssignmentLookupTarget({ ...assignmentTarget(), assignments: null }), false);
  });

  it("checks the assignments rather than their container", () => {
    const good = { role_id: "client_admin", scope_id: "c-1", scope_type: "client" };
    const read = plain(assignments.readAssignmentLookup({
      match: { ...assignmentTarget(), assignments: [good, { role_id: "" }, null, "assignment"] },
    }));
    assert.deepEqual(read.match.assignments, [good],
      "normalizeTarget already accepted any array; a malformed entry is now dropped instead");
  });

  it("reports no match as null on every path the service takes", () => {
    const body = { match: assignmentTarget() };
    assert.deepEqual(plain(assignments.readAssignmentLookup(body)), body);
    for (const empty of [null, undefined, "body", 4, [], {}, { match: null }, { match: {} },
      { match: omit(assignmentTarget(), "userId") }]) {
      assert.equal(assignments.readAssignmentLookup(empty).match, null,
        "an invalid address and an address with no active member both answer a null match");
    }
  });
});

describe("the transport", () => {
  it("hands each consumer a narrowed envelope rather than the raw body", () => {
    for (const [page, source, reader, route] of [
      ["user-admin.js", adminPage, "readAccountLookup", "/api/users/lookup"],
      ["role-assignments.js", assignmentsPage, "readAssignmentLookup", "/api/role-assignments/lookup"],
    ]) {
      const at = source.indexOf(`"${route}"`);
      assert.ok(at > 0, `${page} must still call ${route}`);
      assert.match(source.slice(at - 400, at + 200),
        new RegExp(`${reader}\\(await requireApi\\(\\)\\.postJson`),
        `${page} must narrow the ${route} body at the call rather than reading it raw`);
    }
    assert.match(declarationSource, /postJson\([^)]*\): Promise<unknown>;/,
      "BrowserApi keeps returning a promise of unknown; nothing here is a trusted fetch");
  });
});

/** @param {string} source @param {readonly string[]} functions */
function sandbox(source, functions) {
  const context = vm.createContext({});
  for (const name of functions) {
    vm.runInContext(extractFunctionBlock(source, name), context, { filename: name });
  }
  return vm.runInContext(`({ ${functions.join(", ")} })`, context);
}

/** The members a service builds inside its match literal. @param {string} source @param {string} fn */
function matchMembers(source, fn) {
  const block = extractFunctionBlock(source, fn);
  const start = block.indexOf("match: {");
  assert.ok(start >= 0, `${fn} must keep building its match record as an object literal`);
  const literal = block.slice(start, block.indexOf("\n    },", start));
  return [...new Set([...literal.matchAll(/^\s{6}([a-zA-Z_]\w*):/gm)].map((entry) => entry[1]))];
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
function accountMatch() {
  return { alreadyActive: false, displayName: "Someone", username: "someone@example.com" };
}

/** @returns {Record<string, unknown>} */
function assignmentTarget() {
  return {
    activeMembership: true,
    assignmentRevision: "a1b2c3",
    assignments: [{ role_id: "client_admin", scope_id: "c-1", scope_type: "client" }],
    displayName: "Someone",
    userId: "u-1",
    username: "someone@example.com",
  };
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
