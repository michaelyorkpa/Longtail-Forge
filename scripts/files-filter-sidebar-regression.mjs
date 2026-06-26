import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.18.11.8";
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const filesHtml = readText("views/protected/files.html");
const filesScript = readText("public/js/files.js");
const styles = readText("public/css/longtail-forge.css");
const frameworkSurfaceSource = readText("src/core/view-surfaces/framework-view-surfaces.js");
const rendererShellRegression = readText("scripts/view-renderer-shell-regression.mjs");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the current app version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the current app version");

assert.match(filesHtml, /<main class="wide-page files-page" data-files-host><\/main>/, "Files protected view should stay a minimal descriptor host");
assert.match(filesHtml, /js\/shared\/client-project-options\.js[\s\S]*js\/shared\/view-builder\.js\?v=16[\s\S]*js\/shared\/view-renderer\.js\?v=12[\s\S]*js\/files\.js\?v=7/, "Files host should load the client/project provider helper and renderer before the Files adapter");
assertNoProtectedAnatomy(filesHtml, "views/protected/files.html");

assert.match(frameworkSurfaceSource, /id:\s*"files\.browse"[\s\S]*layout:\s*"slide-out-sidebar"/, "Files descriptor should use the shared slide-out sidebar layout");
assert.match(frameworkSurfaceSource, /sidebarLabel:\s*"File filters"/, "Files descriptor should label the slide-out drawer");
assert.match(frameworkSurfaceSource, /sidebarPanels:[\s\S]*id:\s*"files-browse-filters"[\s\S]*behavior:\s*"files\.browse\.filters"[\s\S]*open:\s*true/, "Files descriptor should mount filters in the drawer");
assert.match(frameworkSurfaceSource, /detail:[\s\S]*id:\s*"files-browse-results"[\s\S]*behavior:\s*"files\.browse\.results"/, "Files descriptor should mount browse results in the slide-out main region");
assert.match(frameworkSurfaceSource, /route:\s*"\/api\/files\/attachments"/, "Files descriptor should preserve the service-owned attachments read route");

