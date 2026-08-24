import { escapeRegExp, extractFunctionSpan } from "../../test-support/source-scan.mjs";
import assert from "node:assert/strict";

import { createProjectTextReader } from "../../test-support/source-scan.mjs";
// Consolidated under views.current-static-contracts by 0.33.33.9.
const { readText } = createProjectTextReader();

const version = "0.33.5.15.6";
const viewContract = readText("docs/view-building-contract.md");
const helper = readText("public/js/shared/view-builder.js");
const renderer = readText("public/js/shared/view-renderer.js");
const css = readText("public/css/longtail-forge.css");
const listsHtml = readText("views/protected/lists.html");
const listsJs = readText("public/js/lists.js");
const clientsScript = readText("public/js/clients-projects.js");
const clientsHtml = readText("views/protected/clients.html");
const projectsHtml = readText("views/protected/projects.html");
const workbenchHtml = readText("views/protected/workbench.html");

assert.match(viewContract, new RegExp(`As of ${escapeRegExp(version)}`), "View contract should report the current guardrail version");
assert.match(viewContract, /Implementation Notes For 0\.33\.5\.15\.5/, "View contract should document the guardrail slice");
assert.doesNotMatch(helper, /\bfetch\b|XMLHttpRequest|localStorage|sessionStorage|["'`]\/api\//, "View builder should not own module data loading or storage");
assert.match(helper, /function createModalFooter/, "View builder should own modal footer creation");
assert.match(helper, /surface-modal-footer-group/, "View builder should own modal footer groups");
assert.match(helper, /function createDetailActionStrip/, "View builder should own detail action strips");
assert.match(helper, /function createInlineActionRow/, "View builder should own inline action rows");

assert.match(listsHtml, /<main class="wide-page lists-page" data-lists-host><\/main>/, "Lists converted surface should stay a minimal host");
assert.match(listsHtml, /js\/shared\/view-builder\.js[\s\S]*js\/lists\.js/, "Lists should load view-builder before the converted module script");
assert.doesNotMatch(listsHtml, /<dialog|data-list-filter-status|data-lists-list|data-list-detail|data-list-dialog/, "Lists HTML should not reintroduce converted anatomy");
assert.doesNotMatch(listsJs, /document\.createElement\("dialog"\)/, "Converted Lists should use the shared modal helper for dialogs");
assertNoHardcodedLightBackgrounds(listsJs, "Lists converted browser source");

for (const helperName of [
  "createFilterPanel",
  "createCollapsibleIndexPanel",
  "createDataTable",
  "createDetailActionStrip",
  "createInlineActionRow",
  "createModalForm",
]) {
  assert.match(renderer, new RegExp(`view\\.${helperName}`), `Declarative renderer should use LongtailForge.view.${helperName}`);
  assert.doesNotMatch(listsJs, new RegExp(`view\\.${helperName}`), `Converted Lists should not call LongtailForge.view.${helperName} directly after descriptor migration`);
}

for (const helperName of [
  "renderDescriptorActionMenu",
  "renderDescriptorDataTable",
  "renderDescriptorFieldGrid",
  "renderDescriptorInlineActions",
  "renderDescriptorModalForm",
]) {
  assert.match(listsJs, new RegExp(`view\\.${helperName}`), `Converted Lists should use LongtailForge.view.${helperName}`);
}

for (const html of [clientsHtml, projectsHtml]) {
  assert.match(html, /js\/shared\/view-builder\.js/, "Client/Project surfaces should load view-builder");
  assert.match(html, /js\/shared\/view-renderer\.js/, "Client/Project surfaces should load view-renderer");
  assert.ok(
    html.indexOf("js/shared/view-builder.js") < html.indexOf("js/shared/view-renderer.js") &&
      html.indexOf("js/shared/view-renderer.js") < html.indexOf("clients-projects.js"),
    "Client/Project surfaces should load view-builder and view-renderer before shared Client/Project code",
  );
}
// The workbench keeps the view helpers static and lazy-loads the shared
// Client/Project dialog code through its module-action dependency mechanism.
assert.match(workbenchHtml, /js\/shared\/view-builder\.js/, "Workbench should load view-builder");
assert.match(workbenchHtml, /js\/shared\/view-renderer\.js/, "Workbench should load view-renderer");
assert.ok(
  workbenchHtml.indexOf("js/shared/view-builder.js") < workbenchHtml.indexOf("js/shared/view-renderer.js"),
  "Workbench should load view-builder before view-renderer",
);
assert.doesNotMatch(workbenchHtml, /js\/clients-projects\.js/, "Workbench should lazy-load the shared Client/Project dialog code");
assert.match(readText("public/js/workbench.js"), /src: "js\/clients-projects\.js"/, "Workbench should declare the Client/Project dialog as a lazy module-action dependency");
assert.doesNotMatch(clientsHtml, /<dialog data-client-modal>/, "Clients page should not restore the static Add Client dialog");
assert.match(clientsScript, /const view = window\.LongtailForge\?\.view/, "Client/Project dialogs should consume the shared view namespace");
assert.match(extractFunctionSpan(clientsScript, "createModalCommitGroup"), /surface-modal-footer-group/, "Converted Client/Project footers should keep framework footer groups");
assert.match(extractFunctionSpan(clientsScript, "createModalAction"), /surface-modal-footer-action/, "Converted Client/Project actions should keep framework footer action classes");

for (const functionName of [
  "openProjectDetailDialog",
  "openClientDetailDialog",
  "openAddProjectDialog",
  "openAddClientDialog",
]) {
  const block = extractFunctionSpan(clientsScript, functionName);
  assert.doesNotMatch(block, /document\.createElement\("dialog"\)/, `${functionName} should not directly create dialog elements`);
  assert.doesNotMatch(block, /\.className\s*=\s*["'`][^"'`]*(form-actions|modal-actions)[^"'`]*/, `${functionName} should not overwrite helper-built footer classes`);
  assert.doesNotMatch(block, /\.classList\.add\([^)]*modal-actions/, `${functionName} should not add one-off modal action classes outside helper calls`);
  assertNoHardcodedLightBackgrounds(block, `${functionName} converted dialog source`);
}
assert.doesNotMatch(clientsScript, /function createAddClientPageDialogShell/, "Client/Project source should not keep a duplicate page-level Add Client dialog shell");

const viewCss = css.slice(css.indexOf(".view-page-header"), css.indexOf(".site-header"));
assert(viewCss.length > 0, "Shared view CSS block should be discoverable");
assert.doesNotMatch(viewCss, /background(?:-color)?:\s*#[0-9a-fA-F]{3,8}\b/, "Shared view CSS should use theme tokens for backgrounds");
assert.match(css, /\.view-detail-action-strip,[\s\S]*\.view-inline-action-row\s*\{[\s\S]*flex-wrap:\s*wrap/, "Shared detail and inline action rows should wrap");
assert.match(helper, /className:\s*\["view-detail-action-strip",\s*"surface-dense-actions"/, "Detail action strips should use dense action surface classes");
assert.match(helper, /className:\s*\["view-inline-action-row",\s*"surface-dense-actions"/, "Inline action rows should use dense action surface classes");

console.log("View builder converted-surface guardrails passed.");

/** @param {string} source @param {string} label */
function assertNoHardcodedLightBackgrounds(source, label) {
  assert.doesNotMatch(
    source,
    /(?:background(?:Color)?|background-color)\s*(?::|=)\s*["'`]?#(?:fff|f[0-9a-fA-F]{2}|e[0-9a-fA-F]{2}|d[0-9a-fA-F]{2})\b/i,
    `${label} should not introduce hard-coded light backgrounds`,
  );
}
