// Runtime proof for the managed user-session responses.
//
// Two envelopes from one service: a session list and a revocation acknowledgement. The rollup
// that drew this child refused to make them one, and the trace agrees - a list with an optional
// count would be a false symmetry.
//
// **The security argument is the whole child.** The `sessions` table has no token, hash or
// secret column, because the `session_id` *is* the bearer credential - it is the value
// `buildSessionCookie` writes into the session cookie. So the control is not redaction of a
// secret field; it is that `toManagedSession` never passes the identifier through at all and
// substitutes an HMAC-derived reference the server resolves on the way back. These proofs read
// the schema, the query, the cookie writer and the shaper to establish exactly that.

import { describe, it } from "vitest";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const { readText } = createProjectTextReader();

const serviceSource = readText("src/services/sessions.service.js");
const routesSource = readText("src/routes/users.routes.js");
const repositorySource = readText("src/repositories/sessions.repo.js");
const cookiesSource = readText("src/security/cookies.js");
const schemaSource = readText("src/db/schema/current.sql");
const declarationSource = readText("src/types/browser-contracts.d.ts");
const page = readText("public/js/user-admin.js");

const parser = sandbox(page,
  ["isResponseRecord", "isManagedSession", "isManagedSessionUser", "readManagedSessionList", "readSessionRevocation"],
  ["MANAGED_SESSION_TEXT", "MANAGED_SESSION_USER_TEXT"]);

const listService = extractFunctionBlock(serviceSource, "listManagedUserSessions");
const revokeOne = extractFunctionBlock(serviceSource, "revokeManagedSession");
const revokeAll = extractFunctionBlock(serviceSource, "revokeManagedUserSessions");
const shaper = extractFunctionBlock(serviceSource, "toManagedSession");
const targetShaper = extractFunctionBlock(serviceSource, "toTargetUser");
const gate = extractFunctionBlock(serviceSource, "assertCanManageUserSessions");
const listQuery = extractFunctionBlock(repositorySource, "listForUserInWorkspace");
const sessionsTable = schemaSource.slice(schemaSource.indexOf("CREATE TABLE sessions ("));
const sessionColumns = tableColumns(sessionsTable.slice(0, sessionsTable.indexOf(");")));

/** Everything a session row holds that must never reach the browser. */
const WITHHELD = ["session_id", "sessionId", "home_workspace_id", "active_workspace_id", "user_id", "updated_at"];

