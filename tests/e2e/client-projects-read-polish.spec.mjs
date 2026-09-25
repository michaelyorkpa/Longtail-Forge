/* global document, HTMLElement, getComputedStyle */

import { expect, test } from "@playwright/test";

const FOCUS_CLEARANCE_TOLERANCE_PX = 0.01;

/**
 * @param {import("@playwright/test").APIRequestContext} request
 * @param {string} path
 * @param {Record<string, unknown>} data
 * @param {string} label
 */
async function createRecord(request, path, data, label) {
  const response = await request.post(path, { data });
  expect(response.status(), `${label} should be created`).toBe(201);
  return response.json();
}

/**
 * @param {import("@playwright/test").Locator} table
 * @param {string[]} contentHeaders
 */
async function expectBlankUtilityHeaders(table, contentHeaders) {
  const headers = await table.locator("thead th").allTextContents();
  expect(headers.map((header) => header.trim())).toEqual(["", ...contentHeaders, ""]);
}

/**
 * @param {import("@playwright/test").Locator} control
 */
async function expectFocusRingClearance(control) {
  const clearance = await control.evaluate((element) => {
    element.focus({ preventScroll: true });
    const panelBody = element.closest(".view-collapsible-index-body, .view-sidebar-panel-body");
    if (!(panelBody instanceof HTMLElement)) {
      return null;
    }

    const elementRect = element.getBoundingClientRect();
    const panelRect = panelBody.getBoundingClientRect();
    const style = getComputedStyle(element);
    const focusPaint = Number.parseFloat(style.outlineWidth || "0")
      + Number.parseFloat(style.outlineOffset || "0");

    return {
      bottom: panelRect.bottom - elementRect.bottom,
      focusPaint,
      focused: document.activeElement === element,
      left: elementRect.left - panelRect.left,
      right: panelRect.right - elementRect.right,
      top: elementRect.top - panelRect.top,
    };
  });

  expect(clearance, "the focused control should be inside the filter drawer body").not.toBeNull();
  if (!clearance) {
    throw new Error("the focused control was outside the filter drawer body");
  }
  expect(clearance.focused, "the filter control should accept focus while its ring clearance is measured").toBe(true);
  expect(clearance.left + FOCUS_CLEARANCE_TOLERANCE_PX).toBeGreaterThanOrEqual(clearance.focusPaint);
  expect(clearance.right + FOCUS_CLEARANCE_TOLERANCE_PX).toBeGreaterThanOrEqual(clearance.focusPaint);
  expect(clearance.top + FOCUS_CLEARANCE_TOLERANCE_PX).toBeGreaterThanOrEqual(clearance.focusPaint);
  expect(clearance.bottom + FOCUS_CLEARANCE_TOLERANCE_PX).toBeGreaterThanOrEqual(clearance.focusPaint);
}

