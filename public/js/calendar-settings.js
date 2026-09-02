/* global CSS */

(function attachCalendarSettingsPage() {
const createForm = document.querySelector("[data-calendar-subscription-create-form]");
const nameInput = document.querySelector("[data-calendar-subscription-name]");
const scopeSelect = document.querySelector("[data-calendar-subscription-scope]");
const clientField = document.querySelector("[data-calendar-subscription-client-field]");
const clientSelect = document.querySelector("[data-calendar-subscription-client]");
const projectField = document.querySelector("[data-calendar-subscription-project-field]");
const projectSelect = document.querySelector("[data-calendar-subscription-project]");
const createButton = document.querySelector("[data-create-calendar-subscription]");
const availability = document.querySelector("[data-calendar-subscription-availability]");
const createStatus = asStatusElement(document.querySelector("[data-calendar-subscription-create-status]"));
const secretPanel = document.querySelector("[data-calendar-subscription-secret-panel]");
const secretDetail = document.querySelector("[data-calendar-subscription-secret-detail]");
const secretInput = document.querySelector("[data-calendar-subscription-url]");
const revealButton = document.querySelector("[data-reveal-calendar-subscription]");
const copyButton = document.querySelector("[data-copy-calendar-subscription]");
const secretStatus = asStatusElement(document.querySelector("[data-calendar-subscription-secret-status]"));
const subscriptionList = document.querySelector("[data-calendar-subscription-list]");
const listStatus = document.querySelector("[data-calendar-subscription-list-status]");

const state = {
  clients: [],
  subscriptions: [],
  tasksEnabled: true,
  workspaceType: "business",
  workspaceProjects: [],
};
let currentSecret = "";

createForm?.addEventListener("submit", createSubscription);
scopeSelect?.addEventListener("change", renderScopeFields);
clientSelect?.addEventListener("change", renderProjectOptions);
revealButton?.addEventListener("click", toggleSecretVisibility);
copyButton?.addEventListener("click", copySecret);
subscriptionList?.addEventListener("click", handleSubscriptionAction);
window.addEventListener("pagehide", clearSecret);

initialize();

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
    throw new Error("Calendar settings requires LongtailForge.api.");
  }
  return apiClient;
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
    throw new Error("Calendar settings requires LongtailForge.status.");
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
    throw new Error("Calendar settings requires LongtailForge.modal.");
  }
  return dialogs;
}

/** @typedef {import("../../src/types/browser-contracts.js").BrowserCalendarSubscription} BrowserCalendarSubscription */
/** @typedef {import("../../src/types/browser-contracts.js").BrowserCalendarSubscriptionSecret} BrowserCalendarSubscriptionSecret */
/** @typedef {import("../../src/types/browser-contracts.js").BrowserClientProjectOptionsBody} BrowserClientProjectOptionsBody */

/** The three scope words the token row is typed to, one of which is the shaper's fallback. */
const CALENDAR_SCOPE_TYPES = Object.freeze(["client", "project", "workspace"]);

/** The four members `toPublicSubscription` always answers as text. */
const SUBSCRIPTION_TEXT = Object.freeze(["name", "status", "subscriptionId", "timezone"]);

/** The four members the shaper answers as text or `null`, never as an absence. */
const SUBSCRIPTION_NULLABLE_TEXT = Object.freeze(["createdAt", "revocationReason", "revokedAt", "rotatedAt"]);

/**
 * A plain JSON object, which is the least a wire body can be before any member is read.
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isResponseRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {value is string | null}
 */
function isNullableText(value) {
  return value === null || typeof value === "string";
}

/**
 * A calendar subscription descriptor as `toPublicSubscription` reconstructs it.
 *
 * **Every private-feeds route sends this same record, and none of them puts a feed URL on it.**
 * The tables above are the authority the unit proof reads; the reconstruction is exact, so the
 * check is exact too, down to the owner and scope records the shaper builds by hand.
 * @param {unknown} value
 * @returns {value is BrowserCalendarSubscription}
 */
