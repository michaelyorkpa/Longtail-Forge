import { randomUUID } from "node:crypto";
import { expect, test } from "./support/isolated-workspace.mjs";

test("Existing option producer preserves native setter inputs and their evaluation order", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  await page.goto("/tasks.html");
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.window.LongtailForge?.pageController))).toBe(true);
  const result = await page.evaluate(() => {
    const producer = globalThis.window.LongtailForge?.pageController;
    if (!producer) throw new Error("Option producer unavailable");
    /** @type {string[]} */ const calls = [];
    const create = globalThis.document.createElement;
    globalThis.document.createElement = function (/** @type {unknown[]} */ ...args) { calls.push("create"); return Reflect.apply(create, this, args); };
    try {
      const value = { [Symbol.toPrimitive](/** @type {string} */ hint) { calls.push(`value:${hint}`); return 42; } };
      const label = { [Symbol.toPrimitive](/** @type {string} */ hint) { calls.push(`label:${hint}`); return "Label"; } };
      const option = Reflect.apply(producer.createOption, producer, [value, label]);
      const ordered = [...calls];
      const nullable = Reflect.apply(producer.createOption, producer, [null, null]);
      return { ordered, value: option.value, label: option.textContent, nullValue: nullable.value, nullLabel: nullable.textContent };
    } finally {
      globalThis.document.createElement = create;
    }
  });
  expect(result).toEqual({ ordered: ["create", "value:string", "label:string"], value: "42", label: "Label", nullValue: "null", nullLabel: "" });
});

test("Task focus tables open the intended panel and nested checklist icons save once", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api } = isolatedWorkspace;
  const created = await api.post("/api/tasks", { data: { title: `Task tail ${randomUUID()}` } });
  expect(created.status(), await created.text()).toBe(201);
  const taskId = (await created.json()).task.task_id;
  const added = await api.post(`/api/tasks/${taskId}/checklist`, { data: { label: "Before" } });
  expect(added.status(), await added.text()).toBe(201);
  const itemId = (await added.json()).item.task_checklist_item_id;
  await page.goto("/tasks.html");
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.window.LongtailForge?.tasksDialog))).toBe(true);
  for (const [focusTarget, selector] of [["due_date", "[data-task-due-date]"], ["next_action", "[data-task-next-action]"], ["toString", "[data-task-title]"]]) {
    const opened = page.evaluate(async ({ taskId, focusTarget }) => {
      const editor = globalThis.window.LongtailForge?.tasksDialog;
      if (!editor) throw new Error("Task editor unavailable");
      return editor.openTaskEditor({ taskId, mode: "edit", focusTarget });
    }, { taskId, focusTarget });
    const dialog = page.locator("dialog[data-task-dialog][open]");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(selector)).toBeFocused();
    if (focusTarget !== "toString") await expect(dialog.locator("[data-task-details-panel]")).toHaveAttribute("open", "");
    if (focusTarget === "next_action") {
      const row = dialog.locator(`[data-task-checklist-item="${itemId}"]`);
      await row.getByRole("textbox", { name: "Checklist item label" }).fill("After");
      /** @type {string[]} */ const writes = [];
      page.on("request", (request) => {
        if (new URL(request.url()).pathname === `/api/tasks/${taskId}/checklist/${itemId}` && request.method() === "PUT") writes.push(request.postData() || "");
      });
      const response = page.waitForResponse((r) => new URL(r.url()).pathname === `/api/tasks/${taskId}/checklist/${itemId}` && r.request().method() === "PUT");
      await row.getByRole("button", { name: "Save checklist item" }).locator("svg").click();
      expect((await response).status()).toBe(200);
      await expect(row.getByRole("textbox", { name: "Checklist item label" })).toHaveValue("After");
      expect(writes.map((body) => JSON.parse(body))).toEqual([{ label: "After" }]);
      await page.screenshot({ path: testInfo.outputPath("task-tail-focus.png"), fullPage: true });
    }
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(await opened).toBe("cancel");
  }
});
