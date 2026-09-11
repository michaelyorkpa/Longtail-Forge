// Rendered proof for the five `<label hidden>` controls the page-level CSS safeguard covers.
//
// `label { display: grid }` in `public/css/longtail-forge.css` is an author rule, so it outranks
// the user-agent stylesheet's `[hidden] { display: none }` and these controls rendered even while
// their own page marked them hidden. Asserting the attribute proves nothing here - it was always
// set correctly - so every case below drives the real state transition and asks whether the
// control is actually visible, and whether it is usable when the page shows it again.

import { expect, test } from "@playwright/test";

/** @param {import("@playwright/test").Locator} locator */
async function expectUsable(locator) {
  await expect(locator).toBeVisible();

  // Visible is not enough: a control collapsed to nothing would still pass that.
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("a shown control must occupy layout, but it reported no bounding box");
  }
  expect(box.height).toBeGreaterThan(0);
  expect(box.width).toBeGreaterThan(0);
}

const ROLE_OPTIONS = [
  {
    role_id: "role-workspace",
    role_name: "Workspace Member",
    assignment_scope_type: "workspace",
    assignable_scope_type: "workspace",
    description: "",
    scopes: [],
  },
  {
    role_id: "role-client",
    role_name: "Client Manager",
    assignment_scope_type: "client",
    assignable_scope_type: "client",
    description: "",
    scopes: [{ scopeId: "c1", label: "Client One" }, { scopeId: "c2", label: "Client Two" }],
  },
  {
    role_id: "role-project",
    role_name: "Project Lead",
    assignment_scope_type: "project",
    assignable_scope_type: "project",
    description: "",
    scopes: [{ scopeId: "p1", label: "Project One" }],
  },
];

test("User Admin shows only the scope field its selected role calls for, and hides the other", async ({ page }) => {
  await page.route("**/api/users/add-options*", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      // `canAddUsers` gates `applyUserCreationAvailability`, which disables the role select
      // without it - so the transition under test could never be driven.
      body: JSON.stringify({
        canAddUsers: true,
        roles: ROLE_OPTIONS,
        selectedWorkspaceId: "w1",
        workspaces: [{ workspaceId: "w1", workspaceName: "Primary", workspaceType: "business" }],
      }),
    });
  });

  const response = await page.goto("/user-admin.html");
  if (!response) {
    throw new Error("page.goto(\"/user-admin.html\") returned no response");
  }
  expect(response.status()).toBe(200);

  const roleSelect = page.locator("[data-new-user-role]");
  const clientField = page.locator("[data-new-user-client-scope-field]");
  const projectField = page.locator("[data-new-user-project-scope-field]");
  const clientSelect = page.locator("[data-new-user-client-scope]");
  const projectSelect = page.locator("[data-new-user-project-scope]");

  // The three roles plus the "No initial role" placeholder the page always renders first.
  await expect(roleSelect.locator("option")).toHaveCount(ROLE_OPTIONS.length + 1);

  // No role at all needs neither field.
  await roleSelect.selectOption("");
  await expect(clientField).toBeHidden();
  await expect(projectField).toBeHidden();

  // A workspace-scoped role needs neither field.
  await roleSelect.selectOption("role-workspace");
  await expect(clientField).toBeHidden();
  await expect(projectField).toBeHidden();

  // Switching to a client-scoped role reveals the client field, populated and usable.
  await roleSelect.selectOption("role-client");
  await expectUsable(clientField);
  await expect(projectField).toBeHidden();
  await expect(clientSelect.locator("option")).toHaveCount(2);
  await clientSelect.selectOption("c2");
  await expect(clientSelect.locator("option:checked")).toHaveText("Client Two");

  // Switching again swaps which of the two is shown; neither is left behind.
  await roleSelect.selectOption("role-project");
  await expect(clientField).toBeHidden();
  await expectUsable(projectField);
  await expect(projectSelect.locator("option")).toHaveCount(1);
  await projectSelect.selectOption("p1");
  await expect(projectSelect.locator("option:checked")).toHaveText("Project One");

  // And back to a role that needs neither, so the reveal is not one-way.
  await roleSelect.selectOption("role-workspace");
  await expect(clientField).toBeHidden();
  await expect(projectField).toBeHidden();
});

