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
  preferences: [],
};

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.filter = button.dataset.notificationFilter || "active";
    state.page = 0;
    filterButtons.forEach((candidate) => {
      candidate.setAttribute("aria-pressed", String(candidate === button));
    });
    loadNotifications();
  });
});

moduleFilter?.addEventListener("change", renderNotifications);
markAllReadButton?.addEventListener("click", markAllRead);
preferenceForm?.addEventListener("submit", savePreferences);

loadNotificationsPage();

async function loadNotificationsPage() {
  await Promise.all([loadNotifications(), loadPreferences()]);
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
    const response = await fetch(`/api/notifications?${params}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Notifications unavailable.");
    }

    const body = await response.json();
    state.notifications = Array.isArray(body.notifications) ? body.notifications : [];
    populateModuleFilter();
    renderNotifications();
    setStatus("");
  } catch {
    state.notifications = [];
    renderNotifications();
    setStatus("Notifications unavailable.", true);
  }
}

async function loadPreferences() {
  try {
    const body = await window.LongtailForge.notificationPreferences.loadPreferences();
    state.preferences = body.events;
    renderPreferences(body.canManageWorkspaceDefaults === true);
  } catch {
    state.preferences = [];
    renderPreferences(false);
  }
}

function populateModuleFilter() {
  if (!moduleFilter) {
    return;
  }

  const previousValue = moduleFilter.value;
  const moduleIds = [...new Set(state.notifications.map((notification) => notification.module_id).filter(Boolean))].sort();
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
    ? filteredNotifications.map(createNotificationRow)
    : [emptyElement("No notifications")]));
  renderPagination(filteredNotifications.length);
}

function renderPagination(rowCount) {
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
  next.disabled = rowCount < state.pageSize;
  next.addEventListener("click", () => {
    state.page += 1;
    loadNotifications();
  });

  label.textContent = `Page ${state.page + 1}`;
  controls.append(previous, label, next);
  notificationList.after(controls);
}

function createNotificationRow(notification) {
  const row = document.createElement("article");
  const heading = document.createElement("div");
  const title = notification.url ? document.createElement("a") : document.createElement("span");
  const badge = document.createElement("span");
  const body = document.createElement("p");
  const meta = document.createElement("p");
  const actions = document.createElement("div");
  const readButton = createNotificationActionButton("Read", "complete");
  const dismissButton = createNotificationActionButton("Dismiss", "close", { danger: true });
  const displayTitle = notificationDisplayTitle(notification);
  const contextTitle = notificationContextTitle(notification);

  row.className = `notification-row is-${notification.status || "unread"}`;
  heading.className = "notification-row-heading";

  title.textContent = displayTitle;
  if (contextTitle) {
    title.title = contextTitle;
  }
  if (notification.url) {
    title.href = notification.url;
  }

  badge.className = "notification-status-badge";
  badge.textContent = notification.status || "unread";
  heading.append(title, badge);

  body.textContent = notification.body || "";
  meta.className = "notification-meta";
  meta.textContent = notificationMetaParts(notification).join(" - ");

  actions.className = "notification-row-actions";
  readButton.disabled = notification.status !== "unread";
  readButton.addEventListener("click", () => mutateNotification(notification.notification_id, "read"));
  dismissButton.disabled = notification.status === "dismissed";
  dismissButton.addEventListener("click", () => mutateNotification(notification.notification_id, "dismiss"));
  actions.append(readButton, dismissButton);

  row.append(heading, body, meta, actions);
  return row;
}

function createNotificationActionButton(label, icon, options = {}) {
  if (window.LongtailForge.icons?.createIconButton) {
    return window.LongtailForge.icons.createIconButton({
      icon,
      label,
      title: label,
      variant: options.danger ? "danger" : "",
    });
  }

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
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

function renderPreferences(canManageWorkspaceDefaults) {
  window.LongtailForge.notificationPreferences.renderPreferenceGroups(preferenceList, state.preferences, {
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
}

async function savePreferences(event) {
  event.preventDefault();
  const preferences = window.LongtailForge.notificationPreferences.readUserPreferencesPayload(preferenceList);
  const defaults = window.LongtailForge.notificationPreferences.readWorkspaceDefaultsPayload(preferenceList);

  try {
    await window.LongtailForge.notificationPreferences.saveUserPreferences(preferences);

    if (defaults.length > 0) {
      await window.LongtailForge.notificationPreferences.saveWorkspaceDefaults(defaults);
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

function formatDate(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}
