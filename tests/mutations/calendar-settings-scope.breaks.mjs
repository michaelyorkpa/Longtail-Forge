import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Run explicitly, with no server or other verification reading this source concurrently.
// This harness is not a standing gate; it proves the checkpoint's new behavioral assertions.
const sourcePath = "public/js/calendar-settings.js";
const suites = ["tests/unit/calendar-settings-scope-contracts.test.mjs"];
const original = Buffer.from(readFileSync(sourcePath));
const source = original.toString("utf8");
/** @param {Buffer} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const beforeHash = hash(original);

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the completion claims -----------------------------------------------------------------------
  ["a control reverts to an unchecked query",
    'const scopeSelect = findCalendarControl("[data-calendar-subscription-scope]", HTMLSelectElement);',
    'const scopeSelect = document.querySelector("[data-calendar-subscription-scope]");'],
  ["a control is narrowed past what the host renders",
    'const nameInput = findCalendarControl("[data-calendar-subscription-name]", HTMLInputElement);',
    'const nameInput = findCalendarControl("[data-calendar-subscription-name]", HTMLSelectElement);'],
  ["the secret field is narrowed past what the host renders",
    'const secretInput = findCalendarControl("[data-calendar-subscription-url]", HTMLInputElement);',
    'const secretInput = findCalendarControl("[data-calendar-subscription-url]", HTMLTextAreaElement);'],
  ["a cast replaces the checked lookup",
    'const createButton = findCalendarControl("[data-create-calendar-subscription]", HTMLButtonElement);',
    'const createButton = /** @type {HTMLButtonElement} */ (document.querySelector("[data-create-calendar-subscription]"));'],
  ["a suppression is introduced",
    "function renderScopeFields() {",
    "// @ts-expect-error deliberately added\nfunction renderScopeFields() {"],
  ["the lookup stops checking the subtype",
    "  const element = document.querySelector(selector);\n  return element instanceof constructor ? element : null;",
    "  const element = document.querySelector(selector);\n  return element;"],
  ["the required narrowing stops refusing an absent control",
    "  if (value === null) {\n    throw new TypeError(`Calendar Settings requires its ${name}.`);\n  }",
    "  if (false) {\n    throw new TypeError(`unreachable`);\n  }"],
  ["this cohort's status helper is swept away",
    'const createStatus = asStatusElement(document.querySelector("[data-calendar-subscription-create-status]"));',
    'const createStatus = findCalendarControl("[data-calendar-subscription-create-status]", HTMLElement);'],
  ["the rotate request starts sending a body",
    "/rotate`,\n      undefined,\n    ));",
    "/rotate`,\n      {},\n    ));"],

  // --- the scope fields -----------------------------------------------------------------------------
  ["the client field is shown for a workspace subscription",
    '    clientField.hidden = !usesBusinessScopes() || scopeType === "workspace";',
    "    clientField.hidden = !usesBusinessScopes();"],
  ["the client field is shown in a workspace with no clients",
    '    clientField.hidden = !usesBusinessScopes() || scopeType === "workspace";',
    '    clientField.hidden = scopeType === "workspace";'],
  ["the client field is hidden for a client subscription",
    '    clientField.hidden = !usesBusinessScopes() || scopeType === "workspace";',
    "    clientField.hidden = true;"],
  ["the project field is shown for every scope",
    '    projectField.hidden = scopeType !== "project";',
    "    projectField.hidden = false;"],
  ["the project field is hidden for a project subscription",
    '    projectField.hidden = scopeType !== "project";',
    "    projectField.hidden = true;"],
  ["the client picker stops being required for a client subscription",
    '    clientSelect.required = scopeType === "client";',
    "    clientSelect.required = false;"],
  ["the client picker is required for every scope",
    '    clientSelect.required = scopeType === "client";',
    "    clientSelect.required = true;"],
  ["the project picker stops being required for a project subscription",
    '    projectSelect.required = scopeType === "project";',
    "    projectSelect.required = false;"],
  ["the two required gates swap scopes",
    '    clientSelect.required = scopeType === "client";',
    '    clientSelect.required = scopeType === "project";'],
  ["a standing client choice survives a return to the workspace scope",
    '    if (scopeType === "workspace") {\n      clientSelect.value = "";\n    }',
    '    if (false) {\n      clientSelect.value = "";\n    }'],
  ["the client choice is cleared for every scope",
    '    if (scopeType === "workspace") {\n      clientSelect.value = "";\n    }',
    '    if (true) {\n      clientSelect.value = "";\n    }'],
  ["the workspace type stops deciding whether clients exist",
    '  return state.workspaceType === "business";',
    "  return true;"],

  // --- the option lists -------------------------------------------------------------------------------
  ["the empty client label stops naming the scope",
    '  const emptyLabel = scopeSelect?.value === "project"\n    ? "All readable projects"\n    : "Choose a client";',
    '  const emptyLabel = "Choose a client";'],
  ["the two empty client labels swap",
    '  const emptyLabel = scopeSelect?.value === "project"\n    ? "All readable projects"\n    : "Choose a client";',
    '  const emptyLabel = scopeSelect?.value === "project"\n    ? "Choose a client"\n    : "All readable projects";'],
  ["the client list is appended to rather than rebuilt",
    "  clientSelect.replaceChildren(\n    option(\"\", emptyLabel),",
    "  clientSelect.append(\n    option(\"\", emptyLabel),"],
  ["a still-offered client is dropped on repaint",
    "  clientSelect.value = [...clientSelect.options].some((entry) => entry.value === previousValue)\n    ? previousValue\n    : \"\";",
    '  clientSelect.value = "";'],
  ["a client the catalogue no longer offers is kept",
    "  clientSelect.value = [...clientSelect.options].some((entry) => entry.value === previousValue)\n    ? previousValue\n    : \"\";",
    "  clientSelect.value = previousValue;"],
  ["the combined project list stops naming where each project came from",
    "      project.groupLabel ? `${project.groupLabel} / ${project.label}` : project.label,",
    "      project.label,"],
  ["the workspace projects lose their group",
    '        ...state.workspaceProjects.map((project) => ({ ...project, groupLabel: "Workspace" })),',
    "        ...state.workspaceProjects.map((project) => ({ ...project })),"],
  ["a client's projects lose their group",
    "          groupLabel: client.label,",
    '          groupLabel: "",'],
  ["a chosen client stops narrowing the project list",
    "  const projects = selectedClientId\n    ? state.clients.find((client) => client.id === selectedClientId)?.projects || []",
    "  const projects = false\n    ? state.clients.find((client) => client.id === selectedClientId)?.projects || []"],
  ["an unreadable project list stops saying so",
    '    option("", projects.length > 0 ? "Choose a project" : "No readable projects"),',
    '    option("", "Choose a project"),'],

  // --- the create payload --------------------------------------------------------------------------------
  ["the subscription name stops being trimmed",
    '  const name = String(nameInput?.value || "").trim();',
    '  const name = String(nameInput?.value || "");'],
  ["an unnamed subscription is created anyway",
    "  if (!name) {",
    "  if (false) {"],
  ["the scope stops defaulting to the workspace",
    'const name = String(nameInput?.value || "").trim();\n  const scopeType = String(scopeSelect?.value || "workspace");',
    'const name = String(nameInput?.value || "").trim();\n  const scopeType = String(scopeSelect?.value || "");'],
  ["a client subscription stops carrying its client",
    '  if (scopeType === "client") {\n    payload.clientId = String(clientSelect?.value || "");',
    '  if (false) {\n    payload.clientId = String(clientSelect?.value || "");'],
  ["a client subscription is created with no client chosen",
    "    if (!payload.clientId) {",
    "    if (false) {"],
  ["a project subscription stops carrying its project",
    '  if (scopeType === "project") {\n    payload.projectId = String(projectSelect?.value || "");',
    '  if (false) {\n    payload.projectId = String(projectSelect?.value || "");'],
  ["a project subscription is created with no project chosen",
    "    if (!payload.projectId) {",
    "    if (false) {"],
  ["a workspace subscription starts carrying a client",
    "  const payload = { name, scopeType };",
    '  const payload = { name, scopeType, clientId: "" };'],
  ["the two refusal messages swap",
    '      setStatus(createStatus, "Choose a client.", { type: "error" });',
    '      setStatus(createStatus, "Choose a project.", { type: "error" });'],

  // --- the normalizers -------------------------------------------------------------------------------------
  ["a subscription with no identifier is kept",
    "  })).filter((subscription) => subscription.subscriptionId) : [];",
    "  })) : [];"],
  ["an unnamed subscription stops being named",
    '    name: String(subscription?.name || "Unnamed subscription"),',
    "    name: String(subscription?.name || \"\"),"],
  ["an unreadable status is taken as active",
    '    status: String(subscription?.status || "revoked"),',
    '    status: String(subscription?.status || "active"),'],
  ["an unreadable owner stops being named",
    '    ownerLabel: String(subscription?.owner?.displayName || subscription?.owner?.username || "Unavailable user"),',
    "    ownerLabel: String(subscription?.owner?.displayName || \"\"),"],
  ["the owner label stops preferring the display name",
    "subscription?.owner?.displayName || subscription?.owner?.username",
    "subscription?.owner?.username || subscription?.owner?.displayName"],
  ["an unreadable scope stops being named",
    '    scopeLabel: String(subscription?.scope?.label || "Unavailable scope"),',
    "    scopeLabel: String(subscription?.scope?.label || \"\"),"],
  ["ownership stops being exact",
    "    ownedByCurrentUser: subscription?.ownedByCurrentUser === true,",
    "    ownedByCurrentUser: Boolean(subscription?.ownedByCurrentUser),"],
  ["a non-list of subscriptions is taken as a list",
    "  return Array.isArray(subscriptions) ? subscriptions.map((subscription) => ({",
    "  return (subscriptions || []).length >= 0 ? [...subscriptions].map((subscription) => ({"],
  ["a client with no identifier is kept",
    "  })).filter((client) => client.id) : [];",
    "  })) : [];"],
  ["a project with no identifier is kept",
    "  })).filter((project) => project.id) : [];",
    "  })) : [];"],
  ["an untitled client stops being named",
    '    label: String(client?.name || "Untitled Client"),',
    "    label: String(client?.name || \"\"),"],
  ["an unknown workspace word is accepted",
    '  return ["business", "personal", "family"].includes(workspaceType)\n    ? workspaceType\n    : "business";',
    "  return workspaceType;"],
  ["the workspace word stops being normalized",
    '  const workspaceType = String(value || "").trim().toLowerCase();',
    '  const workspaceType = String(value || "");'],

  // --- the row presentation -----------------------------------------------------------------------------------
  ["any status other than revoked reads as active",
    '  return status === "active" ? "Active" : "Revoked";',
    '  return status === "revoked" ? "Revoked" : "Active";'],
  ["an empty cell stops being dashed",
    '  element.textContent = value || "—";',
    "  element.textContent = value;"],
  ["an absent date stops being dashed",
    '  return value ? new Date(value).toLocaleString() : "—";',
    "  return new Date(value).toLocaleString();"],
  ["a row button loses the action it carries",
    "  button.dataset.calendarSubscriptionAction = actionName;",
    '  button.dataset.calendarSubscriptionAction = "";'],
  ["a row button loses the subscription it acts on",
    "  button.dataset.subscriptionId = subscriptionId;",
    '  button.dataset.subscriptionId = "";'],
  ["a row button stops being a plain button",
    '  button.type = "button";',
    '  button.type = "submit";'],
  ["a gated row button opens",
    "  button.disabled = options.disabled === true;",
    "  button.disabled = false;"],
  ["every row button becomes a danger action",
    "  if (options.danger) {",
    "  if (true) {"],
  ["an acknowledgment's name stops being read",
    "  const name = /** @type {Record<string, unknown>} */ (subscription).name;\n  return name ? String(name) : \"This subscription\";",
    '  return "This subscription";'],
  ["the acknowledgment reader stops reading own members only",
    '  if (typeof subscription !== "object" || subscription === null || !Object.hasOwn(subscription, "name")) {',
    '  if (typeof subscription !== "object" || subscription === null) {'],
  ["focus is restored to an element that cannot take it",
    "  if (element instanceof HTMLElement) {\n    element.focus();\n  }",
    "  element?.focus();"],
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