const AUDIT_PAGINATION = {
  hasMore: false, limit: 50, maxPageSize: 500, nextCursor: "", offset: 0, returned: 0, total: 0,
};

/** @param {{ clients?: unknown[], workspaces?: unknown[] }} catalogues */
const auditEnvelope = (catalogues) => ({
  auditLogs: [],
  filterOptions: {
    changeTypes: [],
    clients: catalogues.clients || [],
    projects: [],
    recordTypes: [],
    users: [],
    workspaces: catalogues.workspaces || [],
  },
  pagination: AUDIT_PAGINATION,
  workspaceId: "",
});

test("Audit Log hides its client and workspace filters until a catalogue offers something", async ({ page }) => {
  /** @type {{ clients: { label: string, value: string }[], workspaces: { label: string, value: string }[] }} */
  let catalogues = { clients: [], workspaces: [] };
  await page.route("**/api/audit-logs?**", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(auditEnvelope(catalogues)) });
  });

  const response = await page.goto("/audit-log.html");
  if (!response) {
    throw new Error("page.goto(\"/audit-log.html\") returned no response");
  }
  expect(response.status()).toBe(200);

  const clientField = page.locator("[data-audit-client-filter-control]");
  const workspaceField = page.locator("[data-audit-workspace-filter-control]");
  const clientSelect = page.locator("[data-audit-client-filter]");
  const workspaceSelect = page.locator("[data-audit-workspace-filter]");

  // Both catalogues came back empty, so both controls stay out of the form.
  await expect(page.locator("[data-audit-user-filter]")).toBeVisible();
  await expect(clientField).toBeHidden();
  await expect(workspaceField).toBeHidden();

  // Offer both catalogues and reload the table through the form the page already has.
  catalogues = {
    clients: [{ label: "Client One", value: "c1" }],
    workspaces: [{ label: "All workspaces", value: "all" }, { label: "Second", value: "w2" }],
  };
  await page.locator("[data-audit-filters] button[type=submit]").click();

  await expectUsable(clientField);
  await expectUsable(workspaceField);
  await clientSelect.selectOption("c1");
  await expect(clientSelect.locator("option:checked")).toHaveText("Client One");
  await workspaceSelect.selectOption("w2");
  await expect(workspaceSelect.locator("option:checked")).toHaveText("Second");

  // Taking the catalogues away hides them again, so the reveal is not one-way.
  catalogues = { clients: [], workspaces: [] };
  await page.locator("[data-audit-filters] button[type=submit]").click();

  await expect(clientField).toBeHidden();
  await expect(workspaceField).toBeHidden();
});

test("Time Entries hides its tag filter until the workspace has tags", async ({ page }) => {
  /** @type {unknown[]} */
  let tags = [];
  await page.route("**/api/tags*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ tags }) });
  });

  const response = await page.goto("/time-entries.html");
  if (!response) {
    throw new Error("page.goto(\"/time-entries.html\") returned no response");
  }
  expect(response.status()).toBe(200);

  const tagField = page.locator("[data-time-entry-filter-tag-control]");

  await expect(page.locator("[data-time-entry-table]")).toBeVisible();
  await expect(tagField).toBeHidden();

  // Give the workspace a tag and reload the page, which is how this control is populated.
  // `isTagCatalogRecord` requires every text member, four integer counts and a known status, so
  // a thinner fixture is filtered out of the catalogue and would never reach the control.
  tags = [{
    color: "#336699",
    created_at: "2026-03-01T10:00:00Z",
    created_by_user_id: "u1",
    description: "",
    direct_usage_count: 0,
    name: "Billable",
    propagated_usage_count: 0,
    slug: "billable",
    status: "active",
    system_usage_count: 0,
    tag_id: "t1",
    updated_at: "2026-03-01T10:00:00Z",
    usage_count: 0,
    workspace_id: "w1",
  }];
  await page.reload();

  await expectUsable(tagField);
  const tagSelect = tagField.locator("select");
  await expect(tagSelect).toBeEnabled();
});
