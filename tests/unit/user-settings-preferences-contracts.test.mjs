import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const reader = createProjectTextReader();
const source = reader.readText("public/js/user-settings.js");

const LIFTED = [
  "findUserSettingsControl", "findUserSettingsControls", "requireUserSettingsValue",
  "applyAppPreferences", "applyMarkdownRendering", "applyProfile", "applyWorkspaceCreation",
  "applyWorkspaceAccess", "setTimezoneValue", "normalizeLandingPreference",
  "normalizeCalendarViewPreference", "normalizeWorkspaceAccess", "normalizeWorkspaceName",
  "normalizeThemeMode", "normalizeThemeAutoSource", "getSelectedThemeMode",
  "getSelectedThemeAutoSource", "formatWorkspaceType", "workspaceNameExists",
  "getWorkspaceTypeSuggestedName", "isValidEmail", "resolveThemeMode",
];

const CONTROLS = [
  ["preferredLoginLandingSelect", "[data-preferred-login-landing]", "select", "HTMLSelectElement"],
  ["preferredWorkspaceSwitchLandingSelect", "[data-preferred-workspace-switch-landing]", "select", "HTMLSelectElement"],
  ["preferredCalendarViewSelect", "[data-preferred-calendar-view]", "select", "HTMLSelectElement"],
  ["openExternalLinksNewTabToggle", "[data-open-external-links-new-tab]", "input", "HTMLInputElement"],
  ["profileUsernameInput", "[data-profile-username]", "input", "HTMLInputElement"],
  ["profileDisplayNameInput", "[data-profile-display-name]", "input", "HTMLInputElement"],
  ["profileAltEmailInput", "[data-profile-alt-email]", "input", "HTMLInputElement"],
  ["profileTimezoneSelect", "[data-profile-timezone]", "select", "HTMLSelectElement"],
  ["newWorkspaceTypeSelect", "[data-new-workspace-type]", "select", "HTMLSelectElement"],
  ["newWorkspaceNameInput", "[data-new-workspace-name]", "input", "HTMLInputElement"],
  ["createWorkspaceButton", "[data-create-workspace]", "button", "HTMLButtonElement"],
  ["workspaceCreateForm", "[data-workspace-create-form]", "form", "HTMLFormElement"],
  ["openWorkspaceRemovalButton", "[data-open-workspace-removal]", "button", "HTMLButtonElement"],
];

/** @param {{ omit?: string[], themeModes?: string[], autoSources?: string[] }} [options] */
function settingsCase(options = {}) {
  const omit = new Set(options.omit || []);
  const document = new FakeDocument();

  for (const [, selector, tag] of CONTROLS) {
    if (omit.has(selector)) continue;
    const element = document.createElement(tag);
    element.setAttribute(selector.slice(1, -1), "");
    document.body.appendChild(element);
  }

  // The radio collections, plus the `<html>` element the theme writer marks with the same
  // attribute - which is exactly the collision the checked collection lookup filters out.
  for (const value of options.themeModes || ["light", "auto", "dark"]) {
    const input = document.createElement("input");
    input.setAttribute("data-theme-mode-option", "");
    input.value = value;
    document.body.appendChild(input);
  }
  const documentElement = document.createElement("html");
  documentElement.setAttribute("data-theme-auto-source", "system");
  document.body.appendChild(documentElement);
  for (const value of options.autoSources || ["system"]) {
    const input = document.createElement("input");
    input.setAttribute("data-theme-auto-source", "");
    input.value = value;
    document.body.appendChild(input);
  }

  const storage = new Map();
  const context = vm.createContext({
    document,
    ...fakeDomConstructors(),
    window: {
      localStorage: {
        /** @param {string} key @param {string} value */
        setItem: (key, value) => storage.set(key, value),
        /** @param {string} key */
        getItem: (key) => storage.get(key) ?? null,
      },
      LongtailForge: {},
    },
    workspaceCreationTypes: [],
    currentWorkspaces: [],
    activeWorkspaceId: "",
    canEnterAccountExportRecovery: false,
    lastSuggestedWorkspaceName: "",
    workspaceNameEditedByUser: false,
    OPEN_EXTERNAL_LINKS_STORAGE_KEY: "lf_open_external_links_new_tab",
    requireTimezones: () => ({
      /** @param {Date} _date @param {string} timezone */
      formatUtcOffset: (_date, timezone) => `offset:${timezone}`,
    }),
    setSuggestedWorkspaceName: () => {},
    renderCreateWorkspaceModuleSettings: () => {},
    getAvailableWorkspaceName: (/** @type {string} */ name) => name,
    renderUserSettingsContributions: () => {},
  });

  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), context);
  for (const [name, selector, , constructor] of CONTROLS) {
    vm.runInContext(`var ${name} = findUserSettingsControl(${JSON.stringify(selector)}, ${constructor});`, context);
  }
  vm.runInContext('var themeModeInputs = findUserSettingsControls("[data-theme-mode-option]", HTMLInputElement);', context);
  vm.runInContext('var themeAutoSourceInputs = findUserSettingsControls("[data-theme-auto-source]", HTMLInputElement);', context);
  vm.runInContext('var newWorkspaceNameField = requireUserSettingsValue(newWorkspaceNameInput, "new workspace name input");', context);

  const api = vm.runInContext(`({ ${LIFTED.join(", ")} })`, context);
  /** @param {string} selector */
  const control = (selector) => document.querySelector(selector);
  return { api, context, document, control, documentElement, storage };
}

