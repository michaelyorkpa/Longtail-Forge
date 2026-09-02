// Runtime proof for the create-user mutation response.
//
// One producer answers `POST /api/users` with four members, and two of them are the halves
// `0.33.33.38.4.4.1` already narrowed - so this owner reuses that record rather than describing
// a user twice, and the proof checks the reuse is real.
//
// **The credential's emptiness is the contract.** `usersService.create` mints a password only in
// the branch that creates an account and leaves `initialPassword` the `""` it was initialised to
// otherwise, so `""` means "no credential was minted" and `accountCreated` says why. The member
// stays required: making it optional would turn a meaningful empty string into an absence. The
// proof pins the generation branch, the audit path that stores no credential, and the panel that
// hides an empty value.

import { describe, it } from "vitest";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const { readText } = createProjectTextReader();

const serviceSource = readText("src/services/users.service.js");
const routesSource = readText("src/routes/users.routes.js");
const repositorySource = readText("src/repositories/users.repo.js");
const declarationSource = readText("src/types/browser-contracts.d.ts");
const page = readText("public/js/user-admin.js");

const parser = sandbox(page,
  ["isResponseRecord", "isUserRecord", "readUserRecord", "readUserRecords", "readUserCreation"],
  ["USER_TEXT_MEMBERS", "USER_BOOLEAN_MEMBERS", "USER_NULLABLE_TEXT_MEMBERS"]);

const create = extractFunctionBlock(serviceSource, "create");

