import { randomUUID } from "node:crypto";
import { expect, test } from "./support/isolated-workspace.mjs";

test("request callbacks survive create-to-edit and complete once per real save", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api } = isolatedWorkspace;
  await page.goto("/tasks.html");
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.window.LongtailForge?.tasksDialog))).toBe(true);
  const title = `Request ${randomUUID()}`;
  const opened = page.evaluate(async (title) => {
    "use strict";
    const editor = globalThis.window.LongtailForge?.tasksDialog;
    if (!editor) throw new Error("Task editor unavailable");
    /** @type {string[]} */ const events = [];
    globalThis.sessionStorage.setItem("request-events", "[]");
    /** @this {unknown} @param {unknown} result */
    async function onSaved(result) {
      if (this !== undefined || !result) throw new Error("Request callback receiver/result changed");
      await Promise.resolve();
      events.push("saved");
      globalThis.sessionStorage.setItem("request-events", JSON.stringify(events));
    }
    /** @this {unknown} */
    async function refresh() {
      if (this !== undefined) throw new Error("Refresh receiver changed");
      events.push("refresh");
      globalThis.sessionStorage.setItem("request-events", JSON.stringify(events));
    }
    return editor.openTaskEditor({ mode: "add", title, onSaved, refresh });
  }, title);
  const dialog = page.locator("dialog[data-task-dialog][open]");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[data-task-title]")).toHaveValue(title);
  const created = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/tasks" && response.request().method() === "POST");
  await dialog.getByRole("button", { name: "Save task", exact: true }).click();
  const response = await created;
  expect(response.status(), await response.text()).toBe(201);
  const taskId = (await response.json()).task.task_id;
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Edit Task", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => globalThis.sessionStorage.getItem("request-events"))).toBe('["saved","refresh"]');
  await dialog.locator("[data-task-next-action]").fill("Request survives the transition");
  const updated = page.waitForResponse((reply) => new URL(reply.url()).pathname === `/api/tasks/${taskId}` && reply.request().method() === "PUT");
  await dialog.getByRole("button", { name: "Save & Close", exact: true }).click();
  const update = await updated;
  expect(update.status(), await update.text()).toBe(200);
  await expect(dialog).toHaveCount(0);
  expect(await opened).toBe("complete");
  expect(await page.evaluate(() => globalThis.sessionStorage.getItem("request-events"))).toBe('["saved","refresh","saved","refresh"]');
  const persisted = await api.get(`/api/tasks/${encodeURIComponent(taskId)}`);
  expect(persisted.status()).toBe(200);
  expect((await persisted.json()).task).toMatchObject({ title, next_action: "Request survives the transition" });
  await page.screenshot({ path: testInfo.outputPath("request-create-edit-closed.png"), fullPage: true });
});
