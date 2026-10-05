import { randomUUID } from "node:crypto";
import { expect, test } from "./support/isolated-workspace.mjs";

test("Task context callbacks retain their receivers through real save and cancel workflows", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api } = isolatedWorkspace;
  const title = `Context task ${randomUUID()}`;
  const created = await api.post("/api/tasks", { data: { title } });
  expect(created.status(), await created.text()).toBe(201);
  const taskId = (await created.json()).task.task_id;
  await page.goto("/tasks.html");
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.window.LongtailForge?.tasksDialog))).toBe(true);
  const opened = page.evaluate(async (id) => {
    const editor = globalThis.window.LongtailForge?.tasksDialog;
    if (!editor) throw new Error("Task editor unavailable");
    return editor.openTaskEditor({ mode: "edit", taskId: id });
  }, taskId);
  const dialog = page.locator("dialog[data-task-dialog][open]");
  await expect(dialog.locator("[data-task-title]")).toHaveValue(title);
  await page.evaluate(() => {
    const host = { complete() {
      globalThis.document.body.dataset.contextCompleteReceiver = String(this === host);
      globalThis.document.body.dataset.contextOrder += ",complete";
      globalThis.document.body.dataset.contextCompleteCount = String(Number(globalThis.document.body.dataset.contextCompleteCount || 0) + 1);
    } };
    globalThis.window.LongtailForge?.tasksDialog?.configure({
      hostContext: host,
      onSaved: /** @this {unknown} */ async function () {
        "use strict";
        globalThis.document.body.dataset.contextSaveReceiver = String(this === undefined);
        globalThis.document.body.dataset.contextOrder = "saved";
        await Promise.resolve();
        globalThis.document.body.dataset.contextOrder += ",awaited";
      },
    });
  });
  await dialog.locator("[data-task-title]").fill(`${title} edited`);
  const saving = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/tasks/${taskId}` && response.request().method() === "PUT");
  await dialog.getByRole("button", { name: "Save & Close", exact: true }).click();
  const saved = await saving;
  expect(saved.status(), await saved.text()).toBe(200);
  expect(await opened).toBe("complete");
  await expect(page.locator("body")).toHaveAttribute("data-context-order", "saved,awaited,complete");
  await expect(page.locator("body")).toHaveAttribute("data-context-save-receiver", "true");
  await expect(page.locator("body")).toHaveAttribute("data-context-complete-receiver", "true");
  await expect(page.locator("body")).toHaveAttribute("data-context-complete-count", "1");
  const reopened = page.evaluate(async (id) => {
    const editor = globalThis.window.LongtailForge?.tasksDialog;
    if (!editor) throw new Error("Task editor unavailable");
    return editor.openTaskEditor({ mode: "edit", taskId: id });
  }, taskId);
  await expect(dialog.locator("[data-task-title]")).toHaveValue(`${title} edited`);
  await page.evaluate(() => {
    const host = { cancel() { globalThis.document.body.dataset.contextCancelReceiver = String(this === host); } };
    globalThis.window.LongtailForge?.tasksDialog?.configure({ hostContext: host });
  });
  await page.screenshot({ path: testInfo.outputPath("context-reopened.png"), fullPage: true });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await reopened).toBe("cancel");
  await expect(page.locator("body")).toHaveAttribute("data-context-cancel-receiver", "true");
  await expect(page.locator("body")).toHaveAttribute("data-context-complete-count", "1");
});
