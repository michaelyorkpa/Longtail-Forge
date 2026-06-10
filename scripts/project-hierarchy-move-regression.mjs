import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const clientsProjects = readText("public/js/clients-projects.js");
const clientProjectsService = readText("src/modules/client-projects/clients.service.js");
const planner = readText("src/modules/client-projects/project-update-planner.js");

assert.match(
  clientsProjects,
  /confirm_downstream_update:\s*action\.confirm_downstream_update === true/,
  "Project save payload must promote confirmed hierarchy moves to top-level confirm_downstream_update",
);
assert.match(
  clientsProjects,
  /const confirmed = await window\.LongtailForge\.modal\.confirm\(\{[\s\S]*confirmLabel: "Move"/,
  "Project hierarchy edits must continue to ask for move confirmation",
);
assert.match(
  clientsProjects,
  /project\.parent_project_id = parentProjectSelect\.value/,
  "Project editor must read the selected parent project before save",
);
assert.match(
  clientsProjects,
  /function sortProjectsForClient\(client\)[\s\S]*appendBranch\(""\)[\s\S]*return sortedProjects;/,
  "Project settings order must render projects with parent-before-child tree traversal",
);
assert.match(
  clientsProjects,
  /function sortProjectRows\(projects\)[\s\S]*const projectOrder = getProjectTreeOrder\(left\.client\)/,
  "Filtered project tables must use the same parent-before-child project order",
);
assert.match(
  clientsProjects,
  /function shouldShowProjectClientLabel\(context,\s*filterValue = ""\)[\s\S]*return selectedFilter === "All";/,
  "Project list labels must hide parenthesized client names when a specific client filter is selected",
);
assert.match(
  clientsProjects,
  /function getClientDescendantIds\(clientId\) \{[\s\S]*if \(!clientId\) \{[\s\S]*return \[\];/,
  "New-client parent selection must not treat blank parent IDs as the root of every top-level client branch",
);
assert.match(
  clientsProjects,
  /const excludedIds = new Set\(excludedClientId[\s\S]*\? \[excludedClientId, \.\.\.getClientDescendantIds\(excludedClientId\)\][\s\S]*: \[\]\);/,
  "Parent client options should exclude descendants only when editing an existing client",
);
assert.match(
  clientsProjects,
  /shouldShowProjectClientLabel\("bulk",\s*clientFilterValue\)/,
  "Project bulk labels must also respect the active client filter",
);
assert.doesNotMatch(
  clientsProjects,
  /getProjectTreeSortKey/,
  "Project hierarchy ordering must not use path-string sorting that separates children from parents",
);
assert.match(
  clientProjectsService,
  /payload\?\.confirm_downstream_update !== true/,
  "Project service must require top-level downstream confirmation for historical record maintenance",
);
assert.match(
  planner,
  /parentMove = \{[\s\S]*isMove: \(previousProject\.parent_project_id \|\| ""\) !== \(targetParentProject\?\.id \|\| ""\)/,
  "Project update planner must treat parent project changes as hierarchy moves",
);

console.log("Project hierarchy move regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
