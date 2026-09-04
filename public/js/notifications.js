(function initializeNotificationsPage() {
const notificationList = document.querySelector("[data-notification-page-list]");
const notificationStatus = document.querySelector("[data-notification-status]");
const moduleFilter = document.querySelector("[data-notification-module-filter]");
const markAllReadButton = document.querySelector("[data-mark-all-notifications-read]");
const preferenceForm = document.querySelector("[data-notification-preferences-form]");
const preferenceList = document.querySelector("[data-notification-preference-list]");
const filterButtons = [...document.querySelectorAll("[data-notification-filter]")];

const state = {
  filter: "active",
  /**
   * The notifications this page vouched for.
   *
   * Annotated because the empty initializer infers `never[]`, which the narrowed response cannot
   * be assigned to. Measured after the reader landed rather than assumed: it is the one direct
   * response handoff this child creates.
   * @type {import("../../src/types/browser-contracts.js").BrowserNotification[]}
   */
  notifications: [],
  page: 0,
  pageSize: 25,
  pagination: {
    hasMore: false,
    total: 0,
  },
  groupingPreferences: { groupingMode: "client_project" },
  /**
   * The configurable notification events as `loadPreferences` narrowed them.
   *
   * **The direct storage handoff for `0.33.33.38.4.10`'s catalogue contract, and the only state
   * slot this checkpoint adopts.** It inferred as an empty array of nothing, so no checked value
   * could be assigned to it once `loadPreferences` stopped returning raw wire elements. Every other
   * field in this store belongs to its `0.33.33.39`-`.44` owner.
   * @type {import("../../src/types/browser-contracts.js").BrowserNotificationEventPreference[]}
   */
  preferences: [],
};

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.filter = button.dataset.notificationFilter || "active";
    state.page = 0;
    updateFilterPressedState();
    loadNotifications();
  });
});

moduleFilter?.addEventListener("change", () => {
  state.page = 0;
  loadNotifications();
});
markAllReadButton?.addEventListener("click", markAllRead);
preferenceForm?.addEventListener("submit", savePreferences);

loadNotificationsPage();

async function loadNotificationsPage() {
  updateFilterPressedState();
  await Promise.allSettled([loadNotifications(), loadPreferences()]);
}

/** The seventeen members `notificationRowToAppValue` reconstructs, plus the three text members the decorator adds. */
const NOTIFICATION_TEXT_MEMBERS = Object.freeze([
  "actor_user_id", "body", "created_at", "dismissed_at", "displayTitle", "displayType",
  "event_type", "module_id", "notification_id", "read_at", "recipient_user_id", "record_id",
  "record_type", "title", "updateTypeLabel", "url", "workspace_id",
]);

/** The unconditional members of `readTargetMetadata`'s base object. */
const NOTIFICATION_TARGET_TEXT_MEMBERS = Object.freeze(["moduleId", "recordId", "recordType", "url"]);

/** The status vocabulary the column's CHECK constraint admits. */
const NOTIFICATION_STATUSES = Object.freeze(["unread", "read", "dismissed", "archived"]);

/** The priority vocabulary the column's CHECK constraint admits. */
const NOTIFICATION_PRIORITIES = Object.freeze(["low", "normal", "high", "urgent"]);

/** The four bounded-pagination members the shared envelope always answers as finite numbers. */
const NOTIFICATION_PAGINATION_NUMBERS = Object.freeze(["limit", "maxPageSize", "offset", "returned"]);

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isNotificationRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** @param {unknown} value @param {readonly string[]} members @returns {boolean} */
function hasNotificationText(value, members) {
  return isNotificationRecord(value) && members.every((member) => typeof value[member] === "string");
}

/** @param {unknown} value @returns {boolean} */
function isNotificationStringList(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string" && entry !== "");
}

/**
 * A URL this page may put in an `href`.
 *
 * **The server guard is not sufficient and this is not the place to fix it.**
 * `safeRelativeUrl` rejects any value carrying a URI scheme, so `javascript:`, `data:` and
 * `vbscript:` cannot be stored - but a protocol-relative `//host/path`, and the backslash forms
 * a browser normalises into one, carry no scheme and pass it. Resolved against the page they
 * navigate to another origin. A notification URL is either empty or a path on this app, so that
 * is what is checked here.
 * @param {unknown} value
 * @returns {value is string}
 */
