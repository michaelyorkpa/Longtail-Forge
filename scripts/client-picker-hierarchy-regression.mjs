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
    { id: "beta", name: "Beta Client", projects: [] },
    { id: "alpha", name: "Alpha Client", projects: [] },
    { id: "alpha-grandchild", name: "Alpha Grandchild", parent_client_id: "alpha-child", projects: [] },
  ],
  workspaceProjects: [
    { id: "workspace-z", name: "Zulu Workspace Project" },
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
  plain(clients[0].projects.map((project) => project.name)),
  ["Alpha Workspace Project", "Zulu Workspace Project"],
  "Workspace projects should be alphabetized inside the workspace option.",
);

await assertPageLoadsHelperBeforeScript("views/protected/time-tracker.html", "js/stop-watch.js");
await assertPageLoadsHelperBeforeScript("views/protected/workbench.html", "js/workbench.js");
await assertPageLoadsHelperBeforeScript("views/protected/time-entries.html", "js/time-entries.js");

await assertSourceUsesSharedHelper("public/js/stop-watch.js");
await assertSourceUsesSharedHelper("public/js/workbench.js");
await assertSourceUsesSharedHelper("public/js/time-entry-dialog.js");
await assertSourceUsesSharedHelper("public/js/time-entries.js");

console.log("Client picker hierarchy regression passed.");

async function assertPageLoadsHelperBeforeScript(pagePath, scriptPath) {
  const html = await fs.readFile(new URL(pagePath, root), "utf8");
  const helperIndex = html.indexOf("js/shared/client-project-options.js?v=1");
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

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}
