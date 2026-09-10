import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/**
 * User Admin's role assignments, typed by `0.33.33.44.9`.
 *
 * **`pendingRoleAssignments` is not `BrowserRoleAssignment[]`, and declaring it as one would have
 * been false.** The slot holds two kinds of row: assignments `readRoleAssignments` vouched for,
 * which carry `assignment_id`, `client_id` and `project_id`; and rows `addPendingRoleAssignment`
 * builds locally, which carry **none of those three**. Only four members are on every row.
 *
 * Those same four are exactly what the receiver reads. This slot is **sent** - `saveEditedUser`
 * PUTs it as `{ assignments }` - so its element type is a claim about an outgoing payload, and
 * the cases below check that claim against `normalizeAssignments` in the service rather than
 * against the record that happens to share the slot.
 */

const page = readFileSync(new URL("../../public/js/user-admin.js", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");
const markup = readFileSync(new URL("../../views/protected/user-admin.html", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");
const contracts = readFileSync(new URL("../../src/types/browser-contracts.d.ts", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");
const service = readFileSync(new URL("../../src/services/permissions.service.js", import.meta.url), "utf8")
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
  ["role-assignment-role", "roleAssignmentRoleSelect", "HTMLSelectElement", "select"],
  ["role-assignment-scope", "roleAssignmentScopeSelect", "HTMLSelectElement", "select"],
  ["add-role-assignment", "addRoleAssignmentButton", "HTMLButtonElement", "button"],
  ["role-assignment-list", "roleAssignmentList", "HTMLElement", "ul"],
];

/** The four members every row carries, and the three only a saved row does. */
const REQUIRED = ["role_id", "scope_type", "scope_id", "permission_overrides"];
const SAVED_ONLY = ["assignment_id", "client_id", "project_id"];

/**
 * The scope label as the page ships it, with a seeded client catalogue.
 * @type {(assignment: { scope_type: string, scope_id: string | null }) => string}
 */
const formatScopeLabel = new Function("seededClients", [
  "let clients = seededClients;",
  slice("  function formatScopeLabel(assignment) {"),
  "return formatScopeLabel;",
].join("\n"))([
  { id: "client-1", name: "Acme", projects: [{ id: "project-1", name: "Rollout" }] },
]);

describe("the slot's model is the outgoing payload, not the published record", () => {
  it("declares exactly the members every row carries", () => {
    const at = page.indexOf("}} PendingRoleAssignment");
    assert.notEqual(at, -1, "PendingRoleAssignment must be declared");
    const body = page.slice(page.lastIndexOf("@typedef {{", at), at);
    const required = [...body.matchAll(/^\s+\*\s+(\w+):/gm)].map((entry) => entry[1]);
    const optional = [...body.matchAll(/^\s+\*\s+(\w+)\?:/gm)].map((entry) => entry[1]);
    assert.deepEqual(required.filter((member) => !optional.includes(member)).sort(), [...REQUIRED].sort(),
      "the four on every row are required");
    assert.deepEqual(optional.sort(), [...SAVED_ONLY].sort(),
      "and the three only a saved row carries are optional");
    assert.ok(!/PendingRoleAssignment/.test(contracts), "the model stays local to this page");
  });

  it("is not the published assignment, because the local builder omits three of its members", () => {
    // This is the whole reason for a local model. `isRoleAssignment` requires all three.
    const validator = slice("  function isRoleAssignment(value) {");
    for (const member of SAVED_ONLY) {
      assert.match(validator, new RegExp(`value\\.${member}`), `isRoleAssignment requires ${member}`);
    }
    const built = slice("  function addPendingRoleAssignment() {");
    const pushed = built.slice(built.indexOf("pendingRoleAssignments.push({"));
    for (const member of SAVED_ONLY) {
      assert.ok(!pushed.includes(`${member}:`), `the locally built row carries no ${member}`);
    }
    for (const member of REQUIRED) {
      assert.ok(pushed.includes(`${member}:`), `but it does carry ${member}`);
    }
  });

  it("names the four the receiver actually reads, checked against the service", () => {
    // The claim is about an outgoing payload, so it is verified against the consumer.
    const normalizer = service.slice(service.indexOf("async function normalizeAssignments(session, assignments) {"));
    const body = normalizer.slice(0, normalizer.indexOf("\n}\n"));
    for (const member of ["role_id", "scope_type", "scope_id", "permission_overrides"]) {
      assert.match(body, new RegExp(`assignment\\.${member}`), `the service reads ${member} off each entry`);
    }
    assert.ok(!/assignment\.assignment_id/.test(body),
      "and never reads assignment_id, which is why the model does not require it");
    assert.match(body, /client_id: scopeType === "client" \? scopeId : null/,
      "the service derives client_id itself");
    assert.match(body, /project_id: scopeType === "project" \? scopeId : null/);
  });

  it("keeps permission_overrides unknown on the row", () => {
    const at = page.indexOf("}} PendingRoleAssignment");
    const body = page.slice(page.lastIndexOf("@typedef {{", at), at);
    assert.match(body, /permission_overrides: unknown,/,
      "a saved row carries whatever the server sent");
    assert.match(contracts, /permission_overrides: unknown;/,
      "which is what the published record says too");
    assert.match(slice("  function formatRoleAssignment(assignment) {"),
      /const overrides = normalizePermissionOverrides\(assignment\.permission_overrides\);/,
      "so the label normalises it rather than reading members off an unknown");
  });

  it("is sent as the payload this model describes", () => {
    assert.match(executable, /\{ assignments: pendingRoleAssignments \},/,
      "the slot is PUT as the assignments payload");
    assert.match(page, /\/\*\* @type \{PendingRoleAssignment\[\]\} \*\/\s*\n\s*let pendingRoleAssignments = \[\];/);
  });
});

describe("the two catalogues come from readers that vouch for them", () => {
  it("types the roles from the option validator", () => {
    assert.match(page, /@type \{BrowserRoleOption\[\]\}\s*\n\s*\*\/\s*\n\s*let roles = \[\];/);
    assert.match(executable, /roles = readRoleOptions\(rolesBody\);/);
    const validator = slice("  function isRoleOption(value) {");
    assert.match(validator, /ROLE_TEXT_MEMBERS\.every\(\(member\) => typeof value\[member\] === "string"\)/);
    assert.match(validator, /value\.scopes\.every\(isRoleScope\)/);
    assert.match(validator, /value\.role_id !== ""/);
  });

  it("types the client scopes from the scope validator", () => {
    assert.match(page, /@type \{BrowserUserAdminClientScope\[\]\}\s*\n\s*\*\/\s*\n\s*let clients = \[\];/);
    assert.match(executable, /clients = clientScopes;/);
    assert.match(slice("  function readClientProjectScopes(body) {"), /body\.clients\.every\(isClientScope\)/);
    assert.match(executable, /if \(!clientScopes \|\| !assignableWorkspaces/,
      "and a catalogue that cannot be read still refuses the whole bootstrap");
  });

  it("reads the saved assignments through the reader that validates them", () => {
    assert.match(executable, /pendingRoleAssignments = readRoleAssignments\(body\);/);
    assert.match(slice("  function readRoleAssignments(body) {"), /\.filter\(isRoleAssignment\)/);
  });
});

describe("the scope label reads only what a staged row can offer", () => {
  it("accepts a row that has no permission_overrides yet", () => {
    // `getDraftAssignment` answers three members; requiring the full model here would have been a
    // claim its own caller could not meet, which is how the structural minimum was found.
    assert.match(docFor("  function formatScopeLabel(assignment) {"),
      /@param \{\{ scope_type: string, scope_id: string \| null \}\} assignment/);
    const draft = slice("  function getDraftAssignment(role) {");
    assert.ok(!draft.includes("permission_overrides"), "the staged row genuinely lacks it");
    assert.match(executable, /formatScopeLabel\(getDraftAssignment\(role\)\)/, "and is passed straight in");
  });

  it("labels every scope kind, on a staged row", () => {
    assert.equal(formatScopeLabel({ scope_type: "all", scope_id: "all" }), "All");
    assert.equal(formatScopeLabel({ scope_type: "workspace", scope_id: "workspace" }), "Workspace");
    assert.equal(formatScopeLabel({ scope_type: "client", scope_id: "client-1" }), "Acme");
    assert.equal(formatScopeLabel({ scope_type: "client", scope_id: "missing" }), "Client",
      "an unresolvable client still labels rather than throwing");
    // A project labels through its client, exactly as `renderScopeOptions` builds the option text.
    assert.equal(formatScopeLabel({ scope_type: "project", scope_id: "project-1" }), "Acme / Rollout");
    assert.equal(formatScopeLabel({ scope_type: "project", scope_id: "missing" }), "Project",
      "and an unresolvable project falls back rather than throwing");
  });

  it("treats a scope_id of all as global regardless of the type", () => {
    assert.equal(formatScopeLabel({ scope_type: "client", scope_id: "all" }), "All",
      "the second half of that first condition is load-bearing");
  });
});

describe("the four controls and their required accesses", () => {
  it("matches the markup and reuses the shared helper", () => {
    for (const [dataset, slot, constructor, tag] of CONTROLS) {
      assert.equal(renderedTag(dataset), tag, `data-${dataset} is rendered as <${tag}>`);
      assert.ok(page.includes(`const ${slot} = findUserAdminControl("[data-${dataset}]", ${constructor});`),
        `${slot} must be acquired as ${constructor}`);
    }
    assert.equal([...page.matchAll(/function findUserAdminControl\(/g)].length, 1, "no new helper");
    assert.equal([...page.matchAll(/function requireUserAdminValue\(/g)].length, 1);
  });

  it("requires only this cluster's controls inside this cluster's functions", () => {
    const slots = new Set(CONTROLS.map(([, slot]) => slot));
    for (const opener of [
      "  function renderRoleOptions() {",
      "  function renderScopeOptions() {",
      "  function appendScopeOption(value, label) {",
      "  function addPendingRoleAssignment() {",
      "  function renderPendingRoleAssignments() {",
      "  function getDraftAssignment(role) {",
    ]) {
      const body = slice(opener).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/[^\n]*/g, "$1");
      for (const [, argument] of body.matchAll(/requireUserAdminValue\(([^,]+),/g)) {
        assert.ok(slots.has(argument.trim()),
          `${argument.trim()} in ${opener.trim()} is not one of this cluster's four controls`);
      }
    }
  });

  it("names the three bare bindings this cluster owns", () => {
    assert.match(executable, /requireUserAdminValue\(addRoleAssignmentButton, "add assignment button"\)\.addEventListener\("click"/);
    assert.match(executable, /requireUserAdminValue\(roleAssignmentRoleSelect, "role select"\)\.addEventListener\("change"/);
    assert.match(executable, /requireUserAdminValue\(configureDraftPermissionsButton, "configure permissions button"\)\.addEventListener\("click"/);
  });
});

describe("assignment behaviour this child must not have moved", () => {
  it("keeps the two refusals before a row is added", () => {
    // Each assertion pins the **guard**, not just its message: neutering `if (!role)` to
    // `if (false)` leaves the message in place, so a message-only check cannot see it.
    const body = slice("  function addPendingRoleAssignment() {");
    assert.match(body, /if \(!role\) \{\s*\n\s*setUserAdminStatus\("Choose a role before adding an assignment\.", true\);/);
    assert.match(body, /if \(scopeType !== "workspace" && !scopeId\) \{\s*\n\s*setUserAdminStatus\("Choose a scope before adding an assignment\.", true\);/);
    assert.match(body, /if \(alreadyAssigned\) \{\s*\n\s*setUserAdminStatus\("That role assignment is already listed\.", true\);/);
    assert.match(body, /assignment\.role_id === role\.role_id &&\s*\n\s*assignment\.scope_type === scopeType &&\s*\n\s*assignment\.scope_id === scopeId/,
      "and the duplicate test still compares all three");
  });

  it("keeps the draft overrides reset after a row is added", () => {
    const body = slice("  function addPendingRoleAssignment() {");
    assert.match(body, /permission_overrides: clonePermissionOverrides\(draftPermissionOverrides\),/);
    assert.match(body, /draftPermissionOverrides = createDefaultPermissionOverrides\(\);/,
      "so the next row starts from the defaults rather than inheriting the last one");
  });

  it("keeps the scope select driven by the role's assignable scope", () => {
    const body = slice("  function renderScopeOptions() {");
    assert.match(body, /scopeSelect\.disabled = scopeType === "workspace" \|\| scopeType === "global";/);
    assert.match(body, /if \(scopeType === "client"\) \{\s*\n\s*clients\.forEach\(\(client\) => appendScopeOption\(client\.id, client\.name\)\);/);
    assert.match(body, /appendScopeOption\(project\.id, `\$\{client\.name\} \/ \$\{project\.name\}`\)/,
      "and project scopes are still labelled through their client");
  });

  it("keeps the per-row permission edit replacing only that row", () => {
    const body = slice("  function renderPendingRoleAssignments() {");
    assert.match(body, /pendingRoleAssignments\[index\] = \{\s*\n\s*\.\.\.pendingRoleAssignments\[index\],\s*\n\s*permission_overrides: overrides,/,
      "the row is spread, so the other members survive the edit");
    assert.match(body, /pendingRoleAssignments\.splice\(index, 1\);/);
    assert.match(body, /emptyItem\.textContent = "No roles assigned\.";/);
  });

  it("adds no cast, suppression, any or namespace surface", () => {
    assert.ok(!/@ts-expect-error|@ts-ignore/.test(page), "no suppression");
    assert.ok(!/@type \{[^}]*\bany\b/.test(page), "nothing is typed any");
    assert.equal([...page.matchAll(/\*\/ \(/g)].length, 3,
      "the three casts in the element-checking readers predate this child, and none was added");
    assert.ok(!/LongtailForge\.\w+\s*=/.test(executable), "nothing is published");
  });

  it("leaves the clusters it does not own to their own children", () => {
    // Deliberately not a list of names: naming unconverted controls turns this into a maintenance
    // tax on every later child, which is exactly how the sibling suite broke when this one landed.
    const bare = [...page.matchAll(/= document\.querySelector\("\[data-/g)].length;
    assert.ok(bare > 0, "controls no landed child owns are still bare");
    // `userSessionList` left this list when `0.33.33.44.10` took ownership of it.
    assert.ok(!/requireUserAdminValue\((workspaceMembershipList|userList)/.test(executable),
      "and no control of an unowned cluster gained a required access here");
  });
});
