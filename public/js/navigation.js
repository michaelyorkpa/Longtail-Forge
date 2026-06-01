// Shared authenticated app shell. Add/remove menu items here instead of editing every page.
const DEFAULT_WORKSPACE_NAME = "Workspace";
const NAV_ITEMS = [
  { label: "Dashboard", href: "dashboard.html" },
  {
    label: "Time Keeping",
    items: [
      { label: "Time Tracker", href: "time-tracker.html" },
      { label: "Create Manual Entry", href: "manual-entry.html" },
      { label: "Edit Entries", href: "edit-entries.html" },
    ],
  },
  { label: "Reporting", href: "reporting.html" },
  {
    label: "Settings",
    items: [
      { label: "Projects", href: "projects.html" },
      { label: "Clients", href: "clients.html" },
      { label: "Workspace", href: "workspace-settings.html" },
      { label: "User Admin", href: "user-admin.html" },
      { label: "User", href: "user-settings.html" },
      { label: "API Keys", href: "api-keys.html" },
      { label: "Audit Log", href: "audit-log.html" },
    ],
  },
];

const siteHeader = buildSiteHeader();
document.body.prepend(siteHeader);

const navToggle = siteHeader.querySelector(".nav-toggle");
const navLinks = siteHeader.querySelector("#primary-menu");
const workspaceSelector = siteHeader.querySelector("[data-workspace-selector]");

if (navToggle && navLinks) {
  navToggle.addEventListener("click", () => {
    const isOpen = navToggle.getAttribute("aria-expanded") === "true";

    navToggle.setAttribute("aria-expanded", String(!isOpen));
    navLinks.classList.toggle("is-open", !isOpen);
  });
}

loadWorkspaceSettings();
loadSessionWorkspaces();

function buildSiteHeader() {
  // Build the header at runtime so page HTML can stay focused on page-specific content.
  const header = document.createElement("header");
  const nav = document.createElement("nav");
  const brand = document.createElement("div");
  const homeLink = document.createElement("a");
  const workspaceSelect = document.createElement("select");
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

  links.append(createLogoutButton());
  nav.append(brand, toggle, links);
  header.append(nav);

  return header;
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
  summary.textContent = item.label;
  menuLinks.className = "nav-menu-links";

  item.items.forEach((childItem) => {
    menuLinks.append(createNavLink(childItem, currentPage));
  });

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
    applyWorkspaceName(settings.workspaceName || settings.organizationName);
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
    const workspaces = Array.isArray(user.workspaces) ? user.workspaces : [];

    if (workspaces.length === 0) {
      return;
    }

    workspaceSelector.replaceChildren(...workspaces.map((workspace) =>
      createWorkspaceOption(workspace.workspaceName || workspace.workspace_id, workspace.workspace_id),
    ));
    workspaceSelector.value = user.active_workspace_id || user.organization_id || workspaces[0].workspace_id;
    workspaceSelector.disabled = workspaces.length < 2;
    applyActiveWorkspaceLabel();
  } catch {
    workspaceSelector.disabled = true;
  }
}

function createWorkspaceOption(label, value = label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function applyWorkspaceName(value) {
  const workspaceName = String(value || "").trim() || DEFAULT_WORKSPACE_NAME;

  document.querySelectorAll("[data-organization-name], [data-workspace-name]").forEach((element) => {
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
    document.title = `${workspaceName} Longtail Forge`;
    return;
  }

  if (document.body.dataset.pageTitle) {
    document.title = `${document.body.dataset.pageTitle} | ${workspaceName} Longtail Forge`;
  }
}

window.applyOrganizationName = applyWorkspaceName;
window.applyWorkspaceName = applyWorkspaceName;

function applyActiveWorkspaceLabel(fallbackName = DEFAULT_WORKSPACE_NAME) {
  if (!workspaceSelector) {
    return;
  }

  const selectedOption = workspaceSelector.selectedOptions[0];
  const workspaceName = selectedOption?.textContent || fallbackName;

  workspaceSelector.title = `Active workspace: ${workspaceName}`;
}

function applyWorkspaceCapabilities(settings) {
  const capabilities = settings.workspaceCapabilities || {};
  const workspaceType = settings.workspaceType || capabilities.workspaceType || "business";
  const availableTools = new Set(Array.isArray(capabilities.availableTools) ? capabilities.availableTools : []);

  siteHeader.dataset.workspaceType = workspaceType;
  setNavLinkVisible("clients.html", availableTools.has("clients_projects"));
  setNavLinkVisible("api-keys.html", workspaceType === "business");
  setNavLinkVisible("user-admin.html", availableTools.has("team_members"));
  setNavLinkVisible("reporting.html", availableTools.has("billing_invoicing_reporting") || availableTools.has("time_tracking"));
  setNavLinkVisible("time-tracker.html", availableTools.has("time_tracking") || availableTools.has("time_tracking_optional"));
  setNavLinkVisible("manual-entry.html", availableTools.has("time_tracking") || availableTools.has("time_tracking_optional"));
  setNavLinkVisible("edit-entries.html", availableTools.has("time_tracking") || availableTools.has("time_tracking_optional"));

  document.querySelectorAll(".nav-menu").forEach((menu) => {
    const visibleLinks = [...menu.querySelectorAll("a")].filter((link) => !link.hidden);
    menu.hidden = visibleLinks.length === 0;
  });
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
    window.location.replace("/login.html");
  }
}
