// Runtime proof for the browser-facing user record.
//
// `USER_SELECT_COLUMNS` is the column authority and `userRowToAppValue` is the response authority,
// and they are not the same list: the select carries `password`, `home_workspace_id` and
// `active_workspace_id`, and the shaper sends none of them. That gap is the reason this file exists.
//
// The two authorities are separate files, as `0.33.33.38.4.11` established. The producer side is
// read from `src/utils/normalizers.js` and `src/repositories/users.repo.js`; the contract side from
// the browser declaration and `public/js/user-admin.js`. Breaking one leaves the other standing.

import { describe, it } from "vitest";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const { readText } = createProjectTextReader();

const normalizersSource = readText("src/utils/normalizers.js");
const repositorySource = readText("src/repositories/users.repo.js");
const declarationSource = readText("src/types/browser-contracts.d.ts");
const adminSource = readText("public/js/user-admin.js");

/** The columns the select carries that the shaper must never forward. */
const WITHHELD_COLUMNS = Object.freeze(["password", "home_workspace_id", "active_workspace_id"]);

const admin = sandbox(adminSource,
  ["isResponseRecord", "isUserRecord", "readUserRecords", "readUserRecord"],
  ["USER_TEXT_MEMBERS", "USER_BOOLEAN_MEMBERS", "USER_NULLABLE_TEXT_MEMBERS"]);

describe("the browser-facing user record", () => {
  it("describes exactly what the shaper constructs", () => {
    const produced = shapedMembers();
    const checked = [
      ...plain(admin.USER_TEXT_MEMBERS),
      ...plain(admin.USER_BOOLEAN_MEMBERS),
      ...plain(admin.USER_NULLABLE_TEXT_MEMBERS),
    ];
    assert.deepEqual(checked.slice().sort(), produced.slice().sort(),
      "the browser must check the members userRowToAppValue builds, no more and no fewer");
    const declared = [...declarationBlock("BrowserUserRecord").matchAll(/^  (\w+)\??:/gm)].map((entry) => entry[1]);
    assert.deepEqual(
      declared.filter((member) => member !== "workspaceMemberships").sort(),
      produced.slice().sort(),
      "the contract describes the same members, plus the memberships the list paths decorate on",
    );
  });

  it("never regains the columns the select carries and the response withholds", () => {
    const selected = selectedColumns();
    const produced = shapedMembers();
    for (const column of WITHHELD_COLUMNS) {
      assert.ok(selected.includes(column), `${column} must still be selected, or this test proves nothing`);
      assert.ok(!produced.includes(column), `${column} is withheld by the shaper`);
      assert.doesNotMatch(declarationBlock("BrowserUserRecord"), new RegExp(`\\n  ${column}\\??:`),
        `${column} must never be a member of the browser user contract`);
      assert.ok(!plain(admin.USER_TEXT_MEMBERS).includes(column), `${column} must not be checked either`);
    }
  });

  it("accepts a record the shaper could build", () => {
    assert.equal(admin.isUserRecord(userFixture()), true);
    assert.equal(admin.isUserRecord({ ...userFixture(), altEmail: null, preferredCalendarView: null }), true,
      "the two members the shaper nulls are nullable");
    assert.equal(admin.isUserRecord({ ...userFixture(), password: "hash" }), true,
      "a body carrying a withheld column is still a user: the contract omits the member rather than policing the wire");
  });

  it("rejects a record it cannot vouch for", () => {
    for (const member of plain(admin.USER_TEXT_MEMBERS)) {
      assert.equal(admin.isUserRecord(omit(userFixture(), member)), false, `${member} must be present`);
      assert.equal(admin.isUserRecord({ ...userFixture(), [member]: null }), false, `${member} is never null`);
      assert.equal(admin.isUserRecord({ ...userFixture(), [member]: 7 }), false, `${member} is text`);
    }
    for (const member of plain(admin.USER_BOOLEAN_MEMBERS)) {
      for (const stored of [1, 0, "1", "true", null, undefined]) {
        assert.equal(admin.isUserRecord({ ...userFixture(), [member]: stored }), false,
          `${member} is normalised to a boolean before it is sent`);
      }
    }
    for (const member of plain(admin.USER_NULLABLE_TEXT_MEMBERS)) {
      assert.equal(admin.isUserRecord(omit(userFixture(), member)), false, `${member} is nulled, never omitted`);
      assert.equal(admin.isUserRecord({ ...userFixture(), [member]: 4 }), false);
    }
    assert.equal(admin.isUserRecord({ ...userFixture(), user_id: "" }), false, "an empty identity is not a user");
    for (const malformed of [null, undefined, 0, "user", true, [], [userFixture()]]) {
      assert.equal(admin.isUserRecord(malformed), false);
    }
  });

  it("checks list elements rather than the container", () => {
    const valid = userFixture();
    const mixed = { users: [valid, { user_id: "u-2" }, null, "user", [valid]] };
    assert.deepEqual(plain(admin.readUserRecords(mixed)), [valid],
      "a valid array must not make its elements trusted");
    for (const empty of [null, undefined, 0, "body", [], {}, { users: null }, { users: "all" }]) {
      assert.deepEqual(plain(admin.readUserRecords(empty)), [],
        "every call site wrote `body.users || []`, so a body without users still renders none");
    }
  });

  it("falls back rather than throwing for a single user", () => {
    assert.equal(plain(admin.readUserRecord({ user: userFixture() })).username, "username-value");
    for (const empty of [null, undefined, "body", {}, { user: null }, { user: { user_id: "u" } }]) {
      assert.equal(admin.readUserRecord(empty), null,
        "every consumer already wrote `body.user?.username || username`, so absence was already the fallback");
    }
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

/** The members `userRowToAppValue` constructs, read from the normalizer itself. @returns {string[]} */
function shapedMembers() {
  const block = extractFunctionBlock(normalizersSource, "userRowToAppValue");
  const literal = block.slice(block.indexOf("return {"), block.indexOf("};"));
  return [...new Set([...literal.matchAll(/^\s{4,}([a-zA-Z_]\w*):/gm)].map((entry) => entry[1]))];
}

/** The columns the user select carries, read from the repository. @returns {string[]} */
function selectedColumns() {
  const match = repositorySource.match(/const USER_SELECT_COLUMNS = `([\s\S]*?)`;/);
  assert.ok(match, "USER_SELECT_COLUMNS must remain a readable column list");
  return match[1].split(",").map((column) => column.trim()).filter(Boolean);
}

/** @param {string} name @returns {string} */
function declarationBlock(name) {
  const match = declarationSource.match(new RegExp(`export interface ${name}\\b[^{]*\\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `${name} must be declared`);
  return match[0];
}

/** A user exactly as the shaper builds one. @returns {Record<string, unknown>} */
function userFixture() {
  /** @type {Record<string, unknown>} */
  const user = {};
  for (const member of plain(admin.USER_TEXT_MEMBERS)) user[member] = `${member}-value`;
  for (const member of plain(admin.USER_BOOLEAN_MEMBERS)) user[member] = false;
  for (const member of plain(admin.USER_NULLABLE_TEXT_MEMBERS)) user[member] = `${member}-value`;
  return user;
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
