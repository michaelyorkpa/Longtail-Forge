import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.18.13.3";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const clientsHtml = readText("views/protected/clients.html");
const projectsHtml = readText("views/protected/projects.html");
const clientsProjectsScript = readText("public/js/clients-projects.js");
const clientProjectsModule = readText("src/modules/client-projects/module.js");
const clientsRoutes = readText("src/modules/client-projects/clients.routes.js");
const projectsRoutes = readText("src/modules/client-projects/projects.routes.js");
const clientsService = readText("src/modules/client-projects/clients.service.js");
const manifestContract = readText("src/core/modules/manifest-contract.js");
const viewBuilder = readText("public/js/shared/view-builder.js");
const viewRenderer = readText("public/js/shared/view-renderer.js");
const css = readText("public/css/longtail-forge.css");
const inventoryDoc = readText("docs/clients-projects-strict-guardrail-inventory.md");
const declarativeGuide = readText("docs/declarative-view-surfaces.md");
const viewContract = readText("docs/view-building-contract.md");
const moduleContract = readText("docs/module-contract.md");
const surfaceContract = readText("docs/ui-surface-contract.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the Clients/Projects readiness version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the Clients/Projects readiness version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Clients/Projects readiness version");

assert.match(inventoryDoc, /Current as of 0\.33\.5\.18\.13\.3/, "Clients/Projects inventory should report this slice");
assert.match(inventoryDoc, /reporting-only[\s\S]*not strict declarative surfaces yet/, "Inventory should keep Clients/Projects guardrails reporting-only");
assert.match(inventoryDoc, /Framework-Owned Guardrail Candidates[\s\S]*page-header\/status shells[\s\S]*Filter panels[\s\S]*Hierarchy index\/list shells[\s\S]*Related table\/list shells[\s\S]*Bulk-toolbar shell[\s\S]*Empty\/loading\/error\/status shells/, "Inventory should map future framework-owned anatomy");
assert.match(inventoryDoc, /Allowed Clients\/Projects Escape Hatches[\s\S]*\/api\/clients[\s\S]*\/api\/projects[\s\S]*\/api\/client-projects[\s\S]*hierarchy rules[\s\S]*Billing metadata\/default editors[\s\S]*Tag assignment[\s\S]*Query-param openers[\s\S]*Business-only Client availability[\s\S]*Save payload construction/, "Inventory should map Clients/Projects-owned escape hatches");
assert.match(inventoryDoc, /0\.33\.5\.18\.13\.3 Framework-Rendered Read Anatomy[\s\S]*page headers[\s\S]*filters[\s\S]*row action placement[\s\S]*query-param openers/, "Inventory should document the framework-rendered read anatomy boundary");
assert.match(inventoryDoc, /14\.1 remains responsible for deeper action registration cleanup/, "Inventory should keep full action cleanup out of scope");

assert.match(manifestContract, /VIEW_INDEX_PANEL_FIELDS[\s\S]*itemDepthField[\s\S]*itemParentField[\s\S]*itemPathField/, "Manifest validation should allow display-only hierarchy metadata on index panels");
assert.match(manifestContract, /VIEW_TABLE_FIELDS[\s\S]*hierarchy/, "Manifest validation should allow table hierarchy metadata");
assert.match(manifestContract, /VIEW_TABLE_COLUMN_FORMATTERS = new Set\(\["text", "hierarchy-label", "chip-list"\]\)/, "Manifest validation should keep table formatters narrow");
assert.match(manifestContract, /formatter must be text, hierarchy-label, or chip-list/, "Manifest validation should reject unknown table formatters");

assert.match(viewBuilder, /function hierarchyMetadata[\s\S]*viewHierarchyDepth[\s\S]*viewHierarchyParent[\s\S]*viewHierarchyPath/, "View builder should carry display-only hierarchy metadata");
assert.match(viewBuilder, /view-index-list-item--hierarchy/, "Index primitive should expose hierarchy display styling");
assert.match(viewBuilder, /view-data-table-row--hierarchy/, "Data-table primitive should expose hierarchy row metadata");
assert.match(viewRenderer, /mountType: "fieldOptions"[\s\S]*optionsSource/, "Renderer should mount option-source hydration for select filters");
assert.match(viewRenderer, /setOptions: \(options\) => setSelectOptions/, "Renderer should expose setOptions to module-owned option behaviors");
assert.match(viewRenderer, /function renderHierarchyLabel[\s\S]*view-hierarchy-label/, "Renderer should expose the hierarchy-label display hook");
assert.match(viewRenderer, /function renderChipList[\s\S]*view-table-chip-list/, "Renderer should expose the chip-list display hook");
assert.match(viewRenderer, /function tableColumns[\s\S]*table\.rowActions[\s\S]*renderActions\(rowActions, view, "Row actions", state, record\)/, "Renderer should place descriptor table row actions in a framework-owned action column");
assert.match(css, /\.view-index-list-item--hierarchy/, "CSS should style hierarchy-aware index rows");
assert.match(css, /\.view-data-table \.view-hierarchy-label/, "CSS should style table hierarchy labels");
assert.match(css, /\.view-table-chip-list/, "CSS should style table chip-list cells");