function isCalendarSubscription(value) {
  return isResponseRecord(value)
    && SUBSCRIPTION_TEXT.every((member) => typeof value[member] === "string")
    && value.subscriptionId !== ""
    && SUBSCRIPTION_NULLABLE_TEXT.every((member) => isNullableText(value[member]))
    && typeof value.ownedByCurrentUser === "boolean"
    && isResponseRecord(value.owner)
    && typeof value.owner.displayName === "string"
    && typeof value.owner.username === "string"
    && isResponseRecord(value.scope)
    && typeof value.scope.label === "string"
    && typeof value.scope.type === "string"
    && CALENDAR_SCOPE_TYPES.includes(value.scope.type);
}

/**
 * The descriptors the list route sends, each one vouched for.
 *
 * Total, as `normalizeSubscriptions` already was: an unusable body or a non-list member yields an
 * empty list, and an element the browser cannot vouch for is dropped rather than rendered.
 * @param {unknown} body
 * @returns {BrowserCalendarSubscription[]}
 */
function readCalendarSubscriptions(body) {
  const subscriptions = isResponseRecord(body) ? body.subscriptions : null;
  return Array.isArray(subscriptions) ? subscriptions.filter(isCalendarSubscription) : [];
}

/**
 * The one-time secret create and rotate answer, or `null` when the response cannot be vouched for.
 *
 * A response without a usable URL already took the clear-the-panel path in `showSecret`, and a
 * `null` here takes exactly that path: nothing is shown that the browser cannot stand behind.
 * @param {unknown} body
 * @returns {BrowserCalendarSubscriptionSecret | null}
 */
function readCalendarSubscriptionSecret(body) {
  if (!isResponseRecord(body)) {
    return null;
  }
  const { feedUrl, subscription } = body;
  return typeof feedUrl === "string" && feedUrl !== "" && isCalendarSubscription(subscription)
    ? { feedUrl, subscription }
    : null;
}

/**
 * The options body, narrowed to its envelope only.
 *
 * The two collections stay `unknown[]` on purpose: this page's `normalizeClients` and
 * `normalizeProjects` are total over their elements, and the element vocabulary belongs to the
 * shared `clientProjectOptions` surface rather than to this page. A body that does not announce
 * itself as the options view is not this producer's, and yields the same empty collections a
 * non-list member always did.
 * @param {unknown} body
 * @returns {BrowserClientProjectOptionsBody}
 */
function readClientProjectOptions(body) {
  if (!isResponseRecord(body) || body.view !== "options") {
    return { clients: [], view: "options", workspaceProjects: [] };
  }
  const { clients, workspaceProjects } = body;
  return {
    clients: Array.isArray(clients) ? clients : [],
    view: "options",
    workspaceProjects: Array.isArray(workspaceProjects) ? workspaceProjects : [],
  };
}

async function initialize() {
  const api = requireApi();
  setStatus(listStatus, "Loading calendar subscriptions...");
  setCreateBusy(true);

  try {
    await readWorkspaceContext();
    const [subscriptionsBody, optionsBody] = await Promise.all([
      api.getJson("/api/private-feeds/calendar-subscriptions", { cache: "no-store" }),
      api.getJson("/api/client-projects?view=options", { cache: "no-store" }),
    ]);
    const options = readClientProjectOptions(optionsBody);
    state.subscriptions = normalizeSubscriptions(readCalendarSubscriptions(subscriptionsBody));
    state.clients = usesBusinessScopes() ? normalizeClients(options.clients) : [];
    state.workspaceProjects = normalizeProjects(options.workspaceProjects);
    renderScopeOptions();
    renderClientOptions();
    renderScopeFields();
    renderSubscriptions();
    renderAvailability();
    setStatus(listStatus, "");
  } catch (error) {
    handleApiError(error, listStatus, "Calendar subscriptions could not be loaded.");
  } finally {
    setCreateBusy(false);
  }
}

