const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.getElementById("primary-menu");
const DEFAULT_ORGANIZATION_NAME = "Organization";

if (navToggle && navLinks) {
  navToggle.addEventListener("click", () => {
    const isOpen = navToggle.getAttribute("aria-expanded") === "true";

    navToggle.setAttribute("aria-expanded", String(!isOpen));
    navLinks.classList.toggle("is-open", !isOpen);
  });
}

loadAppSettings();

async function loadAppSettings() {
  try {
    const response = await fetch("data/settings.json", { cache: "no-store" });

    if (!response.ok) {
      throw new Error("Settings were unavailable.");
    }

    const settings = await response.json();
    applyOrganizationName(settings.organizationName);
  } catch (error) {
    applyOrganizationName(DEFAULT_ORGANIZATION_NAME);
  }
}

function applyOrganizationName(value) {
  const organizationName = String(value || "").trim() || DEFAULT_ORGANIZATION_NAME;

  document.querySelectorAll("[data-organization-name]").forEach((element) => {
    element.textContent = organizationName;
  });

  if (document.body.dataset.titleMode === "app") {
    document.title = `${organizationName} Time Tracker`;
    return;
  }

  if (document.body.dataset.pageTitle) {
    document.title = `${document.body.dataset.pageTitle} | ${organizationName} Time Tracker`;
  }
}
