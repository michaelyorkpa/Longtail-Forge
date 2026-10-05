import { test, expect } from "./support/isolated-workspace.mjs";

test("Inspector handles retain collapse, viewport transitions and focus return", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api } = isolatedWorkspace;
  const created = await api.post("/api/tasks", { data: { title: "Inspector handle task" } });
  expect(created.status(), await created.text()).toBe(201);
  const taskId = (await created.json()).task.task_id;
  /** @type {string[]} */ const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/workbench.html?taskId=${encodeURIComponent(taskId)}`);
  const inspector = page.locator("[data-workbench-inspector]");
  const open = page.getByRole("button", { name: "Open Inspector", exact: true });
  const close = page.getByRole("button", { name: "Close Inspector", exact: true });
  if (testInfo.project.name === "mobile") await open.click();
  await expect(inspector).toBeVisible();
  await expect(inspector.locator("h2")).toHaveText("Task context");
  const list = inspector.locator("[data-workbench-inspector-list]");
  await expect(list).toContainText("No related task context is available yet.");
  await expect(inspector.locator("[data-workbench-inspector-count]")).toHaveText("0");
  if (testInfo.project.name === "mobile") {
    // The existing mobile stylesheet hides collapse; the drawer's close action remains available.
    await expect(inspector.locator(".workbench-inspector-collapse-button")).toBeHidden();
    await close.click();
    await expect(open).toBeFocused();
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(inspector).not.toHaveClass(/view-slideout-sidebar-drawer/);
  }
  await inspector.getByRole("button", { name: "Collapse Task Focus Inspector", exact: true }).click();
  await expect(list).toBeHidden();
  await inspector.getByRole("button", { name: "Expand Task Focus Inspector", exact: true }).click();
  await expect(list).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(open).toBeVisible();
  await open.click();
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(inspector).toHaveAttribute("aria-hidden", "true");
  await expect(open).toBeFocused();
  await expect(page.locator("body")).not.toHaveClass(/view-slideout-sidebar-lock/);
  await page.setViewportSize({ width: 900, height: 844 });
  await expect(open).toBeHidden();
  await expect(inspector).toBeHidden();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(inspector).toBeVisible();
  await expect(inspector).not.toHaveClass(/view-slideout-sidebar-drawer/);
  await expect(list).toBeVisible();
  await expect(list).toContainText("No related task context is available yet.");
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("inspector-handles.png"), fullPage: true });
});
