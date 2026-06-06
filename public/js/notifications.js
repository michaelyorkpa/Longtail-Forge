const notificationList = document.querySelector("[data-notification-page-list]");
const notificationStatus = document.querySelector("[data-notification-status]");
const moduleFilter = document.querySelector("[data-notification-module-filter]");
const markAllReadButton = document.querySelector("[data-mark-all-notifications-read]");
const preferenceForm = document.querySelector("[data-notification-preferences-form]");
const preferenceList = document.querySelector("[data-notification-preference-list]");
const filterButtons = [...document.querySelectorAll("[data-notification-filter]")];

const state = {
  filter: "all",
  notifications: [],
  page: 0,
  pageSize: 25,
  preferences: [],
};

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.filter = button.dataset.notificationFilter || "all";
    filterButtons.forEach((candidate) => {
      candidate.setAttribute("aria-pressed", String(candidate === button));
    });
    renderNotifications();
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
    const response = await fetch("/api/notifications/preferences", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Preferences unavailable.");
    }

    const body = await response.json();
    state.preferences = Array.isArray(body.events) ? body.events : [];
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
    const statusMatch = state.filter === "all" || notification.status === state.filter;
    const moduleMatch = !moduleFilter?.value || notification.module_id === moduleFilter.value;
    return statusMatch && moduleMatch;
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
  const readButton = document.createElement("button");
  const dismissButton = document.createElement("button");

  row.className = `notification-row is-${notification.status || "unread"}`;
  heading.className = "notification-row-heading";

  title.textContent = notification.title || "Notification";
  if (notification.url) {
    title.href = notification.url;
  }

  badge.className = "notification-status-badge";
  badge.textContent = notification.status || "unread";
  heading.append(title, badge);

  body.textContent = notification.body || "";
  meta.className = "notification-meta";
  meta.textContent = [
    notification.module_id || "framework",
    notification.event_type,
    formatDate(notification.created_at),
  ].filter(Boolean).join(" · ");

  actions.className = "notification-row-actions";
  readButton.type = "button";
  readButton.textContent = "Read";
  readButton.disabled = notification.status !== "unread";
  readButton.addEventListener("click", () => mutateNotification(notification.notification_id, "read"));
  dismissButton.type = "button";
  dismissButton.textContent = "Dismiss";
  dismissButton.disabled = notification.status === "dismissed";
  dismissButton.addEventListener("click", () => mutateNotification(notification.notification_id, "dismiss"));
  actions.append(readButton, dismissButton);

  row.append(heading, body, meta, actions);
  return row;
}

function renderPreferences(canManageWorkspaceDefaults) {
  if (!preferenceList) {
    return;
  }

  preferenceList.replaceChildren(...(state.preferences.length > 0
    ? state.preferences.map((preference) => createPreferenceRow(preference, canManageWorkspaceDefaults))
    : [emptyElement("No configurable notification types")]));
}

function createPreferenceRow(preference, canManageWorkspaceDefaults) {
  const row = document.createElement("fieldset");
  const legend = document.createElement("legend");
  const description = document.createElement("p");
  const userToggle = document.createElement("label");
  const userInput = document.createElement("input");

  row.className = "notification-preference-row";
  row.dataset.notificationEventId = preference.id;

  legend.textContent = preference.label || preference.id;
  description.textContent = preference.description || "";
  description.className = "muted-text";

  userInput.type = "checkbox";
  userInput.checked = preference.userEnabled !== false;
  userInput.dataset.preferenceUserEnabled = "";
  userToggle.append(userInput, document.createTextNode(" Enabled"));

  row.append(legend, description, userToggle);

  if (canManageWorkspaceDefaults) {
    const workspaceToggle = document.createElement("label");
    const workspaceInput = document.createElement("input");
    const priorityLabel = document.createElement("label");
    const prioritySelect = document.createElement("select");

    workspaceInput.type = "checkbox";
    workspaceInput.checked = preference.workspaceEnabled !== false;
    workspaceInput.dataset.preferenceWorkspaceEnabled = "";
    workspaceToggle.append(workspaceInput, document.createTextNode(" Workspace default"));

    prioritySelect.dataset.preferenceWorkspacePriority = "";
    ["low", "normal", "high", "urgent"].forEach((priority) => {
      prioritySelect.append(optionElement(priority, priority));
    });
    prioritySelect.value = preference.workspacePriority || preference.defaultPriority || "normal";
    priorityLabel.append(document.createTextNode("Priority"), prioritySelect);

    row.append(workspaceToggle, priorityLabel);
  }

  return row;
}

async function mutateNotification(notificationId, action) {
  const response = await fetch(`/api/notifications/${encodeURIComponent(notificationId)}/${action}`, {
    method: "POST",
  });
  if (!response.ok) {
    setStatus("Notification action failed.", true);
    return;
  }

  await loadNotifications();
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
  const rows = [...preferenceList.querySelectorAll("[data-notification-event-id]")];
  const preferences = rows.map((row) => ({
    id: row.dataset.notificationEventId,
    enabled: row.querySelector("[data-preference-user-enabled]")?.checked !== false,
  }));
  const defaults = rows
    .filter((row) => row.querySelector("[data-preference-workspace-enabled]"))
    .map((row) => ({
      id: row.dataset.notificationEventId,
      enabled: row.querySelector("[data-preference-workspace-enabled]")?.checked !== false,
      priority: row.querySelector("[data-preference-workspace-priority]")?.value || "normal",
    }));

  const userResponse = await fetch("/api/notifications/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ preferences }),
  });

  if (!userResponse.ok) {
    setStatus("Unable to save preferences.", true);
    return;
  }

  if (defaults.length > 0) {
    const defaultsResponse = await fetch("/api/notifications/workspace-defaults", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaults }),
    });

    if (!defaultsResponse.ok) {
      setStatus("Unable to save workspace defaults.", true);
      return;
    }
  }

  await loadPreferences();
  setStatus("Notification preferences saved.");
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
