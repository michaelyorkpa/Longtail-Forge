// Shared authenticated app shell. Add/remove menu items here instead of editing every page.
const DEFAULT_WORKSPACE_NAME = "Workspace";
const WORKSPACE_CONTEXT_STORAGE_KEY = "lf_workspace_context";
const NAV_ITEMS = [
  { label: "Dashboard", href: "dashboard.html" },
  { label: "Workbench", href: "workbench.html" },
  {
    label: "Settings",
    items: [
      {
        label: "Workspace",
        items: [
          { label: "Workspace Settings", href: "workspace-settings.html" },
          { label: "Files", href: "files-settings.html" },
          { label: "User Admin", href: "user-admin.html" },
          { label: "API Keys", href: "api-keys.html" },
          { label: "Audit Log", href: "audit-log.html" },
        ],
      },
      { label: "User", href: "user-settings.html" },
      { label: "Help", href: "help.html" },
    ],
  },
];

const siteHeader = buildSiteHeader();
document.body.prepend(siteHeader);

const navToggle = siteHeader.querySelector(".nav-toggle");
const navLinks = siteHeader.querySelector("#primary-menu");
const notificationBell = siteHeader.querySelector("[data-notification-bell]");
const notificationCount = siteHeader.querySelector("[data-notification-count]");
const notificationPanel = siteHeader.querySelector("[data-notification-panel]");
const notificationList = siteHeader.querySelector("[data-notification-list]");
const notificationReadAll = siteHeader.querySelector("[data-notification-read-all]");
const notificationDismissAll = siteHeader.querySelector("[data-notification-dismiss-all]");
const globalSearchShell = siteHeader.querySelector("[data-global-search-shell]");
const globalSearchToggle = siteHeader.querySelector("[data-global-search-toggle]");
const globalSearchForm = siteHeader.querySelector("[data-global-search-form]");
const globalSearchInput = siteHeader.querySelector("[data-global-search-input]");
const globalSearchTarget = siteHeader.querySelector("[data-global-search-target]");
const workspaceSelector = siteHeader.querySelector("[data-workspace-selector]");

applyCachedWorkspaceContext();

if (navToggle && navLinks) {
  navToggle.addEventListener("click", () => {
    const isOpen = navToggle.getAttribute("aria-expanded") === "true";

    navToggle.setAttribute("aria-expanded", String(!isOpen));
    navLinks.classList.toggle("is-open", !isOpen);
  });
}

if (notificationBell) {
  notificationBell.addEventListener("click", () => {
    const isOpen = notificationBell.getAttribute("aria-expanded") === "true";
    notificationBell.setAttribute("aria-expanded", String(!isOpen));
    notificationPanel.hidden = isOpen;
    if (!isOpen) {
      loadNotificationPanel();
    }
  });
}

notificationReadAll?.addEventListener("click", () => mutateAllNotifications("read-all"));
notificationDismissAll?.addEventListener("click", () => mutateAllNotifications("dismiss-all"));

if (globalSearchToggle) {
  globalSearchToggle.addEventListener("click", () => {
    const isOpen = globalSearchToggle.getAttribute("aria-expanded") === "true";

    setGlobalSearchOpen(!isOpen);
    if (isOpen) {
      return;
    }

    window.setTimeout(() => globalSearchInput?.focus(), 0);
  });
}

if (globalSearchForm) {
  globalSearchForm.addEventListener("submit", submitGlobalSearch);
}

siteHeader.addEventListener("toggle", (event) => {
  const openedMenu = event.target;

  if (openedMenu?.tagName !== "DETAILS" || !openedMenu.open || !openedMenu.classList.contains("nav-menu")) {
    return;
  }

  siteHeader.querySelectorAll(".nav-menu[open]").forEach((menu) => {
    if (menu === openedMenu || menu.contains(openedMenu) || openedMenu.contains(menu)) {
      return;
    }

    menu.open = false;
  });
}, true);

window.LongtailForge = window.LongtailForge || {};
window.LongtailForge.getWorkspaceProjectsLabel = getWorkspaceProjectsLabel;
window.LongtailForge.refreshNotifications = refreshNotificationCount;
window.LongtailForge.workspaceContextReady = loadAppShellBootstrap();