describe("User Settings control acquisition", () => {
  it("acquires every control through the checked lookup at the subtype the host renders", () => {
    const DECLARED = [
      ["themeForm", "[data-user-theme-form]", "HTMLFormElement"],
      ["preferredLoginLandingSelect", "[data-preferred-login-landing]", "HTMLSelectElement"],
      ["openExternalLinksNewTabToggle", "[data-open-external-links-new-tab]", "HTMLInputElement"],
      ["savePasswordButton", "[data-save-password]", "HTMLButtonElement"],
      ["workspaceRemovalDialog", "[data-workspace-removal-dialog]", "HTMLDialogElement"],
      ["profileTimezoneSelect", "[data-profile-timezone]", "HTMLSelectElement"],
      ["notificationPreferenceList", "[data-user-notification-preference-list]", "HTMLElement"],
    ];

    for (const [name, selector, constructor] of DECLARED) {
      const expected = `const ${name} = findUserSettingsControl("${selector}", ${constructor});`;
      assert.equal(source.includes(expected), true, `${name} must be acquired as ${expected}`);
    }

    // The two radio collections go through the collection lookup at the same subtype. This is a
    // source fact rather than a fixture one: the lifted cases build their own collections, so a
    // change to these declaration lines is invisible to them.
    for (const [name, selector] of [
      ["themeModeInputs", "[data-theme-mode-option]"],
      ["themeAutoSourceInputs", "[data-theme-auto-source]"],
    ]) {
      const expected = `const ${name} = findUserSettingsControls("${selector}", HTMLInputElement);`;
      assert.equal(source.includes(expected), true, `${name} must be acquired as ${expected}`);
    }
  });

  /** The lookup answers null for a control the host rendered at another subtype. */
  it("refuses a control rendered at a subtype the page did not ask for", () => {
    const testCase = settingsCase({ omit: ["[data-profile-username]"] });
    const wrong = testCase.document.createElement("div");
    wrong.setAttribute("data-profile-username", "");
    testCase.document.body.appendChild(wrong);

    const control = testCase.api.findUserSettingsControl("[data-profile-username]", testCase.context.HTMLInputElement);

    assert.equal(control, null);
    assert.throws(() => testCase.api.requireUserSettingsValue(control, "username input"), {
      name: "TypeError",
      message: "User Settings requires its username input.",
    });
  });

  /**
   * This page keeps its cohort's status helper. `0.33.33.38.3.1` retired that idiom in
   * `workspace-settings.js` **alone**, and `workspace-deletion-dialog-dom-contracts` pins that
   * scope - so the claim is that every *other* control goes through the checked lookup.
   */
  it("queries the document only for its status node, and keeps that cohort's helper", () => {
    // `querySelectorAll` contains the same substring, so the four sites are named instead of counted loosely.
    assert.equal(source.split("document.querySelector").length - 1, 4);
    assert.equal(source.split("document.querySelectorAll").length - 1, 1);
    assert.equal(source.includes('asStatusElement(document.querySelector("[data-user-settings-status]"))'), true);
    assert.equal(source.includes("const element = document.querySelector(selector);"), true);
    assert.equal(source.includes("root: document.querySelector(\"[data-settings-host='user']\")"), true);
    for (const suppression of ["@ts-expect-error", "@ts-ignore", "eslint-disable"]) {
      assert.equal(source.includes(suppression), false, `${suppression} must not appear`);
    }
  });

  it("fails at the access that already dereferenced a missing control, by name", () => {
    const testCase = settingsCase({ omit: ["[data-profile-username]"] });

    assert.throws(() => testCase.api.applyProfile({ username: "ada@example.com" }), {
      name: "TypeError",
      message: "User Settings requires its username input.",
    });
  });
});