async function readWorkspaceContext() {
  try {
    await window.LongtailForge?.workspaceContextReady;
    state.workspaceType = normalizeWorkspaceType(
      window.LongtailForge?.workspaceContext?.workspaceType,
    );
    const enabledModules = window.LongtailForge?.workspaceContext?.enabledModules;
    if (Array.isArray(enabledModules)) {
      state.tasksEnabled = enabledModules.includes("tasks");
    }
  } catch {
    state.tasksEnabled = true;
  }
}

async function createSubscription(event) {
  const api = requireApi();
  event.preventDefault();
  const payload = readCreatePayload();
  if (!payload) {
    return;
  }

  setStatus(createStatus, "Creating calendar subscription...");
  setCreateBusy(true);

  try {
    const secret = readCalendarSubscriptionSecret(
      await api.postJson("/api/private-feeds/calendar-subscriptions", payload),
    );
    showSecret(secret?.feedUrl || "", secret?.subscription || null, "created");
    createForm.reset();
    renderClientOptions();
    renderScopeFields();
    await reloadSubscriptions();
    setStatus(createStatus, `Created ${secret?.subscription.name || payload.name}.`, {
      clearAfter: 2400,
      type: "success",
    });
  } catch (error) {
    handleApiError(error, createStatus, "Calendar subscription could not be created.");
  } finally {
    setCreateBusy(false);
  }
}

function readCreatePayload() {
  const name = String(nameInput?.value || "").trim();
  const scopeType = String(scopeSelect?.value || "workspace");
  if (!name) {
    setStatus(createStatus, "Enter a calendar subscription name.", { type: "error" });
    nameInput?.focus();
    return null;
  }

  const payload = { name, scopeType };
  if (scopeType === "client") {
    payload.clientId = String(clientSelect?.value || "");
    if (!payload.clientId) {
      setStatus(createStatus, "Choose a client.", { type: "error" });
      clientSelect?.focus();
      return null;
    }
  }
  if (scopeType === "project") {
    payload.projectId = String(projectSelect?.value || "");
    if (!payload.projectId) {
      setStatus(createStatus, "Choose a project.", { type: "error" });
      projectSelect?.focus();
      return null;
    }
  }
  return payload;
}

async function reloadSubscriptions(focus = null) {
  const api = requireApi();
  const body = await api.getJson("/api/private-feeds/calendar-subscriptions", { cache: "no-store" });
  state.subscriptions = normalizeSubscriptions(readCalendarSubscriptions(body));
  renderSubscriptions();
  if (focus) {
    restoreSubscriptionFocus(focus);
  }
}

async function handleSubscriptionAction(event) {
  const button = event.target.closest("[data-calendar-subscription-action]");
  if (!button) {
    return;
  }
  const subscription = state.subscriptions.find((item) => item.subscriptionId === button.dataset.subscriptionId);
  if (!subscription) {
    return;
  }
  if (button.dataset.calendarSubscriptionAction === "rotate") {
    await rotateSubscription(subscription, button);
  } else if (["revoke", "delete"].includes(button.dataset.calendarSubscriptionAction)) {
    await removeSubscription(subscription, button);
  }
}

async function rotateSubscription(subscription, trigger) {
  const api = requireApi();
  const confirmed = await requireModalDialogs().confirm({
    title: "Rotate calendar subscription URL?",
    message: `The current URL for ${subscription.name} will stop working immediately. Calendar apps using it will not receive updates until the replacement URL is installed.`,
    confirmLabel: "Rotate URL",
    cancelLabel: "Cancel",
    danger: true,
  });
  if (!confirmed) {
    trigger.focus();
    return;
  }

  setListBusy(subscription.subscriptionId, true);
  setStatus(listStatus, `Rotating ${subscription.name}...`);
  try {
    const secret = readCalendarSubscriptionSecret(await api.postJson(
      `/api/private-feeds/calendar-subscriptions/${encodeURIComponent(subscription.subscriptionId)}/rotate`,
    ));
    showSecret(secret?.feedUrl || "", secret?.subscription || null, "rotated");
    await reloadSubscriptions({ action: "rotate", subscriptionId: subscription.subscriptionId });
    setStatus(listStatus, `Rotated ${subscription.name}. Copy the replacement URL now.`, {
      clearAfter: 2400,
      type: "success",
    });
  } catch (error) {
    handleApiError(error, listStatus, "Calendar subscription URL could not be rotated.");
    trigger.focus();
  } finally {
    setListBusy(subscription.subscriptionId, false);
  }
}

