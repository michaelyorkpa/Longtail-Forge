import { test, expect } from "./support/isolated-workspace.mjs";

test("Workbench task opener preserves cancellation, real save, completion and focus", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api } = isolatedWorkspace;
  const created = await api.post("/api/tasks", { data: { title: "Task opener" } });
  expect(created.status(), await created.text()).toBe(201);
  const taskId = (await created.json()).task.task_id;
  /** @type {string[]} */ const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/workbench.html?taskId=${taskId}`);
  await expect(page.locator("[data-workbench-inspector-list]")).toContainText("No related task context is available yet.");
  const edit = page.getByRole("button", { name: "Edit task", exact: true });
  const dialog = page.locator("dialog[data-task-dialog][open]");
  async function observeFocusReturn() {
    await edit.evaluate(button => {
      if (!(button instanceof globalThis.HTMLElement)) throw new Error("Expected the real edit button.");
      globalThis.document.body.dataset.openerFocusCalls = "0";
      const focus = button.focus;
      button.focus = function (options) {
        globalThis.document.body.dataset.openerFocusCalls = String(Number(globalThis.document.body.dataset.openerFocusCalls) + 1);
        focus.call(this, options);
      };
    });
  }
  await observeFocusReturn();
  await edit.click();
  await expect(dialog.locator("[data-task-title]")).toHaveValue("Task opener");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  // The existing post-close refresh replaces the trigger. Verify the real
  // original element's focus call; do not claim its replacement keeps focus.
  await expect.poll(() => page.locator("body").getAttribute("data-opener-focus-calls").then(Number)).toBeGreaterThan(0);
  await expect(page.locator("[data-workbench-inspector-list]")).toContainText("No related task context is available yet.");
  await observeFocusReturn();
  await edit.click();
  await dialog.locator("[data-task-title]").fill("Task opener saved");
  const saved = page.waitForResponse(response => response.request().method() === "PUT" && response.url().endsWith(`/api/tasks/${taskId}`));
  await dialog.getByRole("button", { name: "Save & Close", exact: true }).click();
  expect((await saved).status()).toBe(200);
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("[data-workbench-task-focus-summary]")).toContainText("Task opener saved");
  // Save refreshes before close, so the existing dialog guard may skip a
  // disconnected trigger. The lifted case separately proves payload identity.
  await edit.click();
  const completed = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith(`/api/tasks/${taskId}/complete`));
  await dialog.getByRole("button", { name: "Complete task", exact: true }).click();
  expect((await completed).status()).toBe(200);
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("[data-workbench-host]")).toHaveAttribute("data-workbench-view-state", "focus-selection");
  await expect(page.locator('[data-workbench-focus-mode][data-active="true"]')).toBeFocused();
  const detail = await api.get(`/api/tasks/${taskId}`);
  expect(detail.status(), await detail.text()).toBe(200);
  expect((await detail.json()).task.status).toBe("complete");
  await expect(page).toHaveURL(/\/workbench\.html$/);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("task-opener.png"), fullPage: true });
});
