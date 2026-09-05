(function attachUserSettingsPage() {
// User settings owns per-user preferences and password changes for the signed-in account.
const THEME_STORAGE_KEY = "lf_theme";
const THEME_AUTO_SOURCE_STORAGE_KEY = "lf_theme_auto_source";
const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";
const OPEN_EXTERNAL_LINKS_STORAGE_KEY = "lf_open_external_links_new_tab";
const themeForm = document.querySelector("[data-user-theme-form]");
const themeModeInputs = [...document.querySelectorAll("[data-theme-mode-option]")];
const themeAutoSourceControls = document.querySelector("[data-theme-auto-source-controls]");
const themeAutoSourceInputs = [...document.querySelectorAll("[data-theme-auto-source]")];
const markdownRenderingForm = document.querySelector("[data-user-markdown-rendering-form]");
const openExternalLinksNewTabToggle = document.querySelector("[data-open-external-links-new-tab]");
const preferredLoginLandingSelect = document.querySelector("[data-preferred-login-landing]");
const preferredWorkspaceSwitchLandingSelect = document.querySelector("[data-preferred-workspace-switch-landing]");
const preferredCalendarViewSelect = document.querySelector("[data-preferred-calendar-view]");
const passwordForm = document.querySelector("[data-user-password-form]");
const currentPasswordInput = document.querySelector("[data-current-password]");
const newPasswordInput = document.querySelector("[data-new-password]");
const confirmPasswordInput = document.querySelector("[data-confirm-password]");
const savePasswordButton = document.querySelector("[data-save-password]");
const profileForm = document.querySelector("[data-user-profile-form]");
const profileUsernameInput = document.querySelector("[data-profile-username]");
const profileDisplayNameInput = document.querySelector("[data-profile-display-name]");
const profileAltEmailInput = document.querySelector("[data-profile-alt-email]");
const profileTimezoneSelect = document.querySelector("[data-profile-timezone]");
const notificationPreferencesForm = document.querySelector("[data-user-notification-preferences-form]");
const notificationGroupingPreferences = document.querySelector("[data-user-notification-grouping-preferences]");
const notificationPreferenceList = document.querySelector("[data-user-notification-preference-list]");
const workspaceCreateForm = document.querySelector("[data-workspace-create-form]");
const newWorkspaceTypeSelect = document.querySelector("[data-new-workspace-type]");
const newWorkspaceNameInput = document.querySelector("[data-new-workspace-name]");
const newWorkspaceModuleSettingsContainer = document.querySelector('[data-settings-attachment="new-workspace"]');
const userSettingsContributionContainer = document.querySelector('[data-settings-attachment="user"]');
const createWorkspaceButton = document.querySelector("[data-create-workspace]");
const openWorkspaceRemovalButton = document.querySelector("[data-open-workspace-removal]");
const deleteAccountButton = document.querySelector("[data-delete-account]");
const workspaceRemovalDialog = document.querySelector("[data-workspace-removal-dialog]");
const workspaceRemovalList = document.querySelector("[data-workspace-removal-list]");
const closeWorkspaceRemovalButton = document.querySelector("[data-close-workspace-removal]");
const userSettingsStatus = asStatusElement(document.querySelector("[data-user-settings-status]"));
let workspaceCreationTypes = [];
let currentWorkspaces = [];
let activeWorkspaceId = "";
let canEnterAccountExportRecovery = false;
let lastSuggestedWorkspaceName = "";
let workspaceNameEditedByUser = false;
let systemThemeModeQuery = null;
let systemThemeModeListenerAttached = false;
let settingsCatalog = null;
const settingsPageController = requireSettingsPageController().create({
  root: document.querySelector("[data-settings-host='user']"),
  onSave: saveAllSettings,
  onRevert: applyPendingPreferencePreview,
});

loadUserSettings();
loadNotificationPreferences();

themeForm.addEventListener("change", (event) => {
  if (event.target.matches("[data-theme-mode-option], [data-theme-auto-source]")) {
    applyPendingPreferencePreview();
  }
});

markdownRenderingForm?.addEventListener("change", (event) => {
  if (event.target.matches("[data-open-external-links-new-tab]")) {
    applyPendingPreferencePreview();
  }
});

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await changePassword();
});

profileForm.addEventListener("submit", (event) => {
  event.preventDefault();
});

notificationPreferencesForm?.addEventListener("submit", (event) => {
  event.preventDefault();
});

workspaceCreateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await createWorkspace();
});

newWorkspaceNameInput.addEventListener("input", () => {
  workspaceNameEditedByUser = newWorkspaceNameInput.value.trim() !== lastSuggestedWorkspaceName;
});

newWorkspaceTypeSelect.addEventListener("change", () => {
  updateSuggestedWorkspaceName();
  renderCreateWorkspaceModuleSettings();
});