async function removeSubscription(subscription, trigger) {
  const api = requireApi();
  const isActive = subscription.status === "active";
  const confirmed = await requireModalDialogs().confirm({
    title: isActive ? "Revoke calendar subscription?" : "Delete calendar subscription?",
    message: isActive
      ? `Revoke ${subscription.name}? Its private URL will stop working immediately and the subscription will be removed from this list.`
      : `Delete ${subscription.name} from this list? Its private URL is already inoperable.`,
    confirmLabel: isActive ? "Revoke and Remove" : "Delete",
    cancelLabel: "Cancel",
    danger: true,
  });
  if (!confirmed) {
    trigger.focus();
    return;
  }

  setListBusy(subscription.subscriptionId, true);
  setStatus(listStatus, `${isActive ? "Revoking" : "Deleting"} ${subscription.name}...`);
  try {
    await api.deleteJson(
      `/api/private-feeds/calendar-subscriptions/${encodeURIComponent(subscription.subscriptionId)}`,
    );
    await reloadSubscriptionsAfterRemoval(subscription.subscriptionId);
    setStatus(listStatus, `${isActive ? "Revoked and removed" : "Deleted"} ${subscription.name}.`, {
      clearAfter: 2000,
      type: "success",
    });
  } catch (error) {
    handleApiError(error, listStatus, `Calendar subscription could not be ${isActive ? "revoked" : "deleted"}.`);
    trigger.focus();
  } finally {
    setListBusy(subscription.subscriptionId, false);
  }
}

async function reloadSubscriptionsAfterRemoval(subscriptionId) {
  const removedIndex = state.subscriptions.findIndex((item) => item.subscriptionId === subscriptionId);
  await reloadSubscriptions();
  const rows = [...(subscriptionList?.querySelectorAll("tr[data-subscription-id]") || [])];
  const focusRow = rows[Math.min(Math.max(removedIndex, 0), rows.length - 1)];
  (focusRow || createButton)?.focus();
}

function renderScopeFields() {
  const scopeType = String(scopeSelect?.value || "workspace");
  if (clientField) {
    clientField.hidden = !usesBusinessScopes() || scopeType === "workspace";
  }
  if (clientSelect) {
    clientSelect.required = scopeType === "client";
    if (scopeType === "workspace") {
      clientSelect.value = "";
    }
  }
  if (projectField) {
    projectField.hidden = scopeType !== "project";
  }
  if (projectSelect) {
    projectSelect.required = scopeType === "project";
  }
  renderClientOptions();
  renderProjectOptions();
}

function renderScopeOptions() {
  if (!scopeSelect) {
    return;
  }
  const choices = usesBusinessScopes()
    ? [
        ["workspace", "Workspace"],
        ["client", "Client"],
        ["project", "Project"],
      ]
    : [
        ["workspace", "Workspace"],
        ["project", "Project"],
      ];
  scopeSelect.replaceChildren(...choices.map(([value, label]) => option(value, label)));
  scopeSelect.value = "workspace";
}

function renderClientOptions() {
  if (!clientSelect) {
    return;
  }
  const previousValue = clientSelect.value;
  const emptyLabel = scopeSelect?.value === "project"
    ? "All readable projects"
    : "Choose a client";
  clientSelect.replaceChildren(
    option("", emptyLabel),
    ...state.clients.map((client) => option(client.id, client.label)),
  );
  clientSelect.value = [...clientSelect.options].some((entry) => entry.value === previousValue)
    ? previousValue
    : "";
}

