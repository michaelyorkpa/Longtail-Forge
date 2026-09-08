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
  ["isResponseRecord", "isUserRecord", "readUserRecords", "readUserRecord",
    "isWorkspaceMembership", "hasReadableWorkspaceMemberships", "readUserListResponse"],
  ["USER_TEXT_MEMBERS", "USER_BOOLEAN_MEMBERS", "USER_NULLABLE_TEXT_MEMBERS",
    "WORKSPACE_MEMBERSHIP_TEXT"]);

const membershipsServiceSource = readText("src/services/users.service.js");
const membershipsRepositorySource = readText("src/repositories/user-workspaces.repo.js");

/**
 * The members `decorateUserWithMemberships` writes, read from the decorator itself.
 *
 * **A second producer, deliberately read separately.** `userRowToAppValue` builds the flat user
 * record and emits no memberships at all; the decorator adds them on the list paths only. Comparing
 * the browser's membership check against the *flat* shaper would compare it to a producer that
 * legitimately has nothing to say, which is how `workspaceMemberships` came to be excluded from the
 * completeness proof below and left unvalidated.
 */
function decoratedMembershipMembers() {
  const block = extractFunctionBlock(membershipsServiceSource, "decorateUserWithMemberships");
  const mapped = /workspaceMemberships: memberships\.map\(\(membership\) => \(\{([\s\S]*?)\}\)\)/.exec(block);
  assert.ok(mapped, "the decorator must build its memberships by name");
  return [...mapped[1].matchAll(/^\s*(\w+):/gm)].map((entry) => entry[1]).sort();
}

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
    // `workspaceMemberships` is excluded here because this comparison is against the FLAT shaper,
    // which does not emit it. That exclusion is correct - and it is why the member needs the
    // separate decorated-producer evidence in the block below, which `0.33.33.38.4.4.7` added
    // after the audit found this exclusion was the only completeness proof the member had.
    assert.deepEqual(
      declared.filter((member) => member !== "workspaceMemberships").sort(),
      produced.slice().sort(),
      "the contract describes the same members the flat shaper builds",
    );
    assert.ok(declared.includes("workspaceMemberships"),
      "and the one member the flat shaper does not build is still declared");
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

describe("the decorated membership producer, proved apart from the flat shaper", () => {
  /**
   * One membership exactly as `decorateUserWithMemberships` writes it.
   * @param {Record<string, unknown>} [overrides]
   * @returns {Record<string, unknown>}
   */
  const membership = (overrides = {}) => ({
    userWorkspaceId: "uw-1",
    workspaceId: "ws-1",
    workspaceName: "Acme",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  });

  it("checks exactly the members the decorator writes, no more and no fewer", () => {
    const produced = decoratedMembershipMembers();
    assert.deepEqual(produced,
      ["createdAt", "status", "updatedAt", "userWorkspaceId", "workspaceId", "workspaceName"],
      "the decorator writes six members");
    assert.deepEqual(plain(admin.WORKSPACE_MEMBERSHIP_TEXT).slice().sort(), produced,
      "and the browser checks that same six");
    const declared = [...declarationBlock("BrowserUserWorkspaceMembership").matchAll(/^  (\w+)\??:/gm)]
      .map((entry) => entry[1]).sort();
    assert.deepEqual(declared, produced, "and the contract declares that same six");
  });

  it("promises strings because every source column is NOT NULL", () => {
    // The guarantee behind the declaration, read from the query and the schema rather than assumed.
    const query = extractFunctionBlock(membershipsRepositorySource, "readForUser");
    assert.match(query, /INNER JOIN workspaces ON workspaces\.workspace_id = user_workspaces\.workspace_id/,
      "workspaceName arrives through an INNER JOIN, so it cannot be null");
    assert.match(query, /workspaces\.name AS workspace_name/);
    const schema = readText("src/db/schema/current.sql");
    const table = schema.slice(schema.indexOf("CREATE TABLE user_workspaces ("));
    const columns = table.slice(0, table.indexOf(");"));
    for (const column of ["workspace_id", "status", "created_at", "updated_at"]) {
      assert.match(columns, new RegExp(column + " TEXT NOT NULL"), column + " is NOT NULL");
    }
    assert.match(columns, /user_workspace_id TEXT PRIMARY KEY/);
    const membershipDeclaration = declarationBlock("BrowserUserWorkspaceMembership");
    assert.ok(!/\|\s*null/.test(membershipDeclaration),
      "so no membership member is declared nullable");
  });

  it("accepts a decorated record and preserves richer producer members", () => {
    const rich = membership({ aFutureColumn: 7 });
    assert.equal(admin.isWorkspaceMembership(rich), true);
    assert.equal(rich.aFutureColumn, 7, "extra producer members are not stripped");
  });

  it("refuses a membership missing any required member", () => {
    for (const member of decoratedMembershipMembers()) {
      const incomplete = membership();
      delete incomplete[member];
      assert.equal(admin.isWorkspaceMembership(incomplete), false,
        "a membership without " + member + " is not one this producer built");
    }
  });

  it("refuses a membership whose required member carries the wrong type", () => {
    for (const member of decoratedMembershipMembers()) {
      for (const bad of [null, 7, true, {}, []]) {
        assert.equal(admin.isWorkspaceMembership(membership({ [member]: bad })), false,
          member + " must be text, not " + JSON.stringify(bad));
      }
    }
  });

  it("refuses an element that is not a record at all", () => {
    for (const element of [null, undefined, "ws-1", 7, true, [membership()]]) {
      assert.equal(admin.isWorkspaceMembership(element), false,
        JSON.stringify(element) + " is not a membership");
    }
  });
});