function buildSiteHeader() {
  // Build the header at runtime so page HTML can stay focused on page-specific content.
  const header = document.createElement("header");
  const nav = document.createElement("nav");
  const brand = document.createElement("div");
  const homeLink = document.createElement("a");
  const workspaceSelect = document.createElement("select");
  const searchShell = document.createElement("div");
  const searchButton = document.createElement("button");
  const searchButtonIcon = document.createElement("span");
  const searchForm = document.createElement("form");
  const searchInput = document.createElement("input");
  const searchTarget = document.createElement("select");
  const notificationWrap = document.createElement("div");
  const notificationButton = document.createElement("button");
  const notificationIcon = document.createElement("span");
  const notificationBadge = document.createElement("span");
  const notificationPanelElement = document.createElement("div");
  const notificationPanelHeader = document.createElement("div");
  const notificationPanelTitle = document.createElement("strong");
  const notificationPageLink = document.createElement("a");
  const notificationItems = document.createElement("div");
  const notificationPanelFooter = document.createElement("div");
  const notificationReadAllButton = document.createElement("button");
  const notificationDismissAllButton = document.createElement("button");
  const toggle = document.createElement("button");
  const links = document.createElement("div");
  const currentPage = getCurrentPage();

  header.className = "site-header";
  nav.className = "site-nav";
  nav.setAttribute("aria-label", "Primary");

  brand.className = "site-brand";

  homeLink.href = "dashboard.html";
  homeLink.textContent = "Longtail Forge";

  workspaceSelect.className = "workspace-selector";
  workspaceSelect.dataset.workspaceSelector = "";
  workspaceSelect.setAttribute("aria-label", "Active workspace");
  workspaceSelect.disabled = true;
  workspaceSelect.append(createWorkspaceOption(DEFAULT_WORKSPACE_NAME));

  brand.append(homeLink, workspaceSelect);

  searchShell.className = "global-search-shell";
  searchShell.dataset.globalSearchShell = "";
  searchShell.hidden = true;

  searchButton.className = "global-search-toggle";
  searchButton.type = "button";
  searchButton.dataset.globalSearchToggle = "";
  searchButton.setAttribute("aria-expanded", "false");
  searchButton.setAttribute("aria-controls", "global-search-form");
  searchButton.setAttribute("aria-label", "Search");
  searchButton.title = "Search";

  searchButtonIcon.className = "global-search-toggle-icon";
  searchButtonIcon.setAttribute("aria-hidden", "true");
  searchButton.append(searchButtonIcon);

  searchForm.className = "global-search-form";
  searchForm.id = "global-search-form";
  searchForm.dataset.globalSearchForm = "";
  searchForm.hidden = true;
  searchForm.setAttribute("role", "search");
  searchForm.setAttribute("aria-label", "Global search");

  searchInput.className = "global-search-input";
  searchInput.type = "search";
  searchInput.name = "text";
  searchInput.autocomplete = "off";
  searchInput.placeholder = "Search";
  searchInput.dataset.globalSearchInput = "";
  searchInput.setAttribute("aria-label", "Search");

  searchTarget.className = "global-search-target";
  searchTarget.name = "target";
  searchTarget.dataset.globalSearchTarget = "";
  searchTarget.setAttribute("aria-label", "Search record type");
  searchTarget.append(createSearchTargetOption("", "All"));

  searchForm.append(searchInput, searchTarget);
  searchShell.append(searchButton, searchForm);

  notificationWrap.className = "notification-shell";

  notificationButton.className = "notification-bell";
  notificationButton.type = "button";
  notificationButton.dataset.notificationBell = "";
  notificationButton.setAttribute("aria-expanded", "false");
  notificationButton.setAttribute("aria-controls", "notification-panel");
  notificationButton.setAttribute("aria-label", "Notifications");
  notificationButton.title = "Notifications";

  notificationIcon.className = "notification-bell-icon";
  notificationIcon.setAttribute("aria-hidden", "true");
  notificationButton.append(notificationIcon);

  notificationBadge.className = "notification-count";
  notificationBadge.dataset.notificationCount = "";
  notificationBadge.textContent = "0";
  notificationBadge.hidden = true;
  notificationButton.append(notificationBadge);

  notificationPanelElement.className = "notification-panel";
  notificationPanelElement.id = "notification-panel";
  notificationPanelElement.dataset.notificationPanel = "";
  notificationPanelElement.hidden = true;

  notificationPanelHeader.className = "notification-panel-header";
  notificationPanelTitle.textContent = "Notifications";
  notificationPageLink.href = "notifications.html";
  notificationPageLink.textContent = "View all";
  notificationPanelHeader.append(notificationPanelTitle, notificationPageLink);

  notificationItems.className = "notification-panel-list";
  notificationItems.dataset.notificationList = "";

  notificationPanelFooter.className = "notification-panel-footer";
  notificationReadAllButton.type = "button";
  notificationReadAllButton.className = "notification-panel-text-action";
  notificationReadAllButton.dataset.notificationReadAll = "";
  notificationReadAllButton.textContent = "Read all";
  notificationDismissAllButton.type = "button";
  notificationDismissAllButton.className = "notification-panel-text-action is-danger";
  notificationDismissAllButton.dataset.notificationDismissAll = "";
  notificationDismissAllButton.textContent = "Dismiss all";
  notificationPanelFooter.append(notificationReadAllButton, notificationDismissAllButton);

  notificationPanelElement.append(notificationPanelHeader, notificationItems, notificationPanelFooter);
  notificationWrap.append(notificationButton, notificationPanelElement);

  toggle.className = "nav-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", "primary-menu");
  toggle.setAttribute("aria-label", "Toggle navigation");

  for (let index = 0; index < 3; index += 1) {
    toggle.append(document.createElement("span"));
  }

  links.className = "nav-links";
  links.id = "primary-menu";

  links.append(searchShell);
  NAV_ITEMS.forEach((item) => {
    links.append(createNavItem(item, currentPage));
  });
  links.append(notificationWrap);

  nav.append(brand, toggle, links);
  header.append(nav);

  return header;
}