function renderProjectOptions() {
  if (!projectSelect) {
    return;
  }
  const selectedClientId = String(clientSelect?.value || "");
  const projects = selectedClientId
    ? state.clients.find((client) => client.id === selectedClientId)?.projects || []
    : [
        ...state.workspaceProjects.map((project) => ({ ...project, groupLabel: "Workspace" })),
        ...state.clients.flatMap((client) => client.projects.map((project) => ({
          ...project,
          groupLabel: client.label,
        }))),
      ];
  const previousValue = projectSelect.value;
  projectSelect.replaceChildren(
    option("", projects.length > 0 ? "Choose a project" : "No readable projects"),
    ...projects.map((project) => option(
      project.id,
      project.groupLabel ? `${project.groupLabel} / ${project.label}` : project.label,
    )),
  );
  projectSelect.value = [...projectSelect.options].some((entry) => entry.value === previousValue)
    ? previousValue
    : "";
}

function renderSubscriptions() {
  subscriptionList?.replaceChildren();
  if (!subscriptionList) {
    return;
  }
  if (state.subscriptions.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 9;
    cell.textContent = "No calendar subscriptions yet.";
    row.appendChild(cell);
    subscriptionList.appendChild(row);
    return;
  }

  for (const subscription of state.subscriptions) {
    const row = document.createElement("tr");
    row.tabIndex = -1;
    row.dataset.subscriptionId = subscription.subscriptionId;
    row.append(
      cell(subscription.name),
      cell(subscription.ownerLabel),
      cell(subscription.scopeLabel),
      cell(subscription.timezone),
      cell(formatStatus(subscription.status)),
      cell(formatDate(subscription.createdAt)),
      cell(formatDate(subscription.rotatedAt)),
      cell(formatDate(subscription.revokedAt)),
      actionCell(subscription),
    );
    subscriptionList.appendChild(row);
  }
}

function actionCell(subscription) {
  const tableCell = document.createElement("td");
  const actions = document.createElement("div");
  actions.className = "calendar-subscription-row-actions";
  if (subscription.status === "active" && subscription.ownedByCurrentUser) {
    actions.appendChild(rowAction("Rotate", "rotate", subscription.subscriptionId, {
      disabled: !state.tasksEnabled,
    }));
  }
  if (subscription.status === "active") {
    actions.appendChild(rowAction("Revoke", "revoke", subscription.subscriptionId, {
      danger: true,
    }));
  } else {
    actions.appendChild(rowAction("Delete", "delete", subscription.subscriptionId, {
      danger: true,
    }));
  }
  if (actions.childElementCount === 0) {
    tableCell.textContent = "No actions";
  } else {
    tableCell.appendChild(actions);
  }
  return tableCell;
}

function rowAction(label, actionName, subscriptionId, options = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.disabled = options.disabled === true;
  button.dataset.calendarSubscriptionAction = actionName;
  button.dataset.subscriptionId = subscriptionId;
  if (options.danger) {
    button.className = "danger-button";
  }
  return button;
}

function setListBusy(subscriptionId, isBusy) {
  subscriptionList
    ?.querySelectorAll(`[data-subscription-id="${CSS.escape(subscriptionId)}"] button`)
    .forEach((button) => {
      button.disabled = isBusy || (
        button.dataset.calendarSubscriptionAction === "rotate" && !state.tasksEnabled
      );
    });
}

function restoreSubscriptionFocus(focus) {
  const row = subscriptionList?.querySelector(
    `tr[data-subscription-id="${CSS.escape(focus.subscriptionId)}"]`,
  );
  const action = focus.action && row?.querySelector(
    `[data-calendar-subscription-action="${CSS.escape(focus.action)}"]`,
  );
  (action || row)?.focus();
}

function showSecret(feedUrl, subscription, operation) {
  currentSecret = String(feedUrl || "");
  if (!currentSecret) {
    clearSecret();
    return;
  }
  secretInput.value = currentSecret;
  secretInput.type = "password";
  revealButton.textContent = "Reveal URL";
  secretPanel.hidden = false;
  secretDetail.textContent = `${subscription?.name || "This subscription"} was ${operation}. Copy this private URL now.`;
  setStatus(secretStatus, "");
  secretInput.focus();
}

function clearSecret() {
  currentSecret = "";
  if (secretInput) {
    secretInput.value = "";
    secretInput.type = "password";
  }
  if (secretPanel) {
    secretPanel.hidden = true;
  }
}