describe("the list envelope against its producer", () => {
  it("is exactly the two members the service returns", () => {
    const returned = literalMembers(listService.slice(listService.lastIndexOf("return {")), 4);
    assert.deepEqual(returned.slice().sort(), ["sessions", "user"], "listManagedUserSessions returns two members");
    assert.deepEqual(declaredMembers("BrowserManagedSessionList").sort(), returned.slice().sort(),
      "and the contract is exactly those two, neither optional");
    for (const member of returned) {
      assert.doesNotMatch(declarationBlock("BrowserManagedSessionList"), new RegExp(`\\n  ${member}\\?:`),
        `${member} is always sent, so it is never optional`);
    }
  });

  it("is scoped to the caller's workspace rather than the account's sessions everywhere", () => {
    assert.match(listService, /sessionsRepository\.listForUserInWorkspace\(targetUser\.user_id, session\.workspace_id\)/,
      "the list is read for one workspace");
    assert.match(listQuery, /home_workspace_id = :workspaceId\s+OR active_workspace_id = :workspaceId/,
      "which is what the query restricts on");
    assert.match(declarationDoc("BrowserManagedSessionList"), /not every session the\s+\* account holds/,
      "and the contract records that it is not widened");
    assert.match(page, /No active sessions are connected to this workspace\./,
      "the panel's own wording says the same");
  });

  it("is gated on users.manage in this workspace, for the target account", () => {
    assert.match(gate, /assertCan\(session, "users\.manage", \{\s+operation,\s+workspace_id: session\.workspace_id,/,
      "the permission is asserted for the caller's workspace");
    assert.match(gate, /if \(!targetUser\) \{\s+throw new AppError\("User was not found\.", 404\);/,
      "the target must exist");
    assert.match(gate, /assertPublicDemoVisitorIdentityMutable\(targetUser\.user_id\);/,
      "and a public-demo visitor identity is protected");
    assert.match(listService, /assertCanManageUserSessions\(session, userId, "read"\)/, "the list asks for read");
    for (const [name, block] of [["revokeManagedSession", revokeOne], ["revokeManagedUserSessions", revokeAll]]) {
      assert.match(block, /assertCanManageUserSessions\(session, userId, "update"\)/, `${name} asks for update`);
    }
  });
});

describe("what does not cross the boundary", () => {
  it("withholds the identifier that is itself the credential", () => {
    assert.match(cookiesSource, /function buildSessionCookie\(sessionId, maxAgeSeconds, request = null\) \{\s+return buildCookie\(config\.cookies\.sessionName, sessionId,/,
      "the stored session id is the value written into the session cookie");
    assert.ok(sessionColumns.includes("session_id"), "the row carries it");
    assert.match(listQuery, /SELECT\s+session_id,/, "and the query selects it");
    const emitted = literalMembers(shaper.slice(shaper.indexOf("return {")), 4);
    for (const member of WITHHELD) {
      assert.ok(!emitted.includes(member), `the shaper must never emit ${member}`);
      assert.ok(!declaredMembers("BrowserManagedSession").includes(member),
        `and the contract must never name ${member}`);
    }
    assert.match(shaper, /sessionReference: createSessionReference\(row\.session_id\),/,
      "the identifier is consumed into the reference and nowhere else");
    assert.equal(shaper.split("row.session_id").length, 3,
      "which is the only other place the shaper touches it, beside the current-session comparison");
  });

  it("has no token, hash or secret column to withhold in the first place", () => {
    const body = sessionsTable.slice(0, sessionsTable.indexOf(");"));
    for (const forbidden of ["token", "hash", "secret", "password", "csrf"]) {
      assert.doesNotMatch(body, new RegExp(forbidden, "i"),
        `the sessions table declares no ${forbidden} column, which is why the identifier is the credential`);
    }
    assert.match(declarationDoc("BrowserManagedSession"), /the identifier is the\s+\* credential, which is exactly why substituting a reference for it is the control/,
      "and the contract records that reasoning");
  });

  it("emits five members and no more", () => {
    const emitted = literalMembers(shaper.slice(shaper.indexOf("return {")), 4);
    assert.deepEqual(emitted.slice().sort(),
      ["createdAt", "expiresAt", "ipAddress", "isCurrent", "sessionReference"],
      "toManagedSession names five members");
    assert.deepEqual(declaredMembers("BrowserManagedSession").sort(), emitted.slice().sort(),
      "and the contract is exactly those five");
    assert.ok(sessionColumns.length > emitted.length,
      "which is fewer than the row carries, and that reduction is the projection");
  });
});

describe("the session reference", () => {
  it("is derived rather than stored, and the server resolves it back", () => {
    assert.match(serviceSource, /const SESSION_REFERENCE_SECRET = randomBytes\(32\);/,
      "the secret is generated in process memory");
    assert.match(extractFunctionBlock(serviceSource, "createSessionReference"),
      /createHmac\("sha256", SESSION_REFERENCE_SECRET\)\s*\.update\(String\(sessionId \|\| ""\)\)\s*\.digest\("base64url"\)\s*\.slice\(0, 32\)/,
      "and the reference is a truncated base64url HMAC over the identifier");
    assert.match(revokeOne, /candidates\.find\(\(row\) => createSessionReference\(row\.session_id\) === normalizedReference\)/,
      "the revoke route recomputes the reference server-side rather than trusting an id");
    assert.match(extractFunctionBlock(serviceSource, "normalizeReference"),
      /\/\^\[A-Za-z0-9_-\]\{32\}\$\/\.test\(reference\)/, "and validates its shape before looking");
    assert.match(revokeOne, /throw new AppError\("Session was not found\.", 404\);/,
      "answering the same 404 for an unmatched reference");
  });

  it("is not promised as a durable identifier", () => {
    assert.match(declarationBlock("BrowserManagedSession"), /Not a session id, and deliberately not durable/,
      "the contract refuses that reading");
    assert.match(declarationBlock("BrowserManagedSession"), /stable only for the life of the server process/,
      "because the secret is minted at module load");
    assert.ok(!declaredMembers("BrowserManagedSession").includes("sessionId"),
      "and it is never renamed to something that would imply otherwise");
  });

  it("is refused by the browser when it could not be sent back", () => {
    assert.equal(parser.isManagedSession(managedSession()), true);
    assert.equal(parser.isManagedSession({ ...managedSession(), sessionReference: "short" }), false,
      "a handle the server's own validator would reject is not one this page may offer to revoke");
    assert.equal(parser.isManagedSession({ ...managedSession(), sessionReference: "!".repeat(32) }), false,
      "nor one outside the shape it accepts");
    assert.match(page, /const SESSION_REFERENCE_PATTERN = \/\^\[A-Za-z0-9_-\]\{32\}\$\/;/,
      "and the browser checks the same shape the server requires");
  });
});

describe("the session members", () => {
  it("shows the address rather than pretending it is redacted", () => {
    assert.match(shaper, /ipAddress: String\(row\.ip_address \|\| ""\)\.slice\(0, 128\),/,
      "the shaper coerces and bounds the column");
    assert.match(declarationBlock("BrowserManagedSession"), /\n  ipAddress: string;/,
      "so it is always text, empty when the column was");
    assert.match(declarationDoc("BrowserManagedSession"), /`ipAddress` is \*\*not redacted\*\*/,
      "and the contract says so plainly");
    assert.match(page, /session\.ipAddress \|\| "IP unavailable"/, "which is what the renderer already assumed");
    assert.equal(parser.isManagedSession({ ...managedSession(), ipAddress: "" }), true, "an empty address is real");
    assert.equal(parser.isManagedSession({ ...managedSession(), ipAddress: null }), false, "but it is never null");
  });

  it("types both timestamps as text because both columns are NOT NULL", () => {
    const body = sessionsTable.slice(0, sessionsTable.indexOf(");"));
    for (const column of ["expires_at", "created_at"]) {
      assert.match(body, new RegExp(`${column} TEXT NOT NULL`), `${column} cannot be null`);
    }
    assert.match(shaper, /createdAt: row\.created_at \|\| "",/, "the shaper guards one defensively");
    assert.match(shaper, /expiresAt: row\.expires_at,/, "and passes the other through unguarded");
    for (const member of ["createdAt", "expiresAt"]) {
      assert.match(declarationBlock("BrowserManagedSession"), new RegExp(`\\n  ${member}: string;`),
        `${member} is text either way`);
      assert.equal(parser.isManagedSession({ ...managedSession(), [member]: null }), false, `${member} is never null`);
    }
  });

  it("takes the current-session marker from the server", () => {
    assert.match(shaper, /isCurrent: row\.session_id === currentSessionId,/,
      "the server compares the stored identifier with the caller's own");
    assert.match(routesSource, /getSessionIdFromRequest\(request\)/, "which the route supplies from the request");
    assert.equal(parser.isManagedSession({ ...managedSession(), isCurrent: "true" }), false,
      "so a word is not the boolean it computes");
    assert.equal(parser.isManagedSession(omit(managedSession(), "isCurrent")), false, "and it is always sent");
  });

  it("gives the runtime tables authority of their own", () => {
    assert.deepEqual([...plain(parser.MANAGED_SESSION_TEXT), "isCurrent"].sort(),
      declaredMembers("BrowserManagedSession").sort(), "the browser checks every member a session declares");
    assert.deepEqual(plain(parser.MANAGED_SESSION_USER_TEXT).slice().sort(),
      declaredMembers("BrowserManagedSessionUser").sort(), "and every member the account summary declares");
    for (const member of plain(parser.MANAGED_SESSION_TEXT)) {
      assert.equal(parser.isManagedSession(omit(managedSession(), member)), false, `${member} is always built`);
    }
  });
});

describe("the account summary", () => {
  it("is the three members its own shaper builds, not a user record", () => {
    const built = literalMembers(targetShaper.slice(targetShaper.indexOf("return {")), 4);
    assert.deepEqual(built.slice().sort(), ["displayName", "userId", "username"], "toTargetUser names three");
    assert.deepEqual(declaredMembers("BrowserManagedSessionUser").sort(), built.slice().sort(),
      "and the contract is exactly the three that shaper builds");
    assert.match(targetShaper, /displayName: user\.display_name \|\| user\.username,/, "with a fallback to the username");
    for (const recordOnly of ["userStatus", "protectedUser", "passwordChangeRequired", "themeMode", "user_id"]) {
      assert.ok(!declaredMembers("BrowserManagedSessionUser").includes(recordOnly),
        `${recordOnly} belongs to BrowserUserRecord, which a different shaper builds`);
    }
    assert.equal(parser.isManagedSessionUser(managedUser()), true);
    assert.equal(parser.isManagedSessionUser({ ...managedUser(), userId: "" }), false, "an account with no id is not one");
    assert.equal(parser.isManagedSessionUser({ displayName: "x" }), false, "a partial summary is not one");
  });
});

describe("the revocation acknowledgement", () => {
  it("is one contract because both producers write the same literal", () => {
    for (const [name, block] of [["revokeManagedSession", revokeOne], ["revokeManagedUserSessions", revokeAll]]) {
      assert.match(block, /return \{ ok: true, revokedCount \};/, `${name} ends in the same literal`);
    }
    assert.deepEqual(declaredMembers("BrowserSessionRevocationResult").sort(), ["ok", "revokedCount"]);
    assert.match(declarationBlock("BrowserSessionRevocationResult"), /\n  ok: true;/,
      "so ok is the literal the producers write rather than a flag to test");
    assert.doesNotMatch(declarationSource, /BrowserSingleSessionRevocationResult/,
      "and there is not one contract per route");
  });

  it("refuses an acknowledgement that did not come from those producers", () => {
    assert.deepEqual(plain(parser.readSessionRevocation(revocation())), revocation());
    assert.equal(parser.readSessionRevocation({ ...revocation(), ok: false }), null, "a false ok is not what they write");
    assert.equal(parser.readSessionRevocation({ ...revocation(), ok: "true" }), null, "nor a truthy word");
    assert.equal(parser.readSessionRevocation(omit(revocation(), "ok")), null);
    assert.equal(parser.readSessionRevocation({ ...revocation(), revokedCount: "2" }), null, "the count is a number");
    assert.equal(parser.readSessionRevocation({ ...revocation(), revokedCount: Number.NaN }), null);
    for (const empty of [null, undefined, "body", 4, [], {}]) {
      assert.equal(parser.readSessionRevocation(empty), null);
    }
  });

  it("never invents a count, and never claims nothing was revoked", () => {
    assert.match(page, /setUserAdminStatus\(revocation\s+\? `Revoked \$\{revocation\.revokedCount\} session\$\{revocation\.revokedCount === 1 \? "" : "s"\}\.`\s+: "Workspace sessions were revoked\."\);/,
      "an unreadable acknowledgement reports the revocation without a number");
    assert.doesNotMatch(page, /revokedCount \|\| 0/,
      "rather than the zero the raw read would have invented for a body it could not vouch for");
    assert.match(page, /: "Workspace sessions were revoked\.",?\);\s+await loadUserSessions\(user\);/,
      "and the list is refreshed either way, which is what actually shows the truth");
  });
});

describe("the list reader", () => {
  it("accepts the producer's envelope whole", () => {
    assert.deepEqual(plain(parser.readManagedSessionList(sessionList())), sessionList());
    assert.deepEqual(plain(parser.readManagedSessionList({ ...sessionList(), sessions: [] })),
      { ...sessionList(), sessions: [] }, "an account with no sessions here is a real answer");
  });

  it("refuses the whole list rather than hiding a session", () => {
    assert.equal(parser.readManagedSessionList({ ...sessionList(), sessions: [managedSession(), { isCurrent: true }] }), null,
      "dropping an element would hide an active session from the administrator looking for one");
    assert.equal(parser.readManagedSessionList({ ...sessionList(), sessions: [{}] }), null,
      "an array container alone confers no trust");
    assert.match(page, /if \(!managed\) \{\s+throw new Error\("The managed session response could not be read\."\);/,
      "so it takes the load-error path the page already owned");
    assert.match(page, /renderManagedUserSessions\(\[\]\);\s+setUserAdminStatus\(requireErrors\(\)\.caughtMessage\(error, "Active sessions could not be loaded\."\), true\);/,
      "which says the sessions could not be loaded rather than that there are none");
  });

  it("does not render a header for an account it cannot vouch for", () => {
    assert.equal(parser.readManagedSessionList({ ...sessionList(), user: { username: "partial" } }), null,
      "a summary the browser cannot vouch for must not become a panel header");
    assert.equal(parser.readManagedSessionList(omit(sessionList(), "user")), null, "the summary is always sent");
    for (const empty of [null, undefined, "body", 4, [], {}, { sessions: [] }]) {
      assert.equal(parser.readManagedSessionList(empty), null);
    }
  });
});

describe("the consumers", () => {
  it("narrow both owned reads through the readers", () => {
    const consumers = ["isManagedSession", "isManagedSessionUser", "readManagedSessionList", "readSessionRevocation"]
      .reduce((rest, reader) => rest.replace(extractFunctionBlock(page, reader), ""), page);
    for (const raw of ["body.sessions", "body.revokedCount"]) {
      assert.ok(!consumers.includes(raw), `user-admin.js must no longer read ${raw} off an unknown body`);
    }
    assert.match(page, /const managed = readManagedSessionList\(await requireApi\(\)\.getJson\(/);
    assert.match(page, /renderManagedUserSessions\(managed\.sessions\);/);
    assert.match(page, /const revocation = readSessionRevocation\(await requireApi\(\)\.deleteJson\(/);
    assert.match(declarationSource, /getJson\([^)]*\): Promise<unknown>;/, "BrowserApi keeps returning a promise of unknown");
    assert.match(declarationSource, /deleteJson\([^)]*\): Promise<unknown>;/);
  });

  it("leaves the revoke-one call reading nothing, as it already did", () => {
    const revoke = extractFunctionBlock(page, "revokeUserSession");
    assert.match(revoke, /await requireApi\(\)\.deleteJson\(\s*`\/api\/users\/\$\{encodeURIComponent\(user\.user_id\)\}\/sessions\/\$\{encodeURIComponent\(session\.sessionReference\)\}`,\s*\);/,
      "the single revoke awaits without reading a body");
    assert.doesNotMatch(revoke, /readSessionRevocation/,
      "so no contract is forced onto a result the page ignores");
    assert.match(revoke, /setUserAdminStatus\("Session revoked\."\);/, "and its status copy is unchanged");
  });

  it("preserves the behaviour the session-revocation owner pins", () => {
    assert.match(page, /\/sessions\/\$\{encodeURIComponent\(session\.sessionReference\)\}/,
      "the revoke-one URL expression a regression pins is untouched");
    assert.match(page, /requireModalDialogs\(\)\.confirm/, "and both confirmations remain");
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
  const pattern = source.match(/const SESSION_REFERENCE_PATTERN = [^;]+;/);
  assert.ok(pattern, "the reference shape must remain readable");
  vm.runInContext(pattern[0], context, { filename: "SESSION_REFERENCE_PATTERN" });
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

/**
 * Every column a `CREATE TABLE` body declares.
 * @param {string} body @returns {string[]}
 */
function tableColumns(body) {
  return [...body.replaceAll("\r\n", "\n").matchAll(/^ {2}(\w+) TEXT/gm)].map((entry) => entry[1]);
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
function managedSession() {
  return {
    createdAt: "2026-09-02T12:00:00.000Z",
    expiresAt: "2026-09-09T12:00:00.000Z",
    ipAddress: "10.0.0.1",
    isCurrent: false,
    sessionReference: "abcdefghijklmnopqrstuvwxyz012345",
  };
}

/** @returns {Record<string, unknown>} */
function managedUser() {
  return { displayName: "Viewed User", userId: "u-1", username: "viewed.user" };
}

/** @returns {Record<string, unknown>} */
function sessionList() {
  return { sessions: [managedSession()], user: managedUser() };
}

/** @returns {Record<string, unknown>} */
function revocation() {
  return { ok: true, revokedCount: 2 };
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
