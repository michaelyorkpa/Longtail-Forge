/* global CSS */

(function attachCalendarSettingsPage() {
const createForm = findCalendarControl("[data-calendar-subscription-create-form]", HTMLFormElement);
const nameInput = findCalendarControl("[data-calendar-subscription-name]", HTMLInputElement);
const scopeSelect = findCalendarControl("[data-calendar-subscription-scope]", HTMLSelectElement);
const clientField = findCalendarControl("[data-calendar-subscription-client-field]", HTMLElement);
const clientSelect = findCalendarControl("[data-calendar-subscription-client]", HTMLSelectElement);
const projectField = findCalendarControl("[data-calendar-subscription-project-field]", HTMLElement);
const projectSelect = findCalendarControl("[data-calendar-subscription-project]", HTMLSelectElement);
const createButton = findCalendarControl("[data-create-calendar-subscription]", HTMLButtonElement);
const availability = findCalendarControl("[data-calendar-subscription-availability]", HTMLElement);
const createStatus = asStatusElement(document.querySelector("[data-calendar-subscription-create-status]"));
const secretPanel = findCalendarControl("[data-calendar-subscription-secret-panel]", HTMLElement);
const secretDetail = findCalendarControl("[data-calendar-subscription-secret-detail]", HTMLElement);
const secretInput = findCalendarControl("[data-calendar-subscription-url]", HTMLInputElement);
const revealButton = findCalendarControl("[data-reveal-calendar-subscription]", HTMLButtonElement);
const copyButton = findCalendarControl("[data-copy-calendar-subscription]", HTMLButtonElement);
const secretStatus = asStatusElement(document.querySelector("[data-calendar-subscription-secret-status]"));
const subscriptionList = findCalendarControl("[data-calendar-subscription-list]", HTMLElement);
const listStatus = findCalendarControl("[data-calendar-subscription-list-status]", HTMLElement);

/**
 * **Typed-or-null on purpose**, the reading `0.33.33.44.5` settled and this lane has reused since.
 *
 * This page ships an empty settings host and `shared/settings-host.js` mounts the surface
 * synchronously ahead of this file, so the controls are here at module evaluation because of that
 * script order rather than because the view carries them. Acquisition still runs outside every
 * `try` on this page, so refusing here would turn a load-order change into a dead page instead of
 * the status this page already produces.
 * @template {Element} T
 * @param {string} selector
 * @param {{ new (): T }} constructor
 * @returns {T | null}
 */
function findCalendarControl(selector, constructor) {
  const element = document.querySelector(selector);
  return element instanceof constructor ? element : null;
}

/**
 * Narrow at an access this page already made unguarded.
 * @template T
 * @param {T | null} value
 * @param {string} name
 * @returns {T}
 */
function requireCalendarValue(value, name) {
  if (value === null) {
    throw new TypeError(`Calendar Settings requires its ${name}.`);
  }

  return value;
}

/**
 * One project as `normalizeProjects` rebuilds it for the scope pickers.
 * @typedef {object} CalendarProjectOption
 * @property {string} id
 * @property {string} label
 */

/**
 * The same project as the combined picker offers it, carrying the group it came from. Only the
 * combined list adds one - a client's own project list is already grouped by the control above it.
 * @typedef {CalendarProjectOption & { groupLabel?: string }} CalendarGroupedProjectOption
 */

/**
 * One client, with the projects it owns already rebuilt.
 * @typedef {object} CalendarClientOption
 * @property {string} id
 * @property {string} label
 * @property {CalendarProjectOption[]} projects
 */

/**
 * One subscription row as this page holds it.
 *
 * Every member `normalizeSubscriptions` writes is settled before anything renders it: the three
 * timestamps stay nullable because the wire really does omit them - a subscription that has never
 * been rotated has no rotation time - while the rest are coerced to text.
 * @typedef {object} CalendarSubscriptionRow
 * @property {string | null} createdAt
 * @property {string} name
 * @property {boolean} ownedByCurrentUser
 * @property {string} ownerLabel
 * @property {string | null} revokedAt
 * @property {string | null} rotatedAt
 * @property {string} scopeLabel
 * @property {string} status
 * @property {string} subscriptionId
 * @property {string} timezone
 */

/**
 * @typedef {object} CalendarSettingsState
 * @property {CalendarClientOption[]} clients
 * @property {CalendarSubscriptionRow[]} subscriptions
 * @property {boolean} tasksEnabled
 * @property {string} workspaceType
 * @property {CalendarProjectOption[]} workspaceProjects
 */

/** @type {CalendarSettingsState} */
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

/** @param {Event} event */
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
    requireCalendarValue(createForm, "create form").reset();
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

/**
 * The create request this form describes, or nothing when it is not yet complete.
 *
 * The scope member is optional because the form genuinely adds one only for the scope it is in:
 * a workspace subscription carries neither.
 * @typedef {{ name: string, scopeType: string, clientId?: string, projectId?: string }} CalendarCreatePayload
 * @returns {CalendarCreatePayload | null}
 */
function readCreatePayload() {
  const name = String(nameInput?.value || "").trim();
  const scopeType = String(scopeSelect?.value || "workspace");
  if (!name) {
    setStatus(createStatus, "Enter a calendar subscription name.", { type: "error" });
    nameInput?.focus();
    return null;
  }

  /** @type {CalendarCreatePayload} */
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

/**
 * @typedef {{ action?: string, subscriptionId: string }} CalendarSubscriptionFocus
 * @param {CalendarSubscriptionFocus | null} [focus]
 */
async function reloadSubscriptions(focus = null) {
  const api = requireApi();
  const body = await api.getJson("/api/private-feeds/calendar-subscriptions", { cache: "no-store" });
  state.subscriptions = normalizeSubscriptions(readCalendarSubscriptions(body));
  renderSubscriptions();
  if (focus) {
    restoreSubscriptionFocus(focus);
  }
}

/** @param {Event} event */
async function handleSubscriptionAction(event) {
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest("[data-calendar-subscription-action]");
  if (!(button instanceof HTMLElement)) {
    return;
  }
  const subscription = state.subscriptions.find((item) => item.subscriptionId === button.dataset.subscriptionId);
  if (!subscription) {
    return;
  }
  // A dataset member is absent as `undefined`, and an absent action matched neither branch
  // before; reading it as "" keeps both comparisons answering exactly what they answered.
  const action = button.dataset.calendarSubscriptionAction || "";

  if (action === "rotate") {
    await rotateSubscription(subscription, button);
  } else if (["revoke", "delete"].includes(action)) {
    await removeSubscription(subscription, button);
  }
}

/** @param {CalendarSubscriptionRow} subscription @param {HTMLElement} trigger */
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
    // Sent with no body, which `requestJson` treats as a real request shape: it omits both the
    // body and the Content-Type header. Passing `{}` here would add both, so the absence is
    // stated rather than filled in.
    const secret = readCalendarSubscriptionSecret(await api.postJson(
      `/api/private-feeds/calendar-subscriptions/${encodeURIComponent(subscription.subscriptionId)}/rotate`,
      undefined,
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

/** @param {CalendarSubscriptionRow} subscription @param {HTMLElement} trigger */
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

/** @param {string} subscriptionId */
async function reloadSubscriptionsAfterRemoval(subscriptionId) {
  const removedIndex = state.subscriptions.findIndex((item) => item.subscriptionId === subscriptionId);
  await reloadSubscriptions();
  const rows = [...(subscriptionList?.querySelectorAll("tr[data-subscription-id]") || [])];
  const focusRow = rows[Math.min(Math.max(removedIndex, 0), rows.length - 1)];
  focusCalendarElement(focusRow || createButton);
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
  /** @type {CalendarGroupedProjectOption[]} */
  const groupedProjects = projects;
  const previousValue = projectSelect.value;
  projectSelect.replaceChildren(
    option("", projects.length > 0 ? "Choose a project" : "No readable projects"),
    ...groupedProjects.map((project) => option(
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

/** @param {CalendarSubscriptionRow} subscription @returns {HTMLElement} */
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

/**
 * @param {string} label
 * @param {string} actionName
 * @param {string} subscriptionId
 * @param {{ danger?: boolean, disabled?: boolean }} [options]
 * @returns {HTMLButtonElement}
 */
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

/** @param {string} subscriptionId @param {boolean} isBusy */
function setListBusy(subscriptionId, isBusy) {
  subscriptionList
    ?.querySelectorAll(`[data-subscription-id="${CSS.escape(subscriptionId)}"] button`)
    .forEach((button) => {
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }

      button.disabled = isBusy || (
        button.dataset.calendarSubscriptionAction === "rotate" && !state.tasksEnabled
      );
    });
}

/** @param {CalendarSubscriptionFocus} focus */
function restoreSubscriptionFocus(focus) {
  const row = subscriptionList?.querySelector(
    `tr[data-subscription-id="${CSS.escape(focus.subscriptionId)}"]`,
  );
  const action = focus.action && row?.querySelector(
    `[data-calendar-subscription-action="${CSS.escape(focus.action)}"]`,
  );
  focusCalendarElement(action || row);
}

/** @param {string} feedUrl @param {unknown} subscription @param {string} operation */
function showSecret(feedUrl, subscription, operation) {
  currentSecret = String(feedUrl || "");
  if (!currentSecret) {
    clearSecret();
    return;
  }
  const field = requireCalendarValue(secretInput, "subscription URL field");

  field.value = currentSecret;
  field.type = "password";
  requireCalendarValue(revealButton, "reveal button").textContent = "Reveal URL";
  requireCalendarValue(secretPanel, "secret panel").hidden = false;
  requireCalendarValue(secretDetail, "secret detail").textContent
    = `${readSubscriptionName(subscription)} was ${operation}. Copy this private URL now.`;
  setStatus(secretStatus, "");
  field.focus();
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
  const field = requireCalendarValue(secretInput, "subscription URL field");
  const reveal = field.type === "password";

  field.type = reveal ? "text" : "password";
  requireCalendarValue(revealButton, "reveal button").textContent = reveal ? "Hide URL" : "Reveal URL";
}

async function copySecret() {
  if (!currentSecret) {
    return;
  }
  try {
    await navigator.clipboard.writeText(currentSecret);
  } catch {
    const field = requireCalendarValue(secretInput, "subscription URL field");

    field.select();
    document.execCommand("copy");
    field.setSelectionRange(0, 0);
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

/** @param {boolean} isBusy */
function setCreateBusy(isBusy) {
  for (const control of [nameInput, scopeSelect, clientSelect, projectSelect, createButton]) {
    if (control) {
      control.disabled = isBusy || (!state.tasksEnabled && control === createButton);
    }
  }
}

/** @param {unknown} subscriptions @returns {CalendarSubscriptionRow[]} */
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

/** @param {unknown} clients @returns {CalendarClientOption[]} */
function normalizeClients(clients) {
  return Array.isArray(clients) ? clients.map((client) => ({
    id: String(client?.id || ""),
    label: String(client?.name || "Untitled Client"),
    projects: normalizeProjects(client?.projects),
  })).filter((client) => client.id) : [];
}

/** @param {unknown} projects @returns {CalendarProjectOption[]} */
function normalizeProjects(projects) {
  return Array.isArray(projects) ? projects.map((project) => ({
    id: String(project?.id || ""),
    label: String(project?.name || "Untitled Project"),
  })).filter((project) => project.id) : [];
}

/** @param {unknown} value @returns {string} */
function normalizeWorkspaceType(value) {
  const workspaceType = String(value || "").trim().toLowerCase();
  return ["business", "personal", "family"].includes(workspaceType)
    ? workspaceType
    : "business";
}

function usesBusinessScopes() {
  return state.workspaceType === "business";
}

/** @param {string} value @returns {string} */
function formatWorkspaceType(value) {
  return value === "family" ? "Family" : "Personal";
}

/** @param {string} value @param {string} label @returns {HTMLOptionElement} */
function option(value, label) {
  const element = document.createElement("option");
  element.value = value;
  element.textContent = label;
  return element;
}

/** @param {string} value @returns {HTMLElement} */
function cell(value) {
  const element = document.createElement("td");
  element.textContent = value || "—";
  return element;
}

/** @param {string} status @returns {string} */
function formatStatus(status) {
  return status === "active" ? "Active" : "Revoked";
}

/** @param {string | null} value @returns {string} */
function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "—";
}

/**
 * @param {HTMLElement | null} element
 * @param {string} message
 * @param {{ clearAfter?: number, isError?: boolean, type?: string }} [options]
 * @returns {void}
 */
function setStatus(element, message, options = {}) {
  requireStatusMessage().set(element, message, options);
}

/**
 * @param {unknown} error
 * @param {HTMLElement | null} statusElement
 * @param {string} fallbackMessage
 * @returns {void}
 */
/**
 * Restore focus to whichever element survived a reload.
 *
 * Narrowed rather than optional-chained on the call sites, because only an `HTMLElement` carries
 * `focus`; every element these two restorations choose from is one.
 * @param {Element | null | undefined} element
 * @returns {void}
 */
function focusCalendarElement(element) {
  if (element instanceof HTMLElement) {
    element.focus();
  }
}

/**
 * The name an acknowledged subscription carries, when it carries one.
 * @param {unknown} subscription
 * @returns {string}
 */
function readSubscriptionName(subscription) {
  if (typeof subscription !== "object" || subscription === null || !Object.hasOwn(subscription, "name")) {
    return "This subscription";
  }

  const name = /** @type {Record<string, unknown>} */ (subscription).name;
  return name ? String(name) : "This subscription";
}

/**
 * @param {unknown} error
 * @param {HTMLElement | null} statusElement
 * @param {string} fallbackMessage
 * @returns {void}
 */
function handleApiError(error, statusElement, fallbackMessage) {
  const caught = typeof error === "object" && error !== null ? error : {};

  if ("status" in caught && caught.status === 401) {
    window.location.replace("/login.html");
    return;
  }

  const message = "message" in caught ? caught.message : undefined;
  setStatus(statusElement, typeof message === "string" && message ? message : fallbackMessage, { type: "error" });
}
}());