function toggleSecretVisibility() {
  if (!currentSecret) {
    return;
  }
  const reveal = secretInput.type === "password";
  secretInput.type = reveal ? "text" : "password";
  revealButton.textContent = reveal ? "Hide URL" : "Reveal URL";
}

async function copySecret() {
  if (!currentSecret) {
    return;
  }
  try {
    await navigator.clipboard.writeText(currentSecret);
  } catch {
    secretInput.select();
    document.execCommand("copy");
    secretInput.setSelectionRange(0, 0);
  }
  setStatus(secretStatus, "Calendar subscription URL copied.", {
    clearAfter: 1600,
    type: "success",
  });
}

function renderAvailability() {
  if (!availability) {
    return;
  }
  availability.textContent = state.tasksEnabled && !usesBusinessScopes()
    ? `${formatWorkspaceType(state.workspaceType)} workspaces can use Workspace or Project scope. Client scope is available only in Business workspaces.`
    : state.tasksEnabled
      ? "Workspace, Client, and Project scopes are limited to Tasks the subscription owner can currently read."
    : "Tasks is disabled. Existing metadata remains available for revocation, but creation and rotation are unavailable until Tasks is enabled.";
  if (createButton) {
    createButton.disabled = !state.tasksEnabled;
  }
}

function setCreateBusy(isBusy) {
  for (const control of [nameInput, scopeSelect, clientSelect, projectSelect, createButton]) {
    if (control) {
      control.disabled = isBusy || (!state.tasksEnabled && control === createButton);
    }
  }
}

function normalizeSubscriptions(subscriptions) {
  return Array.isArray(subscriptions) ? subscriptions.map((subscription) => ({
    createdAt: subscription?.createdAt || null,
    name: String(subscription?.name || "Unnamed subscription"),
    ownedByCurrentUser: subscription?.ownedByCurrentUser === true,
    ownerLabel: String(subscription?.owner?.displayName || subscription?.owner?.username || "Unavailable user"),
    revokedAt: subscription?.revokedAt || null,
    rotatedAt: subscription?.rotatedAt || null,
    scopeLabel: String(subscription?.scope?.label || "Unavailable scope"),
    status: String(subscription?.status || "revoked"),
    subscriptionId: String(subscription?.subscriptionId || ""),
    timezone: String(subscription?.timezone || "Unavailable"),
  })).filter((subscription) => subscription.subscriptionId) : [];
}

function normalizeClients(clients) {
  return Array.isArray(clients) ? clients.map((client) => ({
    id: String(client?.id || ""),
    label: String(client?.name || "Untitled Client"),
    projects: normalizeProjects(client?.projects),
  })).filter((client) => client.id) : [];
}

function normalizeProjects(projects) {
  return Array.isArray(projects) ? projects.map((project) => ({
    id: String(project?.id || ""),
    label: String(project?.name || "Untitled Project"),
  })).filter((project) => project.id) : [];
}

function normalizeWorkspaceType(value) {
  const workspaceType = String(value || "").trim().toLowerCase();
  return ["business", "personal", "family"].includes(workspaceType)
    ? workspaceType
    : "business";
}

function usesBusinessScopes() {
  return state.workspaceType === "business";
}

function formatWorkspaceType(value) {
  return value === "family" ? "Family" : "Personal";
}

function option(value, label) {
  const element = document.createElement("option");
  element.value = value;
  element.textContent = label;
  return element;
}

function cell(value) {
  const element = document.createElement("td");
  element.textContent = value || "—";
  return element;
}

function formatStatus(status) {
  return status === "active" ? "Active" : "Revoked";
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "—";
}

function setStatus(element, message, options = {}) {
  requireStatusMessage().set(element, message, options);
}

function handleApiError(error, statusElement, fallbackMessage) {
  if (error?.status === 401) {
    window.location.replace("/login.html");
    return;
  }
  setStatus(statusElement, error?.message || fallbackMessage, { type: "error" });
}
}(window));
