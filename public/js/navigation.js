// Shared authenticated app shell. Add/remove menu items here instead of editing every page.
const DEFAULT_ORGANIZATION_NAME = "Organization";
const NAV_ITEMS = [
  { label: "Home", href: "home.html" },
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
      { label: "Organization", href: "organization-settings.html" },
      { label: "User Admin", href: "user-admin.html" },
      { label: "User", href: "user-settings.html" },
    ],
  },
];

const siteHeader = buildSiteHeader();
document.body.prepend(siteHeader);

const navToggle = siteHeader.querySelector(".nav-toggle");
const navLinks = siteHeader.querySelector("#primary-menu");

if (navToggle && navLinks) {
  navToggle.addEventListener("click", () => {
    const isOpen = navToggle.getAttribute("aria-expanded") === "true";

    navToggle.setAttribute("aria-expanded", String(!isOpen));
    navLinks.classList.toggle("is-open", !isOpen);
  });
}

loadOrganizationSettings();

function buildSiteHeader() {
  // Build the header at runtime so page HTML can stay focused on page-specific content.
  const header = document.createElement("header");
  const nav = document.createElement("nav");
  const brand = document.createElement("a");
  const toggle = document.createElement("button");
  const links = document.createElement("div");
  const currentPage = getCurrentPage();

  header.className = "site-header";
  nav.className = "site-nav";
  nav.setAttribute("aria-label", "Primary");

  brand.className = "site-brand";
  brand.href = "home.html";
  brand.dataset.organizationName = "";
  brand.textContent = DEFAULT_ORGANIZATION_NAME;

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

  return page || "home.html";
}

async function loadOrganizationSettings() {
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
    applyOrganizationName(settings.organizationName);
  } catch {
    applyOrganizationName(DEFAULT_ORGANIZATION_NAME);
  }
}

function applyOrganizationName(value) {
  const organizationName = String(value || "").trim() || DEFAULT_ORGANIZATION_NAME;

  document.querySelectorAll("[data-organization-name]").forEach((element) => {
    element.textContent = organizationName;
  });

  if (document.body.dataset.titleMode === "app") {
    document.title = `${organizationName} Longtail Forge`;
    return;
  }

  if (document.body.dataset.pageTitle) {
    document.title = `${document.body.dataset.pageTitle} | ${organizationName} Longtail Forge`;
  }
}

async function logOut() {
  try {
    await fetch("/api/logout", {
      method: "POST",
    });
  } finally {
    window.localStorage.removeItem("lf_theme");
    window.location.replace("/login.html");
  }
}