describe("optional means absent, or present and valid", () => {
  /** @returns {Record<string, unknown>} */
  const membership = () => ({
    userWorkspaceId: "uw-1", workspaceId: "ws-1", workspaceName: "Acme",
    status: "active", createdAt: "2026-01-01", updatedAt: "2026-01-02",
  });

  it("accepts the answers the producer really gives", () => {
    assert.equal(admin.hasReadableWorkspaceMemberships(undefined), true,
      "absent: the single-user read paths do not decorate");
    assert.equal(admin.hasReadableWorkspaceMemberships([]), true,
      "empty: a user in no active workspace");
    assert.equal(admin.hasReadableWorkspaceMemberships([membership(), membership()]), true);
  });

  it("refuses a present value that is not an array", () => {
    for (const value of ["ws-1", 7, true, { ws: 1 }, null]) {
      assert.equal(admin.hasReadableWorkspaceMemberships(value), false,
        JSON.stringify(value) + " is not a membership array");
    }
  });

  it("refuses a single valid membership sent instead of an array of one", () => {
    // The case that distinguishes a real array check from a coercion: every *invalid* non-array
    // value fails the element check anyway, so only a valid membership object exposes a reader
    // that wraps its input instead of requiring the container the contract declares.
    assert.equal(admin.isWorkspaceMembership(membership()), true, "the object itself is valid");
    assert.equal(admin.hasReadableWorkspaceMemberships(membership()), false,
      "but the contract declares an array, and one membership is not one");
  });

  it("refuses a non-object carrier that happens to hold the six members", () => {
    // The case that distinguishes a real objecthood check from "not an array, not nullish":
    // a function carrying every promised member passes the weaker test and is still not a record.
    const carrier = Object.assign(() => {}, membership());
    assert.equal(typeof carrier.workspaceId, "string", "the carrier really does hold them");
    assert.equal(admin.isWorkspaceMembership(carrier), false,
      "a membership must be a plain record, not anything with the right properties");
  });

  it("refuses an array with one unreadable element among valid ones", () => {
    assert.equal(admin.hasReadableWorkspaceMemberships([membership(), null]), false);
    assert.equal(admin.hasReadableWorkspaceMemberships([membership(), { workspaceId: "ws-2" }]), false);
  });

  it("answers the producer's own array and elements by identity", () => {
    // References captured before the reader runs, so this proves identity rather than equality.
    const first = membership();
    const memberships = [first];
    const user = { ...userFixture(), workspaceMemberships: memberships };
    assert.equal(admin.isUserRecord(user), true);
    assert.equal(user.workspaceMemberships, memberships, "the array is not rebuilt");
    assert.equal(user.workspaceMemberships[0], first, "nor its elements");
  });
});

describe("each outer reader keeps its own established policy", () => {
  const membership = () => ({
    userWorkspaceId: "uw-1", workspaceId: "ws-1", workspaceName: "Acme",
    status: "active", createdAt: "2026-01-01", updatedAt: "2026-01-02",
  });
  const good = () => ({ ...userFixture(), workspaceMemberships: [membership()] });
  const bad = () => ({ ...userFixture(), user_id: "user-2", workspaceMemberships: "ws-1" });

  it("the authoritative roster still refuses rather than hiding an account", () => {
    assert.equal(admin.readUserListResponse({ currentUserId: "user-1", users: [good()] })?.users.length, 1);
    assert.equal(admin.readUserListResponse({ currentUserId: "user-1", users: [good(), bad()] }), null,
      "one unreadable user refuses the whole roster, as it already did for a malformed flat member");
  });

  it("the previously approved filtering reader still filters", () => {
    const filtered = admin.readUserRecords({ users: [good(), bad()] });
    assert.equal(filtered.length, 1, "a malformed user is dropped, not made to refuse the body");
    assert.equal(filtered[0].user_id, userFixture().user_id);
  });

  it("the mutation echo still answers null and lets its caller fall back", () => {
    assert.equal(admin.readUserRecord({ user: good() })?.user_id, userFixture().user_id);
    assert.equal(admin.readUserRecord({ user: bad() }), null,
      "an unreadable echo is null, which the callers already treat as absent");
  });
});
