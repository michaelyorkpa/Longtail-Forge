// Shared footer for public and authenticated pages.
const footer = document.createElement("footer");
footer.className = "site-footer";

const footerInner = document.createElement("div");
footerInner.className = "site-footer-inner";

const footerBrand = document.createElement("p");
footerBrand.className = "site-footer-brand";
footerBrand.textContent = [
  "Longtail Forge",
  "Copyright \u00a9 2026 Raymond Tec",
].join("\n");

const footerLicense = document.createElement("p");
footerLicense.className = "site-footer-license";
footerLicense.textContent = [
  "This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by",
  "the Free Software Foundation, either version 3 of the License, or at your option any later version.",
].join("\n");

footerInner.append(footerBrand, footerLicense);
footer.appendChild(footerInner);
document.body.appendChild(footer);

function updateFooterMetrics() {
  const root = document.documentElement;
  const viewportHeight = window.innerHeight || root.clientHeight || 0;
  const footerRect = typeof footer.getBoundingClientRect === "function"
    ? footer.getBoundingClientRect()
    : { top: viewportHeight };
  const footerTop = Number.isFinite(footerRect.top) ? footerRect.top : viewportHeight;
  const footerBottom = Number.isFinite(footerRect.bottom) ? footerRect.bottom : footerTop;
  const visibleFooterOffset = Math.max(
    0,
    Math.min(viewportHeight, footerBottom) - Math.max(footerTop, 0),
  );

  root.style.setProperty("--site-footer-visible-offset", `${Math.ceil(visibleFooterOffset)}px`);
}

async function updateFooterBrand() {
  try {
    const response = await fetch("/api/app-info", {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("App info unavailable");
    }

    const appInfo = await response.json();
    const name = appInfo.name || "Longtail Forge";
    const version = appInfo.version ? ` v${appInfo.version}` : "";

    footerBrand.textContent = [
      `${name}${version}`,
      "Copyright \u00a9 2026 Raymond Tec",
    ].join("\n");
  } catch {
    footerBrand.textContent = [
      "Longtail Forge",
      "Copyright \u00a9 2026 Raymond Tec",
    ].join("\n");
  } finally {
    updateFooterMetrics();
  }
}

updateFooterBrand();
updateFooterMetrics();
window.addEventListener?.("resize", updateFooterMetrics);
window.addEventListener?.("scroll", updateFooterMetrics, { passive: true });