describe("User Settings theme collections", () => {
  /**
   * `applyThemeMode` writes `data-theme-auto-source` onto the document element as theme state,
   * so the bare selector matched `<html>` as well as the radio. The checked collection keeps
   * only what the name claims.
   */
  it("collects only the inputs, not the document element carrying the same attribute", () => {
    const testCase = settingsCase();

    assert.equal(testCase.context.themeAutoSourceInputs.length, 1);
    assert.equal(testCase.context.themeAutoSourceInputs[0].tagName, "INPUT");
    assert.equal(testCase.context.themeModeInputs.length, 3);
    for (const input of testCase.context.themeModeInputs) {
      assert.equal(input.tagName, "INPUT");
    }
  });

  it("reads the selected mode and auto source from the checked input", () => {
    const testCase = settingsCase();
    testCase.context.themeModeInputs[1].checked = true;
    testCase.context.themeAutoSourceInputs[0].checked = true;

    assert.equal(testCase.api.getSelectedThemeMode(), "auto");
    assert.equal(testCase.api.getSelectedThemeAutoSource(), "system");
  });

  it("falls back to the default word when nothing is checked or the word is unknown", () => {
    const testCase = settingsCase();

    assert.equal(testCase.api.getSelectedThemeMode(), "light");
    assert.equal(testCase.api.normalizeThemeMode("sideways"), "light");
    assert.equal(testCase.api.normalizeThemeMode(7), "light");
    assert.equal(testCase.api.normalizeThemeMode("dark"), "dark");
    assert.equal(testCase.api.normalizeThemeAutoSource("nonsense"), "system");
  });

  it("resolves auto against the system only when the source says so", () => {
    const testCase = settingsCase();

    assert.equal(testCase.api.resolveThemeMode("dark"), "dark");
    assert.equal(testCase.api.resolveThemeMode("light"), "light");
  });
});

describe("User Settings preference application", () => {
  it("writes each landing preference to its own control", () => {
    const testCase = settingsCase();

    testCase.api.applyAppPreferences({
      preferredLoginLanding: "tasks",
      preferredWorkspaceSwitchLanding: "notes",
      preferredCalendarView: "week",
    });

    assert.equal(testCase.control("[data-preferred-login-landing]").value, "tasks");
    assert.equal(testCase.control("[data-preferred-workspace-switch-landing]").value, "notes");
    assert.equal(testCase.control("[data-preferred-calendar-view]").value, "week");
  });

  it("falls back to the dashboard for a word outside the vocabulary", () => {
    const testCase = settingsCase();

    testCase.api.applyAppPreferences({ preferredLoginLanding: "nowhere", preferredCalendarView: "century" });

    assert.equal(testCase.control("[data-preferred-login-landing]").value, "dashboard");
    assert.equal(testCase.control("[data-preferred-calendar-view]").value, "");
  });

  it("treats a non-string preference as absent rather than accepting it", () => {
    const testCase = settingsCase();

    assert.equal(testCase.api.normalizeLandingPreference(4), "dashboard");
    assert.equal(testCase.api.normalizeLandingPreference(null), "dashboard");
    assert.equal(testCase.api.normalizeCalendarViewPreference(4), null);
    assert.equal(testCase.api.normalizeCalendarViewPreference("day"), "day");
  });

  it("mirrors the markdown preference into the control and into storage", () => {
    const testCase = settingsCase();

    testCase.api.applyMarkdownRendering({ openExternalLinksNewTab: true });

    assert.equal(testCase.control("[data-open-external-links-new-tab]").checked, true);
    assert.equal(testCase.storage.get("lf_open_external_links_new_tab"), "true");

    testCase.api.applyMarkdownRendering({});

    assert.equal(testCase.control("[data-open-external-links-new-tab]").checked, false);
    assert.equal(testCase.storage.get("lf_open_external_links_new_tab"), "false");
  });

  it("writes the profile into the three fields the save reads back", () => {
    const testCase = settingsCase();

    testCase.api.applyProfile({
      username: "ada@example.com",
      displayName: "Ada Lovelace",
      altEmail: "ada@home.example",
      timezone: "Europe/London",
    });

    assert.equal(testCase.control("[data-profile-username]").value, "ada@example.com");
    assert.equal(testCase.control("[data-profile-display-name]").value, "Ada Lovelace");
    assert.equal(testCase.control("[data-profile-alt-email]").value, "ada@home.example");
    assert.equal(testCase.control("[data-profile-timezone]").value, "Europe/London");
  });

  it("names an empty profile member rather than writing undefined", () => {
    const testCase = settingsCase();

    testCase.api.applyProfile({ username: "", displayName: "", altEmail: "", timezone: "UTC" });

    assert.equal(testCase.control("[data-profile-username]").value, "");
    assert.equal(testCase.control("[data-profile-alt-email]").value, "");

    // A member the producer omitted entirely must still write an empty field, not `undefined`.
    const absent = settingsCase();
    absent.api.applyProfile({ username: "ada@example.com", timezone: "UTC" });
    assert.equal(absent.control("[data-profile-alt-email]").value, "");
    assert.equal(absent.control("[data-profile-display-name]").value, "");
  });
});

