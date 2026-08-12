import { readFileSync } from "node:fs";
import vm from "node:vm";
import { beforeEach, describe, expect, it } from "vitest";

const helperSource = readFileSync("public/js/shared/client-project-options.js", "utf8");
let clientProjectOptions;
let sandboxWindow;

beforeEach(() => {
  sandboxWindow = {
    LongtailForge: {
      getWorkspaceProjectsLabel: () => "York-Lasher Family",
    },
  };
  sandboxWindow.window = sandboxWindow;
  const context = vm.createContext({ window: sandboxWindow });
  vm.runInContext(helperSource, context);
  clientProjectOptions = sandboxWindow.LongtailForge.clientProjectOptions;
});

describe("client-project option hierarchy", () => {
  it("sorts clients and projects parent-first with stable readable indentation", () => {
    const clients = clientProjectOptions.normalizeClients({
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

    expect(plain(clients.map((client) => client.id))).toEqual([
      "__workspace_projects__",
      "alpha",
      "alpha-child",
      "alpha-grandchild",
      "beta",
      "beta-child",
      "zeta",
    ]);
    expect(plain(clients.map((client) => client.optionLabel))).toEqual([
      "York-Lasher Family",
      "Alpha Client",
      "  - Alpha Child",
      "    - Alpha Grandchild",
      "Beta Client",
      "  - Beta Child",
      "Zeta Client",
    ]);
    expect(plain(clients[0].projects.map((project) => project.optionLabel))).toEqual([
      "Alpha Workspace Project",
      "  - Workspace Child Project",
      "Zulu Workspace Project",
    ]);
    expect(plain(clients.find((client) => client.id === "beta").projects.map((project) => project.optionLabel))).toEqual([
      "Beta Project",
      "  - Beta Project Child",
      "Beta Project Z",
    ]);
  });

  it.each([
    ["Business", "Acme Business"],
    ["Personal", "Morgan Personal"],
    ["Family", "York-Lasher Family"],
  ])("uses the readable %s workspace label without flattening projects", (_workspaceType, workspaceLabel) => {
    sandboxWindow.LongtailForge.getWorkspaceProjectsLabel = () => workspaceLabel;
    const clients = clientProjectOptions.normalizeClients({
      clients: [],
      workspaceProjects: [
        { id: "workspace-child", name: "Child Project", parent_project_id: "workspace-parent" },
        { id: "workspace-parent", name: "Parent Project" },
        { id: "workspace-zulu", name: "Zulu Project" },
      ],
    });

    expect(clients[0].optionLabel).toBe(workspaceLabel);
    expect(plain(clients[0].projects.map((project) => project.optionLabel))).toEqual([
      "Parent Project",
      "  - Child Project",
      "Zulu Project",
    ]);
  });
});

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}
