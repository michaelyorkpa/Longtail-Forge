import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Run explicitly, with no server or other verification reading this source concurrently.
// This harness is not a standing gate; it proves the checkpoint's new behavioral assertions.
const sourcePath = "public/js/user-settings.js";
const suites = ["tests/unit/user-settings-preferences-contracts.test.mjs"];
const original = Buffer.from(readFileSync(sourcePath));
const source = original.toString("utf8");
/** @param {Buffer} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const beforeHash = hash(original);

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the completion claims -----------------------------------------------------------------------
  ["a control reverts to an unchecked query",
    'const profileTimezoneSelect = findUserSettingsControl("[data-profile-timezone]", HTMLSelectElement);',
    'const profileTimezoneSelect = document.querySelector("[data-profile-timezone]");'],
  ["a control is narrowed past what the host renders",
    'const openExternalLinksNewTabToggle = findUserSettingsControl("[data-open-external-links-new-tab]", HTMLInputElement);',
    'const openExternalLinksNewTabToggle = findUserSettingsControl("[data-open-external-links-new-tab]", HTMLSelectElement);'],
  ["a cast replaces the checked lookup",
    'const workspaceRemovalDialog = findUserSettingsControl("[data-workspace-removal-dialog]", HTMLDialogElement);',
    'const workspaceRemovalDialog = /** @type {HTMLDialogElement} */ (document.querySelector("[data-workspace-removal-dialog]"));'],
  ["a second lookup helper appears",
    "function applyProfile(profile) {",
    "function findUserSettingsNode(selector) {\n  return document.querySelector(selector);\n}\n\nfunction applyProfile(profile) {"],
  ["a suppression is introduced",
    "function applyProfile(profile) {",
    "// @ts-expect-error deliberately added\nfunction applyProfile(profile) {"],
  ["the lookup stops checking the subtype",
    "  const element = document.querySelector(selector);\n  return element instanceof constructor ? element : null;",
    "  const element = document.querySelector(selector);\n  return element;"],
  ["the required narrowing stops refusing an absent control",
    "  if (value === null) {\n    throw new TypeError(`User Settings requires its ${name}.`);\n  }",
    "  if (false) {\n    throw new TypeError(`unreachable`);\n  }"],

  // --- the collection lookup, and the selector collision it removes -------------------------------------
  ["the collection stops filtering to the subtype it names",
    "  return [...document.querySelectorAll(selector)].filter(\n    /** @param {Element} element @returns {element is T} */ (element) => element instanceof constructor,\n  );",
    "  return [...document.querySelectorAll(selector)];"],
  ["the theme collections revert to an unchecked query",
    'const themeAutoSourceInputs = findUserSettingsControls("[data-theme-auto-source]", HTMLInputElement);',
    'const themeAutoSourceInputs = [...document.querySelectorAll("[data-theme-auto-source]")];'],
  ["the mode collection is narrowed past what the host renders",
    'const themeModeInputs = findUserSettingsControls("[data-theme-mode-option]", HTMLInputElement);',
    'const themeModeInputs = findUserSettingsControls("[data-theme-mode-option]", HTMLSelectElement);'],
  ["the two theme collections are crossed",
    'const themeModeInputs = findUserSettingsControls("[data-theme-mode-option]", HTMLInputElement);',
    'const themeModeInputs = findUserSettingsControls("[data-theme-auto-source]", HTMLInputElement);'],
  ["the selected mode stops requiring a checked input",
    "  return normalizeThemeMode(themeModeInputs.find((input) => input.checked)?.value);",
    "  return normalizeThemeMode(themeModeInputs[0]?.value);"],
  // **Withdrawn, and inert for a real reason rather than an unproven one.** Pointing
  // `getSelectedThemeAutoSource` at the other collection cannot change its answer, because
  // `normalizeThemeAutoSource` is `value === "system" ? "system" : "system"` - both branches
  // answer the same word, so no input it is given is distinguishable from any other. The auto
  // source has exactly one member today; collapsing that normalizer or widening the vocabulary
  // is a production change this checkpoint was not asked to make, so the case is withdrawn
  // rather than satisfied by editing the page.

  // --- the vocabularies -------------------------------------------------------------------------------
  ["an unknown landing word is accepted",
    '  return typeof value === "string" && ["dashboard", "workbench", "tasks", "notes", "lists"].includes(value)\n    ? value\n    : "dashboard";',
    '  return typeof value === "string" ? value : "dashboard";'],
  ["the landing fallback changes page",
    '    ? value\n    : "dashboard";',
    '    ? value\n    : "workbench";'],
  ["an unknown calendar view is accepted",
    '  return typeof value === "string" && ["day", "week", "month"].includes(value) ? value : null;',
    '  return typeof value === "string" ? value : null;'],
  ["the calendar view stops answering nothing for an unknown word",
    '["day", "week", "month"].includes(value) ? value : null;',
    '["day", "week", "month"].includes(value) ? value : "day";'],
  ["an unknown theme mode is accepted",
    '  return typeof value === "string" && ["light", "auto", "dark"].includes(value) ? value : "light";',
    '  return typeof value === "string" ? value : "light";'],
  ["the workspace type label reaches past its own members",
    "  const name = Object.hasOwn(names, workspaceType) ? names[workspaceType] : \"\";",
    "  const name = names[workspaceType];"],
  ["an unnamed workspace type stops falling back",
    '  return name || "Workspace";',
    "  return name;"],

  // --- the preference writers ---------------------------------------------------------------------------
  ["a landing preference is written to the other control",
    "  if (preferredWorkspaceSwitchLandingSelect) {\n    preferredWorkspaceSwitchLandingSelect.value = normalizeLandingPreference(\n      settings?.preferredWorkspaceSwitchLanding,\n    );\n  }",
    "  if (preferredWorkspaceSwitchLandingSelect) {\n    preferredWorkspaceSwitchLandingSelect.value = normalizeLandingPreference(\n      settings?.preferredLoginLanding,\n    );\n  }"],
  ["the login landing stops being applied",
    "  if (preferredLoginLandingSelect) {\n    preferredLoginLandingSelect.value = normalizeLandingPreference(settings?.preferredLoginLanding);\n  }",
    "  if (preferredLoginLandingSelect) {\n    void settings;\n  }"],
  ["the calendar view stops emptying for an absent preference",
    '    preferredCalendarViewSelect.value = normalizeCalendarViewPreference(settings?.preferredCalendarView) || "";',
    "    preferredCalendarViewSelect.value = normalizeCalendarViewPreference(settings?.preferredCalendarView);"],
  ["the markdown preference stops reaching the control",
    "  if (openExternalLinksNewTabToggle) {\n    openExternalLinksNewTabToggle.checked = openExternalLinksNewTab;\n  }",
    "  if (openExternalLinksNewTabToggle) {\n    void openExternalLinksNewTab;\n  }"],
  ["the markdown preference stops being remembered",
    '  window.localStorage.setItem(OPEN_EXTERNAL_LINKS_STORAGE_KEY, openExternalLinksNewTab ? "true" : "false");',
    "  void OPEN_EXTERNAL_LINKS_STORAGE_KEY;"],
  ["the markdown preference is remembered inverted",
    'openExternalLinksNewTab ? "true" : "false");',
    'openExternalLinksNewTab ? "false" : "true");'],
  ["a missing markdown preference is treated as enabled",
    "  const openExternalLinksNewTab = settings?.openExternalLinksNewTab === true;",
    "  const openExternalLinksNewTab = settings?.openExternalLinksNewTab !== false;"],

  // --- the profile --------------------------------------------------------------------------------------
  ["two profile fields swap",
    '  requireUserSettingsValue(profileUsernameInput, "username input").value = profile.username || "";\n  requireUserSettingsValue(profileDisplayNameInput, "display name input").value = profile.displayName || "";',
    '  requireUserSettingsValue(profileUsernameInput, "username input").value = profile.displayName || "";\n  requireUserSettingsValue(profileDisplayNameInput, "display name input").value = profile.username || "";'],
  ["an absent profile member writes undefined",
    '  requireUserSettingsValue(profileAltEmailInput, "alternate email input").value = profile.altEmail || "";',
    '  requireUserSettingsValue(profileAltEmailInput, "alternate email input").value = profile.altEmail;'],
  ["the profile stops setting the timezone",
    '  setTimezoneValue(profile.timezone || "America/New_York");',
    "  void profile.timezone;"],
  ["an address without a domain dot is accepted",
    "function isValidEmail(value) {",
    "function isValidEmail(value) {\n  return String(value || \"\").includes(\"@\");"],

  // --- the timezone control -------------------------------------------------------------------------------
  ["a zone the catalogue lacks stops being added",
    "  if (!matchingOption) {",
    "  if (false) {"],
  ["an already-offered zone is added a second time",
    "  if (!matchingOption) {",
    "  if (true) {"],
  ["the timezone control stops being selected",
    "  timezoneSelect.value = timezone;",
    "  void timezone;"],

  // --- workspace creation -----------------------------------------------------------------------------------
  ["the create form stays open with no available type",
    '  requireUserSettingsValue(workspaceCreateForm, "workspace create form").hidden = !hasAvailableTypes;',
    '  requireUserSettingsValue(workspaceCreateForm, "workspace create form").hidden = false;'],
  ["the create controls stay open with no available type",
    "  typeSelect.disabled = !hasAvailableTypes;\n  newWorkspaceNameField.disabled = !hasAvailableTypes;",
    "  typeSelect.disabled = false;\n  newWorkspaceNameField.disabled = false;"],
  ["the create button stays open with no available type",
    '  requireUserSettingsValue(createWorkspaceButton, "create workspace button").disabled = !hasAvailableTypes;',
    '  requireUserSettingsValue(createWorkspaceButton, "create workspace button").disabled = false;'],
  ["the type list is appended to rather than rebuilt",
    "  typeSelect.replaceChildren(...workspaceCreationTypes.map((type) => {",
    "  typeSelect.append(...workspaceCreationTypes.map((type) => {"],
  ["an option loses the default name the suggestion reads",
    '    option.dataset.defaultName = type.defaultName || "";',
    '    option.dataset.defaultName = "";'],
  ["an unlabelled type stops falling back to its word",
    "    option.textContent = type.label || type.workspaceType;",
    "    option.textContent = type.label;"],
  ["the first available type stops being selected",
    "    typeSelect.value = workspaceCreationTypes[0].workspaceType;",
    "    void workspaceCreationTypes[0];"],
  ["a malformed catalogue is taken as a list",
    "  workspaceCreationTypes = Array.isArray(workspaceCreation?.availableTypes)\n    ? workspaceCreation.availableTypes\n    : [];",
    "  workspaceCreationTypes = workspaceCreation?.availableTypes || [];"],
  ["the suggested name stops preferring the type's default",
    "  return workspaceType?.defaultName || workspaceType?.label || \"Workspace\";",
    "  return workspaceType?.label || \"Workspace\";"],

  // --- workspace access ----------------------------------------------------------------------------------------
  ["a membership with no identifier is kept",
    "    ? settings.workspaces.map(normalizeWorkspaceAccess).filter((workspace) => workspace.workspaceId)",
    "    ? settings.workspaces.map(normalizeWorkspaceAccess)"],
  ["a malformed membership list is taken as a list",
    "  currentWorkspaces = Array.isArray(settings?.workspaces)",
    "  currentWorkspaces = (settings?.workspaces || []).length >= 0"],
  ["the removal control stays open with no membership",
    "    openWorkspaceRemovalButton.disabled = currentWorkspaces.length === 0;",
    "    openWorkspaceRemovalButton.disabled = false;"],
  ["an unnamed membership stops being named",
    '    workspaceName: String(workspace.workspaceName || workspace.workspace_name || "Workspace"),',
    "    workspaceName: String(workspace.workspaceName || workspace.workspace_name || \"\"),"],
  ["a membership loses its default type",
    '    workspaceType: String(workspace.workspaceType || workspace.workspace_type || "business"),',
    "    workspaceType: String(workspace.workspaceType || workspace.workspace_type || \"\"),"],
  ["the export-recovery permission is read even when the producer never sent it",
    '  if (Object.hasOwn(settings || {}, "canEnterAccountExportRecovery")) {',
    "  if (true) {"],
  ["the export-recovery permission stops being exact",
    "    canEnterAccountExportRecovery = settings.canEnterAccountExportRecovery === true;",
    "    canEnterAccountExportRecovery = Boolean(settings.canEnterAccountExportRecovery);"],

  // --- workspace naming -------------------------------------------------------------------------------------------
  ["an existing workspace name stops being compared case-insensitively",
    '  return String(workspaceName || "").trim().toLowerCase();',
    '  return String(workspaceName || "").trim();'],
  ["an existing workspace name stops being trimmed",
    '  return String(workspaceName || "").trim().toLowerCase();',
    '  return String(workspaceName || "").toLowerCase();'],
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
