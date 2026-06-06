import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const iconHelper = readText("public/js/shared/icons.js");
const css = readText("public/css/longtail-forge.css");
const packageJson = readText("package.json");
const packageLock = readText("package-lock.json");
const accessibilityDocs = readText("docs/accessibility.md");
const sourceFiles = [
  "public/js/tasks.js",
  "public/js/tags.js",
  "public/js/time-entries.js",
  "public/js/notifications.js",
  "public/js/clients-projects.js",
  "public/js/task-dialog.js",
  "public/js/stop-watch.js",
];
const protectedViews = readdirSync(new URL("../views/protected/", import.meta.url))
  .filter((fileName) => fileName.endsWith(".html"))
  .map((fileName) => readText(`views/protected/${fileName}`));

assert.match(iconHelper, /button\.setAttribute\("aria-label", label\)/, "icon-only buttons must receive aria-label from the shared helper");
assert.match(iconHelper, /button\.title = options\.title \|\| label/, "icon-only buttons must keep discoverable title text");
assert.match(iconHelper, /createIcon\(options\.icon, \{ decorative: true, size: options\.size \}\)/, "button icons must be decorative by default");
assert.match(iconHelper, /icon\.setAttribute\("aria-hidden", "true"\)/, "decorative icons must be hidden from assistive technology");
assert.match(iconHelper, /icon\.setAttribute\("focusable", "false"\)/, "decorative SVG icons must not become focusable");
assert.match(iconHelper, /Non-decorative icons require a label\./, "non-decorative standalone icons must require labels");
assert.match(iconHelper, /button\.classList\.add\("danger-button"\)/, "danger icon buttons must preserve danger-button styling");
assert.match(iconHelper, /document\.createElement\("button"\)/, "shared action controls must use native button elements");
assert.match(iconHelper, /decorateButton requires a button element\./, "decorateButton must refuse non-button command elements");

assert.match(css, /:focus-visible\s*\{[\s\S]*outline/, "focusable controls must keep visible focus styling");
assert.match(css, /button:disabled\s*\{[\s\S]*cursor:\s*not-allowed[\s\S]*opacity:\s*0\.5/, "disabled icon buttons must inherit discoverable disabled styling");
assert.match(css, /\.icon-button\s*\{[\s\S]*min-width:\s*44px[\s\S]*width:\s*44px[\s\S]*min-height:\s*44px/, "icon-only buttons must keep the 44px shared touch target");
assert.match(css, /\.icon-button\.danger-button\s*\{[\s\S]*border-color:\s*var\(--color-danger-border\)[\s\S]*color:\s*var\(--color-danger\)/, "danger icon buttons must keep danger colors");

sourceFiles.forEach((path) => {
  const source = readText(path);
  const callBlocks = findFunctionCallBlocks(source, "createIconButton");

  callBlocks.forEach((block) => {
    assert.match(block, /\blabel(?:\s*:|[\s,\n}])/, `${path} createIconButton calls must pass an accessible label`);
    assert.match(block, /\btitle\s*:/, `${path} createIconButton calls must pass discoverable title text`);
  });
});

const combinedProtectedViews = protectedViews.join("\n");
assert.doesNotMatch(combinedProtectedViews, /(?:fontawesome|font-awesome|cdnjs|unpkg|jsdelivr|lucide)/i, "protected views must not load remote icon fonts or CDN icon scripts");
assert.doesNotMatch(css, /(?:fontawesome|font-awesome|cdnjs|unpkg|jsdelivr|@font-face[\s\S]*icon)/i, "shared CSS must not introduce remote icon font dependencies");
assert.doesNotMatch(packageJson, /(?:lucide|fontawesome|font-awesome)/i, "package.json must not add icon package dependencies for the local subset");
assert.doesNotMatch(packageLock, /(?:lucide|fontawesome|font-awesome)/i, "package-lock.json must not add icon package dependencies for the local subset");

assert.match(accessibilityDocs, /Icon-Only Controls/, "accessibility docs must document icon-only control expectations");
assert.match(accessibilityDocs, /aria-label/, "accessibility docs must require labels for icon-only controls");

console.log("Icon accessibility contract regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function findFunctionCallBlocks(source, functionName) {
  const blocks = [];
  let start = source.indexOf(`${functionName}(`);

  while (start !== -1) {
    const openParen = source.indexOf("(", start);
    let depth = 0;

    for (let index = openParen; index < source.length; index += 1) {
      const char = source[index];

      if (char === "(") {
        depth += 1;
      } else if (char === ")") {
        depth -= 1;

        if (depth === 0) {
          blocks.push(source.slice(start, index + 1));
          break;
        }
      }
    }

    start = source.indexOf(`${functionName}(`, start + functionName.length);
  }

  return blocks;
}
