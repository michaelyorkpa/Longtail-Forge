import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/**
 * User Admin's managed sessions, typed by `0.33.33.44.10`.
 *
 * **The readers already established these records, so this child verified that and used it**
 * rather than declaring over them. `readManagedSessionList` requires a record, an array whose
 * every element satisfies `isManagedSession`, and a `user` satisfying `isManagedSessionUser`;
 * `loadUserSessions` already refuses when it answers `null`. So typing the slot makes the
 * compiler check the chain end to end instead of the declaration asserting it.
 *
 * This child also closes the deferral `0.33.33.44.7` recorded: the edit dialog's focus target was
 * a union whose sessions half was a bare query, and that half is typed here.
 */

const page = readFileSync(new URL("../../public/js/user-admin.js", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");
const markup = readFileSync(new URL("../../views/protected/user-admin.html", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");
const contracts = readFileSync(new URL("../../src/types/browser-contracts.d.ts", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");

/** @param {string} opener */
function slice(opener) {
  const start = page.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist in the page source");
  return page.slice(start, page.indexOf("\n  }\n", start) + 4);
}

/** @param {string} opener */
function docFor(opener) {
  const at = page.indexOf(opener);
  assert.notEqual(at, -1, opener + " must exist");
  return page.slice(page.lastIndexOf("/**", at), at);
}

/** Executable code only, so prose naming a call cannot satisfy a claim about it. */
const executable = page.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/[^\n]*/g, "$1");

/** @param {string} dataset */
function renderedTag(dataset) {
  const at = markup.search(new RegExp(`data-${dataset}(?=[\\s=>])`));
  assert.notEqual(at, -1, dataset + " must appear in the rendered markup");
  const open = markup.lastIndexOf("<", at);
  const tag = /^<([a-z0-9]+)/.exec(markup.slice(open, at));
  assert.ok(tag, dataset + " must sit on an element");
  return tag[1];
}

const CONTROLS = [
  ["user-session-list", "userSessionList", "HTMLElement", "ul"],
  ["refresh-user-sessions", "refreshUserSessionsButton", "HTMLButtonElement", "button"],
  ["revoke-user-sessions", "revokeUserSessionsButton", "HTMLButtonElement", "button"],
];

/**
 * The revocation reader as the page ships it. Declared at the shape these cases read; the cases
 * are what verify that declaration against the shipped function.
 * @type {(body: unknown) => { ok: true, revokedCount: number } | null}
 */
const readSessionRevocation = new Function([
  slice("  function isResponseRecord(value) {"),
  slice("  function readSessionRevocation(body) {"),
  "return readSessionRevocation;",
].join("\n"))();

describe("the readers establish what this child then relies on", () => {
  it("validates every session element, not just the container", () => {
    const validator = slice("  function isManagedSession(value) {");
    assert.match(validator, /MANAGED_SESSION_TEXT\.every\(\(member\) => typeof value\[member\] === "string"\)/);
    assert.match(validator, /typeof value\.sessionReference === "string"/);
    assert.match(validator, /SESSION_REFERENCE_PATTERN\.test\(value\.sessionReference\)/,
      "the reference is checked against its pattern, not merely for being text");
    assert.match(validator, /typeof value\.isCurrent === "boolean"/);
    const reader = slice("  function readManagedSessionList(body) {");
    assert.match(reader, /!sessions\.every\(isManagedSession\)/);
    assert.match(reader, /!isManagedSessionUser\(user\)/);
  });

  it("refuses a body it cannot read, before anything is rendered", () => {
    const body = slice("  async function loadUserSessions(user) {");
    assert.match(body, /if \(!managed\) \{\s*\n\s*throw new Error\("The managed session response could not be read\."\);/);
    assert.match(body, /renderManagedUserSessions\(managed\.sessions\);/,
      "and only a vouched-for list reaches the renderer");
  });

  it("answers null for a revocation body it cannot vouch for, and a record for one it can", () => {
    // Run from the page's own source: the declaration means nothing unless the function does it.
    for (const hostile of [null, undefined, 42, "text", [], {}, { ok: true },
      { ok: "true", revokedCount: 1 }, { ok: true, revokedCount: "1" },
      { ok: true, revokedCount: Number.NaN }, { ok: true, revokedCount: Infinity }, { ok: false, revokedCount: 1 }]) {
      assert.equal(readSessionRevocation(hostile), null,
        `${JSON.stringify(hostile) ?? "undefined"} cannot be vouched for`);
    }
    assert.deepEqual(readSessionRevocation({ ok: true, revokedCount: 0 }), { ok: true, revokedCount: 0 },
      "a zero count is a real answer");
    assert.deepEqual(readSessionRevocation({ ok: true, revokedCount: 3, extra: "ignored" }),
      { ok: true, revokedCount: 3 }, "and only the two vouched members are returned");
  });

  it("types the slot from that chain, and it is still written once", () => {
    assert.match(page, /@type \{BrowserManagedSession\[\]\}\s*\n\s*\*\/\s*\n\s*let managedUserSessions = \[\];/);
    assert.match(docFor("  function renderManagedUserSessions(nextSessions) {"),
      /@param \{BrowserManagedSession\[\]\} nextSessions/);
    // The `let` declaration matches this shape too, so it is excluded by lookbehind.
    const writes = [...executable.matchAll(/(?<!let )(?<![.\w])managedUserSessions = /g)].length;
    assert.equal(writes, 1, "the slot is assigned exactly once, inside the renderer");
    assert.match(slice("  function renderManagedUserSessions(nextSessions) {"),
      /managedUserSessions = Array\.isArray\(nextSessions\) \? nextSessions : \[\];/,
      "and that one assignment is there");
    // Both callers pass either the vouched-for list or an empty one.
    const callArguments = [...executable.matchAll(/(?<!function )renderManagedUserSessions\(([^)]*)\)/g)]
      .map((entry) => entry[1].trim()).filter((argument) => argument !== "nextSessions");
    assert.deepEqual([...new Set(callArguments)].sort(), ["[]", "managed.sessions"],
      "no caller passes an unchecked list");
    assert.ok(contracts.includes("export interface BrowserManagedSession {"));
  });
});

describe("the three controls and their required accesses", () => {
  it("matches the markup and reuses the shared helper", () => {
    for (const [dataset, slot, constructor, tag] of CONTROLS) {
      assert.equal(renderedTag(dataset), tag, `data-${dataset} is rendered as <${tag}>`);
      assert.ok(page.includes(`const ${slot} = findUserAdminControl("[data-${dataset}]", ${constructor});`),
        `${slot} must be acquired as ${constructor}`);
    }
    assert.equal([...page.matchAll(/function findUserAdminControl\(/g)].length, 1, "no new helper");
    assert.equal([...page.matchAll(/function requireUserAdminValue\(/g)].length, 1);
  });

  it("keeps the list a container type, because that is all it is used as", () => {
    const uses = [...page.matchAll(/sessionList\.(\w+)/g)].map((entry) => entry[1]);
    for (const use of uses) {
      assert.ok(["replaceChildren", "appendChild"].includes(use),
        `the session list reads only container members, not ${use}`);
    }
  });

  it("names the two bindings this cluster owns", () => {
    assert.match(executable, /requireUserAdminValue\(refreshUserSessionsButton, "refresh sessions button"\)\.addEventListener\("click"/);
    assert.match(executable, /requireUserAdminValue\(revokeUserSessionsButton, "revoke sessions button"\)\.addEventListener\("click"/);
  });

  it("requires only this cluster's controls inside its own functions", () => {
    const slots = new Set(CONTROLS.map(([, slot]) => slot));
    for (const opener of [
      "  async function loadUserSessions(user) {",
      "  function renderManagedUserSessions(nextSessions) {",
    ]) {
      const body = slice(opener).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/[^\n]*/g, "$1");
      for (const [, argument] of body.matchAll(/requireUserAdminValue\(([^,]+),/g)) {
        assert.ok(slots.has(argument.trim()),
          `${argument.trim()} in ${opener.trim()} is not one of this cluster's three controls`);
      }
    }
  });
});

describe("the deferral 0.33.33.44.7 recorded is closed here", () => {
  it("resolves the edit dialog's focus union", () => {
    const body = slice("  async function openEditUserDialog(user, options = {}) {");
    assert.match(body, /\(options\.focusSessions\s*\n\s*\? requireUserAdminValue\(refreshUserSessionsButton, "refresh sessions button"\)\s*\n\s*: usernameInput\)\.focus\(\);/,
      "both halves are typed and required");
    assert.ok(!/refreshUserSessionsButton\?\./.test(executable),
      "and the throw-on-absent behaviour is still not softened to a no-op");
    assert.match(body, /`0\.33\.33\.44\.7` left this union unresolved/,
      "the code records which child deferred it and why it can close now");
  });

  it("closes a bare binding 0.33.33.44.8 left behind", () => {
    // That child typed the control and missed its binding - an oversight rather than a deferral,
    // so it is closed here rather than recorded as owned work.
    assert.match(executable, /requireUserAdminValue\(cancelRolePermissionsButton, "cancel permissions button"\)\.addEventListener\("click", closePermissionDialog\);/);
  });
});

describe("session behaviour this child must not have moved", () => {
  it("keeps the refresh button disabled only while loading", () => {
    const body = slice("  async function loadUserSessions(user) {");
    assert.match(body, /refreshButton\.disabled = true;/);
    assert.match(body, /\} finally \{\s*\n\s*refreshButton\.disabled = false;\s*\n\s*\}/,
      "and re-enabled in the finally, so a failure does not strand it");
    assert.match(body, /createSessionStatusItem\("Loading active sessions\.\.\."\)/);
  });

  it("keeps the unauthenticated path silent and the failure path loud", () => {
    const body = slice("  async function loadUserSessions(user) {");
    assert.match(body, /if \(requireErrors\(\)\.caughtStatus\(error\) === 401\) \{\s*\n\s*return;\s*\n\s*\}/,
      "a 401 returns without rendering or reporting");
    assert.match(body, /renderManagedUserSessions\(\[\]\);\s*\n\s*setUserAdminStatus\(requireErrors\(\)\.caughtMessage\(error, "Active sessions could not be loaded\."\), true\);/,
      "and any other failure empties the list and says so");
  });

  it("keeps the revoke-all button following the list", () => {
    const body = slice("  function renderManagedUserSessions(nextSessions) {");
    assert.match(body, /\.disabled =\s*\n?\s*managedUserSessions\.length === 0;/);
    assert.match(body, /if \(!managedUserSessions\.length\) \{/);
    assert.match(body, /createSessionStatusItem\("No active sessions are connected to this workspace\."\)/);
  });

  it("keeps each row's detail and its per-row revoke", () => {
    const body = slice("  function renderManagedUserSessions(nextSessions) {");
    assert.match(body, /const currentLabel = session\.isCurrent \? "Current session\. " : "";/);
    assert.match(body, /const ipLabel = session\.ipAddress \|\| "IP unavailable";/);
    assert.match(body, /Started \$\{formatSessionDate\(session\.createdAt\)\}; expires \$\{formatSessionDate\(session\.expiresAt\)\}; \$\{ipLabel\}\./);
    assert.match(body, /revokeButton\.addEventListener\("click", \(\) => revokeUserSession\(getEditingUser\(\), session\)\);/);
  });

  it("adds no cast, suppression, any or namespace surface", () => {
    assert.ok(!/@ts-expect-error|@ts-ignore/.test(page), "no suppression");
    assert.ok(!/@type \{[^}]*\bany\b/.test(page), "nothing is typed any");
    assert.equal([...page.matchAll(/\*\/ \(/g)].length, 3,
      "the three casts in the element-checking readers predate this child, and none was added");
    assert.ok(!/LongtailForge\.\w+\s*=/.test(executable), "nothing is published");
  });

  it("leaves the clusters it does not own to their own children", () => {
    const bare = [...page.matchAll(/= document\.querySelector\("\[data-/g)].length;
    assert.ok(bare > 0, "controls no landed child owns are still bare");
    assert.ok(!/requireUserAdminValue\((workspaceMembershipList|userList)/.test(executable),
      "and no control of another cluster gained a required access here");
  });
});
