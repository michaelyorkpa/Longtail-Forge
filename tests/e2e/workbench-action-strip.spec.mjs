import { test, expect } from "./support/isolated-workspace.mjs";

test("Task Focus action strip keeps order, labels and lifecycle availability", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api } = isolatedWorkspace;
  /** @type {string[]} */ const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const status of ["open", "blocked", "complete"]) {
    const created = await api.post("/api/tasks", { data: {
      title: `Action strip ${status}`,
      status,
      ...(status === "blocked" ? { blocked_reason: "Waiting for confirmation" } : {}),
    } });
    expect(created.status(), await created.text()).toBe(201);
    const taskId = (await created.json()).task.task_id;
    await page.goto(`/workbench.html?taskId=${taskId}`);
    await expect(page.locator("[data-workbench-task-focus-summary]")).toContainText(`Action strip ${status}`);
    await expect(page.locator("[data-workbench-inspector-list]")).toContainText("No related task context is available yet.");
    const buttons = page.locator("[data-workbench-task-focus-action]");
    await expect(buttons).toHaveCount(3);
    const action = status === "blocked" ? "resume" : "block";
    const label = status === "blocked" ? "Resume task" : "Block task";
    for (const [index, id, name] of [[0, "edit", "Edit task"], [1, "complete", "Complete task"], [2, action, label]]) {
      const button = buttons.nth(Number(index));
      await expect(button).toHaveAttribute("data-workbench-task-focus-action", String(id));
      await expect(button).toHaveAttribute("aria-label", String(name));
      await expect(button).toHaveAttribute("data-task-id", taskId);
      await expect(button).toBeVisible();
    }
    await expect(buttons.nth(0)).toBeEnabled();
    if (status === "complete") {
      await expect(buttons.nth(1)).toBeDisabled();
      await expect(buttons.nth(1)).toHaveAttribute("title", "Task is already complete or archived.");
      await expect(buttons.nth(2)).toBeDisabled();
      await expect(buttons.nth(2)).toHaveAttribute("title", "Completed and archived tasks cannot be blocked.");
    } else {
      await expect(buttons.nth(1)).toBeEnabled();
      await expect(buttons.nth(2)).toBeEnabled();
      await expect(buttons.nth(2)).toHaveAttribute("title", label);
    }
    await page.screenshot({ path: testInfo.outputPath(`action-strip-${status}.png`), fullPage: true });
  }
  expect(errors).toEqual([]);
});
