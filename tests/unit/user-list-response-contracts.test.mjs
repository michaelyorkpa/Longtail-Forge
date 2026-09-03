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
      "function isUserRecord(value) {",
      "function readUserListResponse(body) {",
    ], TABLES, "readUserListResponse")],
    ["workspace-settings", shippedReader(workspaceSettings, [
      "function isDeletionRecord(value) {",
      "function isWorkspaceUserRecord(value) {",
      "function readWorkspaceUserList(body) {",
    ], TABLES, "readWorkspaceUserList")],
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
        users: [user({ workspaceMemberships: [{ workspaceId: "ws", status: "active" }], aFutureColumn: 1 })],
      }));
      assert.ok(result, name + " must accept decoration the producer adds");
      assert.equal(result.users[0].aFutureColumn, 1, "and answer the element the producer sent");
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
