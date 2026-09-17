import { randomUUID } from "node:crypto";
import { expect, test } from "./support/isolated-workspace.mjs";

test("saved recurrence and reminder settings hydrate, edit and reopen through the real task editor", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api } = isolatedWorkspace;
  const created = await api.post("/api/tasks", { data: {
    title: `Scheduling ${randomUUID()}`, due_date: "2050-04-01",
    recurrence: { enabled: true, frequency: "WEEKLY", interval: 2, endDate: "2051-01-01" },
    reminderOverrideEnabled: true, reminderPolicy: { dateTime: [180], dateOnly: [2880, 1440] },
  } });
  expect(created.status(), await created.text()).toBe(201);
  const taskId = (await created.json()).task.task_id;
  await page.goto("/tasks.html");
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.window.LongtailForge?.tasksDialog))).toBe(true);
  for (const editing of [true, false]) {
    const opened = page.evaluate(async (taskId) => {
      const editor = globalThis.window.LongtailForge?.tasksDialog;
      if (!editor) throw new Error("Task editor unavailable");
      return editor.openTaskEditor({ mode: "edit", taskId });
    }, taskId);
    const dialog = page.locator("[data-task-dialog][open]");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("[data-task-recurrence-summary]")).toHaveText("Every 2 weeks until 2051-01-01.");
    if (await dialog.locator("[data-task-reminder-details]").getAttribute("open") === null)
      await dialog.locator("[data-task-reminder-details] > summary").click();
    await expect(dialog.locator("[data-task-reminder-date-time-hours-1]")).toBeVisible();
    await expect(dialog.locator("[data-task-reminder-override]")).toBeChecked();
    await expect(dialog.locator("[data-task-reminder-date-time-hours-1]")).toHaveValue(editing ? "3" : "5");
    await expect(dialog.locator("[data-task-reminder-date-time-hours-2-enabled]")).not.toBeChecked();
    await expect(dialog.locator("[data-task-reminder-date-time-hours-2]")).toBeDisabled();
    await expect(dialog.locator("[data-task-reminder-date-only-days-2-enabled]")).toBeChecked();
    await expect(dialog.locator("[data-task-reminder-date-only-days-2]")).toBeEnabled();
    await expect(dialog.locator("[data-task-reminder-date-only-days-1]")).toHaveValue("1");
    await expect(dialog.locator("[data-task-reminder-date-only-days-2]")).toHaveValue("2");
    await expect(dialog.locator("[data-task-effective-reminders]")).toContainText(editing ? "3h" : "5h");
    await page.screenshot({ path: testInfo.outputPath(editing ? "scheduling-edit.png" : "scheduling-reopened.png"), fullPage: true });
    if (editing) {
      await dialog.locator("[data-task-reminder-date-time-hours-1]").fill("5");
      const saved = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/tasks/${taskId}` && response.request().method() === "PUT");
      await dialog.getByRole("button", { name: "Save & Close", exact: true }).click();
      const response = await saved;
      expect(response.status(), await response.text()).toBe(200);
      expect(response.request().postDataJSON().reminderPolicy).toEqual({ dateTime: [300], dateOnly: [1440, 2880] });
    } else {
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    }
    await expect(dialog).toHaveCount(0);
    await opened;
  }
  const persisted = await api.get(`/api/tasks/${taskId}`);
  expect(persisted.status()).toBe(200);
  expect((await persisted.json()).task.reminderDetails.taskPolicy).toEqual({ dateTime: [300], dateOnly: [1440, 2880] });
});