assert.match(clientProjectsModule, /viewSurfaces:\s*\[[\s\S]*id:\s*"client-projects\.clients"[\s\S]*id:\s*"client-projects\.projects"/, "Clients/Projects should declare separate page descriptors");
assert.match(clientProjectsModule, /route:\s*"\/api\/clients\?include_depth=true"[\s\S]*route:\s*"\/api\/projects\?include_depth=true"/, "Clients/Projects descriptors should bind to canonical list routes");
assert.match(clientsHtml, /<main class="wide-page client-projects-page clients-page" data-client-projects-host><\/main>/, "Clients host should be a minimal descriptor host");
assert.match(projectsHtml, /<main class="wide-page client-projects-page projects-page" data-client-projects-host><\/main>/, "Projects host should be a minimal descriptor host");
assert.match(clientsHtml, /view-builder\.js\?v=4[\s\S]*view-renderer\.js\?v=13[\s\S]*clients-projects\.js\?v=13/, "Clients host should load builder, renderer, then adapter");
assert.match(projectsHtml, /view-builder\.js\?v=4[\s\S]*view-renderer\.js\?v=13[\s\S]*clients-projects\.js\?v=13/, "Projects host should load builder, renderer, then adapter");

assert.doesNotMatch(clientsProjectsScript, /function ensureClientProjectsPageHost\(\)/, "Clients/Projects adapter should not bridge page/filter/status/list anatomy after 13.3");
assert.match(clientsProjectsScript, /function renderClientProjectsReadSurface\(\)[\s\S]*view\.renderSurface\(activeClientProjectsReadDescriptor, host\)/, "Clients/Projects read anatomy should mount through the shared renderer");
assert.match(clientsProjectsScript, /view\.registerBehavior\("client-projects\.clients\.create"[\s\S]*view\.registerBehavior\("client-projects\.projects\.edit"/, "Page Add/Edit actions should be registered behavior handlers");
assert.match(clientsProjectsScript, /function createProjectInlineBulkControls\(\)/, "Project bulk behavior should remain module-owned until the bulk-control slice");
assert.match(clientsProjectsScript, /function createClientInlineBulkControls\(\)/, "Client bulk behavior should remain module-owned until the bulk-control slice");
assert.match(clientsProjectsScript, /function openAddClientModalFromQuery\(\)[\s\S]*params\.get\("addClient"\) !== "true"/, "Client query-param opener should remain module-owned");
assert.match(clientsProjectsScript, /function openAddProjectModalFromQuery\(\)[\s\S]*params\.get\("addProject"\) !== "true"/, "Project query-param opener should remain module-owned");
assert.match(clientsProjectsScript, /function openClientDetailModalFromQuery\(\)[\s\S]*openClientDetailDialog\(client\)/, "Client query-param detail opener should remain module-owned");
assert.match(clientsProjectsScript, /function openProjectDetailModalFromQuery\(\)[\s\S]*openProjectDetailDialog\(match\.client, match\.project\)/, "Project query-param detail opener should remain module-owned");
assert.match(clientsProjectsScript, /\/api\/client-projects/, "Existing option workflows should keep using /api/client-projects");
assert.match(clientsProjectsScript, /\/api\/clients/, "Existing Client route calls should remain in the module adapter");
assert.match(clientsProjectsScript, /\/api\/projects/, "Existing Project route calls should remain in the module adapter");

assert.match(clientsRoutes, /clientsRoutes\.get\("\/clients"/, "Clients route should keep the canonical /api/clients read path");
assert.match(clientsRoutes, /clientsRoutes\.get\("\/projects"/, "Projects route should keep the canonical /api/projects read path");
assert.match(projectsRoutes, /clientsRoutes as projectsRoutes/, "Projects route module should remain an alias of the shared Clients/Projects route set");
assert.match(clientsRoutes, /clientsRoutes\.get\("\/client-projects"/, "Shared option route should keep the canonical /api/client-projects read path");
assert.match(clientsService, /async function listClients[\s\S]*assertBusinessWorkspace[\s\S]*filterReadableClients/, "Clients service should keep Business workspace and permission-owned Client reads");
assert.match(clientsService, /async function listProjects[\s\S]*filterReadableProjects/, "Projects service should keep service-owned Project reads");

assert.match(declarativeGuide, /0\.33\.5\.18\.13\.3[\s\S]*client-projects\.clients[\s\S]*client-projects\.projects[\s\S]*framework-rendered read anatomy[\s\S]*reporting-only/, "Declarative guide should document the Clients/Projects framework-rendered read boundary");
assert.match(viewContract, /Implementation Notes For 0\.33\.5\.18\.13\.3[\s\S]*Clients\/Projects framework-rendered read anatomy/, "View-building contract should document the read anatomy boundary");
assert.match(moduleContract, /As of 0\.33\.5\.18\.13\.1[\s\S]*optionsSource[\s\S]*depth\/parent\/path[\s\S]*hierarchy-label[\s\S]*chip-list/, "Module contract should document the new descriptor fields");
assert.match(moduleContract, /As of 0\.33\.5\.18\.13\.3[\s\S]*Clients\/Projects read pages[\s\S]*registered behavior handlers/, "Module contract should document the read-action handoff");
assert.match(surfaceContract, /As of 0\.33\.5\.18\.13\.3[\s\S]*table row actions[\s\S]*framework-owned action column/, "Surface contract should document the UI ownership boundary");
assert.match(roadmap, /Completed 0\.33\.5\.18\.13\.1 through 0\.33\.5\.18\.13\.3 are archived/, "Roadmap should point completed Clients/Projects slices to the archive");
assert.match(changelog, /Version 0\.33\.5\.18\.13\.3[\s\S]*framework-rendered read anatomy[\s\S]*clients-projects-read-descriptor-host-regression\.mjs/, "Changelog should record the completed 0.33.5.18.13.3 slice");
assert.match(regressionSuite, /scripts\/clients-projects-strict-guardrail-inventory-regression\.mjs/, "Regression suite should include the Clients/Projects readiness regression");

console.log("Clients/Projects descriptor readiness and guardrail inventory regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
