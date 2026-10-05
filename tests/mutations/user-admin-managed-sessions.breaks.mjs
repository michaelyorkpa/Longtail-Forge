import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Run explicitly, with no server or other verification reading this source concurrently.
// This harness is not a standing gate; it proves the checkpoint's new behavioral assertions.
const sourcePath = "public/js/user-admin.js";
const suites = [
  "tests/unit/user-admin-managed-session-contracts.test.mjs",
  "tests/unit/user-admin-edit-user-contracts.test.mjs",
];
const original = Buffer.from(readFileSync(sourcePath));
const source = original.toString("utf8");
/** @param {Buffer} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const beforeHash = hash(original);

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- what the readers establish -----------------------------------------------------------------
  ["the session reference stops being pattern-checked",
    "      && SESSION_REFERENCE_PATTERN.test(value.sessionReference)\n", ""],
  ["a session member class stops being checked",
    '      && typeof value.isCurrent === "boolean";',
    "      && true;"],
  ["the list reader stops validating its elements",
    "!sessions.every(isManagedSession)", "false"],
  ["the list reader stops validating its user",
    " || !isManagedSessionUser(user)", ""],
  ["an unreadable body is rendered instead of refused",
    '      if (!managed) {\n        throw new Error("The managed session response could not be read.");\n      }',
    "      if (!managed) {\n        return;\n      }"],
  ["the revocation reader accepts a non-numeric count",
    'return ok === true && typeof revokedCount === "number" && Number.isFinite(revokedCount)',
    "return ok === true"],
  ["the revocation reader accepts a falsy ok",
    "return ok === true &&", "return ok !== undefined &&"],
  ["the revocation reader leaks extra members",
    "      ? { ok: true, revokedCount }\n", "      ? { ok: true, revokedCount, ...body }\n"],

  // --- the slot -------------------------------------------------------------------------------------
  ["the slot loses its record type",
    "   * @type {BrowserManagedSession[]}\n   */\n  let managedUserSessions = [];",
    "  let managedUserSessions = [];"],
  ["the renderer accepts an unchecked list",
    "  /** @param {BrowserManagedSession[]} nextSessions */\n  function renderManagedUserSessions(nextSessions) {",
    "  function renderManagedUserSessions(nextSessions) {"],
  ["a caller passes the body member instead of the vouched list",
    "renderManagedUserSessions(managed.sessions);",
    "renderManagedUserSessions(body.sessions);"],
  ["a second writer assigns the slot",
    "  async function revokeAllUserSessions(user) {",
    "  async function revokeAllUserSessions(user) {\n    managedUserSessions = [];"],

  // --- the three controls ---------------------------------------------------------------------------
  ["a button is acquired as a plain element",
    'const revokeUserSessionsButton = findUserAdminControl("[data-revoke-user-sessions]", HTMLButtonElement);',
    'const revokeUserSessionsButton = findUserAdminControl("[data-revoke-user-sessions]", HTMLElement);'],
  ["the session list reverts to an unchecked query",
    'const userSessionList = findUserAdminControl("[data-user-session-list]", HTMLElement);',
    'const userSessionList = document.querySelector("[data-user-session-list]");'],
  ["the list is narrowed past what the markup guarantees",
    'const userSessionList = findUserAdminControl("[data-user-session-list]", HTMLElement);',
    'const userSessionList = findUserAdminControl("[data-user-session-list]", HTMLUListElement);'],
  ["a bare binding stops naming its failure",
    'requireUserAdminValue(refreshUserSessionsButton, "refresh sessions button").addEventListener("click"',
    'refreshUserSessionsButton?.addEventListener("click"'],
  ["a required access targets a control that was never checked",
    'requireUserAdminValue(revokeUserSessionsButton, "revoke sessions button").addEventListener("click"',
    'requireUserAdminValue(document.querySelector("[data-revoke-user-sessions]"), "revoke sessions button").addEventListener("click"'],

  // --- the deferral this child closes ------------------------------------------------------------------
  ["the focus union is softened to a no-op",
    '      ? requireUserAdminValue(refreshUserSessionsButton, "refresh sessions button")',
    "      ? refreshUserSessionsButton?.valueOf()"],
  ["the record of which child deferred the focus union is dropped",
    "    // `0.33.33.44.7` left this union unresolved", "    //"],
  ["the permissions cancel binding goes bare again",
    'requireUserAdminValue(cancelRolePermissionsButton, "cancel permissions button").addEventListener("click", closePermissionDialog);',
    'cancelRolePermissionsButton.addEventListener("click", closePermissionDialog);'],

  // --- behaviour -----------------------------------------------------------------------------------------
  ["the refresh button is stranded disabled on failure",
    "    } finally {\n      refreshButton.disabled = false;\n    }",
    "    }"],
  // Anchored through the line that follows it: three functions guard on a 401 the same way.
  ["a 401 renders and reports instead of returning quietly",
    "      if (requireErrors().caughtStatus(error) === 401) {\n        return;\n      }\n      renderManagedUserSessions([]);",
    "      renderManagedUserSessions([]);"],
  ["a load failure stops emptying the list",
    "      renderManagedUserSessions([]);\n      setUserAdminStatus(requireErrors().caughtMessage(error, \"Active sessions could not be loaded.\"), true);",
    '      setUserAdminStatus(requireErrors().caughtMessage(error, "Active sessions could not be loaded."), true);'],
  ["revoke-all stays enabled with no sessions",
    "      managedUserSessions.length === 0;", "      false;"],
  ["the empty state stops rendering",
    'createSessionStatusItem("No active sessions are connected to this workspace.")',
    'createSessionStatusItem("")'],
  ["the current-session label is dropped",
    'const currentLabel = session.isCurrent ? "Current session. " : "";',
    'const currentLabel = "";'],
  ["a missing IP stops falling back",
    'const ipLabel = session.ipAddress || "IP unavailable";',
    "const ipLabel = session.ipAddress;"],
  ["the per-row revoke loses its session",
    'revokeButton.addEventListener("click", () => revokeUserSession(getEditingUser(), session));',
    'revokeButton.addEventListener("click", () => revokeUserSession(getEditingUser(), managedUserSessions[0]));'],
];

let caught = 0;
let missed = 0;

try {
  for (const [name, find, replace] of cases) {
    const occurrences = source.split(find).length - 1;
    assert.equal(occurrences, 1, `anchor for "${name}" must appear exactly once (found ${occurrences})`);
    writeFileSync(sourcePath, source.replace(find, replace), "utf8");

    const syntax = spawnSync("node", ["--check", sourcePath], { encoding: "utf8", shell: true });
    const suite = spawnSync("node", ["node_modules/vitest/vitest.mjs", "run", ...suites], {
      encoding: "utf8", shell: true,
    });
    writeFileSync(sourcePath, original);

    const syntaxValid = syntax.status === 0;
    const refused = syntaxValid && suite.status !== 0;
    if (refused) {
      caught += 1;
      console.log(`CAUGHT (syntax valid, assertion failed): ${name}`);
    } else {
      missed += 1;
      console.log(`MISSED${syntaxValid ? "" : " (INVALID SYNTAX)"}: ${name}`);
    }
  }
} finally {
  writeFileSync(sourcePath, original);
  const afterHash = hash(Buffer.from(readFileSync(sourcePath)));
  assert.equal(afterHash, beforeHash, "source must be restored byte-for-byte");
  console.log(`Restored SHA-256 ${afterHash}`);
}

console.log(`${caught}/${cases.length} caught; ${missed} inert.`);
if (missed > 0) {
  process.exitCode = 1;
}
