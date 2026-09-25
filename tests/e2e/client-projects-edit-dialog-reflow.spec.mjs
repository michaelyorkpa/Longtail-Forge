/* global getComputedStyle, HTMLDetailsElement */

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

/**
 * The tag ids assigned directly to one Client or Project.
 * @param {import("@playwright/test").APIRequestContext} request
 * @param {"client" | "project"} targetType
 * @param {string} targetId
 * @returns {Promise<string[]>}
 */
async function directTagIds(request, targetType, targetId) {
  const response = await request.get(`/api/tags/assignments?targetType=${targetType}&targetId=${encodeURIComponent(targetId)}`);
  expect(response.status(), `${targetType} tag assignments should be readable`).toBe(200);
  const assignments = await response.json();
  return assignments.directTags.map((/** @type {Record<string, unknown>} */ entry) => String(entry.tag_id));
}

test("Edit Project uses the wide unboxed framework flow while preserving save behavior", async ({ page, request }, testInfo) => {
  const suffix = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const clientName = `Edit Reflow Client ${suffix}`;
  const projectName = `Edit Reflow Project ${suffix}`;
  // `0.33.33.43.46`: the project starts with a tag, so the save must read the mounted picker back
  // through the page's own record - a stub answer would clear it.
  const { tag } = await createRecord(request, "/api/tags", { name: `Edit Reflow Tag ${suffix}` }, "the proof tag");
  const { client } = await createRecord(request, "/api/clients", { name: clientName }, "the proof Client");
  const { project } = await createRecord(
    request,
    `/api/clients/${encodeURIComponent(client.id)}/projects`,
    { name: projectName, tagIds: [tag.tag_id] },
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
  expect(await directTagIds(request, "project", project.id), "the project's tag survives the save").toEqual([tag.tag_id]);
});

// The permanent Edit Client case owed since `0.33.33.38.3.9`, added with `0.33.33.43.46`: the save
// reads the tag picker and both billing editors back from what their builders recorded.
test("Edit Client saves its tags and both billing editors", async ({ page, request }, testInfo) => {
  const suffix = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const clientName = `Edit Client Proof ${suffix}`;
  const keptTagName = `Edit Client Kept ${suffix}`;
  const addedTagName = `Edit Client Added ${suffix}`;
  const { tag: keptTag } = await createRecord(request, "/api/tags", { name: keptTagName }, "the kept tag");
  const { tag: addedTag } = await createRecord(request, "/api/tags", { name: addedTagName }, "the added tag");
  const { client } = await createRecord(request, "/api/clients", { name: clientName, tagIds: [keptTag.tag_id] }, "the proof Client");

  const response = await page.goto("/clients.html");
  if (!response) {
    throw new Error("page.goto(\"/clients.html\") returned no response");
  }
  expect(response.status()).toBe(200);
  const clientRow = page.locator("tbody tr").filter({ hasText: clientName }).first();
  await expect(clientRow).toBeVisible();
  await clientRow.getByRole("button", { name: "Edit Client", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: `Edit Client: ${clientName}`, exact: true });
  await expect(dialog).toBeVisible();

  const tags = dialog.locator("[data-client-tags]");
  await expect(tags.locator(`[data-tag-picker-selected][value="${keptTag.tag_id}"]`)).toHaveCount(1);
  await tags.locator("[data-tag-picker-input]").fill(addedTagName);
  await tags.locator(`[data-tag-picker-suggestion="${addedTag.tag_id}"]`).click();
  await expect(tags.locator(`[data-tag-picker-selected][value="${addedTag.tag_id}"]`)).toHaveCount(1);

  const billing = dialog.locator(".billing-details")
    .filter({ has: page.locator("summary").getByText("Client Billing Settings", { exact: true }) });
  if (!await billing.evaluate((details) => details instanceof HTMLDetailsElement && details.open)) {
    await billing.locator("summary").click();
  }
  await billing.locator("[data-client-billable-input]").check();
  const periodSelects = billing.locator("[data-billing-period-editor] select");
  await periodSelects.nth(0).selectOption("custom");
  await periodSelects.nth(1).selectOption("15");
  const roundingSelects = billing.locator("[data-billing-rounding-editor] select");
  await roundingSelects.nth(0).selectOption("round");
  await roundingSelects.nth(1).selectOption("nearestHalfHour");

  await dialog.getByRole("button", { name: "Save Client", exact: true }).click();
  await expect(dialog).toBeHidden();

  const savedResponse = await request.get(`/api/clients/${encodeURIComponent(client.id)}`);
  expect(savedResponse.status()).toBe(200);
  const saved = (await savedResponse.json()).client;
  expect(saved.billing_period).toEqual({ type: "custom", startDay: 15 });
  expect(saved.billing_rounding).toEqual({ enabled: true, increment: "nearestHalfHour" });
  expect((await directTagIds(request, "client", client.id)).sort()).toEqual([keptTag.tag_id, addedTag.tag_id].sort());
});
