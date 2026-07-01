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
  notifications: [],
  page: 0,
  pageSize: 25,
  pagination: {
    hasMore: false,
    total: 0,
  },
  groupingPreferences: { groupingMode: "client_project" },
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

    const body = await response.json();
    state.notifications = Array.isArray(body.notifications) ? body.notifications : [];
    state.pagination = normalizeNotificationPagination(body.pagination);
    populateModuleFilter(body.filterOptions);
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