function renderNavigation(items) {
  if (!navLinks || !Array.isArray(items) || items.length === 0) {
    return;
  }

  const currentPage = getCurrentPage();

  navLinks.replaceChildren(
    ...(globalSearchShell ? [globalSearchShell] : []),
    ...items.map((item) => createNavItem(item, currentPage)),
    ...(notificationBell?.parentElement ? [notificationBell.parentElement] : []),
  );
}

function createNavItem(item, currentPage) {
  if (item.items) {
    return createNavMenu(item, currentPage);
  }

  return createNavLink(item, currentPage);
}

function createNavMenu(item, currentPage) {
  const menu = document.createElement("details");
  const summary = document.createElement("summary");
  const menuLinks = document.createElement("div");

  menu.className = "nav-menu";
  menu.dataset.navMenu = item.label;
  summary.textContent = item.label;
  menuLinks.className = "nav-menu-links";

  item.items.forEach((childItem) => {
    menuLinks.append(createNavItem(childItem, currentPage));
  });

  if (item.label === "Settings") {
    menuLinks.append(createLogoutButton());
  }

  menu.append(summary, menuLinks);
  return menu;
}

function createNavLink(item, currentPage) {
  const link = document.createElement("a");

  link.href = item.href;
  link.textContent = item.label;
  link.dataset.navHref = item.href;

  if (item.href === currentPage) {
    // Keeps current-page styling and screen reader context in sync with the URL.
    link.setAttribute("aria-current", "page");
  }

  return link;
}

function createLogoutButton() {
  const logoutButton = document.createElement("button");

  logoutButton.className = "nav-logout";
  logoutButton.type = "button";
  logoutButton.textContent = "Log Out";
  logoutButton.addEventListener("click", logOut);

  return logoutButton;
}

function getCurrentPage() {
  const pathParts = window.location.pathname.split("/");
  const page = pathParts[pathParts.length - 1];

  return page || "dashboard.html";
}

