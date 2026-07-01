import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.20.1";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const clientProjectsModule = readText("src/modules/client-projects/module.js");
const clientsService = readText("src/modules/client-projects/clients.service.js");
const planner = readText("src/modules/client-projects/project-update-planner.js");
const clientsProjectsScript = readText("public/js/clients-projects.js");
const viewRenderer = readText("public/js/shared/view-renderer.js");
const canonicalRegression = readText("scripts/client-projects-canonical-payload-regression.mjs");
const projectMoveRegression = readText("scripts/project-hierarchy-move-regression.mjs");
const inventoryDoc = readText("docs/clients-projects-strict-guardrail-inventory.md");
const declarativeGuide = readText("docs/declarative-view-surfaces.md");
const viewContract = readText("docs/view-building-contract.md");
const moduleContract = readText("docs/module-contract.md");
const surfaceContract = readText("docs/ui-surface-contract.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the hierarchy/reparent slice version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the hierarchy/reparent slice version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the hierarchy/reparent slice version");

assert.match(
  clientProjectsModule,
  new RegExp(`version:\\s*"${escapeRegExp(appVersion)}"`),
  "Clients/Projects module should report the current app version",
);
assert.match(
  clientProjectsModule,
  /id:\s*"client-projects\.projects"[\s\S]*behavior:\s*"client-projects\.projects\.edit"[\s\S]*route:\s*"\/api\/projects\?include_depth=true"/,
  "Projects descriptor should keep edit/reparent entry points as registered behavior on the canonical Projects read route",
);
assert.match(
  clientProjectsModule,
  /id:\s*"client-projects\.clients"[\s\S]*behavior:\s*"client-projects\.clients\.edit"[\s\S]*route:\s*"\/api\/clients\?include_depth=true"/,
  "Clients descriptor should keep client parent edits behind the registered Client editor behavior",
);