openWorkspaceRemovalButton?.addEventListener("click", openWorkspaceRemovalDialog);
deleteAccountButton?.addEventListener("click", deleteAccount);
closeWorkspaceRemovalButton?.addEventListener("click", () => workspaceRemovalDialog?.close());

  /** @typedef {import("../../src/types/browser-contracts.js").BrowserTimezones} BrowserTimezones */

  /**
   * The timezone state and formatters this page cannot render dates without.
   *
   * Acquired at the point of use, so a missing surface still fails at exactly the moment it
   * failed before `0.33.33.38.2.2.6.2` made the read checked. Every page that loads this script
   * loads `shared/timezones.js` ahead of it.
   *
   * `navigation.js`, `shared/settings-host.js`, `tasks.js`, and `task-dialog.js` read the same
   * surface optionally and fall back, and they keep doing so: absence is a real state there.
   * @returns {BrowserTimezones}
   */
  function requireTimezones() {
    const timezones = window.LongtailForge?.timezones;
    if (!timezones) {
      throw new Error("User Settings requires LongtailForge.timezones.");
    }
    return timezones;
  }

/** @typedef {import("../../src/types/browser-contracts.js").BrowserApi} BrowserApi */

/**
 * The API client this file cannot run without.
 *
 * Acquired per call rather than once at module scope, so a missing client still fails at
 * exactly the moment it failed before `0.33.33.38.1` declared the namespace it lives on.
 * The five methods keep returning `Promise<unknown>`: a fetch body is an untrusted wire
 * value, and narrowing one is `0.33.33.38.4`'s work rather than this file's.
 * @returns {BrowserApi}
 */
function requireApi() {
  const apiClient = window.LongtailForge?.api;
  if (!apiClient) {
    throw new Error("User settings requires LongtailForge.api.");
  }
  return apiClient;
}
/** @typedef {import("../../src/types/browser-contracts.js").BrowserNotificationPreferences} BrowserNotificationPreferences */

/**
 * The notification preference surface this page cannot render its Notifications section without.
 *
 * `views/protected/user-settings.html` loads `shared/notification-preferences.js` at line 23,
 * ahead of this script, so a missing surface is a delivery failure rather than a configuration.
 * Both call sites already sit inside a `try` that reports the failure as a status message, so the
 * checked read fails exactly where the raw read failed before - with a named error instead of a
 * `TypeError` raised by the first property access.
 * @returns {BrowserNotificationPreferences}
 */
function requireNotificationPreferences() {
  const preferences = window.LongtailForge?.notificationPreferences;
  if (!preferences) {
    throw new Error("User settings requires LongtailForge.notificationPreferences.");
  }
  return preferences;
}

/** @typedef {import("../../src/types/browser-contracts.js").BrowserSettingsHost} BrowserSettingsHost */
/** @typedef {import("../../src/types/browser-contracts.js").BrowserSettingsPageController} BrowserSettingsPageController */

/**
 * The settings host this page cannot render without. Every page that loads this script also
 * loads `shared/settings-host.js` ahead of it, so a missing host is a delivery failure and
 * the checked read fails exactly where the raw read failed before.
 * @returns {BrowserSettingsHost}
 */
/** @typedef {import("../../src/types/browser-contracts.js").BrowserSettingsRenderer} BrowserSettingsRenderer */

/**
 * The shared settings renderer this page requires.
 *
 * User Settings loads `settings-renderer.js` before its controller, so an absent surface is a
 * delivery failure rather than a condition to render around. This fails where the raw
 * property read already failed, and says what is missing.
 * @returns {BrowserSettingsRenderer}
 */
function requireSettingsRenderer() {
  const renderer = window.LongtailForge?.settingsRenderer;
  if (!renderer) {
    throw new Error("User settings requires LongtailForge.settingsRenderer.");
  }
  return renderer;
}

/**
 * The form the renderer collects and validates against.
 *
 * The renderer walks this element; a missing one threw on the first DOM read before and
 * throws here instead, named.
 * @returns {Element}
 */
function requireWorkspaceCreateForm() {
  if (!workspaceCreateForm) {
    throw new Error("User settings requires its workspace create form.");
  }
  return workspaceCreateForm;
}

function requireSettingsHost() {
  const host = window.LongtailForge?.settingsHost;
  if (!host) {
    throw new Error("User settings requires LongtailForge.settingsHost.");
  }
  return host;
}

/** @returns {BrowserSettingsPageController} */
function requireSettingsPageController() {
  const controller = window.LongtailForge?.settingsPageController;
  if (!controller) {
    throw new Error("User settings requires LongtailForge.settingsPageController.");
  }
  return controller;
}

/** @typedef {import("../../src/types/browser-contracts.js").BrowserStatusMessage} BrowserStatusMessage */

/**
 * The status-message helpers this page cannot report through without. Every page that loads
 * this script also loads `shared/status.js` ahead of it, so the checked read fails exactly
 * where the raw read failed before.
 * @returns {BrowserStatusMessage}
 */
function requireStatusMessage() {
  const status = window.LongtailForge?.status;
  if (!status) {
    throw new Error("User settings requires LongtailForge.status.");
  }
  return status;
}

/**
 * A status element the message helpers can drive. They set `hidden`, which only an
 * `HTMLElement` has; anything else was already a silent no-op and stays one.
 * @param {Element | null} node
 * @returns {HTMLElement | null}
 */
