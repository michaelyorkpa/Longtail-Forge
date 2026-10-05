import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const service = read("src/services/users.service.js");
const routes = read("src/routes/users.routes.js");
const userAdmin = read("public/js/user-admin.js");
const workspaceSettings = read("public/js/workspace-settings.js");
const contracts = read("src/types/browser-contracts.d.ts");

/** @param {string} source @param {string} opener */
function functionBody(source, opener) {
  const start = source.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf("\n}\n", start);
  return source.slice(start, end === -1 ? source.length : end);
}

/** @param {string} name */
function declaredInterface(name) {
  const at = contracts.indexOf("export interface " + name + " {");
  assert.notEqual(at, -1, name + " must be declared");
  return contracts.slice(at, contracts.indexOf("\n}", at));
}

/**
 * The words a frozen member table lists, read from whichever page carries it.
 * @param {string} source @param {string} name
 */
function memberTable(source, name) {
  const match = new RegExp("const " + name + " = Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\);").exec(source);
  assert.ok(match, name + " must be a frozen table");
  return [...match[1].matchAll(/"(\w+)"/g)].map((entry) => entry[1]).sort();
}

/**
 * A reader sliced out of a shipped page, instantiated with the helpers it needs.
 * @param {string} source @param {readonly string[]} helpers
 * @param {readonly string[]} tables @param {string} exported
 */
function shippedReader(source, helpers, tables, exported) {
  /** @param {string} opener */
  const slice = (opener) => {
    const start = source.indexOf(opener);
    assert.notEqual(start, -1, opener + " must exist in the page source");
    return source.slice(start, source.indexOf("\n  }\n", start) + 4);
  };
  const body = [
    ...tables.map((/** @type {string} */ name) => {
      const match = new RegExp("const " + name + " = Object\\.freeze\\(\\[[\\s\\S]*?\\]\\);").exec(source);
      assert.ok(match, name + " must exist in the page source");
      return match[0];
    }),
    ...helpers.map(slice),
    "return " + exported + ";",
  ].join("\n");
  return new Function(body)();
}

const TABLES = ["USER_TEXT_MEMBERS", "USER_BOOLEAN_MEMBERS", "USER_NULLABLE_TEXT_MEMBERS"];

/** Lifted with the readers, but applied by `isWorkspaceMembership` rather than the user predicate. */
const LIFTED_TABLES = [...TABLES, "WORKSPACE_MEMBERSHIP_TEXT"];

/**
 * One membership exactly as `decorateUserWithMemberships` writes it - **all six members**.
 *
 * The fixture this replaces carried two (`workspaceId`, `status`). A fixture narrower than
 * the producer cannot notice missing validation, which is how `0.33.33.38.4.4.7`'s defect
 * survived: this suite used the short shape only to prove *extra* members are preserved.
 */
/**
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
const membership = (overrides = {}) => ({
  createdAt: "2026-01-01T00:00:00.000Z",
  status: "active",
  updatedAt: "2026-01-02T00:00:00.000Z",
  userWorkspaceId: "uw-1",
  workspaceId: "ws-1",
  workspaceName: "Acme",
  ...overrides,
});

const user = (overrides = {}) => ({
  altEmail: null,
  displayName: "Ada",
  openExternalLinksNewTab: false,
  passwordChangeRequired: false,
  preferredCalendarView: null,
  preferredLoginLanding: "dashboard",
  preferredWorkspaceSwitchLanding: "dashboard",
  protectedUser: false,
  themeAutoSource: "system",
  themeMode: "auto",
  timezone: "UTC",
  userStatus: "active",
  user_id: "user-1",
  username: "ada",
  ...overrides,
});
const body = (overrides = {}) => ({ currentUserId: "user-1", users: [user()], ...overrides });

/**
 * The six members the decorator writes, read from `decorateUserWithMemberships` itself so the
 * cases below are not generated from the same table they test.
 */
const MEMBERSHIP_MEMBERS = (() => {
  const block = functionBody(service, "async function decorateUserWithMemberships(user) {");
  const mapped = /workspaceMemberships: memberships\.map\(\(membership\) => \(\{([\s\S]*?)\}\)\)/.exec(block);
  assert.ok(mapped, "the decorator must build its memberships by name");
  return [...mapped[1].matchAll(/^\s*(\w+):/gm)].map((entry) => entry[1]).sort();
})();