assert.match(filesScript, /view\.registerBehavior\("files\.browse\.filters"/, "Files adapter should register the filter behavior");
assert.match(filesScript, /view\.registerBehavior\("files\.browse\.results"/, "Files adapter should register the results behavior");
assert.match(filesScript, /view\.renderSurface\(\{ \.\.\.activeFilesViewDescriptor, dataSource: null, modals: \[\] \}, host\)/, "Files adapter should render the descriptor shell without renderer-owned data fetching");
assert.match(filesScript, /fallbackFilesViewSurfaceDescriptor/, "Files adapter should keep a fallback descriptor for early bootstrap timing");

const filterChrome = functionBlock(filesScript, "createFilesFilterChrome");
assert.match(filterChrome, /createFilterLabel\("Filename"[\s\S]*createFilterLabel\("Status"[\s\S]*createBusinessFilterLabel\("Client", createClientSelect\(\)\)[\s\S]*createFilterLabel\("Project", createProjectSelect\(\)\)[\s\S]*createAdvancedTargetFilters\(\)/, "Files filters should expose readable filename/status/client/project controls before advanced target filters");
assert.doesNotMatch(filterChrome, /Client ID|Project ID|Target ID/, "Normal Files filters should not expose raw ID labels");

const advancedFilters = functionBlock(filesScript, "createAdvancedTargetFilters");
assert.match(advancedFilters, /summary\.textContent = "Advanced target filters"/, "Raw target filters should live behind an explicit advanced disclosure");
assert.match(advancedFilters, /"Module"[\s\S]*"fileFilterModule"[\s\S]*"Target Type"[\s\S]*"fileFilterTargetType"[\s\S]*"Target ID"[\s\S]*"fileFilterTargetId"[\s\S]*"Project ID"[\s\S]*"fileFilterProjectId"/, "Advanced target filters should preserve module, target type, target ID, and raw project ID meanings");

assert.match(filesScript, /api\.getJson\("\/api\/client-projects", \{ cache: "no-store" \}\)/, "Files filters should reuse the existing client/project option provider");
assert.match(filesScript, /window\.LongtailForge\.clientProjectOptions\?\.normalizeClients\?/, "Files filters should reuse shared client/project option normalization");
assert.match(filesScript, /createOption\("", "All clients"\)/, "Client filter should use readable select options");
assert.match(filesScript, /createOption\("", "All projects"\)/, "Project filter should use readable select options");
assert.match(filesScript, /clientId:\s*usesBusinessScope\(\) \? clientFilter\?\.value : ""/, "Client filter values should only be submitted in Business workspaces");
assert.match(filesScript, /clientFilter\.disabled = !usesBusinessScope\(\)/, "Non-Business workspaces should not submit the disabled Client filter");
assert.match(filesScript, /element\.hidden = !usesBusinessScope\(\)/, "Non-Business workspaces should hide Client filter controls");
assert.match(filesScript, /projectId:\s*projectFilter\?\.value \|\| advancedProjectFilter\?\.value/, "Project filter semantics should support readable options plus explicit advanced IDs");

const bindFilesEvents = functionBlock(filesScript, "bindFilesEvents");
assert.match(bindFilesEvents, /filterForm\?\.addEventListener\("submit"[\s\S]*loadFiles\(\)/, "Apply should refetch Files through the browse loader");
assert.match(bindFilesEvents, /clientFilter\?\.addEventListener\("change"[\s\S]*populateProjectFilter\(\)[\s\S]*loadFiles\(\)/, "Client changes should refresh project options and refetch Files");
assert.match(bindFilesEvents, /moduleFilter[\s\S]*targetTypeFilter[\s\S]*targetIdFilter[\s\S]*projectFilter[\s\S]*advancedProjectFilter[\s\S]*filenameFilter[\s\S]*statusFilter[\s\S]*addEventListener\("change"[\s\S]*loadFiles\(\)/, "Filter value changes should refetch Files through the Files route");
assert.match(filesScript, /api\.getJson\(`\/api\/files\/attachments\?\$\{readFilters\(\)\.toString\(\)\}`/, "Files browse loader should refetch through the Files attachments route");

const fileRow = functionBlock(filesScript, "fileRow");
assert.match(fileRow, /clientId:[\s\S]*projectId:/, "Files may keep raw context IDs internally for the modal shell");
assert.doesNotMatch(fileRow, /clientLabel:\s*[^,\n]*(clientId|client_id)|projectLabel:\s*[^,\n]*(projectId|project_id)/, "Normal Files visible labels should not fall back to raw client/project IDs");
assert.match(filesScript, /function formatTargetDisplay\(targetType, targetLabel\)/, "Files rows should format target context without normal raw ID fallback");

assert.match(styles, /\.view-slideout-sidebar-drawer \.file-filters,[\s\S]*\.files-advanced-filter-fields\s*\{[\s\S]*grid-template-columns:\s*1fr/, "Files filters should collapse to a stable one-column drawer layout");
assert.match(styles, /\.files-advanced-filters summary\s*\{[\s\S]*cursor:\s*pointer/, "Advanced filters should have a usable disclosure affordance");

assert.match(rendererShellRegression, /Trigger click should open the slide-out drawer/, "Shared renderer regression should cover slide-out trigger open behavior");
assert.match(rendererShellRegression, /Backdrop click should close the drawer/, "Shared renderer regression should cover slide-out backdrop close behavior");
assert.match(rendererShellRegression, /Escape should close the drawer/, "Shared renderer regression should cover slide-out Escape close behavior");
assert.match(regressionSuite, /scripts\/files-filter-sidebar-regression\.mjs/, "Regression suite should include the Files filter sidebar regression");

console.log("Files filter sidebar regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function functionBlock(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.slice(start + 1).search(/\n(?:async\s+)?function\s+/);
  return source.slice(start, nextFunction === -1 ? source.length : start + 1 + nextFunction);
}

function assertNoProtectedAnatomy(html, label) {
  const body = html.slice(html.indexOf("<body"), html.indexOf("</body>"));

  assert.doesNotMatch(body, /<(section|form|table|dialog|details|button|h1|h2|ul|ol)\b/i, `${label} should not ship framework-owned protected view anatomy`);
  assert.doesNotMatch(body, /\b(data-file-filters|data-file-list|data-file-status|files-table)\b/, `${label} should not ship Files browse hooks outside the descriptor host`);
}