describe("User Settings timezone control", () => {
  it("adds the account's zone when the catalogue does not already offer it", () => {
    const testCase = settingsCase();

    testCase.api.setTimezoneValue("Pacific/Auckland");

    const select = testCase.control("[data-profile-timezone]");
    assert.equal(select.options.length, 1);
    assert.equal(select.options[0].value, "Pacific/Auckland");
    assert.match(select.options[0].textContent, /Pacific\/Auckland \(offset:Pacific\/Auckland\)/);
    assert.equal(select.value, "Pacific/Auckland");
  });

  it("selects an already-offered zone without adding it twice", () => {
    const testCase = settingsCase();
    const select = testCase.control("[data-profile-timezone]");
    const option = testCase.document.createElement("option");
    option.value = "UTC";
    select.appendChild(option);

    testCase.api.setTimezoneValue("UTC");

    assert.equal(select.options.length, 1);
    assert.equal(select.value, "UTC");
  });
});

describe("User Settings workspace creation", () => {
  const types = [
    { workspaceType: "business", label: "Business", defaultName: "My Business" },
    { workspaceType: "personal", label: "Personal", defaultName: "" },
  ];

  it("offers every available type and opens the form", () => {
    const testCase = settingsCase();

    testCase.api.applyWorkspaceCreation({ availableTypes: types });

    const select = testCase.control("[data-new-workspace-type]");
    assert.deepEqual(select.options.map((option) => option.value), ["business", "personal"]);
    assert.deepEqual(select.options.map((option) => option.textContent), ["Business", "Personal"]);
    assert.equal(select.options[0].dataset.defaultName, "My Business");
    assert.equal(testCase.control("[data-workspace-create-form]").hidden, false);
    assert.equal(select.disabled, false);
    assert.equal(testCase.control("[data-new-workspace-name]").disabled, false);
    assert.equal(testCase.control("[data-create-workspace]").disabled, false);
    assert.equal(select.value, "business");
  });

  it("rebuilds the type list on a repaint rather than accumulating a second copy", () => {
    const testCase = settingsCase();

    testCase.api.applyWorkspaceCreation({ availableTypes: types });
    testCase.api.applyWorkspaceCreation({ availableTypes: types });

    assert.equal(testCase.control("[data-new-workspace-type]").options.length, 2);
  });

  it("names an unlabelled type by its own word", () => {
    const testCase = settingsCase();

    testCase.api.applyWorkspaceCreation({
      availableTypes: [{ workspaceType: "family", label: "", defaultName: "" }],
    });

    assert.equal(testCase.control("[data-new-workspace-type]").options[0].textContent, "family");
  });

  it("refuses a catalogue that is not a list", () => {
    const testCase = settingsCase();

    testCase.api.applyWorkspaceCreation({ availableTypes: "business,personal" });

    assert.equal(testCase.context.workspaceCreationTypes.length, 0);
    assert.equal(testCase.control("[data-workspace-create-form]").hidden, true);
  });

  it("closes the whole form when no type is available", () => {
    const testCase = settingsCase();

    testCase.api.applyWorkspaceCreation({ availableTypes: [] });

    assert.equal(testCase.control("[data-workspace-create-form]").hidden, true);
    assert.equal(testCase.control("[data-new-workspace-type]").disabled, true);
    assert.equal(testCase.control("[data-new-workspace-name]").disabled, true);
    assert.equal(testCase.control("[data-create-workspace]").disabled, true);
  });

  it("closes the form when the catalogue is missing entirely", () => {
    const testCase = settingsCase();

    testCase.api.applyWorkspaceCreation(undefined);

    assert.equal(testCase.control("[data-workspace-create-form]").hidden, true);
    assert.equal(testCase.context.workspaceCreationTypes.length, 0);
  });

  it("prefers a type's default name and falls back to its label", () => {
    const testCase = settingsCase();

    assert.equal(testCase.api.getWorkspaceTypeSuggestedName(types[0]), "My Business");
    assert.equal(testCase.api.getWorkspaceTypeSuggestedName(types[1]), "Personal");
    assert.equal(testCase.api.getWorkspaceTypeSuggestedName(undefined), "Workspace");
  });
});