describe("the decorated membership producer", () => {
  it("writes exactly six members, and the browser checks exactly those", () => {
    assert.deepEqual(MEMBERSHIP_MEMBERS,
      ["createdAt", "status", "updatedAt", "userWorkspaceId", "workspaceId", "workspaceName"]);
    assert.deepEqual(Object.keys(membership()).sort(), MEMBERSHIP_MEMBERS,
      "and this suite's fixture carries all six, not a subset");
    for (const [name, source] of [["user-admin", userAdmin], ["workspace-settings", workspaceSettings]]) {
      assert.deepEqual(memberTable(source, "WORKSPACE_MEMBERSHIP_TEXT"), MEMBERSHIP_MEMBERS,
        name + " must check the members the decorator writes");
    }
    assert.deepEqual(
      [...declaredInterface("BrowserUserWorkspaceMembership").matchAll(/^  (\w+)\??:/gm)]
        .map((entry) => entry[1]).sort(),
      MEMBERSHIP_MEMBERS,
      "and the contract declares that same six");
  });
});

describe("the user list producer", () => {
  it("reconstructs two members and spreads nothing", () => {
    const literal = functionBody(service, "async function list(session) {");
    const members = [...literal.matchAll(/^    (\w+):/gm)].map((entry) => entry[1]).sort();
    assert.deepEqual(members, ["currentUserId", "users"], "the list must answer exactly two members");
    assert.ok(!literal.includes("..."), "a spread would make the exact membership unearned");
  });

  it("takes the acting identity from the session, not from the list", () => {
    assert.match(
      functionBody(service, "async function list(session) {"),
      /currentUserId: session\.user_id,/,
      "the current user id must be the session's own",
    );
  });

  it("gates the read before it reads anything", () => {
    const literal = functionBody(service, "async function list(session) {");
    assert.match(
      literal,
      /permissionsService\.assertCan\(session, "users\.manage", \{ workspace_id: session\.workspace_id, operation: "read" \}\)/,
      "the list must assert users.manage in the current workspace",
    );
    assert.ok(
      literal.indexOf("assertCan") < literal.indexOf("readUsersWithMemberships"),
      "the gate must run before any user is read",
    );
  });

  it("hands the result to the browser unchanged", () => {
    const at = routes.indexOf("usersRoutes.get(\"/users\"");
    assert.notEqual(at, -1, "the user list route must exist");
    const route = routes.slice(at, routes.indexOf("}));", at));
    assert.match(route, /usersService\.list\(request\.session\)/, "the route must call the traced producer");
    assert.match(route, /response\.status\(200\)\.json\(result\)/, "the route must answer the producer's result");
  });
});

describe("the declaration", () => {
  const declared = declaredInterface("BrowserUserListResponse");

  it("declares the producer's own membership, with nothing optional", () => {
    const members = [...declared.matchAll(/^  (\w+)(\??):/gm)].map((entry) => entry[1]).sort();
    assert.deepEqual(members, ["currentUserId", "users"], "declared membership must equal the producer's literal");
    assert.ok(!/^  \w+\?:/m.test(declared), "neither member may be optional");
  });

  it("reuses the established user record rather than inventing a second one", () => {
    assert.match(declared, /users: BrowserUserRecord\[\];/, "the list must carry the published user record");
    assert.ok(
      contracts.indexOf("export interface BrowserUserRecord {") > contracts.indexOf("export interface BrowserUserListResponse {"),
      "the reused record must be the one this envelope is declared beside",
    );
    assert.match(
      declaredInterface("BrowserUserRecord"),
      /workspaceMemberships\?: BrowserUserWorkspaceMembership\[\];/,
      "and it must already cover the memberships the list paths decorate on",
    );
  });
});

describe("the two element checks, held identical by proof", () => {
  it("carries the same three member tables on both pages", () => {
    for (const table of TABLES) {
      assert.deepEqual(
        memberTable(workspaceSettings, table),
        memberTable(userAdmin, table),
        table + " must be identical on both pages that check this producer",
      );
    }
  });

  it("checks every table on both pages, plus the non-empty identity", () => {
    for (const [name, source, predicate] of [
      ["user-admin", userAdmin, "function isUserRecord(value) {"],
      ["workspace-settings", workspaceSettings, "function isWorkspaceUserRecord(value) {"],
    ]) {
      const check = functionBody(source, "  " + predicate).slice(0, 900);
      for (const table of TABLES) {
        assert.ok(check.includes(table), name + " must apply " + table);
      }
      assert.match(check, /value\.user_id !== ""/, name + " must require a usable identity");
    }
  });

  it("says why the duplication exists rather than leaving it to look accidental", () => {
    const at = workspaceSettings.indexOf("const USER_TEXT_MEMBERS");
    const note = workspaceSettings.slice(Math.max(0, at - 700), at);
    assert.match(note, /held identical by proof/, "the repeated tables must point at the proof that holds them");
    assert.match(note, /no declared namespace surface owns browser user records/,
      "and must say why they are not shared instead");
  });
});