async function loadAppShellBootstrap() {
  try {
    const response = await fetch("/api/app-shell/bootstrap", { cache: "no-store" });

    if (response.status === 401) {
      window.location.replace("/login.html");
      return;
    }

    if (!response.ok) {
      throw new Error("App shell bootstrap was unavailable.");
    }

    const shell = await response.json();
    const workspaceContext = {
      ...(shell.workspaceContext || {}),
      enabledModules: shell.enabledModules || shell.workspaceContext?.enabledModules || [],
      navigation: shell.navigation || [],
      permissionHints: shell.permissionHints || {},
      searchTargets: shell.searchTargets || [],
      viewSurfaces: shell.viewSurfaces || shell.workspaceContext?.viewSurfaces || [],
      userId: shell.user?.user_id || "",
      username: shell.user?.username || "",
    };

    storeWorkspaceContext(workspaceContext);
    renderNavigation(shell.navigation);
    applyNotificationSummary(shell.notificationSummary);
    applySearchTargets(shell.searchTargets || []);
    applyWorkspaceName(workspaceContext.workspaceName);
    applyWorkspaceCapabilities(workspaceContext);
    if (shell.themeMode) {
      applyThemeMode(shell.themeMode);
    }
    populateWorkspaceSelector(shell.workspaces || [], shell.activeWorkspaceId || workspaceContext.workspaceId);
  } catch {
    await loadWorkspaceSettings();
    await loadSessionWorkspaces();
  }
}

function submitGlobalSearch(event) {
  event.preventDefault();

  const params = new URLSearchParams();
  const text = String(globalSearchInput?.value || "").trim();
  const selectedOption = globalSearchTarget?.selectedOptions?.[0] || null;

  if (text) {
    params.set("text", text);
  }

  if (selectedOption?.dataset.moduleId && selectedOption?.dataset.recordType) {
    params.set("module", selectedOption.dataset.moduleId);
    params.set("recordType", selectedOption.dataset.recordType);
  } else if (selectedOption?.dataset.sourceLabel && selectedOption?.dataset.recordType) {
    params.set("source", selectedOption.dataset.sourceLabel);
    params.set("recordType", selectedOption.dataset.recordType);
  }

  const query = params.toString();
  window.location.href = query ? `search.html?${query}` : "search.html";
}

function setGlobalSearchOpen(isOpen) {
  if (!globalSearchToggle || !globalSearchForm) {
    return;
  }

  globalSearchToggle.setAttribute("aria-expanded", String(isOpen));
  globalSearchForm.hidden = !isOpen;
}

function applySearchTargets(targets = []) {
  if (!globalSearchShell || !globalSearchForm || !globalSearchTarget) {
    return;
  }

  const normalizedTargets = normalizeSearchTargets(targets);

  globalSearchShell.hidden = normalizedTargets.length === 0;
  if (normalizedTargets.length === 0) {
    setGlobalSearchOpen(false);
  }
  globalSearchTarget.replaceChildren(
    createSearchTargetOption("", "All"),
    ...normalizedTargets.map((target) => createSearchTargetOption(target.id, target.label, target)),
  );
}

function normalizeSearchTargets(targets = []) {
  const seen = new Set();

  return (Array.isArray(targets) ? targets : [])
    .map((target) => ({
      id: String(target.id || `${target.moduleId || ""}:${target.recordType || ""}`).trim(),
      label: String(target.label || target.sourceLabel || target.recordType || "").trim(),
      moduleId: String(target.moduleId || "").trim(),
      recordType: String(target.recordType || "").trim(),
      sourceLabel: String(target.sourceLabel || "").trim(),
    }))
    .filter((target) => (target.moduleId || target.sourceLabel) && target.recordType && target.label)
    .filter((target) => {
      if (seen.has(target.id)) {
        return false;
      }

      seen.add(target.id);
      return true;
    })
    .sort((left, right) => left.label.localeCompare(right.label));
}

function createSearchTargetOption(value, label, target = null) {
  const option = document.createElement("option");

  option.value = value;
  option.textContent = label;

  if (target) {
    if (target.moduleId) {
      option.dataset.moduleId = target.moduleId;
    }
    if (target.sourceLabel) {
      option.dataset.sourceLabel = target.sourceLabel;
    }
    option.dataset.recordType = target.recordType;
  }

  return option;
}

