/* global getComputedStyle */

import { expect, test } from "@playwright/test";

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

test("Edit Project uses the wide unboxed framework flow while preserving save behavior", async ({ page, request }, testInfo) => {
  const suffix = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const clientName = `Edit Reflow Client ${suffix}`;
  const projectName = `Edit Reflow Project ${suffix}`;
  const { client } = await createRecord(request, "/api/clients", { name: clientName }, "the proof Client");
  const { project } = await createRecord(
    request,
    `/api/clients/${encodeURIComponent(client.id)}/projects`,
    { name: projectName },
    "the proof Project",
  );

  const response = await page.goto("/projects.html");
  if (!response) {
    throw new Error("page.goto(\"/projects.html\") returned no response");
  }
  expect(response.status()).toBe(200);
  const projectRow = page.locator("tbody tr").filter({ hasText: projectName }).first();
  await expect(projectRow).toBeVisible();
  await projectRow.getByRole("button", { name: "Edit Project", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: `Edit Project: ${projectName}`, exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveClass(/view-modal--wide/);
  await expect(dialog).not.toHaveClass(/project-form-dialog|detail-edit-dialog/);
  await expect(dialog.locator(".view-modal-body > .project-item")).toHaveCount(0);

  const editor = dialog.locator(".view-modal-body > .project-edit-form");
  await expect(editor).toBeVisible();
  await expect(editor.locator(".project-edit-tags-field .tag-picker")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save Project", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Archive", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeVisible();

  const layout = await editor.evaluate((form) => {
    const directField = (/** @type {string} */ selector) => form.querySelector(`:scope > ${selector}`);
    const formRect = form.getBoundingClientRect();
    const status = directField(".project-status-field");
    const clientField = directField(".project-client-field");
    const parent = directField(".project-parent-field");
    const tags = directField(".project-edit-tags-field");
    const orderedFields = [status, clientField, parent];
    const fieldRects = orderedFields.map((field) => field?.getBoundingClientRect());
    const [statusRect, clientRect, parentRect] = fieldRects;
    const tagRect = tags?.getBoundingClientRect();
    const tagPicker = tags?.querySelector(".tag-picker");
    const tagStyle = tagPicker ? getComputedStyle(tagPicker) : null;
    return {
      fullWidthIdentityFields: fieldRects.every((rect) => rect
        && Math.abs(rect.left - formRect.left) <= 2
        && Math.abs(rect.right - formRect.right) <= 2),
      identityOrder: Boolean(statusRect && clientRect && parentRect
        && statusRect.top < clientRect.top
        && clientRect.top < parentRect.top),
      noFormBorder: getComputedStyle(form).borderTopWidth === "0px",
      noHorizontalOverflow: form.scrollWidth <= form.clientWidth + 1,
      tagsFullWidth: Boolean(tagRect
        && Math.abs(tagRect.left - formRect.left) <= 2
        && Math.abs(tagRect.right - formRect.right) <= 2),
      tagsUnboxed: Boolean(tagStyle
        && tagStyle.borderTopWidth === "0px"
        && tagStyle.paddingTop === "0px"),
    };
  });
  expect(layout).toEqual({
    fullWidthIdentityFields: true,
    identityOrder: true,
    noFormBorder: true,
    noHorizontalOverflow: true,
    tagsFullWidth: true,
    tagsUnboxed: true,
  });

  const projectDefaults = editor.locator(".project-defaults-details");
  await projectDefaults.locator("summary").click();
  const taskModuleDefaults = projectDefaults.locator(".project-module-defaults-group");
  await expect(taskModuleDefaults.getByText("Task Reminder Defaults", { exact: true })).toBeVisible();
  await expect(taskModuleDefaults.getByText("Rounding", { exact: true })).toBeVisible();
  await expect(editor.locator(".project-billing-settings").getByText("Task Reminder Defaults", { exact: true })).toHaveCount(0);
  await expect(editor.locator(".project-billing-settings").getByText("Rounding", { exact: true })).toHaveCount(0);
  await expect(editor.locator(".project-billing-details").getByText("Project Rounding", { exact: true })).toHaveCount(0);
  const defaultsOrder = await taskModuleDefaults.locator(":scope > *").evaluateAll((children) => children.map((child) => child.tagName === "FIELDSET" ? child.querySelector("legend")?.textContent : child.className));
  expect(defaultsOrder.indexOf("Task Reminder Defaults")).toBeGreaterThan(defaultsOrder.indexOf("Task module"));
  expect(defaultsOrder.indexOf("Rounding")).toBeGreaterThan(defaultsOrder.indexOf("Task Reminder Defaults"));

  await dialog.locator(".project-status-field select").selectOption("Inactive");
  await dialog.getByRole("button", { name: "Save Project", exact: true }).click();
  await expect(dialog).toBeHidden();

  const savedResponse = await request.get(`/api/projects/${encodeURIComponent(project.id)}`);
  expect(savedResponse.status()).toBe(200);
  const saved = (await savedResponse.json()).project;
  expect(saved.status).toBe("Inactive");
  expect(saved.client_id).toBe(client.id);
  expect(saved.parent_project_id || "").toBe("");
});