describe("both shipped readers, run against real bodies", () => {
  const readers = [
    ["user-admin", shippedReader(userAdmin, [
      "function isResponseRecord(value) {",
      "function isWorkspaceMembership(value) {",
      "function hasReadableWorkspaceMemberships(value) {",
      "function isUserRecord(value) {",
      "function readUserListResponse(body) {",
    ], LIFTED_TABLES, "readUserListResponse")],
    ["workspace-settings", shippedReader(workspaceSettings, [
      "function isDeletionRecord(value) {",
      "function isWorkspaceMembership(value) {",
      "function hasReadableWorkspaceMemberships(value) {",
      "function isWorkspaceUserRecord(value) {",
      "function readWorkspaceUserList(body) {",
    ], LIFTED_TABLES, "readWorkspaceUserList")],
  ];

  for (const [name, readList] of readers) {
    it(name + " accepts a real body", () => {
      const result = readList(body());
      assert.ok(result, "a valid body must be accepted");
      assert.equal(result.currentUserId, "user-1", "the actor identity must survive the read");
      assert.equal(result.users.length, 1, "and so must the list");
    });

    it(name + " refuses a body that is not an object", () => {
      for (const bad of [null, undefined, 7, "users", [], true]) {
        assert.equal(readList(bad), null, name + " must refuse a primitive body: " + String(bad));
      }
    });

    it(name + " refuses a missing or empty actor identity", () => {
      for (const bad of [undefined, null, "", 7]) {
        assert.equal(
          readList(body({ currentUserId: bad })),
          null,
          name + " must refuse an unusable currentUserId: " + String(bad),
        );
      }
    });

    it(name + " refuses a missing or non-array user list", () => {
      for (const bad of [undefined, null, {}, "users"]) {
        assert.equal(readList(body({ users: bad })), null, name + " must refuse a non-array list: " + String(bad));
      }
    });

    it(name + " refuses the whole response when one user cannot be vouched for", () => {
      const result = readList(body({
        users: [user(), user({ user_id: "" }), user({ username: "ok" })],
      }));
      assert.equal(result, null, name + " must not answer a silently shortened administrative roster");
    });

    it(name + " refuses a user whose member types are wrong", () => {
      assert.equal(readList(body({ users: [user({ protectedUser: "yes" })] })), null,
        name + " must refuse a non-boolean flag");
      assert.equal(readList(body({ users: [user({ altEmail: 7 })] })), null,
        name + " must refuse a nullable member that is neither null nor text");
      assert.equal(readList(body({ users: [user({ timezone: null })] })), null,
        name + " must refuse a text member that is null");
    });

    it(name + " accepts a user carrying members this record does not name", () => {
      const result = readList(body({
        users: [user({ workspaceMemberships: [membership()], aFutureColumn: 1 })],
      }));
      assert.ok(result, name + " must accept decoration the producer adds");
      assert.equal(result.users[0].aFutureColumn, 1, "and answer the element the producer sent");
    });

    it(name + " accepts every membership answer the producer really gives", () => {
      for (const [label, memberships] of [
        ["absent", undefined],
        ["an empty array", []],
        ["one membership", [membership()]],
        ["several", [membership(), membership({ workspaceId: "ws-2", userWorkspaceId: "uw-2" })]],
        ["one carrying a future column", [membership({ aFutureColumn: 1 })]],
      ]) {
        const users = memberships === undefined
          ? [user()]
          : [user({ workspaceMemberships: memberships })];
        assert.ok(readList(body({ users })), name + " must accept memberships " + label);
      }
    });

    it(name + " refuses a present memberships value that is not an array", () => {
      for (const bad of ["ws-1", 7, true, { ws: 1 }, null]) {
        assert.equal(readList(body({ users: [user({ workspaceMemberships: bad })] })), null,
          name + " must refuse memberships of " + JSON.stringify(bad));
      }
    });

    it(name + " refuses a membership element that is not a record", () => {
      for (const bad of [null, "ws-1", 7, true, [membership()]]) {
        assert.equal(readList(body({ users: [user({ workspaceMemberships: [bad] })] })), null,
          name + " must refuse a membership element of " + JSON.stringify(bad));
      }
    });

    it(name + " refuses a membership missing any promised member", () => {
      for (const member of MEMBERSHIP_MEMBERS) {
        const incomplete = membership();
        delete incomplete[member];
        assert.equal(readList(body({ users: [user({ workspaceMemberships: [incomplete] })] })), null,
          name + " must refuse a membership without " + member);
      }
    });

    it(name + " refuses a membership whose promised member has the wrong type", () => {
      for (const member of MEMBERSHIP_MEMBERS) {
        for (const bad of [null, 7, true, {}, []]) {
          assert.equal(readList(body({ users: [user({ workspaceMemberships: [membership({ [member]: bad })] })] })), null,
            name + " must refuse " + member + " of " + JSON.stringify(bad));
        }
      }
    });

    it(name + " refuses the whole roster for one malformed membership among valid users", () => {
      // The established outer policy: an authoritative roster refuses rather than hiding an
      // account. A newly-invalid element must follow it, not quietly become a filtered one.
      const result = readList(body({
        users: [user(), user({ user_id: "user-2", workspaceMemberships: [{ workspaceId: "ws-1" }] })],
      }));
      assert.equal(result, null,
        name + " must not answer a roster with one account silently dropped");
    });

    it(name + " answers the producer's own membership array and elements by identity", () => {
      const first = membership();
      const memberships = [first];
      const result = readList(body({ users: [user({ workspaceMemberships: memberships })] }));
      assert.ok(result, "the body is accepted");
      assert.equal(result.users[0].workspaceMemberships, memberships, "the array is not rebuilt");
      assert.equal(result.users[0].workspaceMemberships[0], first, "nor its elements");
    });

    it(name + " accepts a genuinely empty roster", () => {
      const result = readList(body({ users: [] }));
      assert.ok(result, "an empty list the server really sent must be accepted");
      assert.deepEqual(result.users, [], "and answered as the empty list it is");
    });
  }
});

