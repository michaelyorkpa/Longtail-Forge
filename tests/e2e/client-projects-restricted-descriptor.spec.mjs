import { expect, test } from "@playwright/test";

const pages = [
  { path: "/clients.html", heading: "Clients", unavailableAction: "Add Client" },
  { path: "/projects.html", heading: "Projects", unavailableAction: "Add Project" },
];

test("permission-restricted Clients and Projects descriptors render without unavailable primary actions", async ({ page }) => {
  /** @type {string[]} */
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.route("**/api/client-projects?*", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({
      response,
      json: {
        ...body,
        capabilities: {
          ...body.capabilities,
          can_create_top_level_client: false,
          can_create_workspace_project: false,
          can_manage_workspace_projects: false,
        },
        clients: Array.isArray(body.clients)
          ? body.clients.map((/** @type {Record<string, unknown>} */ client) => ({
            ...client,
            can_create_project: false,
            can_manage_projects: false,
          }))
          : [],
      },
    });
  });

  for (const surface of pages) {
    const response = await page.goto(surface.path);
    if (!response) {
      throw new Error(`page.goto(${surface.path}) returned no response`);
    }
    expect(response.status()).toBe(200);
    await expect(page.locator(".view-page-header").getByRole("heading", { name: surface.heading, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: surface.unavailableAction, exact: true })).toHaveCount(0);
    await expect(page.locator("[data-client-projects-host] table")).toBeVisible();
  }

  expect(pageErrors).toEqual([]);
});

test("super-admin Clients and Projects descriptors retain their primary actions", async ({ page }) => {
  for (const surface of pages) {
    const response = await page.goto(surface.path);
    if (!response) {
      throw new Error(`page.goto(${surface.path}) returned no response`);
    }
    expect(response.status()).toBe(200);
    await expect(page.getByRole("button", { name: surface.unavailableAction, exact: true })).toBeVisible();
  }
});