function isApplicationRelativeUrl(value) {
  if (typeof value !== "string" || value === "") {
    return value === "";
  }

  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\");
}

/** @param {unknown} value @returns {value is import("../../src/types/browser-contracts.js").BrowserNotificationRecordTarget} */
function isNotificationTarget(value) {
  return isNotificationRecord(value)
    && hasNotificationText(value, NOTIFICATION_TARGET_TEXT_MEMBERS)
    && typeof value.canOpen === "boolean"
    && typeof value.targetExists === "boolean"
    && isApplicationRelativeUrl(value.url)
    && (value.label === undefined || typeof value.label === "string")
    && (value.context === undefined || hasNotificationText(value.context, ["clientName", "projectName"]));
}

/**
 * One notification as the list producer decorates it.
 *
 * **Exact, because the spread source is a total reconstruction.** Every member checked here is
 * named by `notificationRowToAppValue` or added by `decorateForSession`, and the row normaliser
 * turns every nullable column into `""`, so nothing is nullable.
 *
 * **The protected-note redaction is checked as a whole.** The decorator answers a redacted
 * notification when a note target does not exist, and a record that claims one half of that
 * redaction without the other did not come from it.
 * @param {unknown} value
 * @returns {value is import("../../src/types/browser-contracts.js").BrowserNotification}
 */
function isNotificationRecordValue(value) {
  if (!isNotificationRecord(value)
    || !hasNotificationText(value, NOTIFICATION_TEXT_MEMBERS)
    || value.notification_id === ""
    || !NOTIFICATION_STATUSES.some((status) => status === value.status)
    || !NOTIFICATION_PRIORITIES.some((priority) => priority === value.priority)
    || !isNotificationRecord(value.metadata)
    || !isNotificationTarget(value.target)
    || !isApplicationRelativeUrl(value.url)) {
    return false;
  }

  const target = value.target;

  // A non-openable target carries no navigable URL, because the decorator writes `""` for it.
  if (!target.canOpen && value.url !== "") {
    return false;
  }

  // The redaction is all of it or none of it.
  if (value.record_type === "note" && target.targetExists === false) {
    return value.title === "Protected or unavailable note"
      && value.displayTitle === "Protected or unavailable note"
      && value.body === ""
      && Object.keys(value.metadata).length === 0;
  }

  return true;
}

/** @param {unknown} value @returns {value is import("../../src/types/browser-contracts.js").BrowserBoundedPagination} */
function isNotificationPagination(value) {
  return isNotificationRecord(value)
    && NOTIFICATION_PAGINATION_NUMBERS.every((member) => typeof value[member] === "number" && Number.isFinite(value[member]))
    && typeof value.hasMore === "boolean"
    && typeof value.nextCursor === "string"
    && (value.total === null || (typeof value.total === "number" && Number.isFinite(value.total)));
}

/**
 * The notification list, or `null` when the body is not one this producer sent.
 *
 * **One malformed notification refuses the whole response.** This is the recipient's
 * authoritative notification list, and the raw read defaulted an unreadable body to an empty
 * array - which rendered "No notifications" for a response the browser never understood.
 * A genuinely empty list stays a real answer.
 *
 * **The producer's own array and records are answered, not rebuilt**, so the members these
 * renderers do not yet read survive unpromised.
 * @param {unknown} body
 * @returns {body is import("../../src/types/browser-contracts.js").BrowserNotificationList}
 */
function isNotificationList(body) {
  return isNotificationRecord(body)
    && isNotificationRecord(body.filterOptions)
    && isNotificationStringList(body.filterOptions.events)
    && isNotificationStringList(body.filterOptions.modules)
    && isNotificationPagination(body.pagination)
    && Array.isArray(body.notifications)
    && body.notifications.every(isNotificationRecordValue);
}

/**
 * The notification list, or `null`.
 *
 * A predicate narrows and a cast asserts, so the checking happens in `isNotificationList` and
 * this only chooses between the narrowed value and the refusal.
 * @param {unknown} body
 * @returns {import("../../src/types/browser-contracts.js").BrowserNotificationList | null}
 */