describe("the two consumers", () => {
  it("no longer coerce the actor identity out of an unread body", () => {
    assert.ok(
      !userAdmin.includes("String(usersBody.currentUserId || \"\")"),
      "the raw coerced actor read must be gone",
    );
  });

  it("no longer default the roster to an empty list", () => {
    assert.ok(
      !workspaceSettings.includes("result.users || []"),
      "the raw roster default must be gone",
    );
  });

  it("both refuse rather than render a body they cannot vouch for", () => {
    for (const [name, source] of [["user-admin", userAdmin], ["workspace-settings", workspaceSettings]]) {
      assert.match(
        source,
        /throw new Error\("The workspace user list could not be read\./,
        name + " must refuse an unreadable user list",
      );
    }
  });

  it("checks the shape of what it was given before reading into it", () => {
    // Pinned by source as well as by behaviour: both guards are defence in depth, so removing
    // either makes the reader throw or changes nothing, and neither outcome names the guard.
    for (const [name, source, opener, recordGuard] of [
      ["user-admin", userAdmin, "  function readUserListResponse(body) {", "isResponseRecord"],
      ["workspace-settings", workspaceSettings, "  function readWorkspaceUserList(body) {", "isDeletionRecord"],
    ]) {
      const start = source.indexOf(opener);
      const reader = source.slice(start, source.indexOf("\n  }\n", start));
      assert.match(reader, /!Array\.isArray\(users\)/,
        name + " must check the roster is a container before iterating it");
      assert.ok(reader.includes(recordGuard + "(body)"),
        name + " must check the body is a record before reading its members");
    }
  });

  it("does not infer the acting user from the list it was sent", () => {
    // Sliced at the enclosing indent: these readers live inside a page IIFE, so a top-level
    // closing brace marks the end of the file rather than the end of the function.
    const start = userAdmin.indexOf("  function readUserListResponse(body) {");
    const reader = userAdmin.slice(start, userAdmin.indexOf("\n  }\n", start));
    assert.ok(
      !reader.includes("users.find") && !reader.includes("users.some"),
      "the actor identity must come from the producer, never from list membership",
    );
  });

  it("leaves the best-effort reader's policy to the bodies whose children set it", () => {
    assert.match(
      userAdmin,
      /return envelope && Array\.isArray\(envelope\.users\) \? envelope\.users\.filter\(isUserRecord\) : \[\];/,
      "readUserRecords must keep dropping for the three bodies it still serves",
    );
    assert.equal(
      userAdmin.split("readUserRecords(").length - 1, 4,
      "and must still serve exactly its own callers, with the list route moved off it",
    );
  });
});
