import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.19.2";

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

assert.match(inventoryDoc, /Current as of 0\.33\.5\.18\.15/, "Clients/Projects inventory should report the branch closeout state");
assert.match(inventoryDoc, /strict enforcement is active/, "Inventory should mark Clients/Projects guardrails as active");
assert.match(inventoryDoc, /Framework-Owned Guardrail Candidates[\s\S]*page-header\/status shells[\s\S]*Inline top filter panels[\s\S]*Hierarchy index\/list shells[\s\S]*Related table\/list shells[\s\S]*Bulk-toolbar shell[\s\S]*row-selection checkbox shell[\s\S]*Empty\/loading\/error\/status shells/, "Inventory should map framework-owned anatomy");
assert.match(inventoryDoc, /Allowed Clients\/Projects Escape Hatches[\s\S]*\/api\/clients[\s\S]*\/api\/projects[\s\S]*\/api\/client-projects[\s\S]*hierarchy rules[\s\S]*Billing metadata\/default editors[\s\S]*Tag assignment[\s\S]*Query-param openers[\s\S]*Business-only Client availability[\s\S]*Bulk selected-ID collection[\s\S]*Save payload construction/, "Inventory should map Clients/Projects-owned escape hatches");
assert.match(inventoryDoc, /0\.33\.5\.18\.13\.3 Framework-Rendered Read Anatomy[\s\S]*page headers[\s\S]*filter controls[\s\S]*row action placement[\s\S]*query-param openers/, "Inventory should document the framework-rendered read anatomy boundary");
assert.match(inventoryDoc, /0\.33\.5\.18\.14\.1 Action Registration Cleanup[\s\S]*LongtailForge\.moduleActions\.open[\s\S]*LongtailForge\.clientProjectDialog[\s\S]*duplicate page-level Add Client compatibility shell/, "Inventory should document the completed action registration cleanup");
assert.match(inventoryDoc, /0\.33\.5\.18\.14\.2 Related Table and Detail Regions[\s\S]*createDataTable[\s\S]*Project editor's Client and Parent Project context rows[\s\S]*does not add a persistent Inspector-style detail pane/, "Inventory should document the completed related-region cleanup");
assert.match(inventoryDoc, /0\.33\.5\.18\.14\.3 Bulk Controls and Selection Behavior[\s\S]*table `selection` metadata[\s\S]*LongtailForge\.view\.createBulkActionToolbar\(\)[\s\S]*Business workspaces may expose Project Client reassignment/, "Inventory should document the completed bulk-control cleanup");
assert.match(inventoryDoc, /0\.33\.5\.18\.14\.4 Hierarchy Ordering and Reparent Safety[\s\S]*service-owned Projects read ordering[\s\S]*existing Client\/Project editors[\s\S]*does not add drag\/drop hierarchy editing/, "Inventory should document the completed hierarchy/reparent boundary");
assert.match(inventoryDoc, /0\.33\.5\.18\.14\.5 Strict Guardrails and Cleanup[\s\S]*left-side slide-out filter surface[\s\S]*secondary table rows[\s\S]*icon-only edit action[\s\S]*no database schema, route payload, permission, or workflow changes/, "Inventory should document the completed strict cleanup boundary");

assert.match(manifestContract, /VIEW_INDEX_PANEL_FIELDS[\s\S]*itemDepthField[\s\S]*itemParentField[\s\S]*itemPathField/, "Manifest validation should allow display-only hierarchy metadata on index panels");
assert.match(manifestContract, /VIEW_TABLE_FIELDS[\s\S]*hierarchy/, "Manifest validation should allow table hierarchy metadata");
assert.match(manifestContract, /VIEW_FILTER_PLACEMENTS = new Set\(\["inline", "slide-out-sidebar"\]\)/, "Manifest validation should allow table-page filters to move into the shared slide-out surface");
assert.match(manifestContract, /VIEW_TABLE_FIELDS[\s\S]*secondaryRows/, "Manifest validation should allow table secondary rows");
assert.match(manifestContract, /VIEW_TABLE_COLUMN_FORMATTERS = new Set\(\["text", "hierarchy-label", "chip-list"\]\)/, "Manifest validation should keep table formatters narrow");
assert.match(manifestContract, /formatter must be text, hierarchy-label, or chip-list/, "Manifest validation should reject unknown table formatters");
assert.match(manifestContract, /VIEW_ACTION_FIELDS[\s\S]*icon[\s\S]*iconOnly[\s\S]*title/, "Manifest validation should allow descriptor action icon metadata");

assert.match(viewBuilder, /function hierarchyMetadata[\s\S]*viewHierarchyDepth[\s\S]*viewHierarchyParent[\s\S]*viewHierarchyPath/, "View builder should carry display-only hierarchy metadata");
assert.match(viewBuilder, /view-index-list-item--hierarchy/, "Index primitive should expose hierarchy display styling");
assert.match(viewBuilder, /view-data-table-row--hierarchy/, "Data-table primitive should expose hierarchy row metadata");
assert.match(viewBuilder, /function createDataSecondaryRow[\s\S]*view-data-table-secondary-row[\s\S]*normalizedColumnIndex/, "Data-table primitive should support secondary row rendering");
assert.match(viewRenderer, /mountType: "fieldOptions"[\s\S]*optionsSource/, "Renderer should mount option-source hydration for filter fields");
assert.match(viewRenderer, /setOptions: \(options, optionsConfig = \{\}\) => setFieldOptions/, "Renderer should expose setOptions to module-owned option behaviors");
assert.match(viewRenderer, /mountSearchOptions: \(options, optionsConfig = \{\}\) => mountSearchOptions/, "Renderer should expose search suggestion mounting to module-owned option behaviors");
assert.match(viewRenderer, /function renderTablePageSlideOutLayout[\s\S]*Open filters[\s\S]*renderSidebarPanels/, "Renderer should move table-page filters into the shared slide-out surface");
assert.match(viewRenderer, /function renderHierarchyLabel[\s\S]*view-hierarchy-label/, "Renderer should expose the hierarchy-label display hook");
assert.match(viewRenderer, /function renderChipList[\s\S]*view-table-chip-list/, "Renderer should expose the chip-list display hook");
assert.match(viewRenderer, /function tableSecondaryRows[\s\S]*renderTableSecondaryRow/, "Renderer should expose descriptor-driven secondary table rows");
assert.match(viewRenderer, /function normalizeAction[\s\S]*iconOnly[\s\S]*normalized\.text = ""/, "Renderer should preserve icon-only row action metadata");
assert.match(viewRenderer, /function tableColumns[\s\S]*table\.rowActions[\s\S]*renderActions\(rowActions, view, "Row actions", state, record\)/, "Renderer should place descriptor table row actions in a framework-owned action column");
assert.match(css, /\.view-index-list-item--hierarchy/, "CSS should style hierarchy-aware index rows");
assert.match(css, /\.view-data-table \.view-hierarchy-label/, "CSS should style table hierarchy labels");
assert.match(css, /\.view-table-chip-list/, "CSS should style table chip-list cells");
assert.match(css, /\.view-data-table-secondary-row/, "CSS should style secondary table rows");

assert.match(clientProjectsModule, /viewSurfaces:\s*\[[\s\S]*id:\s*"client-projects\.clients"[\s\S]*id:\s*"client-projects\.projects"/, "Clients/Projects should declare separate page descriptors");
assert.match(clientProjectsModule, /route:\s*"\/api\/clients\?include_depth=true"[\s\S]*route:\s*"\/api\/projects\?include_depth=true"/, "Clients/Projects descriptors should bind to canonical list routes");
assert.match(clientProjectsModule, /filterPlacement:\s*"slide-out-sidebar"[\s\S]*id:\s*"client-projects-clients-filters"[\s\S]*secondaryRows:[\s\S]*id:\s*"client-tags"[\s\S]*iconOnly:\s*true/, "Clients descriptor should use drawer filters, secondary tags, and icon-only edit action");
assert.match(clientProjectsModule, /filterPlacement:\s*"slide-out-sidebar"[\s\S]*id:\s*"client-projects-projects-filters"[\s\S]*secondaryRows:[\s\S]*id:\s*"project-tags"[\s\S]*iconOnly:\s*true/, "Projects descriptor should use drawer filters, secondary tags, and icon-only edit action");
assert.match(clientsHtml, /<main class="wide-page client-projects-page clients-page" data-client-projects-host><\/main>/, "Clients host should be a minimal descriptor host");
assert.match(projectsHtml, /<main class="wide-page client-projects-page projects-page" data-client-projects-host><\/main>/, "Projects host should be a minimal descriptor host");
assert.match(clientsHtml, /view-builder\.js\?v=5[\s\S]*view-renderer\.js\?v=16[\s\S]*clients-projects\.js\?v=20/, "Clients host should load builder, renderer, then adapter");
assert.match(projectsHtml, /view-builder\.js\?v=5[\s\S]*view-renderer\.js\?v=16[\s\S]*clients-projects\.js\?v=20/, "Projects host should load builder, renderer, then adapter");

assert.doesNotMatch(clientsProjectsScript, /function ensureClientProjectsPageHost\(\)/, "Clients/Projects adapter should not bridge page/filter/status/list anatomy after 13.3");
assert.doesNotMatch(clientsProjectsScript, /function renderClients\(|function createProjectTable\(|function createClientTable\(|function openProjectBulkEditor\(|data-client-status-filter|data-project-client-filter|list-table-wrap|project-bulk-dialog/, "Clients/Projects adapter should not keep legacy page filter/table/bulk-dialog chrome after strict cleanup");
assert.match(clientsProjectsScript, /function renderClientProjectsReadSurface\(\)[\s\S]*view\.renderSurface\(activeClientProjectsReadDescriptor, host\)/, "Clients/Projects read anatomy should mount through the shared renderer");
assert.match(clientsProjectsScript, /registerClientProjectsModuleActionBehavior\("client-projects\.clients\.create", "clients\.add"\)[\s\S]*registerClientProjectsModuleActionBehavior\("client-projects\.projects\.edit", "projects\.edit"\)/, "Page Add/Edit actions should dispatch through registered module actions");
assert.match(clientsProjectsScript, /function createRelatedProjectsRegion[\s\S]*createCollapsibleIndexPanel[\s\S]*function createRelatedProjectsDataTable[\s\S]*createDataTable/, "Related Project regions should use shared region/table anatomy");
assert.match(clientsProjectsScript, /function createProjectClientContextRegion[\s\S]*createListShell[\s\S]*createDataTable/, "Project Client context rows should use shared list/table anatomy");
assert.match(clientsProjectsScript, /function createProjectBulkToolbar\(\)[\s\S]*createBulkActionToolbar/, "Project bulk chrome should use the shared toolbar shell");
assert.match(clientsProjectsScript, /function createClientBulkToolbar\(\)[\s\S]*createBulkActionToolbar/, "Client bulk chrome should use the shared toolbar shell");
assert.match(clientsProjectsScript, /function createProjectBulkControls\(\)[\s\S]*createBulkClientSelect/, "Project bulk control meaning should remain module-owned");
assert.match(clientsProjectsScript, /function createClientBulkControls\(\)[\s\S]*createBulkBillableSelect/, "Client bulk control meaning should remain module-owned");
assert.match(clientsProjectsScript, /function openAddClientActionFromQuery\(\)[\s\S]*params\.get\("addClient"\) !== "true"[\s\S]*openClientProjectModuleAction\("clients\.add"/, "Client query-param opener should use the registered module action");
assert.match(clientsProjectsScript, /function openAddProjectActionFromQuery\(\)[\s\S]*params\.get\("addProject"\) !== "true"[\s\S]*openClientProjectModuleAction\("projects\.add"/, "Project query-param opener should use the registered module action");
assert.match(clientsProjectsScript, /function openEditClientActionFromQuery\(\)[\s\S]*openClientProjectModuleAction\("clients\.edit"/, "Client query-param detail opener should use the registered module action");
assert.match(clientsProjectsScript, /function openEditProjectActionFromQuery\(\)[\s\S]*openClientProjectModuleAction\("projects\.edit"/, "Project query-param detail opener should use the registered module action");
assert.doesNotMatch(clientsProjectsScript, /function openAddClientModal\(\)/, "Adapter should not keep a duplicate Add Client modal opener after action cleanup");
assert.doesNotMatch(clientsProjectsScript, /window\.LongtailForge\.moduleActions\?\.register/, "Adapter should not duplicate first-party module action registration after action cleanup");
assert.match(clientsProjectsScript, /\/api\/client-projects/, "Existing option workflows should keep using /api/client-projects");
assert.match(clientsProjectsScript, /\/api\/clients/, "Existing Client route calls should remain in the module adapter");
assert.match(clientsProjectsScript, /\/api\/projects/, "Existing Project route calls should remain in the module adapter");

assert.match(clientsRoutes, /clientsRoutes\.get\("\/clients"/, "Clients route should keep the canonical /api/clients read path");
assert.match(clientsRoutes, /clientsRoutes\.get\("\/projects"/, "Projects route should keep the canonical /api/projects read path");
assert.match(projectsRoutes, /clientsRoutes as projectsRoutes/, "Projects route module should remain an alias of the shared Clients/Projects route set");
assert.match(clientsRoutes, /clientsRoutes\.get\("\/client-projects"/, "Shared option route should keep the canonical /api/client-projects read path");
assert.match(clientsService, /async function listClients[\s\S]*assertBusinessWorkspace[\s\S]*filterReadableClients/, "Clients service should keep Business workspace and permission-owned Client reads");
assert.match(clientsService, /async function listProjects[\s\S]*filterReadableProjects/, "Projects service should keep service-owned Project reads");

assert.match(declarativeGuide, /0\.33\.5\.18\.14\.5[\s\S]*client-projects\.clients[\s\S]*client-projects\.projects[\s\S]*strict enforcement is active[\s\S]*slide-out filter surface[\s\S]*secondary tag rows[\s\S]*icon-only repeated edit controls/, "Declarative guide should document the Clients/Projects strict cleanup boundary");
assert.match(inventoryDoc, /searchable tag suggestions[\s\S]*searchable tag suggestion mounting/, "Clients/Projects inventory should document searchable tag filter ownership");
assert.match(viewContract, /Implementation Notes For 0\.33\.5\.18\.13\.3[\s\S]*Clients\/Projects framework-rendered read anatomy/, "View-building contract should document the read anatomy boundary");
assert.match(viewContract, /Implementation Notes For 0\.33\.5\.18\.14\.1[\s\S]*LongtailForge\.moduleActions\.open[\s\S]*LongtailForge\.clientProjectDialog[\s\S]*duplicate page-level Add Client compatibility shell/, "View-building contract should document the action registration boundary");
assert.match(viewContract, /Implementation Notes For 0\.33\.5\.18\.14\.2[\s\S]*createDataTable[\s\S]*Client and Parent Project context rows[\s\S]*does not convert bulk controls/, "View-building contract should document the related-region boundary");
assert.match(viewContract, /Implementation Notes For 0\.33\.5\.18\.14\.3[\s\S]*descriptor table selection metadata[\s\S]*shared bulk toolbar helper[\s\S]*Business workspaces may expose Project Client reassignment/, "View-building contract should document the bulk-control boundary");
assert.match(moduleContract, /As of 0\.33\.5\.18\.13\.1[\s\S]*optionsSource[\s\S]*depth\/parent\/path[\s\S]*hierarchy-label[\s\S]*chip-list/, "Module contract should document the new descriptor fields");
assert.match(moduleContract, /As of 0\.33\.5\.18\.14\.1[\s\S]*Clients\/Projects read pages[\s\S]*LongtailForge\.moduleActions\.open[\s\S]*LongtailForge\.clientProjectDialog/, "Module contract should document the read-action handoff");
assert.match(moduleContract, /As of 0\.33\.5\.18\.14\.2[\s\S]*related read regions[\s\S]*list, data-table, collapsible-region, and dense action-strip helpers/, "Module contract should document the related-region handoff");
assert.match(moduleContract, /As of 0\.33\.5\.18\.14\.3[\s\S]*descriptor table selection[\s\S]*LongtailForge\.view\.createBulkActionToolbar\(\)[\s\S]*Business workspaces only/, "Module contract should document the bulk-control handoff");
assert.match(surfaceContract, /As of 0\.33\.5\.18\.13\.3[\s\S]*table row actions[\s\S]*framework-owned action column/, "Surface contract should document the UI ownership boundary");
assert.match(surfaceContract, /As of 0\.33\.5\.18\.14\.1[\s\S]*shared module-action registry[\s\S]*dialog bodies[\s\S]*payload construction/, "Surface contract should document the action ownership boundary");
assert.match(surfaceContract, /As of 0\.33\.5\.18\.14\.2[\s\S]*related rows[\s\S]*shared list\/table\/action anatomy/, "Surface contract should document the related-region ownership boundary");
assert.match(surfaceContract, /As of 0\.33\.5\.18\.14\.3[\s\S]*descriptor row-selection checkbox anatomy[\s\S]*shared bulk toolbar shell[\s\S]*Business-only Client reassignment visibility/, "Surface contract should document the bulk-control ownership boundary");
assert.match(roadmap, /Completed 0\.33\.5\.18\.13\.1 through 0\.33\.5\.18\.13\.3 are archived/, "Roadmap should point completed Clients/Projects slices to the archive");
assert.match(roadmap, /Completed 0\.33\.5\.18\.14\.1 is archived/, "Roadmap should point the completed action cleanup slice to the archive");
assert.match(roadmap, /Completed 0\.33\.5\.18\.14\.2 is archived/, "Roadmap should point the completed related-region slice to the archive");
assert.match(roadmap, /Completed 0\.33\.5\.18\.14\.3 is archived/, "Roadmap should point the completed bulk-control slice to the archive");
assert.match(roadmap, /Completed 0\.33\.5\.18\.14\.5 is archived/, "Roadmap should point the completed strict cleanup slice to the archive");
assert.match(changelog, /Version 0\.33\.5\.18\.14\.5[\s\S]*slide-out filter surface[\s\S]*secondary tag rows[\s\S]*icon-only repeated edit controls[\s\S]*clients-projects-strict-closeout-regression\.mjs/, "Changelog should record the completed 0.33.5.18.14.5 slice");
assert.match(regressionSuite, /scripts\/clients-projects-strict-guardrail-inventory-regression\.mjs/, "Regression suite should include the Clients/Projects readiness regression");

console.log("Clients/Projects descriptor readiness and guardrail inventory regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