function applyNotificationSummary(summary = {}) {
  const unreadCount = Number(summary.unreadCount || summary.count || 0);
  const priority = summary.hasUrgentPriority ? "urgent" : summary.hasHighPriority ? "high" : "";
  const hasPriorityAlert = summary.hasPriorityAlert === true || Boolean(priority);

  if (!notificationCount) {
    return;
  }

  notificationCount.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
  notificationCount.hidden = unreadCount === 0;

  if (notificationBell) {
    notificationBell.classList.toggle("has-priority-alert", hasPriorityAlert);
    notificationBell.dataset.notificationPriority = priority;
    notificationBell.title = hasPriorityAlert ? "Priority notifications" : "Notifications";
    notificationBell.setAttribute("aria-label", hasPriorityAlert ? "Priority notifications" : "Notifications");
  }
}

async function loadNotificationPanel() {
  if (!notificationList) {
    return;
  }

  notificationList.replaceChildren(createNotificationPanelEmpty("Loading"));
  setNotificationPanelStatus("");

  try {
    const response = await fetch("/api/notifications?status=active&limit=5", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Notifications unavailable.");
    }

    const body = await response.json();
    const notifications = Array.isArray(body.notifications) ? body.notifications : [];
    renderNotificationPanel(notifications);
    refreshNotificationCount();
  } catch {
    notificationList.replaceChildren(createNotificationPanelEmpty("Notifications unavailable"));
  }
}

function renderNotificationPanel(notifications) {
  const sortedNotifications = sortNotificationPanelItems(notifications);
  const priorityItems = sortedNotifications
    .filter((notification) => ["urgent", "high"].includes(notificationPriority(notification)))
    .map(createNotificationPanelItem);
  const groupedItems = ["normal", "low"]
    .map((priority) => createNotificationPanelGroup(priority, sortedNotifications.filter((notification) => notificationPriority(notification) === priority)))
    .filter(Boolean);
  const rows = [...priorityItems, ...groupedItems];

  notificationList.replaceChildren(...(rows.length > 0 ? rows : [createNotificationPanelEmpty("No notifications")]));
}

function sortNotificationPanelItems(notifications) {
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

function createNotificationPanelGroup(priority, notifications) {
  if (notifications.length === 0) {
    return null;
  }

  const group = document.createElement("section");
  const heading = document.createElement("h3");
  const list = document.createElement("div");

  group.className = "notification-panel-group";
  group.dataset.notificationPriorityGroup = priority;
  heading.className = "notification-panel-group-title";
  heading.textContent = priority === "low" ? "Low priority" : "Normal";
  list.className = "notification-panel-group-list";
  list.append(...notifications.map(createNotificationPanelItem));
  group.append(heading, list);
  return group;
}

function createNotificationPanelItem(notification) {
  const item = document.createElement("article");
  const title = notification.url ? document.createElement("a") : document.createElement("span");
  const type = document.createElement("span");
  const meta = document.createElement("span");
  const actions = document.createElement("span");
  const readButton = createNotificationPanelActionButton("Read", "complete");
  const dismissButton = createNotificationPanelActionButton("Dismiss", "close", { danger: true });
  const displayTitle = notificationDisplayTitle(notification);
  const contextTitle = notificationContextTitle(notification);
  const priority = notificationPriority(notification);

  item.className = `notification-panel-item is-${notification.status || "unread"}`;
  item.classList.add(`is-priority-${priority}`);
  item.dataset.notificationPanelItem = notification.notification_id || "";
  title.className = "notification-panel-title";
  title.textContent = displayTitle;
  if (contextTitle) {
    title.title = contextTitle;
  }
  if (notification.url) {
    title.href = notification.url;
  }

  type.className = "notification-type-badge";
  type.textContent = notificationUpdateTypeLabel(notification);
  meta.className = "notification-meta";
  meta.textContent = notificationMetaParts(notification).join(" - ");

  actions.className = "notification-panel-actions";
  readButton.disabled = notification.status !== "unread";
  readButton.addEventListener("click", () => mutateNotification(notification.notification_id, "read", item));

  dismissButton.addEventListener("click", () => mutateNotification(notification.notification_id, "dismiss", item));
  actions.append(readButton, dismissButton);

  item.append(title, type, meta, actions);
  return item;
}

function createNotificationPanelActionButton(label, icon, options = {}) {
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
    // Fall back to a plain button so optional icon failures cannot blank the notification dropdown.
  }

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.classList.toggle("danger-button", options.danger === true);
  return button;
}