function asStatusElement(node) {
  return node && "hidden" in node ? /** @type {HTMLElement} */ (node) : null;
}

/** @typedef {import("../../src/types/browser-contracts.js").BrowserModalDialogs} BrowserModalDialogs */

/**
 * The alert and confirmation dialogs this file cannot ask a question without. Every page that
 * loads this script also loads `shared/modal.js`, so the checked read fails exactly where the
 * raw read failed before.
 * @returns {BrowserModalDialogs}
 */
function requireModalDialogs() {
  const dialogs = window.LongtailForge?.modal;
  if (!dialogs) {
    throw new Error("User settings requires LongtailForge.modal.");
  }
  return dialogs;
}

async function deleteAccount() {
  const confirmed = await requireModalDialogs().confirm({
    title: "Delete your account?",
    message: "This permanently retires your password, sessions, API keys, roles, and access to every workspace. Your email address, display name, contributions, and attribution are retained in workspace history. This cannot be undone.",
    confirmLabel: "Delete Account",
    cancelLabel: "Cancel",
    danger: true,
  });

  if (!confirmed) {
    return;
  }

  deleteAccountButton.disabled = true;
  setUserSettingsStatus("Deleting account...");

  try {
    await requireApi().deleteJson("/api/user/account");
    window.location.replace("/login.html");
  } catch (error) {
    deleteAccountButton.disabled = false;
    handleApiError(error, "Account could not be deleted.");
  }
}

/** @typedef {import("../../src/types/browser-contracts.js").BrowserUserSettings} BrowserUserSettings */
/** @typedef {import("../../src/types/browser-contracts.js").BrowserUserSettingsProfile} BrowserUserSettingsProfile */
/** @typedef {import("../../src/types/browser-contracts.js").BrowserUserSettingsWorkspace} BrowserUserSettingsWorkspace */
/** @typedef {import("../../src/types/browser-contracts.js").BrowserWorkspaceCreationOptions} BrowserWorkspaceCreationOptions */
/** @typedef {import("../../src/types/browser-contracts.js").BrowserWorkspaceCreationType} BrowserWorkspaceCreationType */
/** @typedef {import("../../src/types/browser-contracts.js").BrowserWorkspaceRemovalResult} BrowserWorkspaceRemovalResult */

/** The three words `normalizeThemeMode` answers, fallback included. */
const USER_THEME_MODES = Object.freeze(["auto", "dark", "light"]);

/** The one word `normalizeThemeAutoSource` answers on every path. */
const USER_THEME_AUTO_SOURCES = Object.freeze(["system"]);

/** The five landings `normalizeUserLandingPage` answers. */
const USER_LANDING_PAGES = Object.freeze(["dashboard", "lists", "notes", "tasks", "workbench"]);

/** The three spans `normalizeCalendarViewPreference` answers before falling to `null`. */
const USER_CALENDAR_VIEWS = Object.freeze(["day", "month", "week"]);

/** The two landing members both routes rebuild through the same normaliser. */
const USER_LANDING_MEMBERS = Object.freeze(["preferredLoginLanding", "preferredWorkspaceSwitchLanding"]);

/** The three text members both routes always fill. */
const USER_PROFILE_TEXT = Object.freeze(["displayName", "timezone", "username"]);

/** The four columns `readForUser` selects for a workspace the account belongs to. */
const USER_WORKSPACE_TEXT = Object.freeze(["status", "workspace_id", "workspace_name", "workspace_type"]);

/** The three kinds of workspace the creation producer starts from. */
const WORKSPACE_TYPES = Object.freeze(["business", "family", "personal"]);

/** The two install modes the creation producer chooses between. */
const WORKSPACE_INSTALL_MODES = Object.freeze(["saas", "self_hosted"]);

/** The three text members each creatable workspace type carries beside its module settings. */
const WORKSPACE_CREATION_TYPE_TEXT = Object.freeze(["defaultName", "label", "workspaceType"]);

/**
 * A plain JSON object, which is the least a wire body can be before any member is read.
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isResponseRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value @param {readonly string[]} vocabulary
 * @returns {boolean}
 */
function isWord(value, vocabulary) {
  return typeof value === "string" && vocabulary.includes(value);
}

/**
 * The ten members both `/api/user/settings` routes send.
 *
 * The closed words are checked here rather than written down and trusted: that is what earns
 * them a union at all, and it is why this contract may close what `BrowserUserRecord` could not.
 * @param {unknown} value
 * @returns {value is BrowserUserSettingsProfile}
 */
function isUserSettingsProfile(value) {
  return isResponseRecord(value)
    && USER_PROFILE_TEXT.every((member) => typeof value[member] === "string")
    && value.username !== ""
    && (value.altEmail === null || typeof value.altEmail === "string")
    && typeof value.openExternalLinksNewTab === "boolean"
    && isWord(value.themeMode, USER_THEME_MODES)
    && isWord(value.themeAutoSource, USER_THEME_AUTO_SOURCES)
    && USER_LANDING_MEMBERS.every((member) => isWord(value[member], USER_LANDING_PAGES))
    && (value.preferredCalendarView === null || isWord(value.preferredCalendarView, USER_CALENDAR_VIEWS));
}

