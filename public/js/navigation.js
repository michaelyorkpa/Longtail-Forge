// Shared authenticated app shell. Add/remove menu items here instead of editing every page.
const DEFAULT_WORKSPACE_NAME = "Workspace";
const WORKSPACE_CONTEXT_STORAGE_KEY = "lf_workspace_context";
const TIME_TRACKING_NAV_HREFS = new Set(["time-tracker.html", "manual-entry.html", "edit-entries.html", "reporting.html"]);
const TASKS_NAV_HREFS = new Set(["tasks.html"]);
const NAV_ITEMS = [
  { label: "Dashboard", href: "dashboard.html" },
  { label: "Workbench", href: "workbench.html" },
  {
    label: "Projects",
    items: [
      {
        label: "Time Keeping",
        items: [
          { label: "Time Tracker", href: "time-tracker.html" },
          { label: "Create Manual Entry", href: "manual-entry.html" },
          { label: "Edit Entries", href: "edit-entries.html" },
        ],
      },
      { label: "Tasks", href: "tasks.html" },
      { label: "Projects Settings", href: "projects.html" },
    ],
  },
  {
    label: "Reporting",
    items: [
      { label: "Time Reports", href: "reporting.html" },
    ],
  },
  {
    label: "Settings",
    items: [
      {
        label: "Workspace",
        items: [
          { label: "Workspace Settings", href: "workspace-settings.html" },
          { label: "Clients", href: "clients.html" },
          {
            label: "Modules",
            items: [
              { label: "Tasks", href: "tasks-settings.html" },
              { label: "Time Tracking", href: "time-tracking-settings.html" },
            ],
          },
          { label: "User Admin", href: "user-admin.html" },
          { label: "API Keys", href: "api-keys.html" },
          { label: "Audit Log", href: "audit-log.html" },
        ],
      },
      { label: "User", href: "user-settings.html" },
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
window.LongtailForge.workspaceContextReady = loadAppShellBootstrap();

function buildSiteHeader() {
  // Build the header at runtime so page HTML can stay focused on page-specific content.
  const header = document.createElement("header");
  const nav = document.createElement("nav");
  const brand = document.createElement("div");
  const homeLink = document.createElement("a");
  const workspaceSelect = document.createElement("select");
  const notificationWrap = document.createElement("div");
  const notificationButton = document.createElement("button");
  const notificationBadge = document.createElement("span");
  const notificationPanelElement = document.createElement("div");
  const notificationPanelHeader = document.createElement("div");
  const notificationPanelTitle = document.createElement("strong");
  const notificationPageLink = document.createElement("a");
  const notificationItems = document.createElement("div");
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

  notificationWrap.className = "notification-shell";

  notificationButton.className = "notification-bell";
  notificationButton.type = "button";
  notificationButton.dataset.notificationBell = "";
  notificationButton.setAttribute("aria-expanded", "false");
  notificationButton.setAttribute("aria-controls", "notification-panel");
  notificationButton.setAttribute("aria-label", "Notifications");
  notificationButton.textContent = "Notifications";

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
  notificationPanelElement.append(notificationPanelHeader, notificationItems);
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

  NAV_ITEMS.forEach((item) => {
    links.append(createNavItem(item, currentPage));
  });

  nav.append(brand, notificationWrap, toggle, links);
  header.append(nav);

  return header;
}

function renderNavigation(items) {
  if (!navLinks || !Array.isArray(items) || items.length === 0) {
    return;
  }

  const currentPage = getCurrentPage();

  navLinks.replaceChildren(...items.map((item) => createNavItem(item, currentPage)));
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
      userId: shell.user?.user_id || "",
      username: shell.user?.username || "",
    };

    storeWorkspaceContext(workspaceContext);
    renderNavigation(shell.navigation);
    applyNotificationSummary(shell.notificationSummary);
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

function applyNotificationSummary(summary = {}) {
  const unreadCount = Number(summary.unreadCount || summary.count || 0);

  if (!notificationCount) {
    return;
  }

  notificationCount.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
  notificationCount.hidden = unreadCount === 0;
}

async function loadNotificationPanel() {
  if (!notificationList) {
    return;
  }

  notificationList.replaceChildren(createNotificationPanelEmpty("Loading"));

  try {
    const response = await fetch("/api/notifications?limit=5", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Notifications unavailable.");
    }

    const body = await response.json();
    const notifications = Array.isArray(body.notifications) ? body.notifications : [];
    notificationList.replaceChildren(...(notifications.length > 0
      ? notifications.map(createNotificationPanelItem)
      : [createNotificationPanelEmpty("No notifications")]));
    refreshNotificationCount();
  } catch {
    notificationList.replaceChildren(createNotificationPanelEmpty("Notifications unavailable"));
  }
}

function createNotificationPanelItem(notification) {
  const item = document.createElement("article");
  const title = notification.url ? document.createElement("a") : document.createElement("span");
  const meta = document.createElement("span");
  const actions = document.createElement("span");
  const readButton = document.createElement("button");
  const dismissButton = document.createElement("button");

  item.className = `notification-panel-item is-${notification.status || "unread"}`;
  title.textContent = notification.title || "Notification";
  if (notification.url) {
    title.href = notification.url;
  }

  meta.className = "notification-meta";
  meta.textContent = [notification.event_type, formatNotificationDate(notification.created_at)].filter(Boolean).join(" · ");

  actions.className = "notification-panel-actions";
  readButton.type = "button";
  readButton.textContent = "Read";
  readButton.disabled = notification.status !== "unread";
  readButton.addEventListener("click", () => mutateNotification(notification.notification_id, "read"));

  dismissButton.type = "button";
  dismissButton.textContent = "Dismiss";
  dismissButton.addEventListener("click", () => mutateNotification(notification.notification_id, "dismiss"));
  actions.append(readButton, dismissButton);

  item.append(title, meta, actions);
  return item;
}

function createNotificationPanelEmpty(text) {
  const empty = document.createElement("p");
  empty.className = "notification-panel-empty";
  empty.textContent = text;
  return empty;
}

async function mutateNotification(notificationId, action) {
  await fetch(`/api/notifications/${encodeURIComponent(notificationId)}/${action}`, { method: "POST" });
  await loadNotificationPanel();
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
  const projectsSettingsVisible = availableTools.has("projects") || availableTools.has("clients_projects");
  const modules = Array.isArray(settings.modules) ? settings.modules : [];
  const timeTrackingModule = modules.find((moduleDefinition) => moduleDefinition.id === "time-tracking");
  const tasksModule = modules.find((moduleDefinition) => moduleDefinition.id === "tasks");
  const timeTrackingEnabled = moduleIsEnabled(timeTrackingModule, settings, "time-tracking");
  const tasksEnabled = moduleIsEnabled(tasksModule, settings, "tasks");
  const timeTrackingLinks = readModuleNavigationHrefs(timeTrackingModule);
  const tasksLinks = readModuleNavigationHrefs(tasksModule);
  const visibleTimeTrackingLinks = timeTrackingLinks.size > 0 ? timeTrackingLinks : TIME_TRACKING_NAV_HREFS;
  const visibleTasksLinks = tasksLinks.size > 0 ? tasksLinks : TASKS_NAV_HREFS;

  siteHeader.dataset.workspaceType = workspaceType;
  document.body.dataset.workspaceType = workspaceType;
  document.body.dataset.workspaceClientTools = availableTools.has("clients_projects") ? "enabled" : "disabled";
  document.body.dataset.timeTrackingModule = timeTrackingEnabled ? "enabled" : "disabled";
  document.body.dataset.tasksModule = tasksEnabled ? "enabled" : "disabled";
  setNavLinkVisible("clients.html", availableTools.has("clients_projects"));
  setNavLinkVisible("projects.html", projectsSettingsVisible);
  setNavLinkVisible("api-keys.html", workspaceType === "business");
  setNavLinkVisible("user-admin.html", availableTools.has("team_members"));
  setNavLinkVisible("reporting.html", availableTools.has("billing_invoicing_reporting") || (timeTrackingEnabled && visibleTimeTrackingLinks.has("reporting.html")));
  setNavLinkVisible("time-tracker.html", timeTrackingEnabled && visibleTimeTrackingLinks.has("time-tracker.html"));
  setNavLinkVisible("manual-entry.html", timeTrackingEnabled && visibleTimeTrackingLinks.has("manual-entry.html"));
  setNavLinkVisible("edit-entries.html", timeTrackingEnabled && visibleTimeTrackingLinks.has("edit-entries.html"));
  setNavLinkVisible("tasks.html", tasksEnabled && visibleTasksLinks.has("tasks.html"));

  document.querySelectorAll(".nav-menu").forEach((menu) => {
    const visibleLinks = [...menu.querySelectorAll("a")].filter((link) => !link.hidden);
    menu.hidden = visibleLinks.length === 0;
  });
}

function moduleIsEnabled(moduleDefinition, settings, moduleId) {
  if (moduleDefinition) {
    return moduleDefinition.status === "enabled";
  }

  const enabledModules = new Set(Array.isArray(settings.enabledModules) ? settings.enabledModules : []);
  return enabledModules.has(moduleId);
}

function readModuleNavigationHrefs(moduleDefinition) {
  const navigation = Array.isArray(moduleDefinition?.navigation) ? moduleDefinition.navigation : [];

  return new Set(readNavigationHrefs(navigation));
}

function readNavigationHrefs(items) {
  return items.flatMap((item) => {
    const hrefs = item.href ? [item.href] : [];
    const childHrefs = Array.isArray(item.items) ? readNavigationHrefs(item.items) : [];

    return [...hrefs, ...childHrefs];
  });
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
