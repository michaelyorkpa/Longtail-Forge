import { randomUUID } from "node:crypto";
import { expect, test } from "./support/isolated-workspace.mjs";

test("Task utility controllers mount, save selected tags, tear down and remount", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api } = isolatedWorkspace;
  const title = `Utility task ${randomUUID().slice(0, 8)}`;
  const tagName = `Utility tag ${randomUUID().slice(0, 8)}`;
  const tagResponse = await api.post("/api/tags", { data: { name: tagName } });
  expect(tagResponse.status(), await tagResponse.text()).toBe(201);
  const tagId = (await tagResponse.json()).tag.tag_id;
  const created = await api.post("/api/tasks", { data: { title } });
  expect(created.status(), await created.text()).toBe(201);
  const taskId = (await created.json()).task.task_id;
  await page.goto("/tasks.html");
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.window.LongtailForge?.tasksDialog))).toBe(true);
  const dialog = page.locator("dialog[data-task-dialog][open]");
  const files = page.locator("[data-task-files-dialog]");
  const tags = page.locator("[data-task-tags-dialog]");
  const notes = page.locator("[data-task-notes]");

  for (const pass of ["select", "reopen"]) {
    const opened = page.evaluate(async (id) => {
      const editor = globalThis.window.LongtailForge?.tasksDialog;
      if (!editor) throw new Error("Task editor unavailable");
      return editor.openTaskEditor({ mode: "edit", taskId: id });
    }, taskId);
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("[data-task-title]")).toHaveValue(title);
    await dialog.locator("[data-task-files-toggle]").click();
    await expect(files).toBeVisible();
    await expect(files.locator("[data-file-attachments-list]")).toContainText("No attachments yet.");
    await expect(files.locator("[data-file-attachment-input]")).toBeVisible();
    await expect(files.locator("[data-file-attachment-input]")).toBeEnabled();
    await files.locator("[data-task-files-dialog-close]").click();
    await expect(files).toBeHidden();
    await dialog.locator("[data-task-notes-panel] > summary").click();
    await expect(notes.locator("[data-notes-linked-panel]")).toBeVisible();
    await expect(notes.locator(".notes-linked-panel-list")).not.toContainText("Loading notes...");
    await expect(notes.locator(".notes-linked-panel-status")).not.toHaveClass(/is-error/);
    await page.screenshot({ path: testInfo.outputPath(`utility-${pass}.png`), fullPage: true });
    await dialog.locator("[data-task-tags-toggle]").click();
    await expect(tags).toBeVisible();
    if (pass === "select") {
      await tags.locator("[data-tag-picker-input]").fill(tagName);
      await tags.locator(`[data-tag-picker-suggestion="${tagId}"]`).click();
    }
    await expect(tags.locator(`[data-tag-picker-selected][value="${tagId}"]`)).toHaveCount(1);
    await tags.locator("[data-task-tags-dialog-close]").click();
    if (pass === "select") {
      const saving = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/tasks/${taskId}` && response.request().method() === "PUT");
      await dialog.getByRole("button", { name: "Save & Close", exact: true }).click();
      const saved = await saving;
      expect(saved.status(), await saved.text()).toBe(200);
      const assignments = await api.get(`/api/tags/assignments?targetType=task&targetId=${encodeURIComponent(taskId)}`);
      expect(assignments.status()).toBe(200);
      expect((await assignments.json()).directTags.map((/** @type {{tag_id: string}} */ tag) => tag.tag_id)).toContain(tagId);
    } else {
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    }
    await opened;
    await expect(dialog).toHaveCount(0);
    await expect(files.locator("[data-task-files] > *")).toHaveCount(0);
    await expect(notes.locator(":scope > *")).toHaveCount(0);
  }
});