/**
 * One workspace row the account belongs to.
 * @param {unknown} value
 * @returns {value is BrowserUserSettingsWorkspace}
 */
function isUserSettingsWorkspace(value) {
  return isResponseRecord(value) && USER_WORKSPACE_TEXT.every((member) => typeof value[member] === "string");
}

/**
 * One workspace kind this account may create.
 * @param {unknown} value
 * @returns {value is BrowserWorkspaceCreationType}
 */
function isWorkspaceCreationType(value) {
  return isResponseRecord(value)
    && WORKSPACE_CREATION_TYPE_TEXT.every((member) => typeof value[member] === "string")
    && isWord(value.workspaceType, WORKSPACE_TYPES)
    && Array.isArray(value.moduleSettings);
}

/**
 * What this account may create, as the server already decided it.
 * @param {unknown} value
 * @returns {value is BrowserWorkspaceCreationOptions}
 */
function isWorkspaceCreationOptions(value) {
  return isResponseRecord(value)
    && isWord(value.installMode, WORKSPACE_INSTALL_MODES)
    && typeof value.workspaceCreationEnabled === "boolean"
    && typeof value.canCreateWorkspaces === "boolean"
    && Array.isArray(value.availableTypes)
    && value.availableTypes.every(isWorkspaceCreationType);
}

/**
 * @param {unknown} value
 * @returns {value is BrowserUserSettingsWorkspace[]}
 */
function isUserSettingsWorkspaces(value) {
  return Array.isArray(value) && value.every(isUserSettingsWorkspace);
}

/**
 * The save response: the ten members and nothing else this page reads.
 *
 * **Refused rather than defaulted, because this is a form the account saves back.** A response
 * the browser cannot vouch for would repopulate the controls with fallbacks, and the next save
 * would write those fallbacks over real preferences. `null` takes the load-error path the page
 * already had.
 * @param {unknown} body
 * @returns {BrowserUserSettingsProfile | null}
 */
function readUserSettingsProfile(body) {
  return isUserSettingsProfile(body) ? body : null;
}

/**
 * The load response: the same ten, plus the four only the read sends.
 * @param {unknown} body
 * @returns {BrowserUserSettings | null}
 */
function readUserSettings(body) {
  if (!isResponseRecord(body)) {
    return null;
  }
  // Read the four before narrowing to the profile: a type predicate narrows the binding it
  // tests, and the profile contract deliberately does not name them.
  const { activeWorkspaceId, canEnterAccountExportRecovery, workspaceCreation, workspaces } = body;
  if (!isUserSettingsProfile(body)
    || typeof activeWorkspaceId !== "string"
    || typeof canEnterAccountExportRecovery !== "boolean"
    || !isWorkspaceCreationOptions(workspaceCreation)
    || !isUserSettingsWorkspaces(workspaces)) {
    return null;
  }
  return { ...body, activeWorkspaceId, canEnterAccountExportRecovery, workspaceCreation, workspaces };
}

/**
 * The two answers the workspace-removal route genuinely has, told apart by their own shapes.
 *
 * Also refused rather than guessed: an unreadable body must not send the account to recovery,
 * and must not leave a stale workspace list on screen either. The removal has already happened
 * on the server, so the page reports its ordinary failure and a reload shows the truth.
 * @param {unknown} body
 * @returns {BrowserWorkspaceRemovalResult | null}
 */
function readWorkspaceRemoval(body) {
  if (!isResponseRecord(body) || !isUserSettingsWorkspaces(body.workspaces)) {
    return null;
  }
  if (body.accountExportRecovery === true) {
    return body.activeWorkspaceId === null
      ? { accountExportRecovery: true, activeWorkspaceId: null, workspaces: body.workspaces }
      : null;
  }
  return body.accountExportRecovery === undefined && typeof body.activeWorkspaceId === "string"
    ? { activeWorkspaceId: body.activeWorkspaceId, workspaces: body.workspaces }
    : null;
}

async function loadUserSettings() {
  try {
    const [body, catalog] = await Promise.all([
      requireApi().getJson("/api/user/settings", { cache: "no-store" }),
      requireApi().getJson("/api/settings/catalog", { cache: "no-store" }),
    ]);
    const settings = readUserSettings(body);
    if (!settings) {
      throw new Error("The user settings response could not be read.");
    }
    settingsCatalog = catalog;

    applyThemeMode(settings.themeMode, settings.themeAutoSource);
    applyMarkdownRendering(settings);
    applyAppPreferences(settings);
    applyProfile(settings);
    applyWorkspaceAccess(settings);
    applyWorkspaceCreation(settings.workspaceCreation);
    renderUserSettingsContributions();
    setUserSettingsStatus("");
    settingsPageController.setClean();
  } catch (error) {
    handleApiError(error, "User settings could not be loaded.");
  }
}

