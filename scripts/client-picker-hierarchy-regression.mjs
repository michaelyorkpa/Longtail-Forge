import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

const root = new URL("../", import.meta.url);

const helperSource = await fs.readFile(new URL("public/js/shared/client-project-options.js", root), "utf8");
const context = {
  window: {
    LongtailForge: {
      getWorkspaceProjectsLabel: () => "York-Lasher Family",
    },
  },
};
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(helperSource, context);

const clients = context.window.LongtailForge.clientProjectOptions.normalizeClients({
  clients: [
    { id: "zeta", name: "Zeta Client", projects: [] },
    { id: "beta-child", name: "Beta Child", parent_client_id: "beta", projects: [] },
    { id: "alpha-child", name: "Alpha Child", parent_client_id: "alpha", projects: [] },
    {
      id: "beta",
      name: "Beta Client",
      projects: [
        { id: "beta-project-child", name: "Beta Project Child", parent_project_id: "beta-project" },
        { id: "beta-project", name: "Beta Project" },
        { id: "beta-project-z", name: "Beta Project Z" },
      ],
    },
    { id: "alpha", name: "Alpha Client", projects: [] },
    { id: "alpha-grandchild", name: "Alpha Grandchild", parent_client_id: "alpha-child", projects: [] },
  ],
  workspaceProjects: [
    { id: "workspace-z", name: "Zulu Workspace Project" },
    { id: "workspace-child", name: "Workspace Child Project", parent_project_id: "workspace-a" },
    { id: "workspace-a", name: "Alpha Workspace Project" },
  ],
});

assert.deepEqual(
  plain(clients.map((client) => client.id)),
  [
    "__workspace_projects__",
    "alpha",
    "alpha-child",
    "alpha-grandchild",
    "beta",
    "beta-child",
    "zeta",
  ],
  "Client options should put workspace projects first, then top-level clients with nested children.",
);
assert.deepEqual(
  plain(clients.map((client) => client.optionLabel)),
  [
    "York-Lasher Family",
    "Alpha Client",
    "  - Alpha Child",
    "    - Alpha Grandchild",
    "Beta Client",
    "  - Beta Child",
    "Zeta Client",
  ],
  "Child client labels should be indented and prefixed with '-'.",
);
assert.deepEqual(
  plain(clients[0].projects.map((project) => project.optionLabel)),
  ["Alpha Workspace Project", "  - Workspace Child Project", "Zulu Workspace Project"],
  "Workspace projects should keep parent-before-child hierarchy inside the workspace option.",
);
assert.deepEqual(
  plain(clients.find((client) => client.id === "beta").projects.map((project) => project.optionLabel)),
  ["Beta Project", "  - Beta Project Child", "Beta Project Z"],
  "Client projects should keep parent-before-child hierarchy inside the client option.",
);

for (const [workspaceType, workspaceLabel] of [
  ["Business", "Acme Business"],
  ["Personal", "Morgan Personal"],
  ["Family", "York-Lasher Family"],
]) {
  context.window.LongtailForge.getWorkspaceProjectsLabel = () => workspaceLabel;
  const workspaceClients = context.window.LongtailForge.clientProjectOptions.normalizeClients({
    clients: [],
    workspaceProjects: [
      { id: `${workspaceType}-child`, name: "Child Project", parent_project_id: `${workspaceType}-parent` },
      { id: `${workspaceType}-parent`, name: "Parent Project" },
      { id: `${workspaceType}-zulu`, name: "Zulu Project" },
    ],
  });

  assert.equal(workspaceClients[0].optionLabel, workspaceLabel, `${workspaceType} Timer scope should use the readable workspace label.`);
  assert.deepEqual(
    plain(workspaceClients[0].projects.map((project) => project.optionLabel)),
    ["Parent Project", "  - Child Project", "Zulu Project"],
    `${workspaceType} Timer projects should retain canonical parent-before-child ordering and labels.`,
  );
}

await assertPageLoadsHelperBeforeScript("views/protected/time-tracker.html", "js/stop-watch.js");
await assertPageLoadsHelperBeforeScript("views/protected/workbench.html", "js/workbench.js");
await assertPageLoadsHelperBeforeScript("views/protected/time-entries.html", "js/time-entries.js");

await assertSourceUsesSharedHelper("public/js/stop-watch.js");
await assertSourceUsesSharedHelper("public/js/workbench.js");
await assertSourceUsesSharedHelper("public/js/time-entry-dialog.js");
await assertSourceUsesSharedHelper("public/js/time-entries.js");
await assertTimerUsesSharedProjectOptions("public/js/stop-watch.js");
await assertTimerUsesSharedProjectOptions("public/js/time-tracking-timer-dialog.js");

console.log("Client picker hierarchy regression passed.");

async function assertPageLoadsHelperBeforeScript(pagePath, scriptPath) {
  const html = await fs.readFile(new URL(pagePath, root), "utf8");
  const helperIndex = html.indexOf("js/shared/client-project-options.js");
  const scriptIndex = html.indexOf(scriptPath);

  assert.ok(helperIndex >= 0, `${pagePath} should load the shared client-project options helper.`);
  assert.ok(scriptIndex >= 0, `${pagePath} should load ${scriptPath}.`);
  assert.ok(helperIndex < scriptIndex, `${pagePath} should load the shared helper before ${scriptPath}.`);
}

async function assertSourceUsesSharedHelper(sourcePath) {
  const source = await fs.readFile(new URL(sourcePath, root), "utf8");

  assert.match(
    source,
    /clientProjectOptions\.normalizeClients/,
    `${sourcePath} should normalize clients through the shared hierarchy helper.`,
  );
}

async function assertTimerUsesSharedProjectOptions(sourcePath) {
  const source = await fs.readFile(new URL(sourcePath, root), "utf8");

  assert.match(
    source,
    /projects\.forEach\(\(project\) => \{[\s\S]*createOption\(project\.id, projectOptionLabel\(project\)\)/,
    `${sourcePath} should render the shared project hierarchy in its supplied order and with its supplied labels.`,
  );
  assert.match(
    source,
    /function projectOptionLabel\(project\) \{[\s\S]*clientProjectOptions\.optionLabel\(project\)/,
    `${sourcePath} should read project labels through the shared Clients/Projects option contract.`,
  );
  assert.doesNotMatch(
    source,
    /sortByName\(projects\)|sortByName\(client\.projects\)/,
    `${sourcePath} must not flatten the shared project hierarchy with a second alphabetical sort.`,
  );
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}