describe("User Settings workspace access", () => {
  it("normalizes each membership and drops one with no identifier", () => {
    const testCase = settingsCase();

    testCase.api.applyWorkspaceAccess({
      activeWorkspaceId: "w1",
      workspaces: [
        { workspace_id: "w1", workspace_name: "Primary", workspace_type: "business", status: "active" },
        { workspace_id: "", workspace_name: "Nameless", workspace_type: "business", status: "active" },
      ],
    });

    assert.equal(testCase.context.activeWorkspaceId, "w1");
    assert.equal(testCase.context.currentWorkspaces.length, 1);
    assert.equal(testCase.context.currentWorkspaces[0].workspaceName, "Primary");
    assert.equal(testCase.control("[data-open-workspace-removal]").disabled, false);
  });

  it("refuses a membership list that is not a list", () => {
    const testCase = settingsCase();

    testCase.api.applyWorkspaceAccess({ activeWorkspaceId: "w1", workspaces: "w1,w2" });

    assert.equal(testCase.context.currentWorkspaces.length, 0);
  });

  it("closes the removal control when no membership remains", () => {
    const testCase = settingsCase();

    testCase.api.applyWorkspaceAccess({ activeWorkspaceId: "", workspaces: [] });

    assert.equal(testCase.control("[data-open-workspace-removal]").disabled, true);
  });

  it("reads the export-recovery permission only when the producer sent it", () => {
    const granted = settingsCase();
    granted.api.applyWorkspaceAccess({ activeWorkspaceId: "w1", workspaces: [], canEnterAccountExportRecovery: true });
    assert.equal(granted.context.canEnterAccountExportRecovery, true);

    const silent = settingsCase();
    silent.context.canEnterAccountExportRecovery = true;
    silent.api.applyWorkspaceAccess({ activeWorkspaceId: "w1", workspaces: [] });
    assert.equal(silent.context.canEnterAccountExportRecovery, true, "a body that never mentions it leaves it alone");

    // A server permission result is the word `true`, not anything that merely looks like it.
    const loose = settingsCase();
    loose.api.applyWorkspaceAccess({ activeWorkspaceId: "w1", workspaces: [], canEnterAccountExportRecovery: "yes" });
    assert.equal(loose.context.canEnterAccountExportRecovery, false);
  });

  it("names a membership that arrives without one and defaults its type", () => {
    const testCase = settingsCase();

    const normalized = testCase.api.normalizeWorkspaceAccess({ workspace_id: "w9" });

    assert.equal(normalized.workspaceName, "Workspace");
    assert.equal(normalized.workspaceType, "business");
    assert.equal(normalized.status, "active");
  });
});

describe("User Settings workspace naming", () => {
  it("compares names without case or surrounding space", () => {
    const testCase = settingsCase();
    testCase.context.currentWorkspaces = [{ workspaceName: "Acme Supply" }];

    assert.equal(testCase.api.workspaceNameExists("  acme supply "), true);
    assert.equal(testCase.api.workspaceNameExists("Acme Supplies"), false);
    assert.equal(testCase.api.normalizeWorkspaceName("  Mixed Case  "), "mixed case");
  });

  it("names each workspace type and falls back for an unknown word", () => {
    const testCase = settingsCase();

    assert.equal(testCase.api.formatWorkspaceType("business"), "Business");
    assert.equal(testCase.api.formatWorkspaceType("family"), "Family");
    assert.equal(testCase.api.formatWorkspaceType("unheard-of"), "Workspace");
    assert.equal(testCase.api.formatWorkspaceType("constructor"), "Workspace");
  });

  it("accepts an address only with a local part, an at sign and a dotted domain", () => {
    const testCase = settingsCase();

    assert.equal(testCase.api.isValidEmail("ada@example.com"), true);
    assert.equal(testCase.api.isValidEmail("ada@example"), false);
    assert.equal(testCase.api.isValidEmail("ada example.com"), false);
    assert.equal(testCase.api.isValidEmail(""), false);
  });
});
