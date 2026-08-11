// Shared authenticated app shell. Add/remove menu items here instead of editing every page.
const DEFAULT_WORKSPACE_NAME = "Workspace";
const WORKSPACE_CONTEXT_STORAGE_KEY = "lf_workspace_context";
const THEME_STORAGE_KEY = "lf_theme";
const THEME_AUTO_SOURCE_STORAGE_KEY = "lf_theme_auto_source";
const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";
const SESSION_LOGIN_PATH = "/login.html";
const SUPPORT_VIEW_RETURN_PATH_KEY = "lf_support_view_return_path";
const SUPPORT_VIEW_RESTORE_FOCUS_KEY = "lf_support_view_restore_focus";
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
const navDrawerOverlay = siteHeader.querySelector(".nav-drawer-overlay");
const mobileNavQuery = typeof window.matchMedia === "function" ? window.matchMedia("(max-width: 700px)") : null;
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
let systemThemeModeQuery = null;
let systemThemeModeListenerAttached = false;
let sessionAuthWarningPromise = null;
let supportViewCountdownId = null;
let supportViewMutationObserver = null;
let supportViewExitPending = false;

const navigationIntent = createNavigationIntentController();
window.LongtailForge = window.LongtailForge || {};
window.LongtailForge.navigationIntent = navigationIntent;

function createNavigationIntentController() {
  let exitGuard = null;
  let pendingIntent = null;
  let committingNavigation = false;

  function registerExitGuard(guard) {
    exitGuard = guard || null;
    return () => {
      if (exitGuard === guard) exitGuard = null;
    };
  }

  function shouldHold(intent = {}) {
    if (committingNavigation || !exitGuard?.shouldHold) return false;
    if (intent.href) {
      try {
        if (new window.URL(intent.href, document.baseURI).pathname === SESSION_LOGIN_PATH) return false;
      } catch {
        return false;
      }
    }
    try {
      return exitGuard.shouldHold(intent) === true;
    } catch {
      return false;
    }
  }

  async function holdBeforeContinue(intent = {}) {
    if (!shouldHold(intent)) return;
    await exitGuard.beforeContinue?.(intent);
  }

  function continueIntent(intent = {}) {
    if (typeof intent.continue === "function") return intent.continue();
    if (intent.href) {
      committingNavigation = true;
      window.location.assign(intent.href);
    }
    return undefined;
  }

  function request(intent = {}) {
    const normalizedIntent = {
      ...intent,
      href: intent.href ? new window.URL(intent.href, document.baseURI).href : "",
    };
    if (!shouldHold(normalizedIntent)) return Promise.resolve(continueIntent(normalizedIntent));
    if (pendingIntent) return pendingIntent;

    pendingIntent = (async () => {
      try {
        await holdBeforeContinue(normalizedIntent);
        if (normalizedIntent.href || normalizedIntent.commitBeforeContinue) exitGuard?.onCommitted?.(normalizedIntent);
        const result = await continueIntent(normalizedIntent);
        if (typeof normalizedIntent.continue === "function" && !normalizedIntent.commitBeforeContinue) {
          exitGuard?.onCommitted?.(normalizedIntent);
        }
        return result;
      } catch (error) {
        exitGuard?.onContinueError?.(normalizedIntent, error);
        throw error;
      } finally {
        pendingIntent = null;
      }
    })();
    return pendingIntent;
  }

  function navigate(href, options = {}) {
    return request({ ...options, href, kind: options.kind || "scripted-navigation" });
  }

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target?.closest?.("a[href]");
    if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
    const url = new window.URL(link.href, document.baseURI);
    const intent = { href: url.href, kind: "link", trigger: link };
    if (url.origin !== window.location.origin || url.href === window.location.href || !shouldHold(intent)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    void request(intent);
  }, true);

  if (window.navigation?.addEventListener) {
    window.navigation.addEventListener("navigate", (event) => {
      const intent = {
        href: event.destination?.url || "",
        kind: event.navigationType === "traverse" ? "history-traversal" : "native-navigation",
        navigationType: event.navigationType || "",
      };
      if (event.navigationType === "reload" || !event.canIntercept || !shouldHold(intent)) return;

      event.intercept({
        handler: async () => {
          await holdBeforeContinue(intent);
          exitGuard?.onCommitted?.(intent);
          committingNavigation = true;
        },
      });
    });
  }

  return Object.freeze({ navigate, registerExitGuard, request, shouldHold });
}