test("Clients and Projects read surfaces preserve hierarchy, workspace filtering, and compact table anatomy", { tag: "@desktop" }, async ({ page, request }, testInfo) => {
  const suffix = `${testInfo.workerIndex}-${Date.now()}`;
  const tagName = `LongReadSurfaceTag${"X".repeat(72)}${suffix}`;
  const parentClientName = `Read Parent Client ${suffix}`;
  const childClientName = `Read Child Client ${suffix}`;
  const workspaceParentName = `Workspace Parent Project ${suffix}`;
  const workspaceChildName = `Workspace Child Project ${suffix}`;
  const clientProjectName = `Client Project ${suffix}`;

  const { tag } = await createRecord(request, "/api/tags", { name: tagName }, "the long proof tag");
  const { client: parentClient } = await createRecord(
    request,
    "/api/clients",
    { name: parentClientName },
    "the parent client",
  );
  await createRecord(
    request,
    "/api/clients",
    { name: childClientName, parent_client_id: parentClient.id, tagIds: [tag.tag_id] },
    "the child client",
  );
  const { project: workspaceParent } = await createRecord(
    request,
    "/api/projects",
    { name: workspaceParentName },
    "the workspace parent project",
  );
  await createRecord(
    request,
    "/api/projects",
    { name: workspaceChildName, parent_project_id: workspaceParent.id, tagIds: [tag.tag_id] },
    "the workspace child project",
  );
  await createRecord(
    request,
    `/api/clients/${encodeURIComponent(parentClient.id)}/projects`,
    { name: clientProjectName },
    "the client-owned project",
  );

  const clientsResponse = await page.goto("/clients.html");
  if (!clientsResponse) {
    throw new Error("navigating to /clients.html returned no response");
  }
  expect(clientsResponse.status()).toBe(200);
  const clientsTable = page.locator(".view-data-table").first();
  await expect(clientsTable).toBeVisible();
  await expect(clientsTable.getByText(`- ${childClientName}`, { exact: true })).toBeVisible();
  await expectBlankUtilityHeaders(clientsTable, ["Client", "Status", "Billing"]);

  const clientTagRow = clientsTable.locator("tr.client-projects-tag-row").filter({ hasText: tagName });
  await expect(clientTagRow).toBeVisible();
  await expect(clientTagRow).not.toContainText("Tags");
  const clientTagLayout = await clientTagRow.evaluate((row) => {
    const chip = row.querySelector(".surface-chip");
    const priorRow = row.previousElementSibling;
    return {
      chipContained: Boolean(chip && chip.scrollWidth <= chip.clientWidth + 1),
      chipWrap: chip ? getComputedStyle(chip).overflowWrap : "",
      priorBorder: priorRow ? getComputedStyle(/** @type {Element} */ (priorRow.lastElementChild)).borderBottomWidth : "missing",
    };
  });
  expect(clientTagLayout).toEqual({ chipContained: true, chipWrap: "anywhere", priorBorder: "0px" });

  await page.locator("[data-view-slideout-sidebar-trigger]").first().click();
  const clientsDrawer = page.locator(".view-slideout-sidebar-drawer.is-open");
  await expect(clientsDrawer).toBeVisible();
  await expectFocusRingClearance(clientsDrawer.locator('[data-view-input="status"]'));
  await expectFocusRingClearance(clientsDrawer.locator('[data-view-input="tagIds"]'));

  const projectsResponse = await page.goto("/projects.html");
  if (!projectsResponse) {
    throw new Error("navigating to /projects.html returned no response");
  }
  expect(projectsResponse.status()).toBe(200);
  const projectsTable = page.locator(".view-data-table").first();
  await expect(projectsTable).toBeVisible();
  await expect(projectsTable.getByText(`- ${workspaceChildName}`, { exact: true })).toBeVisible();
  await expectBlankUtilityHeaders(projectsTable, ["Project", "Client", "Status", "Billing"]);

  await page.locator("[data-view-slideout-sidebar-trigger]").first().click();
  const projectsDrawer = page.locator(".view-slideout-sidebar-drawer.is-open");
  await expect(projectsDrawer).toBeVisible();
  const clientFilter = projectsDrawer.locator('[data-view-input="clientId"]');
  await expect(clientFilter.locator('option[value="__workspace_projects__"]')).toHaveCount(1);
  await clientFilter.selectOption("__workspace_projects__");
  await expect(projectsTable.getByText(workspaceParentName, { exact: true })).toBeVisible();
  await expect(projectsTable.getByText(`- ${workspaceChildName}`, { exact: true })).toBeVisible();
  await expect(projectsTable.getByText(clientProjectName, { exact: true })).toHaveCount(0);

  await expectFocusRingClearance(clientFilter);
  await expectFocusRingClearance(projectsDrawer.locator('[data-view-input="status"]'));
  await expectFocusRingClearance(projectsDrawer.locator('[data-view-input="tagIds"]'));
});

// Runtime proof for 0.33.33.38.3.11.
//
// Selecting a row re-syncs the Projects bulk toolbar by searching the page for it, so the toolbar
// arrives as a bare element. Its count now comes from the framework's own record of the toolbar it
// built (`LongtailForge.view.partsOf`), and `open` from its real `<details>` type. Selecting and
// clearing rows changes no data.
test("the Projects bulk toolbar opens and counts the selected rows", async ({ page, request }, testInfo) => {
  /** @type {string[]} */
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  const suffix = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const { client } = await createRecord(request, "/api/clients", { name: `Bulk Client ${suffix}` }, "the proof Client");
  const names = [`Bulk Project A ${suffix}`, `Bulk Project B ${suffix}`];
  for (const name of names) {
    await createRecord(request, `/api/clients/${encodeURIComponent(client.id)}/projects`, { name }, name);
  }

  const response = await page.goto("/projects.html");
  expect(response?.status()).toBe(200);
  const rows = names.map((name) => page.locator("tbody tr").filter({ hasText: name }).first());
  for (const row of rows) {
    await expect(row).toBeVisible();
  }

  const toolbar = page.locator('[data-client-projects-bulk-toolbar="project"]');
  const count = toolbar.locator("[data-view-bulk-selection-count]");
  await rows[0].locator("[data-view-row-select]").check();
  await expect(toolbar).toHaveJSProperty("open", true);
  await expect(count).toHaveText("1 selected");
  await rows[1].locator("[data-view-row-select]").check();
  await expect(count).toHaveText("2 selected");

  for (const row of rows) {
    await row.locator("[data-view-row-select]").uncheck();
  }
  await expect(count).toHaveJSProperty("hidden", true);
  expect(errors).toEqual([]);
});