async function loadNotificationPreferences() {
  if (!notificationPreferenceList) {
    return;
  }

  try {
    await window.LongtailForge?.workspaceContextReady;
    const notificationPreferences = requireNotificationPreferences();
    const body = await notificationPreferences.loadPreferences();

    notificationPreferences.renderGroupingPreferences(
      notificationGroupingPreferences,
      body.groupingPreferences,
      { workspaceType: window.LongtailForge?.workspaceContext?.workspaceType || "business" },
    );
    notificationPreferences.renderPreferenceGroups(notificationPreferenceList, body.events, {
      canManageWorkspaceDefaults: false,
      emptyText: "No configurable notification types are available.",
      headingLevel: "h3",
      includeWorkspaceDefaults: false,
    });
    settingsPageController.setClean();
  } catch (error) {
    notificationPreferenceList.replaceChildren(createPlaceholder("Notification preferences could not be loaded."));
    handleApiError(error, "Notification preferences could not be loaded.");
  }
}

function applyPendingPreferencePreview() {
  applyThemeMode(getSelectedThemeMode(), getSelectedThemeAutoSource());
  applyMarkdownRendering({ openExternalLinksNewTab: openExternalLinksNewTabToggle?.checked === true });
}

async function saveAllSettings() {
  const username = profileUsernameInput.value.trim().toLowerCase();
  const displayName = profileDisplayNameInput.value.trim();
  const altEmail = profileAltEmailInput.value.trim().toLowerCase();
  if (!isValidEmail(username)) {
    setUserSettingsStatus("Enter a valid email address.", true);
    return false;
  }
  if (!displayName) {
    setUserSettingsStatus("Display name is required.", true);
    return false;
  }
  if (altEmail && !isValidEmail(altEmail)) {
    setUserSettingsStatus("Enter a valid alternate email address or leave it blank.", true);
    return false;
  }

  setUserSettingsStatus("Saving user settings...");
  try {
    const body = await requireApi().putJson("/api/user/settings", {
      altEmail,
      displayName,
      openExternalLinksNewTab: openExternalLinksNewTabToggle?.checked === true,
      preferredLoginLanding: preferredLoginLandingSelect?.value || "dashboard",
      preferredWorkspaceSwitchLanding: preferredWorkspaceSwitchLandingSelect?.value || "dashboard",
      preferredCalendarView: normalizeCalendarViewPreference(preferredCalendarViewSelect?.value),
      themeAutoSource: getSelectedThemeAutoSource(),
      themeMode: getSelectedThemeMode(),
      timezone: profileTimezoneSelect.value,
      username,
    });
    const notificationPreferences = requireNotificationPreferences();
    const preferences = notificationPreferences.readUserPreferencesPayload(notificationPreferenceList);
    const groupingPreferences = notificationPreferences.readGroupingPreferencesPayload(notificationGroupingPreferences);
    await notificationPreferences.saveUserPreferences(preferences, groupingPreferences);
    const saved = readUserSettingsProfile(body);
    if (!saved) {
      throw new Error("The saved user settings response could not be read.");
    }
    applyThemeMode(saved.themeMode, saved.themeAutoSource);
    applyMarkdownRendering(saved);
    applyAppPreferences(saved);
    applyProfile(saved);
    await loadNotificationPreferences();
    setUserSettingsStatus("User settings saved.", false, { type: "success", clearAfter: 1600 });
    return true;
  } catch (error) {
    handleApiError(error, "User settings were not saved.");
    return false;
  }
}

function applyThemeMode(themeMode, themeAutoSource = "system") {
  const normalizedThemeMode = normalizeThemeMode(themeMode);
  const normalizedThemeAutoSource = normalizeThemeAutoSource(themeAutoSource);
  const effectiveTheme = resolveThemeMode(normalizedThemeMode, normalizedThemeAutoSource);

  document.documentElement.dataset.themeMode = normalizedThemeMode;
  document.documentElement.dataset.themeAutoSource = normalizedThemeAutoSource;
  document.documentElement.dataset.theme = effectiveTheme;
  document.documentElement.style.colorScheme = effectiveTheme;
  window.localStorage.setItem(THEME_STORAGE_KEY, normalizedThemeMode);
  window.localStorage.setItem(THEME_AUTO_SOURCE_STORAGE_KEY, normalizedThemeAutoSource);
  themeModeInputs.forEach((input) => {
    input.checked = input.value === normalizedThemeMode;
  });
  themeAutoSourceInputs.forEach((input) => {
    input.checked = input.value === normalizedThemeAutoSource;
    input.disabled = normalizedThemeMode !== "auto";
  });
  if (themeAutoSourceControls) {
    themeAutoSourceControls.hidden = normalizedThemeMode !== "auto";
  }
  ensureSystemThemeModeWatcher();
}

function applyMarkdownRendering(settings) {
  const openExternalLinksNewTab = settings?.openExternalLinksNewTab === true;

  if (openExternalLinksNewTabToggle) {
    openExternalLinksNewTabToggle.checked = openExternalLinksNewTab;
  }

  window.localStorage.setItem(OPEN_EXTERNAL_LINKS_STORAGE_KEY, openExternalLinksNewTab ? "true" : "false");
}