applyCachedWorkspaceContext();

if (navToggle && navLinks) {
  navToggle.addEventListener("click", () => {
    setNavDrawerOpen(navToggle.getAttribute("aria-expanded") !== "true");
  });

  navDrawerOverlay?.addEventListener("click", () => {
    setNavDrawerOpen(false);
    navToggle.focus();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !navDrawerIsOpen()) {
      return;
    }

    setNavDrawerOpen(false);
    navToggle.focus();
  });

  // Keep keyboard focus inside the open drawer or on the toggle, which stays
  // visible above the overlay as the close control.
  document.addEventListener("focusin", (event) => {
    if (!navDrawerIsOpen() || !isMobileNavViewport()) {
      return;
    }

    if (navLinks.contains(event.target) || navToggle.contains(event.target)) {
      return;
    }

    focusFirstNavDrawerItem();
  });

  // Growing past the mobile breakpoint restores the inline desktop
  // navigation, so release the drawer state and scroll lock.
  if (mobileNavQuery) {
    const closeDrawerOnDesktop = () => {
      if (!mobileNavQuery.matches && navDrawerIsOpen()) {
        setNavDrawerOpen(false);
      }
    };

    if (typeof mobileNavQuery.addEventListener === "function") {
      mobileNavQuery.addEventListener("change", closeDrawerOnDesktop);
    } else if (typeof mobileNavQuery.addListener === "function") {
      mobileNavQuery.addListener(closeDrawerOnDesktop);
    }
  }
}

function navDrawerIsOpen() {
  return navToggle?.getAttribute("aria-expanded") === "true";
}

function isMobileNavViewport() {
  return mobileNavQuery ? mobileNavQuery.matches : false;
}

function setNavDrawerOpen(isOpen) {
  if (!navToggle || !navLinks) {
    return;
  }

  navToggle.setAttribute("aria-expanded", String(isOpen));
  navLinks.classList.toggle("is-open", isOpen);
  if (navDrawerOverlay) {
    navDrawerOverlay.hidden = !isOpen;
  }
  document.body.classList.toggle("nav-drawer-open", isOpen);

  if (isOpen) {
    focusFirstNavDrawerItem();
  }
}