function notificationPriority(notification) {
  const priority = String(notification?.priority || "normal").trim().toLowerCase();
  return ["low", "normal", "high", "urgent"].includes(priority) ? priority : "normal";
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
  const date = formatNotificationDate(notification.created_at);

  if (notification.target?.recordType === "task") {
    return [date].filter(Boolean);
  }

  return [notification.event_type, date].filter(Boolean);
}

function notificationUpdateTypeLabel(notification) {
  return notification.updateTypeLabel || notification.displayType || notification.event_type || "Notification";
}

function createNotificationPanelEmpty(text) {
  const empty = document.createElement("p");
  empty.className = "notification-panel-empty";
  empty.textContent = text;
  return empty;
}

async function mutateNotification(notificationId, action, item = null) {
  setNotificationPanelStatus("");

  try {
    const response = await fetch(`/api/notifications/${encodeURIComponent(notificationId)}/${action}`, { method: "POST" });
    if (!response.ok) {
      throw new Error("Notification action failed.");
    }

    if (action === "dismiss") {
      const group = item?.closest("[data-notification-priority-group]");
      item?.remove();
      if (group && group.querySelectorAll("[data-notification-panel-item]").length === 0) {
        group.remove();
      }
      if (notificationList && notificationList.querySelectorAll("[data-notification-panel-item]").length === 0) {
        notificationList.replaceChildren(createNotificationPanelEmpty("No notifications"));
      }
      await refreshNotificationCount();
      return;
    }

    await loadNotificationPanel();
  } catch {
    setNotificationPanelStatus("Notification action failed.", true);
    await refreshNotificationCount();
  }
}

async function mutateAllNotifications(action) {
  setNotificationPanelStatus("");
  setNotificationPanelBulkDisabled(true);

  try {
    const response = await fetch(`/api/notifications/${action}`, { method: "POST" });
    if (!response.ok) {
      throw new Error("Notification action failed.");
    }

    await loadNotificationPanel();
    await refreshNotificationCount();
  } catch {
    setNotificationPanelStatus("Notification action failed.", true);
    await refreshNotificationCount();
  } finally {
    setNotificationPanelBulkDisabled(false);
  }
}

function setNotificationPanelBulkDisabled(disabled) {
  notificationReadAll?.toggleAttribute("disabled", disabled);
  notificationDismissAll?.toggleAttribute("disabled", disabled);
}

async function refreshNotificationCount() {
  try {
    const response = await fetch("/api/notifications/unread-count", { cache: "no-store" });
    if (response.ok) {
      applyNotificationSummary(await response.json());
    }
  } catch {
    applyNotificationSummary({ unreadCount: 0 });
  }
}

function setNotificationPanelStatus(message, isError = false) {
  if (!notificationList) {
    return;
  }

  let status = notificationList.querySelector("[data-notification-panel-status]");
  if (!message) {
    status?.remove();
    return;
  }

  if (!status) {
    status = document.createElement("p");
    status.className = "notification-panel-status";
    status.dataset.notificationPanelStatus = "";
    status.setAttribute("role", "status");
    notificationList.prepend(status);
  }

  status.textContent = message;
  status.classList.toggle("is-error", isError);
}

function formatNotificationDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

async function loadWorkspaceSettings() {
  try {
    const response = await fetch("/api/settings", { cache: "no-store" });

    if (response.status === 401) {
      // Navigation only runs inside the protected app; unauthenticated users go to login.
      window.location.replace("/login.html");
      return;
    }

    if (!response.ok) {
      throw new Error("Settings were unavailable.");
    }

    const settings = await response.json();
    storeWorkspaceContext(settings);
    applyWorkspaceName(settings.workspaceName);
    applyWorkspaceCapabilities(settings);
  } catch {
    applyWorkspaceName(DEFAULT_WORKSPACE_NAME);
  }
}