function applyAppPreferences(settings) {
  if (preferredLoginLandingSelect) {
    preferredLoginLandingSelect.value = normalizeLandingPreference(settings?.preferredLoginLanding);
  }

  if (preferredWorkspaceSwitchLandingSelect) {
    preferredWorkspaceSwitchLandingSelect.value = normalizeLandingPreference(
      settings?.preferredWorkspaceSwitchLanding,
    );
  }

  if (preferredCalendarViewSelect) {
    preferredCalendarViewSelect.value = normalizeCalendarViewPreference(settings?.preferredCalendarView) || "";
  }
}

function normalizeLandingPreference(value) {
  return ["dashboard", "workbench", "tasks", "notes", "lists"].includes(value)
    ? value
    : "dashboard";
}

function normalizeCalendarViewPreference(value) {
  return ["day", "week", "month"].includes(value) ? value : null;
}

function applyWorkspaceCreation(workspaceCreation) {
  workspaceCreationTypes = Array.isArray(workspaceCreation?.availableTypes)
    ? workspaceCreation.availableTypes
    : [];

  newWorkspaceTypeSelect.replaceChildren(...workspaceCreationTypes.map((type) => {
    const option = document.createElement("option");

    option.value = type.workspaceType;
    option.textContent = type.label || type.workspaceType;
    option.dataset.defaultName = type.defaultName || "";
    return option;
  }));

  const hasAvailableTypes = workspaceCreationTypes.length > 0;
  workspaceCreateForm.hidden = !hasAvailableTypes;
  newWorkspaceTypeSelect.disabled = !hasAvailableTypes;
  newWorkspaceNameInput.disabled = !hasAvailableTypes;
  createWorkspaceButton.disabled = !hasAvailableTypes;

  if (hasAvailableTypes) {
    newWorkspaceTypeSelect.value = workspaceCreationTypes[0].workspaceType;
    setSuggestedWorkspaceName(getWorkspaceTypeSuggestedName(workspaceCreationTypes[0]));
    renderCreateWorkspaceModuleSettings();
  } else {
    renderCreateWorkspaceModuleSettings();
  }
}

function applyWorkspaceAccess(settings) {
  activeWorkspaceId = String(settings?.activeWorkspaceId || settings?.active_workspace_id || "");
  if (Object.hasOwn(settings || {}, "canEnterAccountExportRecovery")) {
    canEnterAccountExportRecovery = settings.canEnterAccountExportRecovery === true;
  }
  currentWorkspaces = Array.isArray(settings?.workspaces)
    ? settings.workspaces.map(normalizeWorkspaceAccess).filter((workspace) => workspace.workspaceId)
    : [];

  if (openWorkspaceRemovalButton) {
    openWorkspaceRemovalButton.disabled = currentWorkspaces.length === 0;
  }
}

function applyProfile(profile) {
  profileUsernameInput.value = profile.username || "";
  profileDisplayNameInput.value = profile.displayName || "";
  profileAltEmailInput.value = profile.altEmail || "";
  setTimezoneValue(profile.timezone || "America/New_York");

  if (window.LongtailForge?.timezones) {
    window.LongtailForge.timezones.setUserTimezone(profile.timezone || "America/New_York");
  }
}

function setTimezoneValue(timezone) {
  const matchingOption = [...profileTimezoneSelect.options].find((option) => option.value === timezone);

  if (!matchingOption) {
    const option = document.createElement("option");

    option.value = timezone;
    option.textContent = `${timezone} (${requireTimezones().formatUtcOffset(new Date(), timezone)})`;
    profileTimezoneSelect.appendChild(option);
  }

  profileTimezoneSelect.value = timezone;
}

async function createWorkspace() {
  const workspaceType = newWorkspaceTypeSelect.value;
  const workspaceName = newWorkspaceNameInput.value.trim();

  if (!workspaceType) {
    setUserSettingsStatus("Choose a workspace type.", true);
    return;
  }

  if (!workspaceName) {
    setUserSettingsStatus("Workspace name is required.", true);
    return;
  }

  if (workspaceNameExists(workspaceName)) {
    setUserSettingsStatus("Workspace name already exists.", true);
    return;
  }

  if (!requireSettingsRenderer().validate(requireWorkspaceCreateForm())) {
    setUserSettingsStatus("Review the highlighted module settings.", true);
    return;
  }

  createWorkspaceButton.disabled = true;
  setUserSettingsStatus("Creating workspace...");

  try {
    await requireApi().postJson("/api/workspaces", {
      workspaceType,
      workspaceName,
      moduleSettings: requireSettingsRenderer().collectPayload(requireWorkspaceCreateForm()),
    });

    setUserSettingsStatus("Workspace created.");
    window.location.replace("/workspace-settings.html");
  } catch (error) {
    requireSettingsRenderer().showValidationErrors(requireWorkspaceCreateForm(), error);
    handleApiError(error, "Workspace was not created.");
    createWorkspaceButton.disabled = false;
  }
}