function focusFirstNavDrawerItem() {
  const candidates = navLinks.querySelectorAll("a[href], button, select, input, textarea, summary");

  for (const candidate of candidates) {
    if (candidate.hidden || candidate.closest("[hidden]") || candidate.offsetParent === null) {
      continue;
    }

    candidate.focus();
    return;
  }
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
window.LongtailForge.sessionAuthWarnings = {
  show: showSessionAuthWarning,
};
installSessionAuthWarningGuard();
hydrateStoredWorkspaceContext();
window.LongtailForge.refreshAppShell = loadAppShellBootstrap;
window.LongtailForge.workspaceContextReady = loadAppShellBootstrap();

// The last stored context is available synchronously so pages can render from
// it immediately; the app-shell bootstrap reconciles through the
// longtailforge:workspace-context-updated event when it resolves.
function hydrateStoredWorkspaceContext() {
  const context = readWorkspaceContext();

  if (context && !window.LongtailForge.workspaceContext) {
    window.LongtailForge.workspaceContext = context;
  }
}

function installSessionAuthWarningGuard() {
  if (typeof window.fetch !== "function" || window.fetch.__longtailSessionAuthGuard) {
    return;
  }

  const originalFetch = window.fetch.bind(window);
  const guardedFetch = async (...args) => {
    const response = await originalFetch(...args);

    if (response?.status === 401 && isAppApiRequest(args[0])) {
      await showSessionAuthWarning();
    }

    return response;
  };

  Object.defineProperty(guardedFetch, "__longtailSessionAuthGuard", {
    value: true,
  });
  window.fetch = guardedFetch;
}

function isAppApiRequest(input) {
  const requestUrl = typeof input === "string" ? input : input?.url;

  if (!requestUrl) {
    return false;
  }

  try {
    const url = new window.URL(requestUrl, window.location.href);
    return url.origin === window.location.origin && url.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

function showSessionAuthWarning() {
  if (sessionAuthWarningPromise) {
    return sessionAuthWarningPromise;
  }

  sessionAuthWarningPromise = new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    const form = document.createElement("form");
    const heading = document.createElement("h2");
    const message = document.createElement("p");
    const actions = document.createElement("div");
    const loginButton = document.createElement("button");
    const headingId = "framework-session-warning-title";
    const descriptionId = "framework-session-warning-description";

    dialog.className = "app-dialog framework-session-warning";
    dialog.dataset.frameworkSessionWarning = "";
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", headingId);
    dialog.setAttribute("aria-describedby", descriptionId);

    form.className = "app-dialog-form";
    heading.id = headingId;
    heading.textContent = "Session expired";
    message.id = descriptionId;
    message.textContent = "Your session has expired. Sign in again to continue. Any unsaved changes on this screen have not been saved.";
    actions.className = "form-actions";
    loginButton.type = "button";
    loginButton.textContent = "Sign in";

    actions.appendChild(loginButton);
    form.append(heading, message, actions);
    dialog.appendChild(form);
    document.body.appendChild(dialog);

    const finish = () => {
      dialog.remove();
      sessionAuthWarningPromise = null;
      resolve();
    };

    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
    });
    dialog.addEventListener("close", finish, { once: true });
    loginButton.addEventListener("click", () => {
      window.location.replace(SESSION_LOGIN_PATH);
      if (typeof dialog.close === "function") {
        dialog.close("login");
      } else {
        dialog.removeAttribute("open");
        finish();
      }
    });

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    loginButton.focus();
  });

  return sessionAuthWarningPromise;
}

function buildSiteHeader() {
  // Build the header at runtime so page HTML can stay focused on page-specific content.
  const header = document.createElement("header");
  const nav = document.createElement("nav");
  const brand = document.createElement("div");
  const headerControls = document.createElement("div");
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
  headerControls.className = "site-header-controls";

  brand.className = "site-brand";

  homeLink.href = "dashboard.html";
  homeLink.className = "site-brand-home";
  homeLink.setAttribute("aria-label", "Longtail Forge home");
  const brandLogo = document.createElement("img");
  brandLogo.className = "site-brand-logo";
  brandLogo.src = "/assets/logo.webp";
  brandLogo.alt = "";
  brandLogo.width = 32;
  brandLogo.height = 32;
  const brandName = document.createElement("span");
  brandName.className = "site-brand-name";
  brandName.textContent = "Longtail Forge";
  homeLink.append(brandLogo, brandName);

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

  const drawerOverlay = document.createElement("div");

  drawerOverlay.className = "nav-drawer-overlay";
  drawerOverlay.hidden = true;

  links.className = "nav-links";
  links.id = "primary-menu";

  NAV_ITEMS.forEach((item) => {
    links.append(createNavItem(item, currentPage));
  });

  headerControls.append(searchShell, links, notificationWrap);
  nav.append(brand, headerControls, toggle);
  header.append(nav, drawerOverlay);

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

    const bootstrapAdapter = window.LongtailForge.appShellBootstrap;
    if (!bootstrapAdapter?.normalize) {
      throw new Error("App shell bootstrap adapter was unavailable.");
    }
    const shell = bootstrapAdapter.normalize(await response.json());
    applySupportViewState(shell.supportView || null);
    window.LongtailForge.userPreferences = Object.freeze({
      preferredCalendarView: shell.user?.preferredCalendarView || null,
    });
    const workspaceContext = {
      ...(shell.workspaceContext || {}),
      enabledModules: shell.enabledModules || shell.workspaceContext?.enabledModules || [],
      navigation: shell.navigation || [],
      permissionHints: shell.permissionHints || {},
      quickActions: shell.quickActions || shell.workspaceContext?.quickActions || [],
      searchTargets: shell.searchTargets || [],
      viewSurfaces: shell.viewSurfaces || shell.workspaceContext?.viewSurfaces || [],
      userId: shell.user?.user_id || "",
      username: shell.user?.username || "",
    };

    storeWorkspaceContext(workspaceContext);
    if (shell.user?.timezone || shell.timezone) {
      window.LongtailForge.timezones?.setUserTimezone?.(shell.user?.timezone || shell.timezone);
    }
    renderNavigation(shell.navigation);
    applyNotificationSummary(shell.notificationSummary);
    applySearchTargets(shell.searchTargets || []);
    applyWorkspaceName(workspaceContext.workspaceName);
    applyWorkspaceCapabilities(workspaceContext);
    applyWorkspaceDeletionNotice(workspaceContext);
    if (shell.themeMode) {
      applyThemeMode(shell.themeMode, shell.themeAutoSource);
    }
    populateWorkspaceSelector(shell.workspaces || [], shell.activeWorkspaceId || workspaceContext.workspaceId);
    window.dispatchEvent(new window.CustomEvent("longtailforge:workspace-context-updated", {
      detail: workspaceContext,
    }));
    restoreFocusAfterSupportView();
    return workspaceContext;
  } catch {
    await loadWorkspaceSettings();
    await loadSessionWorkspaces();
    return null;
  }
}