async function loadSessionWorkspaces() {
  if (!workspaceSelector) {
    return;
  }

  try {
    const response = await fetch("/api/session", { cache: "no-store" });

    if (!response.ok) {
      return;
    }

    const body = await response.json();
    const user = body.user || {};
    if (user.workspaceContext) {
      const workspaceContext = {
        ...user.workspaceContext,
        userId: user.user_id || user.userId || user.workspaceContext.userId || user.workspaceContext.user_id || "",
        username: user.username || user.workspaceContext.username || "",
      };
      storeWorkspaceContext(workspaceContext);
      applyWorkspaceCapabilities(workspaceContext);
    }
    if (user.themeMode) {
      applyThemeMode(user.themeMode);
    }
    const workspaces = Array.isArray(user.workspaces) ? user.workspaces : [];

    if (workspaces.length === 0) {
      return;
    }

    populateWorkspaceSelector(workspaces, user.active_workspace_id || user.workspace_id || workspaces[0].workspace_id);
  } catch {
    workspaceSelector.disabled = true;
  }
}

function populateWorkspaceSelector(workspaces, activeWorkspaceId) {
  if (!workspaceSelector || !Array.isArray(workspaces) || workspaces.length === 0) {
    return;
  }

  workspaceSelector.replaceChildren(...workspaces.map((workspace) =>
    createWorkspaceOption(workspace.workspaceName || workspace.workspace_id, workspace.workspace_id),
  ));
  workspaceSelector.value = activeWorkspaceId || workspaces[0].workspace_id;
  workspaceSelector.disabled = workspaces.length < 2;
  applyActiveWorkspaceLabel();
}

function applyThemeMode(themeMode) {
  const normalizedThemeMode = themeMode === "dark" ? "dark" : "light";

  window.localStorage.setItem("lf_theme", normalizedThemeMode);
  document.documentElement.dataset.themeMode = normalizedThemeMode;
  document.documentElement.dataset.theme = normalizedThemeMode;
  document.documentElement.style.colorScheme = normalizedThemeMode;
}

