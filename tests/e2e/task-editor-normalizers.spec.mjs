import { randomUUID } from "node:crypto";
import { expect, test } from "./support/isolated-workspace.mjs";

test("canonical create normalizes host defaults and focuses the requested real field", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api } = isolatedWorkspace;
  await page.goto("/tasks.html");
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.window.LongtailForge?.tasksDialog))).toBe(true);
  const title = `Normalized task ${randomUUID().slice(0, 8)}`;
  const opened = page.evaluate(async (input) => {
    const editor = globalThis.window.LongtailForge?.tasksDialog;
    if (!editor) throw new Error("Task editor unavailable");
    return editor.openTaskEditor(input);
  }, { mode: "NEW", context: { defaults: { title: "context nested" }, title: "context flat" }, defaults: { title: "params nested", description: "Opaque defaults arrive in the editor", nextAction: "nested next" }, title, nextAction: "Top-level next action", focusField: " NEXT-ACTION " });
  const dialog = page.locator("dialog[data-task-dialog][open]");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[data-task-title]")).toHaveValue(title);
  await expect(dialog.locator("[data-task-description]")).toHaveValue("Opaque defaults arrive in the editor");
  await expect(dialog.locator("[data-task-next-action]")).toHaveValue("Top-level next action");
  await expect(dialog.locator("[data-task-next-action]")).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("normalized-create.png"), fullPage: true });
  const saved = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/tasks" && response.request().method() === "POST");
  await dialog.getByRole("button", { name: "Save & Close", exact: true }).click();
  const response = await saved;
  expect(response.status(), await response.text()).toBe(201);
  const task = (await response.json()).task;
  expect(task).toMatchObject({ title, next_action: "Top-level next action", description: "Opaque defaults arrive in the editor", status: "open" });
  await expect(dialog).toHaveCount(0);
  await opened;
  const persisted = await api.get(`/api/tasks/${encodeURIComponent(task.task_id)}`);
  expect(persisted.status()).toBe(200);
  expect((await persisted.json()).task.title).toBe(title);
});

test("edit/copy modes and unrecognized focus instructions retain their real editor behavior", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api } = isolatedWorkspace;
  const title = `Editor aliases ${randomUUID().slice(0, 8)}`;
  const created = await api.post("/api/tasks", { data: { title, next_action: "Existing next action" } });
  expect(created.status(), await created.text()).toBe(201);
  const taskId = (await created.json()).task.task_id;
  await page.goto("/tasks.html");
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.window.LongtailForge?.tasksDialog))).toBe(true);
  /** @type {string[]} */ const writes = [];
  page.on("request", (request) => {
    if (request.method() === "POST" || request.method() === "PUT") {
      if (new URL(request.url()).pathname.startsWith("/api/tasks")) writes.push(request.method());
    }
  });
  for (const [mode, focus, expectedTitle, selector] of [
    ["UPDATE", "due-time", title, "[data-task-due-time]"],
    ["COPY", "constructor", `Copy of ${title}`, "[data-task-title]"],
    ["UPDATE", "__proto__", title, "[data-task-title]"],
  ]) {
    const opened = page.evaluate(async (input) => {
      const editor = globalThis.window.LongtailForge?.tasksDialog;
      if (!editor) throw new Error("Task editor unavailable");
      return editor.openTaskEditor(input);
    }, { mode, taskId, focus });
    const dialog = page.locator("dialog[data-task-dialog][open]");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("[data-task-title]")).toHaveValue(expectedTitle);
    await expect(dialog.locator(selector)).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath(`normalized-${mode}-${focus}.png`), fullPage: true });
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await opened;
  }
  expect(writes).toEqual([]);
  const unchanged = await api.get(`/api/tasks/${encodeURIComponent(taskId)}`);
  expect((await unchanged.json()).task).toMatchObject({ title, next_action: "Existing next action" });
});