function applySupportViewState(supportView) {
  window.clearInterval(supportViewCountdownId);
  supportViewCountdownId = null;
  document.querySelector("[data-support-view-banner]")?.remove();
  supportViewMutationObserver?.disconnect();
  supportViewMutationObserver = null;
  delete document.body.dataset.supportView;
  window.LongtailForge.supportView = supportView ? Object.freeze({ ...supportView }) : null;

  if (!supportView) {
    return;
  }

  document.body.dataset.supportView = "active";
  const banner = document.createElement("section");
  const identity = document.createElement("div");
  const title = document.createElement("strong");
  const detail = document.createElement("span");
  const explanation = document.createElement("span");
  const remaining = document.createElement("span");
  const exitButton = document.createElement("button");

  banner.className = "support-view-banner";
  banner.dataset.supportViewBanner = "";
  banner.setAttribute("role", "region");
  banner.setAttribute("aria-label", "Support View is active");
  identity.className = "support-view-banner-identity";
  title.textContent = "Support View — read only";
  detail.textContent = `Viewing ${supportView.effectiveUserLabel || supportView.effectiveUsername} in ${supportView.effectiveWorkspaceName || "Workspace unavailable"} as ${supportView.actorLabel || supportView.actorUsername}.`;
  explanation.id = "support-view-read-only-explanation";
  explanation.className = "support-view-banner-explanation";
  explanation.textContent = "Changes and protected administrative or secret surfaces are unavailable.";
  remaining.className = "support-view-banner-remaining";
  remaining.dataset.supportViewRemaining = "";
  remaining.setAttribute("aria-live", "off");
  exitButton.type = "button";
  exitButton.className = "support-view-exit-button";
  exitButton.dataset.supportViewExit = "";
  exitButton.textContent = "End Support View";
  exitButton.addEventListener("click", () => exitSupportView(exitButton));

  identity.append(title, detail, explanation, remaining);
  banner.append(identity, exitButton);
  siteHeader.insertAdjacentElement("beforebegin", banner);
  updateSupportViewRemaining(supportView.expiresAt, remaining, exitButton);
  supportViewCountdownId = window.setInterval(() => {
    updateSupportViewRemaining(supportView.expiresAt, remaining, exitButton);
  }, 1000);
  installSupportViewBrowserPolicy();
}

function updateSupportViewRemaining(expiresAt, element, exitButton) {
  const remainingSeconds = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  element.textContent = remainingSeconds > 0
    ? `Remaining: ${minutes}:${String(seconds).padStart(2, "0")}`
    : "Support View has expired.";
  if (remainingSeconds === 0 && !supportViewExitPending) {
    void exitSupportView(exitButton);
  }
}