describe("the envelope against its producer", () => {
  it("is exactly the four members the service returns", () => {
    const returned = literalMembers(create.slice(create.lastIndexOf("return {")), 4);
    assert.deepEqual(returned.slice().sort(), ["accountCreated", "initialPassword", "user", "users"],
      "usersService.create answers exactly four members");
    assert.deepEqual(declaredMembers("BrowserUserCreationResult").sort(), returned.slice().sort(),
      "and the contract is exactly those four");
  });

  it("reuses the record the user child already published for both halves", () => {
    const block = declarationBlock("BrowserUserCreationResult");
    assert.match(block, /\n  user: BrowserUserRecord \| null;/, "the account it acted on");
    assert.match(block, /\n  users: BrowserUserRecord\[\];/, "and the list after it");
    assert.match(create, /user: await decorateUserForWorkspace\(user, workspace\.workspaceId\),/,
      "which is what the producer sends");
    assert.match(declarationSource, /export interface BrowserUserRecord \{/, "that record still exists");
    assert.doesNotMatch(declarationSource, /export interface BrowserCreatedUserRecord/,
      "and no second user shape was invented for this route");
  });

  it("is a mutation envelope rather than a user record", () => {
    for (const member of ["accountCreated", "initialPassword"]) {
      assert.ok(!declaredMembers("BrowserUserRecord").includes(member),
        `${member} belongs to the mutation, not to a user`);
    }
    assert.equal(parser.isUserRecord(creation()), false, "the envelope is not itself a user record");
  });
});

describe("the credential", () => {
  it("is minted only where an account is created", () => {
    assert.match(create, /let initialPassword = "";/, "it starts empty");
    assert.match(create, /initialPassword = createGeneratedPassword\(\);/, "and is generated on one branch");
    assert.equal(create.split("initialPassword = ").length, 3,
      "which is the only place the service assigns it beside that initialisation");
    assert.match(create, /accountCreated = true;/, "the same branch is what sets the flag");
    assert.match(routesSource, /response\.status\(result\.accountCreated \? 201 : 200\)\.json\(result\);/,
      "and the route reports the two cases with different statuses");
  });

  it("is required with an empty absent case, never optional", () => {
    const block = declarationBlock("BrowserUserCreationResult");
    assert.match(block, /\n  initialPassword: string;/, "the member is required");
    assert.doesNotMatch(block, /initialPassword\?:/, "and must never become optional");
    assert.match(declarationDoc("BrowserUserCreationResult"), /Making the member\s+\* optional would turn a meaningful empty string into an absence/,
      "the declaration records why");
    assert.equal(parser.readUserCreation({ ...creation(), initialPassword: "" }).initialPassword, "",
      "an attached account answers the empty string the producer wrote");
    assert.equal(parser.readUserCreation(omit(creation(), "initialPassword")).initialPassword, "",
      "and an absent one is read as that same empty value rather than as undefined");
  });

  it("never reaches the stored record or the audit trail", () => {
    const repoCreate = extractFunctionBlock(repositorySource, "create");
    assert.match(repoCreate, /async function create\(workspaceId, profile, passwordHash\)/,
      "the repository is handed a hash, not the credential");
    // Only the returned literal: the statement above it inserts the hash into the row, which is
    // exactly where a hash belongs.
    const returned = repoCreate.slice(repoCreate.lastIndexOf("return {"));
    assert.doesNotMatch(returned, /password(?!ChangeRequired)/i,
      "and the record it returns names no password member");
    const audit = create.slice(create.indexOf('action: "user_created"'), create.indexOf("return {"));
    assert.ok(audit.length > 0, "the create writes a user_created audit entry");
    assert.doesNotMatch(audit, /initialPassword|passwordHash|password_hash/,
      "which stores neither the credential nor its hash");
  });

  it("is hidden by the browser whenever it is empty", () => {
    assert.match(page, /if \(created\.accountCreated\) \{\s+showGeneratedPassword\(created\.initialPassword\);\s+\} else \{\s+showGeneratedPassword\(""\);\s+\}/,
      "the panel is fed the credential only on the branch that minted one");
    const show = extractFunctionBlock(page, "showGeneratedPassword");
    assert.match(show, /hidden = /, "and the panel hides itself on an empty value");
  });
});

describe("the reader", () => {
  it("reads the producer's body whole", () => {
    assert.deepEqual(plain(parser.readUserCreation(creation())), creation());
  });

  it("degrades rather than throwing, because the reads it replaced did not throw", () => {
    // Asserted on its own so that turning the reader into a refusal fails here by name rather
    // than by an exception escaping some other expectation.
    let thrown = null;
    try {
      parser.readUserCreation(null);
    } catch (error) {
      thrown = error;
    }
    assert.equal(thrown, null, "an unreadable body must degrade rather than throw");
  });

  it("keeps the total behaviour the raw reads already had", () => {
    for (const empty of [null, undefined, "body", 4, [], {}]) {
      assert.deepEqual(plain(parser.readUserCreation(empty)),
        { accountCreated: false, initialPassword: "", user: null, users: [] },
        "an unusable body takes the existing-account branch with no credential, as it already did");
    }
  });

  it("only reports a created account on the producer's own literal", () => {
    assert.equal(parser.readUserCreation({ ...creation(), accountCreated: "true" }).accountCreated, false,
      "a truthy word is not the boolean the producer writes");
    assert.equal(parser.readUserCreation({ ...creation(), accountCreated: 1 }).accountCreated, false);
    assert.equal(parser.readUserCreation(omit(creation(), "accountCreated")).accountCreated, false);
  });

  it("refuses a credential that is not text", () => {
    for (const bad of [null, 12345, { value: "x" }, ["x"]]) {
      assert.equal(parser.readUserCreation({ ...creation(), initialPassword: bad }).initialPassword, "",
        "anything but text is read as no credential at all");
    }
  });

  it("vouches for both user halves through the record child's own guards", () => {
    assert.equal(parser.readUserCreation({ ...creation(), user: { username: "partial" } }).user, null,
      "a partial account is not one");
    assert.deepEqual(plain(parser.readUserCreation({ ...creation(), users: [userRecord(), { user_id: "u-2" }] }).users),
      [userRecord()], "and an element the browser cannot vouch for is dropped");
    assert.deepEqual(plain(parser.readUserCreation({ ...creation(), users: {} }).users), [],
      "a non-list is no list");
  });
});

describe("the consumer", () => {
  it("narrows the three reads through the reader", () => {
    // Scoped to the create path. `resetUserPassword` reads the same member name from a different
    // producer through an implicitly typed callback, which is `0.33.33.44`'s parameter work and
    // not this response boundary's to claim.
    const createUser = extractFunctionBlock(page, "createUser");
    for (const raw of ["body.accountCreated", "body.initialPassword"]) {
      assert.ok(!createUser.includes(raw), `createUser must no longer read ${raw} off an unknown body`);
    }
    assert.match(extractFunctionBlock(page, "resetUserPassword"), /showGeneratedPassword\(body\.initialPassword \|\| ""\)/,
      "and that other producer's read is left exactly as it was");
    assert.match(page, /const created = readUserCreation\(body\);/);
    assert.match(page, /renderUsers\(created\.users\);/, "the list comes from the narrowed envelope");
    assert.match(page, /`Created \$\{created\.user\?\.username \|\| username\}/,
      "and the status keeps the fallback to the name that was sent");
    assert.match(page, /`Added existing account \$\{created\.user\?\.username \|\| username\}/);
    assert.match(declarationSource, /postJson\([^)]*\): Promise<unknown>;/, "BrowserApi keeps returning a promise of unknown");
  });

  it("leaves the other user-admin producers to their own children", () => {
    for (const other of ["workspacesBody.workspaces", "permissionResourcesBody.resources", "usersBody.currentUserId"]) {
      assert.ok(page.includes(other), `${other} is another child's read and is untouched`);
    }
    assert.ok(page.includes("body.sessions"), "the managed-session reads are untouched too");
    assert.doesNotMatch(declarationSource, /BrowserManagedSessionList/, "and this child declares nothing for them");
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

/**
 * The members an object literal names at one indent, written `name: value` or as shorthand.
 * @param {string} literal @param {number} indent @returns {string[]}
 */
function literalMembers(literal, indent) {
  return [...new Set([...literal.replaceAll("\r\n", "\n").matchAll(new RegExp(`^ {${indent}}([a-zA-Z_]\\w*)(?::|,$)`, "gm"))]
    .map((entry) => entry[1]))];
}

/** @param {string} name @returns {string} */
function declarationDoc(name) {
  const index = declarationSource.indexOf(`export interface ${name} {`);
  assert.ok(index > 0, `${name} must be declared`);
  const opened = declarationSource.lastIndexOf("/**", index);
  assert.ok(opened > 0, `${name} must be documented`);
  return declarationSource.slice(opened, index);
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
function userRecord() {
  /** @type {Record<string, unknown>} */
  const user = {};
  for (const member of plain(parser.USER_TEXT_MEMBERS)) user[member] = `${member}-value`;
  for (const member of plain(parser.USER_BOOLEAN_MEMBERS)) user[member] = false;
  for (const member of plain(parser.USER_NULLABLE_TEXT_MEMBERS)) user[member] = null;
  return user;
}

/** @returns {Record<string, unknown>} */
function creation() {
  return {
    accountCreated: true,
    initialPassword: "generated-one-time-value",
    user: userRecord(),
    users: [userRecord()],
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