function createWorkspaceOption(label, value = label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function applyWorkspaceName(value) {
  const workspaceName = String(value || "").trim() || DEFAULT_WORKSPACE_NAME;

  document.querySelectorAll("[data-workspace-name]").forEach((element) => {
    element.textContent = workspaceName;
  });

  document.querySelectorAll("[data-workspace-selector]").forEach((select) => {
    if (select.options.length <= 1) {
      select.replaceChildren(createWorkspaceOption(workspaceName));
      select.value = workspaceName;
    }
  });
  applyActiveWorkspaceLabel(workspaceName);

  if (document.body.dataset.titleMode === "app") {
    document.title = `${workspaceName} | Longtail Forge`;
    return;
  }

  if (document.body.dataset.pageTitle) {
    document.title = `${document.body.dataset.pageTitle} | ${workspaceName} | Longtail Forge`;
  }
}

window.applyWorkspaceName = applyWorkspaceName;

function applyActiveWorkspaceLabel(fallbackName = DEFAULT_WORKSPACE_NAME) {
  if (!workspaceSelector) {
    return;
  }

  const selectedOption = workspaceSelector.selectedOptions[0];
  const workspaceName = selectedOption?.textContent || fallbackName;

  workspaceSelector.title = `Active workspace: ${workspaceName}`;
}

function getWorkspaceProjectsLabel(workspaceName) {
  const labelSource = String(workspaceName || "").trim() ||
    String(window.LongtailForge?.workspaceContext?.workspaceName || "").trim() ||
    workspaceSelector?.selectedOptions?.[0]?.textContent?.trim() ||
    document.querySelector("[data-workspace-name]")?.textContent?.trim() ||
    DEFAULT_WORKSPACE_NAME;

  return labelSource;
}

function applyWorkspaceCapabilities(settings) {
  const capabilities = settings.workspaceCapabilities || {};
  const workspaceType = settings.workspaceType || capabilities.workspaceType || "business";
  const availableTools = new Set(Array.isArray(capabilities.availableTools) ? capabilities.availableTools : []);

  siteHeader.dataset.workspaceType = workspaceType;
  document.body.dataset.workspaceType = workspaceType;
  document.body.dataset.workspaceClientTools = availableTools.has("clients_projects") ? "enabled" : "disabled";
  document.body.dataset.timeTrackingModule = moduleIsEnabled(settings, "time-tracking") ? "enabled" : "disabled";
  document.body.dataset.tasksModule = moduleIsEnabled(settings, "tasks") ? "enabled" : "disabled";
  setNavLinkVisible("clients.html", availableTools.has("clients_projects"));
  setNavLinkVisible("projects.html", availableTools.has("projects") || availableTools.has("clients_projects"));
  setNavLinkVisible("api-keys.html", workspaceType === "business");
  setNavLinkVisible("user-admin.html", availableTools.has("team_members"));

  document.querySelectorAll(".nav-menu").forEach((menu) => {
    const visibleLinks = [...menu.querySelectorAll("a")].filter((link) => !link.hidden);
    menu.hidden = visibleLinks.length === 0;
  });
}

function moduleIsEnabled(settings, moduleId) {
  const moduleDefinition = (Array.isArray(settings.modules) ? settings.modules : [])
    .find((candidate) => candidate.id === moduleId || candidate.moduleId === moduleId);

  if (moduleDefinition) {
    return moduleDefinition.status === "enabled";
  }

  const enabledModules = new Set(Array.isArray(settings.enabledModules) ? settings.enabledModules : []);
  return enabledModules.has(moduleId);
}

function applyCachedWorkspaceContext() {
  const cachedContext = readWorkspaceContext();

  if (!cachedContext) {
    return;
  }

  applyWorkspaceName(cachedContext.workspaceName);
  if (Array.isArray(cachedContext.navigation) && cachedContext.navigation.length > 0) {
    renderNavigation(cachedContext.navigation);
  }
  applySearchTargets(cachedContext.searchTargets || []);
  applyWorkspaceCapabilities(cachedContext);
}

function readWorkspaceContext() {
  try {
    const context = JSON.parse(window.localStorage.getItem(WORKSPACE_CONTEXT_STORAGE_KEY) || "null");
    return context && typeof context === "object" ? context : null;
  } catch {
    return null;
  }
}

function storeWorkspaceContext(settings) {
  const previousContext = readWorkspaceContext() || {};
  const context = {
    enabledModules: Array.isArray(settings.enabledModules) ? settings.enabledModules : previousContext.enabledModules || [],
    modules: Array.isArray(settings.modules) ? settings.modules : previousContext.modules || [],
    navigation: Array.isArray(settings.navigation) ? settings.navigation : previousContext.navigation || [],
    permissionHints: settings.permissionHints || previousContext.permissionHints || {},
    searchTargets: Array.isArray(settings.searchTargets) ? settings.searchTargets : previousContext.searchTargets || [],
    viewSurfaces: Array.isArray(settings.viewSurfaces) ? settings.viewSurfaces : previousContext.viewSurfaces || [],
    tasksEnabled: settings.tasksEnabled === false ? false : true,
    timeTrackingEnabled: settings.timeTrackingEnabled !== false,
    userId: settings.userId || settings.user_id || previousContext.userId || "",
    username: settings.username || previousContext.username || "",
    workspaceCapabilities: settings.workspaceCapabilities || {},
    workspaceId: settings.workspaceId || settings.workspace_id || "",
    workspaceName: settings.workspaceName || DEFAULT_WORKSPACE_NAME,
    workspaceType: settings.workspaceType || settings.workspaceCapabilities?.workspaceType || "business",
  };

  window.localStorage.setItem(WORKSPACE_CONTEXT_STORAGE_KEY, JSON.stringify(context));
  window.LongtailForge = window.LongtailForge || {};
  window.LongtailForge.workspaceContext = context;
}

function setNavLinkVisible(href, isVisible) {
  document.querySelectorAll(`[data-nav-href="${href}"]`).forEach((link) => {
    link.hidden = !isVisible;
  });
}

if (workspaceSelector) {
  workspaceSelector.addEventListener("change", async () => {
    const workspaceId = workspaceSelector.value;

    if (!workspaceId) {
      return;
    }

    workspaceSelector.disabled = true;

    try {
      const response = await fetch("/api/session/workspace", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workspaceId }),
      });

      if (!response.ok) {
        throw new Error("Workspace switch failed.");
      }

      applyActiveWorkspaceLabel();
      window.location.reload();
    } catch {
      await loadSessionWorkspaces();
    }
  });
}

async function logOut() {
  try {
    await fetch("/api/logout", {
      method: "POST",
    });
  } finally {
    window.localStorage.removeItem("lf_theme");
    window.localStorage.removeItem("lf_timezone");
    window.localStorage.removeItem(WORKSPACE_CONTEXT_STORAGE_KEY);
    window.location.replace("/login.html");
  }
}