async function exitSupportView(exitButton) {
  if (supportViewExitPending) {
    return;
  }
  supportViewExitPending = true;
  exitButton.disabled = true;
  exitButton.textContent = "Ending...";

  try {
    await window.LongtailForge.api.postJson("/api/support-view/exit", {});
    const returnPath = normalizeSupportViewReturnPath(
      window.sessionStorage.getItem(SUPPORT_VIEW_RETURN_PATH_KEY),
    );
    window.sessionStorage.removeItem(SUPPORT_VIEW_RETURN_PATH_KEY);
    window.sessionStorage.setItem(SUPPORT_VIEW_RESTORE_FOCUS_KEY, "true");
    window.localStorage.removeItem(WORKSPACE_CONTEXT_STORAGE_KEY);
    window.location.replace(returnPath);
  } catch (error) {
    supportViewExitPending = false;
    exitButton.disabled = false;
    exitButton.textContent = "End Support View";
    await showSessionAuthWarning();
    console.error(error);
  }
}

function normalizeSupportViewReturnPath(value) {
  try {
    const url = new URL(String(value || "/dashboard.html"), window.location.origin);
    const blocked = new Set(["/login.html", "/support-view.html", "/support-view-audit.html"]);
    if (url.origin === window.location.origin && url.pathname.endsWith(".html") && !blocked.has(url.pathname)) {
      return `${url.pathname}${url.search}`;
    }
  } catch {
    // Invalid stored paths fall back to the safe dashboard landing.
  }
  return "/dashboard.html";
}

function restoreFocusAfterSupportView() {
  if (window.LongtailForge.supportView || window.sessionStorage.getItem(SUPPORT_VIEW_RESTORE_FOCUS_KEY) !== "true") {
    return;
  }
  const focusHeading = () => {
    const heading = document.querySelector("main h1");
    if (!heading) {
      return false;
    }
    heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
    window.sessionStorage.removeItem(SUPPORT_VIEW_RESTORE_FOCUS_KEY);
    return true;
  };

  if (focusHeading()) {
    return;
  }

  const observer = new window.MutationObserver(() => {
    if (focusHeading()) {
      observer.disconnect();
    }
  });
  observer.observe(document.querySelector("main") || document.body, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 5000);
}

function installSupportViewBrowserPolicy() {
  applySupportViewBrowserPolicy(document.body);
  supportViewMutationObserver = new window.MutationObserver((records) => {
    records.forEach((record) => {
      record.addedNodes.forEach((node) => {
        if (node.nodeType === window.Node.ELEMENT_NODE) {
          applySupportViewBrowserPolicy(node);
        }
      });
    });
  });
  supportViewMutationObserver.observe(document.body, { childList: true, subtree: true });
}

function applySupportViewBrowserPolicy(root) {
  const controls = [];
  if (root.matches?.("button, input[type='button'], input[type='submit'], input[type='file']")) {
    controls.push(root);
  }
  controls.push(...(root.querySelectorAll?.("button, input[type='button'], input[type='submit'], input[type='file']") || []));
  controls.forEach((control) => {
    if (control.disabled || isSupportViewReadControl(control)) {
      return;
    }
    control.disabled = true;
    control.dataset.supportViewDisabled = "";
    control.title = "Unavailable while using Support View. End Support View to make changes.";
    control.setAttribute("aria-describedby", "support-view-read-only-explanation");
  });
}

function isSupportViewReadControl(control) {
  if (control.closest("[data-support-view-banner], .site-header") || control.hasAttribute("data-support-view-read-control")) {
    return true;
  }
  if (control.matches("input[type='file']")) {
    return false;
  }
  const text = String(control.textContent || control.value || "").trim().toLowerCase();
  const dataNames = Object.keys(control.dataset || {}).join(" ").toLowerCase();
  const safeWords = [
    "apply", "back", "cancel", "close", "collapse", "details", "expand", "filter", "hide",
    "load", "next", "open", "preview", "previous", "refresh", "reset", "search", "show", "today", "view",
  ];
  return safeWords.some((word) => text === word || text.startsWith(`${word} `) || dataNames.includes(word));
}

