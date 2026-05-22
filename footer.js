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
