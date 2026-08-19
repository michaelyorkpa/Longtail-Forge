// Consolidated under views.current-static-contracts by 0.33.33.9.
export const regressionMeta = Object.freeze({
  id: "views.mobile-app-shell-header",
  area: "views",
  tier: "focused",
  tags: ["app-shell", "mobile", "navigation", "responsive", "views"],
  description: "Pins the mobile app-shell header boundary: Search and Notifications stay outside the primary-menu drawer, the phone wordmark is hidden, and the established drawer lifecycle remains intact.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const navigationSource = await fs.readFile(path.join(root, "public/js/navigation.js"), "utf8");
const frameworkCss = await fs.readFile(path.join(root, "public/css/longtail-forge.css"), "utf8");

const buildSiteHeaderSource = extractFunction(navigationSource, "buildSiteHeader");
const renderNavigationSource = extractFunction(navigationSource, "renderNavigation");
const mobileCss = extractCssBlock(frameworkCss, "@media (max-width: 700px)", ".site-nav");

assert.match(
  buildSiteHeaderSource,
  /headerControls\.append\(searchShell, links, notificationWrap\);\s*nav\.append\(brand, headerControls, toggle\);/,
  "Search and Notifications must share a header-controls row outside #primary-menu",
);
assert.doesNotMatch(
  buildSiteHeaderSource,
  /links\.append\((?:searchShell|notificationWrap)\)/,
  "#primary-menu must not own Search or Notifications",
);
assert.match(
  renderNavigationSource,
  /navLinks\.replaceChildren\(\.\.\.items\.map\(\(item\) => createNavItem\(item, currentPage\)\)\);/,
  "runtime navigation refresh must replace navigation items without moving header controls into the drawer",
);
assert.match(mobileCss, /\.site-brand-name\s*\{\s*display: none;/, "the mobile header must hide the wordmark");
assert.match(
  mobileCss,
  /\.site-header-controls\s*\{[\s\S]*?order: 2;[\s\S]*?\}[\s\S]*?\.nav-toggle\s*\{[\s\S]*?order: 3;/,
  "the mobile header controls must remain immediately before the hamburger toggle",
);
assert.match(mobileCss, /\.nav-links\s*\{[\s\S]*?position: fixed;/, "the established mobile primary-menu drawer must remain fixed");
assert.match(navigationSource, /navDrawerOverlay\?\.addEventListener\("click"/, "overlay close behavior must remain wired");
assert.match(navigationSource, /event\.key !== "Escape" \|\| !navDrawerIsOpen\(\)/, "Escape close behavior must remain wired");
assert.match(navigationSource, /document\.addEventListener\("focusin"/, "drawer focus containment must remain wired");
assert.match(navigationSource, /document\.body\.classList\.toggle\("nav-drawer-open", isOpen\)/, "drawer scroll-lock state must remain wired");
console.log("Mobile app-shell header regression passed.");

/** @param {string} source @param {string} name @returns {string} */
function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Expected ${name} in navigation.js`);

  const bodyStart = source.indexOf("{", start);
  let depth = 0;

  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") {
      depth += 1;
    } else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  assert.fail(`Could not extract ${name} from navigation.js`);
}

/** @param {string} source @param {string} marker @param {string} requiredContent @returns {string} */
function extractCssBlock(source, marker, requiredContent) {
  let start = source.indexOf(marker);

  while (start !== -1) {
    const bodyStart = source.indexOf("{", start);
    let depth = 0;

    for (let index = bodyStart; index < source.length; index += 1) {
      if (source[index] === "{") {
        depth += 1;
      } else if (source[index] === "}") {
        depth -= 1;
        if (depth === 0) {
          const block = source.slice(start, index + 1);
          if (block.includes(requiredContent)) {
            return block;
          }
          break;
        }
      }
    }

    start = source.indexOf(marker, start + marker.length);
  }

  assert.fail(`Could not extract ${marker} containing ${requiredContent} from framework CSS`);
}
