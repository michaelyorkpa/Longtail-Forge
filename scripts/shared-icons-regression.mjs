import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const iconHelper = readText("public/js/shared/icons.js");
const css = readText("public/css/longtail-forge.css");
const moduleDevelopment = readText("docs/module-development.md");
const license = readText("public/icons/LUCIDE-LICENSE.md");
const packageJson = readText("package.json");
const protectedViews = readdirSync(new URL("../views/protected/", import.meta.url))
  .filter((fileName) => fileName.endsWith(".html"));

const requiredIcons = ["add", "edit", "archive", "restore", "delete", "start", "pause", "save", "close", "copy", "refresh", "more", "complete", "duplicate", "up", "down", "tag", "file"];

requiredIcons.forEach((iconName) => {
  assert.match(iconHelper, new RegExp(`${iconName}:\\s*Object\\.freeze`), `shared icon helper must register the ${iconName} icon`);
});

assert.match(iconHelper, /createElementNS\(svgNamespace,\s*"svg"\)/, "icons must be rendered as DOM-created inline SVG");
assert.match(iconHelper, /stroke",\s*"currentColor"/, "icons must use currentColor for theme compatibility");
assert.match(iconHelper, /throw new Error\(`Unknown icon '\$\{name\}'\.`\)/, "unknown icon names must fail safely");
assert.doesNotMatch(iconHelper, /\binnerHTML\b/, "icon helper must not inject arbitrary SVG strings with innerHTML");
assert.match(iconHelper, /Non-decorative icons require a label\./, "non-decorative icons must require accessible labels");
assert.match(iconHelper, /Icon buttons require an accessible label or visible text\./, "icon buttons must require an accessible name");
assert.match(iconHelper, /classList\.add\("danger-button"\)/, "danger action buttons must preserve danger styling");
assert.doesNotMatch(iconHelper, /\b(?:tasks|time-tracking|client-projects|tags|notifications)\b/, "shared icon helper must stay module-agnostic");

assert.match(css, /\.icon\s*\{[\s\S]*stroke:\s*currentColor/, "shared CSS must style icons with currentColor");
assert.match(css, /\.icon-button\s*\{[\s\S]*min-width:\s*44px[\s\S]*min-height:\s*44px/, "icon-only buttons must keep a minimum 44px touch target");
assert.match(css, /\.action-button\s*\{[\s\S]*display:\s*inline-flex/, "action buttons must use shared inline-flex layout");
assert.match(css, /\.action-group\s*\{[\s\S]*display:\s*flex/, "shared compact action groups must be available");
assert.match(css, /\.icon-button\.danger-button/, "danger icon buttons must have an explicit shared style hook");

assert.match(moduleDevelopment, /Shared Icon And Action Controls/, "module development docs must document icon/action controls");
assert.match(moduleDevelopment, /window\.LongtailForge\.icons/, "module development docs must name the shared icon helper");
assert.match(moduleDevelopment, /duplicate icon registries/, "module development docs must tell modules not to ship duplicate common icon registries");

assert.match(license, /Lucide Icons/, "local Lucide attribution must be present");
assert.match(license, /ISC License/, "local Lucide attribution must name the ISC license");
assert.doesNotMatch(packageJson, /lucide/i, "shared icon foundation must not add a Lucide package dependency in Pass 1");

protectedViews.forEach((viewName) => {
  const view = readText(`views/protected/${viewName}`);
  assert.match(view, /js\/shared\/icons\.js\?v=\d+/, `${viewName} must load the shared icon helper`);
});

console.log("Shared icons regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
