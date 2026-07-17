import { expect, test } from "@playwright/test";

test("workspace switching follows the safe server-resolved preferred landing page", async ({ page }) => {
  await page.route("**/api/app-shell/bootstrap", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      activeWorkspaceId: "workspace-one",
      enabledModules: [],
      navigation: [],
      notificationSummary: {},
      permissionHints: {},
      quickActions: [],
      searchTargets: [],
      user: { user_id: "user-one", username: "landing@example.test" },
      workspaceContext: { workspaceId: "workspace-one", workspaceName: "Workspace One" },
      workspaces: [
        { workspace_id: "workspace-one", workspaceName: "Workspace One" },
        { workspace_id: "workspace-two", workspaceName: "Workspace Two" },
      ],
    }),
  }));
  await page.route("**/api/session", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      user: {
        active_workspace_id: "workspace-one",
        workspace_id: "workspace-one",
        workspaces: [
          { workspace_id: "workspace-one", workspace_name: "Workspace One", workspace_type: "business" },
          { workspace_id: "workspace-two", workspace_name: "Workspace Two", workspace_type: "personal" },
        ],
      },
    }),
  }));
  await page.route("**/api/session/workspace", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ workspaceId: "workspace-two" });
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ landingPath: "/notes.html" }),
    });
  });
  await page.route("**/notes.html", (route) => route.fulfill({
    contentType: "text/html",
    body: "<!doctype html><title>Workspace landing</title>",
  }));

  await page.goto("/dashboard.html");
  const workspaceSelector = page.locator("[data-workspace-selector]");
  await expect(workspaceSelector).toHaveValue("workspace-one");
  await workspaceSelector.selectOption("workspace-two");
  await expect(page).toHaveURL(/\/notes\.html$/);
});