function updateSuggestedWorkspaceName() {
  const selectedType = workspaceCreationTypes.find((type) => type.workspaceType === newWorkspaceTypeSelect.value);
  const nextSuggestion = getAvailableWorkspaceName(getWorkspaceTypeSuggestedName(selectedType));
  const currentName = newWorkspaceNameInput.value.trim();

  if (!workspaceNameEditedByUser || !currentName || currentName === lastSuggestedWorkspaceName) {
    setSuggestedWorkspaceName(nextSuggestion);
    return;
  }

  lastSuggestedWorkspaceName = nextSuggestion;
}

function renderCreateWorkspaceModuleSettings() {
  const selectedType = workspaceCreationTypes.find((type) => type.workspaceType === newWorkspaceTypeSelect.value);

  requireSettingsRenderer().renderSections(
    newWorkspaceModuleSettingsContainer,
    selectedType?.moduleSettings || [],
    { emptyText: "No module controls are available for this workspace type." },
  );
}

function renderUserSettingsContributions() {
  requireSettingsRenderer().renderSections(
    userSettingsContributionContainer,
    requireSettingsHost().attachmentSections(settingsCatalog, "user"),
    { hideEmpty: true },
  );
}

function setSuggestedWorkspaceName(workspaceName) {
  lastSuggestedWorkspaceName = getAvailableWorkspaceName(workspaceName || "Workspace");
  newWorkspaceNameInput.value = lastSuggestedWorkspaceName;
  workspaceNameEditedByUser = false;
}

function getWorkspaceTypeSuggestedName(workspaceType) {
  return workspaceType?.defaultName || workspaceType?.label || "Workspace";
}

function openWorkspaceRemovalDialog() {
  if (!workspaceRemovalDialog || !workspaceRemovalList) {
    return;
  }

  renderWorkspaceRemovalList();

  if (typeof workspaceRemovalDialog.showModal === "function") {
    workspaceRemovalDialog.showModal();
  } else {
    workspaceRemovalDialog.setAttribute("open", "");
  }
}

function renderWorkspaceRemovalList() {
  workspaceRemovalList.replaceChildren();

  if (currentWorkspaces.length === 0) {
    workspaceRemovalList.appendChild(createWorkspaceRemovalPlaceholder("No workspaces are available."));
    return;
  }

  currentWorkspaces.forEach((workspace) => {
    workspaceRemovalList.appendChild(createWorkspaceRemovalRow(workspace));
  });
}

function createWorkspaceRemovalRow(workspace) {
  const row = document.createElement("div");
  const details = document.createElement("div");
  const name = document.createElement("strong");
  const meta = document.createElement("p");
  const button = document.createElement("button");
  const activeWorkspaceCount = currentWorkspaces.filter((item) => item.status === "active").length;
  const isCurrentWorkspace = workspace.workspaceId === activeWorkspaceId;
  const isLastActiveWorkspace = workspace.status === "active" && activeWorkspaceCount <= 1;

  row.className = "workspace-removal-row";
  name.textContent = workspace.workspaceName || "Workspace";
  meta.textContent = [
    formatWorkspaceType(workspace.workspaceType),
    workspace.status === "inactive" ? "Inactive" : "Active",
    isCurrentWorkspace ? "Current" : "",
  ].filter(Boolean).join(" - ");

  button.type = "button";
  const canLeaveForRecovery = isCurrentWorkspace && isLastActiveWorkspace && canEnterAccountExportRecovery;
  button.textContent = canLeaveForRecovery ? "Leave" : (isCurrentWorkspace ? "Current Workspace" : "Leave");
  button.disabled = (isCurrentWorkspace || isLastActiveWorkspace) && !canLeaveForRecovery;
  button.addEventListener("click", () => removeWorkspaceMembership(workspace.workspaceId));

  if (isLastActiveWorkspace && !isCurrentWorkspace && !canLeaveForRecovery) {
    button.textContent = "Only Active Workspace";
  }

  details.append(name, meta);
  row.append(details, button);
  return row;
}

function createWorkspaceRemovalPlaceholder(message) {
  const placeholder = document.createElement("p");

  placeholder.textContent = message;
  return placeholder;
}

function createPlaceholder(message) {
  const placeholder = document.createElement("p");

  placeholder.className = "placeholder-copy";
  placeholder.textContent = message;
  return placeholder;
}

async function removeWorkspaceMembership(workspaceId) {
  const workspace = currentWorkspaces.find((item) => item.workspaceId === workspaceId);

  if (!workspace) {
    return;
  }

  setUserSettingsStatus(`Leaving ${workspace.workspaceName || "workspace"}...`);

  try {
    const removal = readWorkspaceRemoval(
      await requireApi().deleteJson(`/api/user/workspaces/${encodeURIComponent(workspaceId)}`),
    );
    if (!removal) {
      throw new Error("The workspace removal response could not be read.");
    }

    if (removal.accountExportRecovery) {
      window.location.assign("/login.html?accountRecovery=1");
      return;
    }

    applyWorkspaceAccess(removal);
    renderWorkspaceRemovalList();
    setUserSettingsStatus("Workspace membership removed.", false, { type: "success", clearAfter: 1600 });
  } catch (error) {
    handleApiError(error, "Workspace membership was not removed.");
  }
}