function readNotificationList(body) {
  return isNotificationList(body) ? body : null;
}

async function loadNotifications() {
  setStatus("Loading notifications");

  try {
    const params = new URLSearchParams({
      limit: String(state.pageSize),
      offset: String(state.page * state.pageSize),
    });
    if (state.filter && state.filter !== "all") {
      params.set("status", state.filter);
    }
    if (moduleFilter?.value) {
      params.set("moduleId", moduleFilter.value);
    }
    const response = await fetch(`/api/notifications?${params}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Notifications unavailable.");
    }

    /** @type {unknown} */
    const body = await response.json();
    const list = readNotificationList(body);

    if (!list) {
      throw new Error("The notification list could not be read.");
    }

    state.notifications = list.notifications;
    state.pagination = normalizeNotificationPagination(list.pagination);
    populateModuleFilter(list.filterOptions);
    renderNotifications();
    setStatus("");
  } catch {
    state.notifications = [];
    state.pagination = { hasMore: false, total: 0 };
    renderNotifications();
    setStatus("Notifications unavailable.", true);
  }
}

async function loadPreferences() {
  const preferences = getNotificationPreferences();
  if (!preferences) {
    state.preferences = [];
    renderPreferences(false);
    return;
  }

  try {
    const body = await preferences.loadPreferences();
    state.preferences = body.events;
    state.groupingPreferences = body.groupingPreferences || { groupingMode: "client_project" };
    renderPreferences(body.canManageWorkspaceDefaults === true);
    renderNotifications();
  } catch {
    state.preferences = [];
    state.groupingPreferences = { groupingMode: "client_project" };
    renderPreferences(false);
  }
}

function populateModuleFilter(filterOptions = {}) {
  if (!moduleFilter) {
    return;
  }

  const previousValue = moduleFilter.value;
  const moduleIds = [...new Set([
    ...(Array.isArray(filterOptions.modules) ? filterOptions.modules : []),
    previousValue,
  ].filter(Boolean))].sort();

  moduleFilter.replaceChildren(
    optionElement("", "All"),
    ...moduleIds.map((moduleId) => optionElement(moduleId, moduleId)),
  );
  moduleFilter.value = moduleIds.includes(previousValue) ? previousValue : "";
}

function renderNotifications() {
  if (!notificationList) {
    return;
  }

  const filteredNotifications = state.notifications.filter((notification) => {
    const moduleMatch = !moduleFilter?.value || notification.module_id === moduleFilter.value;
    return moduleMatch;
  });

  notificationList.replaceChildren(...(filteredNotifications.length > 0
    ? groupNotificationsForDisplay(filteredNotifications).map(createNotificationGroup)
    : [emptyElement("No notifications")]));
  renderPagination();
}

function groupNotificationsForDisplay(notifications) {
  const groupingMode = normalizeGroupingMode(state.groupingPreferences?.groupingMode);
  const groups = new Map();

  sortNotificationsForDisplay(notifications).forEach((notification) => {
    const key = notificationGroupKey(notification, groupingMode);
    const group = groups.get(key.id) || {
      id: key.id,
      label: key.label,
      notifications: [],
    };

    group.notifications.push(notification);
    groups.set(key.id, group);
  });

  return [...groups.values()];
}

function createNotificationGroup(group) {
  const section = document.createElement("section");
  const heading = document.createElement("h2");
  const list = document.createElement("div");

  section.className = "notification-page-group";
  section.dataset.notificationPageGroup = group.id;
  heading.className = "notification-page-group-title";
  heading.textContent = group.label;
  list.className = "notification-page-group-list";
  list.append(...group.notifications.map(createNotificationRow));
  section.append(heading, list);
  return section;
}

function sortNotificationsForDisplay(notifications) {
  const priorityOrder = new Map([
    ["urgent", 0],
    ["high", 1],
    ["normal", 2],
    ["low", 3],
  ]);

  return [...notifications].sort((left, right) => (
    (priorityOrder.get(notificationPriority(left)) ?? 2) - (priorityOrder.get(notificationPriority(right)) ?? 2) ||
    String(right.created_at || "").localeCompare(String(left.created_at || "")) ||
    String(right.notification_id || "").localeCompare(String(left.notification_id || ""))
  ));
}

function notificationGroupKey(notification, groupingMode) {
  if (groupingMode === "notification_type") {
    const label = notificationUpdateTypeLabel(notification);
    return {
      id: `notification_type:${label}`,
      label,
    };
  }

  if (groupingMode === "record_type") {
    const label = formatRecordType(notification.target?.recordType || notification.record_type || "notification");
    return {
      id: `record_type:${label}`,
      label,
    };
  }

  const contextLabel = notificationContextTitle(notification);
  return {
    id: `client_project:${contextLabel || "No project context"}`,
    label: contextLabel || "No project context",
  };
}

function renderPagination() {
  const existing = document.querySelector("[data-notification-pagination]");
  existing?.remove();

  if (!notificationList) {
    return;
  }

  const controls = document.createElement("div");
  const previous = document.createElement("button");
  const next = document.createElement("button");
  const label = document.createElement("span");

  controls.className = "notification-pagination";
  controls.dataset.notificationPagination = "";

  previous.type = "button";
  previous.textContent = "Previous";
  previous.disabled = state.page === 0;
  previous.addEventListener("click", () => {
    state.page = Math.max(0, state.page - 1);
    loadNotifications();
  });

  next.type = "button";
  next.textContent = "Next";
  next.disabled = state.pagination.hasMore !== true;
  next.addEventListener("click", () => {
    state.page += 1;
    loadNotifications();
  });

  label.textContent = `Page ${state.page + 1}`;
  controls.append(previous, label, next);
  notificationList.after(controls);
}

function normalizeNotificationPagination(pagination = {}) {
  return {
    hasMore: pagination.hasMore === true,
    total: Number.parseInt(pagination.total, 10) || 0,
  };
}

function createNotificationRow(notification) {
  const row = document.createElement("article");
  const heading = document.createElement("div");
  const title = notification.url ? document.createElement("a") : document.createElement("span");
  const badges = document.createElement("div");
  const typeBadge = document.createElement("span");
  const badge = document.createElement("span");
  const body = document.createElement("p");
  const meta = document.createElement("p");
  const actions = document.createElement("div");
  const readButton = createNotificationActionButton("Read", "complete");
  const dismissButton = createNotificationActionButton("Dismiss", "close", { danger: true });
  const displayTitle = notificationDisplayTitle(notification);
  const contextTitle = notificationContextTitle(notification);

  row.className = `notification-row surface-card is-${notification.status || "unread"}`;
  heading.className = "notification-row-heading";
  badges.className = "notification-row-badges";

  title.textContent = displayTitle;
  if (contextTitle) {
    title.title = contextTitle;
  }
  if (notification.url) {
    title.href = notification.url;
  }

  typeBadge.className = "notification-type-badge";
  typeBadge.textContent = notificationUpdateTypeLabel(notification);
  badge.className = "notification-status-badge";
  badge.textContent = notification.status || "unread";
  badges.append(typeBadge, badge);
  heading.append(title, badges);

  body.textContent = notification.body || "";
  meta.className = "notification-meta";
  meta.textContent = notificationMetaParts(notification).join(" - ");

  actions.className = "notification-row-actions surface-dense-actions";
  readButton.disabled = notification.status !== "unread";
  readButton.addEventListener("click", () => mutateNotification(notification.notification_id, "read"));
  dismissButton.disabled = notification.status === "dismissed";
  dismissButton.addEventListener("click", () => mutateNotification(notification.notification_id, "dismiss"));
  actions.append(readButton, dismissButton);

  row.append(heading, body, meta, actions);
  return row;
}

function createNotificationActionButton(label, icon, options = {}) {
  try {
    if (window.LongtailForge?.icons?.createIconButton) {
      return window.LongtailForge.icons.createIconButton({
        icon,
        label,
        title: label,
        variant: options.danger ? "danger" : "",
      });
    }
  } catch {
    // Fall back to a plain button so optional icon failures cannot blank the notifications list.
  }

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.classList.toggle("danger-button", options.danger === true);
  return button;
}

function notificationDisplayTitle(notification) {
  return notification.displayTitle || notification.target?.label || notification.title || "Notification";
}

function notificationContextTitle(notification) {
  if (notification.target?.recordType !== "task") {
    return "";
  }

  const context = notification.target?.context || {};
  const workspaceType = window.LongtailForge?.workspaceContext?.workspaceType || "business";
  const projectName = String(context.projectName || "").trim();
  const clientName = String(context.clientName || "").trim();

  if (workspaceType === "business") {
    return [clientName, projectName].filter(Boolean).join(" / ");
  }

  return projectName;
}

function notificationMetaParts(notification) {
  const date = formatDate(notification.created_at);

  if (notification.target?.recordType === "task") {
    return [notification.module_id || "framework", date].filter(Boolean);
  }

  return [
    notification.module_id || "framework",
    notification.event_type,
    date,
  ].filter(Boolean);
}

function notificationUpdateTypeLabel(notification) {
  return notification.updateTypeLabel || notification.displayType || notification.event_type || "Notification";
}

function notificationPriority(notification) {
  const priority = String(notification?.priority || "normal").trim().toLowerCase();
  return ["low", "normal", "high", "urgent"].includes(priority) ? priority : "normal";
}

function normalizeGroupingMode(value) {
  return ["client_project", "notification_type", "record_type"].includes(value) ? value : "client_project";
}

function formatRecordType(recordType) {
  return String(recordType || "notification")
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Notification";
}

function renderPreferences(canManageWorkspaceDefaults) {
  const preferences = getNotificationPreferences();

  if (!preferenceList) {
    return;
  }

  if (!preferences?.renderPreferenceGroups) {
    preferenceList.replaceChildren(emptyElement("Notification preferences unavailable."));
    return;
  }

  preferences.renderPreferenceGroups(preferenceList, state.preferences, {
    canManageWorkspaceDefaults,
    emptyText: "No configurable notification types",
    headingLevel: "h3",
    includeWorkspaceDefaults: true,
  });
}

async function mutateNotification(notificationId, action) {
  try {
    const response = await fetch(`/api/notifications/${encodeURIComponent(notificationId)}/${action}`, {
      method: "POST",
    });
    if (!response.ok) {
      throw new Error("Notification action failed.");
    }

    await loadNotifications();
    await refreshNotificationCount();
  } catch {
    setStatus("Notification action failed.", true);
  }
}

async function markAllRead() {
  const response = await fetch("/api/notifications/read-all", { method: "POST" });
  if (!response.ok) {
    setStatus("Unable to mark notifications read.", true);
    return;
  }

  await loadNotifications();
  await refreshNotificationCount();
}

async function savePreferences(event) {
  event.preventDefault();
  const preferenceHelper = getNotificationPreferences();
  if (!preferenceHelper) {
    setStatus("Notification preferences unavailable.", true);
    return;
  }

  const preferences = preferenceHelper.readUserPreferencesPayload(preferenceList);
  const defaults = preferenceHelper.readWorkspaceDefaultsPayload(preferenceList);

  try {
    await preferenceHelper.saveUserPreferences(preferences);

    if (defaults.length > 0) {
      await preferenceHelper.saveWorkspaceDefaults(defaults);
    }

    await loadPreferences();
    setStatus("Notification preferences saved.");
  } catch {
    setStatus("Unable to save preferences.", true);
  }
}

function optionElement(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function emptyElement(text) {
  const empty = document.createElement("p");
  empty.className = "placeholder-copy";
  empty.textContent = text;
  return empty;
}

function setStatus(message, isError = false) {
  if (!notificationStatus) {
    return;
  }

  notificationStatus.textContent = message;
  notificationStatus.classList.toggle("is-error", isError);
}

window.LongtailForge = window.LongtailForge || {};
window.LongtailForge.notificationsPageReady = true;

function updateFilterPressedState() {
  filterButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String((button.dataset.notificationFilter || "active") === state.filter));
  });
}

function getNotificationPreferences() {
  return window.LongtailForge?.notificationPreferences || null;
}

async function refreshNotificationCount() {
  if (!window.LongtailForge?.refreshNotifications) {
    return;
  }

  try {
    await window.LongtailForge.refreshNotifications();
  } catch {
    // The page list is already refreshed; the shell count can retry on the next shell refresh.
  }
}

function formatDate(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}
})();
