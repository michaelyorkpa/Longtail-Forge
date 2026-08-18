/* global getComputedStyle */

import { expect, test } from "@playwright/test";

test("Add Project keeps a nested Clients-owned Add Client flow and framework-aligned forms", async ({ page, request }, testInfo) => {
  const suffix = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const clientName = `Nested Project Client ${suffix}`;
  const projectName = `Nested Client Project ${suffix}`;

  const response = await page.goto("/projects.html");
  if (!response) {
    throw new Error("page.goto(\"/projects.html\") returned no response");
  }
  expect(response.status()).toBe(200);
  await page.getByRole("button", { name: "Add Project", exact: true }).click();

  const projectDialog = page.getByRole("dialog", { name: "Add Project" });
  await expect(projectDialog).toBeVisible();
  const projectForm = projectDialog.locator("form.project-modal-form");
  await expect(projectForm).toBeVisible();

  const workspaceName = (await page.getByRole("combobox", { name: "Active workspace" })
    .locator("option:checked").textContent())?.trim();
  if (!workspaceName) {
    throw new Error("the Active workspace combobox has no checked option text");
  }
  const clientSelect = projectDialog.locator(".project-add-client-field select");
  const workspaceOption = clientSelect.locator("option").first();
  await expect(workspaceOption).toHaveText(workspaceName);
  expect(await workspaceOption.evaluate((/** @type {HTMLOptionElement} */ option) => option.value)).toBe("");
  await expect(projectDialog.locator(".project-billing-details .billable-option input")).not.toBeChecked();

  const addProjectLayout = await projectDialog.evaluate((dialog, isMobile) => {
    const form = dialog.querySelector("form.project-modal-form");
    const parent = dialog.querySelector(".project-parent-field");
    const tags = dialog.querySelector(".project-tags-field");
    const parentRect = parent?.getBoundingClientRect();
    const tagsRect = tags?.getBoundingClientRect();
    return {
      noHorizontalOverflow: Boolean(form && form.scrollWidth <= form.clientWidth + 1),
      parentTagsAligned: Boolean(parentRect && tagsRect && (
        isMobile ? tagsRect.top > parentRect.top : Math.abs(tagsRect.top - parentRect.top) <= 4
      )),
      tagsAlignSelf: tags ? getComputedStyle(tags).alignSelf : "",
    };
  }, testInfo.project.name === "mobile");
  expect(addProjectLayout.noHorizontalOverflow).toBe(true);
  expect(addProjectLayout.parentTagsAligned).toBe(true);
  if (testInfo.project.name === "desktop") {
    expect(addProjectLayout.tagsAlignSelf).toBe("start");
  }

  await projectDialog.getByRole("button", { name: "Add Client", exact: true }).click();
  const clientDialog = page.getByRole("dialog", { name: "Add Client" });
  await expect(clientDialog).toBeVisible();
  await expect(projectDialog).toBeVisible();
  await expect(projectDialog).toHaveAttribute("data-view-modal-stack-level", "1");
  await expect(clientDialog).toHaveAttribute("data-view-modal-stack-level", "2");
  await expect(clientDialog).toHaveAttribute("data-view-modal-stack-top", "true");

  const clientForm = clientDialog.locator("form.client-modal-form");
  await expect(clientForm.locator('[data-view-field="name"]')).toBeVisible();
  await expect(clientForm.locator('[data-view-field="parentClientId"]')).toBeVisible();
  await expect(clientForm.locator(".client-add-tags-field")).toBeVisible();
  const addClientLayout = await clientForm.evaluate((form) => {
    const fields = form.querySelector(".view-modal-form-fields");
    const fieldRects = [...form.querySelectorAll('[data-view-field-width="full"]')]
      .map((field) => field.getBoundingClientRect());
    return {
      allFieldsInside: fieldRects.every((rect) => rect.left >= form.getBoundingClientRect().left
        && rect.right <= form.getBoundingClientRect().right + 1),
      noEntryFormColumns: !form.classList.contains("entry-form"),
      noHorizontalOverflow: form.scrollWidth <= form.clientWidth + 1,
      oneFieldColumn: fieldRects.every((rect) => Math.abs(rect.left - fieldRects[0].left) <= 1),
      sharedFieldGrid: Boolean(fields),
    };
  });
  expect(addClientLayout).toEqual({
    allFieldsInside: true,
    noEntryFormColumns: true,
    noHorizontalOverflow: true,
    oneFieldColumn: true,
    sharedFieldGrid: true,
  });

  await clientDialog.getByLabel("Client Name").fill(clientName);
  await clientDialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(clientDialog).toBeHidden();
  await expect(projectDialog).toBeVisible();
  await expect(clientSelect.locator("option:checked")).toHaveText(clientName);
  const createdClientId = await clientSelect.inputValue();
  expect(createdClientId).not.toBe("");
  await expect(projectDialog.getByLabel("Parent Project")).toHaveValue("");

  await projectDialog.getByLabel("New Project Name").fill(projectName);
  await projectDialog.getByRole("button", { name: "Add Project", exact: true }).click();
  await expect(projectDialog).toBeHidden();

  const projectsResponse = await request.get(`/api/projects?clientId=${encodeURIComponent(createdClientId)}&status=All`);
  expect(projectsResponse.status()).toBe(200);
  const projects = (await projectsResponse.json()).projects;
  expect(projects.some((/** @type {Record<string, unknown>} */ project) => project.name === projectName && project.client_id === createdClientId)).toBe(true);
});