function normalizeWorkspaceAccess(workspace) {
  return {
    status: String(workspace.status || "active"),
    workspaceId: String(workspace.workspaceId || workspace.workspace_id || ""),
    workspaceName: String(workspace.workspaceName || workspace.workspace_name || "Workspace"),
    workspaceType: String(workspace.workspaceType || workspace.workspace_type || "business"),
  };
}

function workspaceNameExists(workspaceName) {
  const normalizedName = normalizeWorkspaceName(workspaceName);

  return currentWorkspaces.some((workspace) => normalizeWorkspaceName(workspace.workspaceName) === normalizedName);
}

function getAvailableWorkspaceName(baseName) {
  const normalizedBaseName = String(baseName || "Workspace").trim() || "Workspace";

  if (!workspaceNameExists(normalizedBaseName)) {
    return normalizedBaseName;
  }

  let suffix = 2;
  let suggestedName = `${normalizedBaseName}-${suffix}`;

  while (workspaceNameExists(suggestedName)) {
    suffix += 1;
    suggestedName = `${normalizedBaseName}-${suffix}`;
  }

  return suggestedName;
}

function normalizeWorkspaceName(workspaceName) {
  return String(workspaceName || "").trim().toLowerCase();
}

function formatWorkspaceType(workspaceType) {
  return {
    business: "Business",
    personal: "Personal",
    family: "Family",
  }[workspaceType] || "Workspace";
}

function getSelectedThemeMode() {
  return normalizeThemeMode(themeModeInputs.find((input) => input.checked)?.value);
}

function getSelectedThemeAutoSource() {
  return normalizeThemeAutoSource(themeAutoSourceInputs.find((input) => input.checked)?.value);
}

function normalizeThemeMode(value) {
  return ["light", "auto", "dark"].includes(value) ? value : "light";
}

function normalizeThemeAutoSource(value) {
  return value === "system" ? "system" : "system";
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function resolveThemeMode(themeMode, themeAutoSource = "system") {
  const normalizedThemeMode = normalizeThemeMode(themeMode);

  if (normalizedThemeMode !== "auto") {
    return normalizedThemeMode;
  }

  return resolveAutoThemeMode(themeAutoSource);
}

function resolveAutoThemeMode(themeAutoSource = "system") {
  if (normalizeThemeAutoSource(themeAutoSource) === "system" && typeof window.matchMedia === "function") {
    return getSystemThemeModeQuery().matches ? "dark" : "light";
  }

  return "light";
}

function getSystemThemeModeQuery() {
  if (!systemThemeModeQuery && typeof window.matchMedia === "function") {
    systemThemeModeQuery = window.matchMedia(SYSTEM_THEME_QUERY);
  }

  return systemThemeModeQuery || { matches: false };
}

function ensureSystemThemeModeWatcher() {
  if (systemThemeModeListenerAttached || typeof window.matchMedia !== "function") {
    return;
  }

  const query = getSystemThemeModeQuery();
  const listener = () => {
    if (
      document.documentElement.dataset.themeMode === "auto" &&
      document.documentElement.dataset.themeAutoSource === "system"
    ) {
      const effectiveTheme = resolveThemeMode("auto", "system");
      document.documentElement.dataset.theme = effectiveTheme;
      document.documentElement.style.colorScheme = effectiveTheme;
    }
  };

  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", listener);
  } else if (typeof query.addListener === "function") {
    query.addListener(listener);
  }

  systemThemeModeListenerAttached = true;
}

async function changePassword() {
  const currentPassword = currentPasswordInput.value;
  const newPassword = newPasswordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  if (newPassword !== confirmPassword) {
    setUserSettingsStatus("New passwords do not match.", true);
    return;
  }

  savePasswordButton.disabled = true;
  setUserSettingsStatus("Changing password...");

  try {
    await requireApi().putJson("/api/user/password", {
      currentPassword,
      newPassword,
    });

    passwordForm.reset();
    flashButtonSavedState(savePasswordButton, "Password changed.");
  } catch (error) {
    handleApiError(error, "Password was not changed.");
  } finally {
    savePasswordButton.disabled = false;
  }
}

function flashButtonSavedState(button, message) {
  const originalText = button.textContent;

  button.textContent = "Saved.";
  button.classList.add("is-saved");
  setUserSettingsStatus(message);

  window.setTimeout(() => {
    button.textContent = originalText;
    button.classList.remove("is-saved");
    setUserSettingsStatus("");
  }, 1600);
}

function setUserSettingsStatus(message, isError = false, options = {}) {
  const statusOptions = typeof isError === "object"
    ? isError
    : { ...options, type: isError ? "error" : options.type || "" };

  requireStatusMessage().set(
    userSettingsStatus,
    message,
    statusOptions,
  );
}

function handleApiError(error, fallbackMessage) {
  if (error?.status === 401) {
    window.location.replace("/login.html");
    return;
  }

  setUserSettingsStatus(error?.message || fallbackMessage, true);
}
})();
