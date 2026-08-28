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
const createStatus = document.querySelector("[data-calendar-subscription-create-status]");
const secretPanel = document.querySelector("[data-calendar-subscription-secret-panel]");
const secretDetail = document.querySelector("[data-calendar-subscription-secret-detail]");
const secretInput = document.querySelector("[data-calendar-subscription-url]");
const revealButton = document.querySelector("[data-reveal-calendar-subscription]");
const copyButton = document.querySelector("[data-copy-calendar-subscription]");
const secretStatus = document.querySelector("[data-calendar-subscription-secret-status]");
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
  const client = window.LongtailForge?.api;
  if (!client) {
    throw new Error("Calendar settings requires LongtailForge.api.");
  }
  return client;
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
    state.subscriptions = normalizeSubscriptions(subscriptionsBody.subscriptions);
    state.clients = usesBusinessScopes() ? normalizeClients(optionsBody.clients) : [];
    state.workspaceProjects = normalizeProjects(optionsBody.workspaceProjects);
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
    const body = await api.postJson("/api/private-feeds/calendar-subscriptions", payload);
    showSecret(body.feedUrl, body.subscription, "created");
    createForm.reset();
    renderClientOptions();
    renderScopeFields();
    await reloadSubscriptions();
    setStatus(createStatus, `Created ${body.subscription?.name || payload.name}.`, {
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
  state.subscriptions = normalizeSubscriptions(body.subscriptions);
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
  const confirmed = await window.LongtailForge.modal.confirm({
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
    const body = await api.postJson(
      `/api/private-feeds/calendar-subscriptions/${encodeURIComponent(subscription.subscriptionId)}/rotate`,
    );
    showSecret(body.feedUrl, body.subscription, "rotated");
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
  const confirmed = await window.LongtailForge.modal.confirm({
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
  window.LongtailForge.status.set(element, message, options);
}

function handleApiError(error, statusElement, fallbackMessage) {
  if (error?.status === 401) {
    window.location.replace("/login.html");
    return;
  }
  setStatus(statusElement, error?.message || fallbackMessage, { type: "error" });
}
}(window));