assert.match(
  clientsService,
  /function buildProjectReadShape\(projects, clients, options = \{\}\)[\s\S]*projectReadGroups\(projects, clients\)[\s\S]*flatMap\(\(groupProjects\) => sortProjectHierarchy\(groupProjects\)\)[\s\S]*decorateProjectShape/,
  "Projects read shaping should group first, then apply parent-before-child Project hierarchy ordering per group",
);
assert.match(
  clientsService,
  /function projectReadGroups\(projects, clients\)[\s\S]*const workspaceProjects = \[\][\s\S]*const orderedClients = sortHierarchy\(clients, \{[\s\S]*parentField: "parent_client_id"[\s\S]*if \(workspaceProjects\.length > 0\) \{[\s\S]*groups\.push\(workspaceProjects\);[\s\S]*orderedClients\.forEach/,
  "Projects read grouping should put workspace Projects first, then Client-backed groups in readable Client hierarchy order",
);
assert.match(
  clientsService,
  /function sortProjectHierarchy\(projects\)[\s\S]*parentField: "parent_project_id"/,
  "Project read ordering should reuse the service-owned parent Project hierarchy sorter",
);
assert.match(
  clientsService,
  /async function listProjects\(session, query = \{\}\)[\s\S]*filterReadableProjects\(session, projects\)[\s\S]*const orderingClients = clients\.filter[\s\S]*return \{ projects: buildProjectReadShape\(decoratedProjects, orderingClients, shapeOptions\) \};/,
  "Canonical /api/projects reads should remain service-owned after permission and filter pruning",
);

assert.match(
  clientsProjectsScript,
  /function renderClientProjectsReadSurface\(\)[\s\S]*view\.renderSurface\(activeClientProjectsReadDescriptor, host\)/,
  "Converted Clients/Projects pages should mount descriptor reads through the shared renderer",
);
assert.match(
  clientsProjectsScript,
  /function openEditProjectAction\(params = \{\}, hostContext = null\)[\s\S]*return openProjectDetailDialog\(match\.client, match\.project, \{ hostContext \}\);/,
  "Project descriptor edit behavior should open the existing Project editor",
);
assert.match(
  clientsProjectsScript,
  /function openEditClientAction\(params = \{\}, hostContext = null\)[\s\S]*return openClientDetailDialog\(client, \{ hostContext \}\);/,
  "Client descriptor edit behavior should open the existing Client editor",
);
assert.match(
  clientsProjectsScript,
  /function createProjectEditor\(client, project, options = \{\}\)[\s\S]*project\.parent_project_id = parentProjectSelect\.value;[\s\S]*confirmLabel: "Move"[\s\S]*saveProjectRecord\(project,[\s\S]*confirm_downstream_update: true/,
  "Project reparenting should still use the existing editor, move confirmation, and validated save payload",
);
assert.match(
  clientsProjectsScript,
  /function populateParentProjectSelect\(select, \{ excludedProjectId = "", clientId = "" \} = \{\}\)[\s\S]*getProjectDescendantIds\(excludedProjectId, targetClient\)[\s\S]*sortProjectsForClient\(targetClient\)/,
  "Project parent options should keep readable same-scope options and exclude descendants in the module adapter",
);
assert.match(
  clientsProjectsScript,
  /function populateParentClientSelect\(select, excludedClientId = ""\)[\s\S]*getClientDescendantIds\(excludedClientId\)[\s\S]*sortClientTree\(getRealClients\(\)\)/,
  "Client parent options should stay module-owned and exclude descendant Client choices",
);
assert.doesNotMatch(
  `${clientsProjectsScript}\n${viewRenderer}`,
  /dragstart|draggable|dataTransfer|addEventListener\("drop"/,
  "Clients/Projects hierarchy editing should not add drag/drop behavior in the adapter or renderer",
);

assert.match(
  planner,
  /if \(normalizedParentId === normalizedProjectId\)[\s\S]*own parent[\s\S]*if \(isArchivedProject\(parentProject\)\)[\s\S]*Archived projects cannot be used as parent projects/,
  "Project update planner should reject self-parenting and archived parent Projects",
);
assert.match(
  planner,
  /if \(\(parentProject\.client_id \|\| ""\) !== normalizedClientId\)[\s\S]*same client or workspace project scope/,
  "Project update planner should enforce same Client or workspace Project scope",
);
assert.match(
  planner,
  /const descendants = collectDescendantIds\(projects, normalizedProjectId\);[\s\S]*descendants\.has\(normalizedParentId\)[\s\S]*descendants/,
  "Project update planner should reject nesting a Project below its own descendant",
);
assert.match(
  planner,
  /const targetClient = await readClientScope\(workspaceId, targetClientId,[\s\S]*Projects cannot be moved into archived clients/,
  "Project move planning should reject archived Client targets through the service planner path",
);

assert.match(
  canonicalRegression,
  /\[\s*"Workspace Parent Project",[\s\S]*"Workspace Child Project",[\s\S]*"Alpha Parent Project",[\s\S]*"Alpha Child Project",[\s\S]*"Alpha Child Client Project",[\s\S]*"Beta Project"[\s\S]*workspace project filter should keep service-owned parent-before-child order/,
  "Canonical payload regression should prove workspace-first and Client hierarchy grouped Project ordering",
);
assert.match(
  projectMoveRegression,
  /Project save payload must promote confirmed hierarchy moves[\s\S]*Project update planner must treat parent project changes as hierarchy moves/,
  "Existing Project hierarchy move regression should continue guarding confirmed reparent payloads",
);

assert.match(
  inventoryDoc,
  /Current as of 0\.33\.5\.18\.15[\s\S]*0\.33\.5\.18\.14\.4 Hierarchy Ordering and Reparent Safety[\s\S]*service-owned Projects read ordering[\s\S]*existing Client\/Project editors/,
  "Clients/Projects inventory should document the hierarchy ordering and reparent safety boundary",
);
assert.match(
  declarativeGuide,
  /0\.33\.5\.18\.14\.4[\s\S]*\/api\/projects[\s\S]*service-owned workspace-first[\s\S]*registered edit behaviors/,
  "Declarative guide should document the service-owned ordering and registered editor handoff",
);
assert.match(
  viewContract,
  /Implementation Notes For 0\.33\.5\.18\.14\.4[\s\S]*workspace-level Projects first[\s\S]*Client hierarchy groups[\s\S]*existing editors/,
  "View-building contract should document the 14.4 hierarchy/reparent split",
);
assert.match(
  moduleContract,
  /As of 0\.33\.5\.18\.14\.4[\s\S]*Projects canonical read ordering[\s\S]*Clients\/Projects services[\s\S]*renderer must not own/,
  "Module contract should record that canonical hierarchy ordering belongs to Clients/Projects services",
);
assert.match(
  surfaceContract,
  /As of 0\.33\.5\.18\.14\.4[\s\S]*Projects read surface[\s\S]*service-owned ordering[\s\S]*No drag\/drop/,
  "Surface contract should record the converted UI hierarchy boundary",
);
assert.match(
  roadmap,
  /Completed 0\.33\.5\.18\.14\.4 is archived/,
  "Roadmap should move the completed hierarchy/reparent slice to the archive pointer",
);
assert.doesNotMatch(
  roadmap,
  /### Version 0\.33\.5\.18\.14\.4/,
  "Active roadmap should no longer contain the completed hierarchy/reparent slice body",
);
assert.match(
  changelog,
  /Version 0\.33\.5\.18\.14\.4[\s\S]*service-owned hierarchy ordering[\s\S]*clients-projects-hierarchy-reparent-regression\.mjs/,
  "Changelog should record the completed hierarchy/reparent slice and focused regression",
);
assert.match(
  regressionSuite,
  /scripts\/clients-projects-hierarchy-reparent-regression\.mjs/,
  "Regression suite should include the hierarchy/reparent guardrail regression",
);

console.log("Clients/Projects hierarchy reparent regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