function applyWorkspaceDeletionNotice(workspaceContext) {
  let notice = document.querySelector("[data-workspace-deletion-notice]");
  const deletion = workspaceContext?.workspaceDeletion;
  if (!deletion) {
    notice?.remove();
    return;
  }
  if (!notice) {
    notice = document.createElement("aside");
    notice.className = "workspace-deletion-notice";
    notice.dataset.workspaceDeletionNotice = "";
    notice.setAttribute("role", "status");
    siteHeader.insertAdjacentElement("afterend", notice);
  }
  const deadline = new Date(deletion.purgeAfter);
  const deadlineLabel = Number.isNaN(deadline.getTime()) ? "the displayed deadline" : deadline.toLocaleString();
  notice.replaceChildren();
  const message = document.createElement("span");
  message.textContent = `This workspace is pending deletion. The 30-day grace period ends ${deadlineLabel}.`;
  const link = document.createElement("a");
  link.href = "workspace-settings.html";
  link.textContent = "Review or cancel";
  notice.append(message, link);
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
  void navigationIntent.navigate(query ? `search.html?${query}` : "search.html", {
    kind: "global-search",
    trigger: globalSearchInput,
  });
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
      applyThemeMode(user.themeMode, user.themeAutoSource);
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

function applyThemeMode(themeMode, themeAutoSource = "system") {
  const normalizedThemeMode = normalizeThemeMode(themeMode);
  const normalizedThemeAutoSource = normalizeThemeAutoSource(themeAutoSource);
  const effectiveTheme = resolveThemeMode(normalizedThemeMode, normalizedThemeAutoSource);

  window.localStorage.setItem(THEME_STORAGE_KEY, normalizedThemeMode);
  window.localStorage.setItem(THEME_AUTO_SOURCE_STORAGE_KEY, normalizedThemeAutoSource);
  document.documentElement.dataset.themeMode = normalizedThemeMode;
  document.documentElement.dataset.themeAutoSource = normalizedThemeAutoSource;
  document.documentElement.dataset.theme = effectiveTheme;
  document.documentElement.style.colorScheme = effectiveTheme;
  ensureSystemThemeModeWatcher();
}

function normalizeThemeMode(value) {
  return ["light", "auto", "dark"].includes(value) ? value : "light";
}

function normalizeThemeAutoSource(value) {
  return value === "system" ? "system" : "system";
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
    quickActions: Array.isArray(settings.quickActions) ? settings.quickActions : previousContext.quickActions || [],
    searchTargets: Array.isArray(settings.searchTargets) ? settings.searchTargets : previousContext.searchTargets || [],
    viewSurfaces: Array.isArray(settings.viewSurfaces) ? settings.viewSurfaces : previousContext.viewSurfaces || [],
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
  workspaceSelector.addEventListener("change", () => {
    const workspaceId = workspaceSelector.value;

    if (!workspaceId) {
      return;
    }

    void navigationIntent.request({
      commitBeforeContinue: true,
      kind: "workspace-switch",
      trigger: workspaceSelector,
      continue: () => switchWorkspace(workspaceId),
    }).catch(() => {});
  });
}

async function switchWorkspace(workspaceId) {
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

    const body = await response.json().catch(() => ({}));
    window.localStorage.removeItem(WORKSPACE_CONTEXT_STORAGE_KEY);
    window.location.assign(normalizeLandingPath(body.landingPath));
  } catch (error) {
    await loadSessionWorkspaces();
    throw error;
  }
}

function normalizeLandingPath(value) {
  return [
    "/dashboard.html",
    "/workbench.html",
    "/tasks.html",
    "/notes.html",
    "/lists.html",
  ].includes(value) ? value : "/dashboard.html";
}

function logOut() {
  return navigationIntent.request({
    commitBeforeContinue: true,
    kind: "logout",
    continue: performLogout,
  });
}

async function performLogout() {
  try {
    await fetch("/api/logout", {
      method: "POST",
    });
  } catch {
    // The local session is still cleared and the login page remains the safe destination.
  } finally {
    window.localStorage.removeItem(THEME_STORAGE_KEY);
    window.localStorage.removeItem(THEME_AUTO_SOURCE_STORAGE_KEY);
    window.localStorage.removeItem("lf_timezone");
    window.localStorage.removeItem(WORKSPACE_CONTEXT_STORAGE_KEY);
    window.location.replace("/login.html");
  }
}
