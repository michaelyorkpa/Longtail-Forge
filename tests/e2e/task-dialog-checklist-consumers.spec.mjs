import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
import { expect, test } from "./support/isolated-workspace.mjs";

test("Checklist edits, focus, ordering and removal use real writes and preserve progress", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api } = isolatedWorkspace;
  const created = await api.post("/api/tasks", { data: { title: `Checklist ${randomUUID()}` } });
  expect(created.status(), await created.text()).toBe(201);
  const task = (await created.json()).task;
  const path = `/api/tasks/${task.task_id}/checklist`;
  /** @type {{ method: string, path: string, data: unknown }[]} */ const writes = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith(path) && request.method() !== "GET")
      writes.push({ method: request.method(), path: new URL(request.url()).pathname, data: request.postData() ? request.postDataJSON() : null });
  });
  await page.goto(`/tasks.html?task=${encodeURIComponent(task.task_id)}`);
  const dialog = page.locator("dialog[data-task-dialog][open]");
  await expect(dialog).toBeVisible();
  const field = dialog.locator("[data-task-checklist-field]");
  await field.locator("summary").click();
  const input = field.locator("[data-task-checklist-input]");
  const rows = field.locator("[data-task-checklist-item]");
  for (const [index, label] of ["First", "Second"].entries()) {
    await input.fill(label);
    const response = page.waitForResponse((r) => new URL(r.url()).pathname === path && r.request().method() === "POST");
    await field.getByRole("button", { name: "Add checklist item" }).click();
    expect((await response).status()).toBe(201);
    await expect(rows).toHaveCount(index + 1);
  }
  const firstId = await rows.first().getAttribute("data-task-checklist-item");
  const secondId = await rows.last().getAttribute("data-task-checklist-item");
  const first = field.locator(`[data-task-checklist-item="${firstId}"]`);
  await expect(first.getByRole("button", { name: "Move checklist item up" })).toBeDisabled();
  const label = first.getByRole("textbox", { name: "Checklist item label" });
  await label.fill("   ");
  await first.getByRole("button", { name: "Save checklist item" }).click();
  await expect(label).toBeFocused();
  expect(writes).toHaveLength(2);
  await label.fill("  Renamed  ");
  const saved = page.waitForResponse((r) => new URL(r.url()).pathname === `${path}/${firstId}` && r.request().method() === "PUT");
  await first.getByRole("button", { name: "Save checklist item" }).click();
  expect((await saved).status()).toBe(200);
  await expect(label).toHaveValue("Renamed");
  await expect(field.locator("[data-task-checklist-status]")).toHaveText("0 / 2 complete. Next: Renamed");
  const checked = page.waitForResponse((r) => new URL(r.url()).pathname === `${path}/${firstId}/check`);
  await first.getByRole("checkbox").check();
  expect((await checked).status()).toBe(200);
  await expect(field.locator("[data-task-checklist-status]")).toHaveText("1 / 2 complete. Next: Second");
  const reordered = page.waitForResponse((r) => new URL(r.url()).pathname === `${path}/reorder`);
  await first.getByRole("button", { name: "Move checklist item down" }).click();
  expect((await reordered).status()).toBe(200);
  await expect(rows.first()).toHaveAttribute("data-task-checklist-item", secondId || "");
  await first.getByRole("button", { name: "Remove checklist item" }).click();
  const confirm = page.getByRole("dialog", { name: "Remove checklist item" });
  await expect(confirm).toContainText('Remove "Renamed" from this task?');
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(writes).toHaveLength(5);
  await first.getByRole("button", { name: "Remove checklist item" }).click();
  const removed = page.waitForResponse((r) => new URL(r.url()).pathname === `${path}/${firstId}` && r.request().method() === "DELETE");
  await confirm.getByRole("button", { name: "Remove", exact: true }).click();
  expect((await removed).status()).toBe(200);
  await expect(rows).toHaveCount(1);
  await expect(field.locator("[data-task-checklist-status]")).toHaveText("0 / 1 complete. Next: Second");
  expect(writes).toEqual([
    { method: "POST", path, data: { label: "First" } }, { method: "POST", path, data: { label: "Second" } },
    { method: "PUT", path: `${path}/${firstId}`, data: { label: "Renamed" } },
    { method: "POST", path: `${path}/${firstId}/check`, data: {} },
    { method: "POST", path: `${path}/reorder`, data: { item_ids: [secondId, firstId] } },
    { method: "DELETE", path: `${path}/${firstId}`, data: null },
  ]);
  const persisted = await api.get(`/api/tasks/${task.task_id}`);
  expect(persisted.status()).toBe(200);
  expect((await persisted.json()).task.checklistItems.map((/** @type {{label: unknown}} */ item) => item.label)).toEqual(["Second"]);
  await page.screenshot({ path: testInfo.outputPath("checklist.png"), fullPage: true });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("Lifted checklist row keeps native dataset/input conversion and foreign element focus", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  await page.goto("/tasks.html");
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.window.LongtailForge?.icons))).toBe(true);
  const source = await readFile(new URL("../../public/js/task-dialog.js", import.meta.url), "utf8");
  const names = ["taskProjectionFields", "optionalTaskProjectionFields", "callTaskContextCollection", "checklistItemRow", "checklistActionButton", "checklistActionIcon", "saveChecklistItemLabel"];
  const code = names.map((name) => extractFunctionBlock(source, name)).join("\n");
  const result = await page.evaluate(async (functions) => {
    // This probe uses actual native setters, not the shared DOM double's stored values.
    const run = new Function("document", "namespace", "requireApi", `${functions}; return { checklistItemRow, saveChecklistItemLabel };`);
    const lifted = run(globalThis.document, globalThis.window.LongtailForge, () => ({}));
    const row = lifted.checklistItemRow({ task_checklist_item_id: undefined, label: 42, is_checked: "yes" }, 0, 1);
    const nullId = lifted.checklistItemRow({ task_checklist_item_id: null, label: false }, 0, 1);
    let symbolRefused = false;
    try { lifted.checklistItemRow({ task_checklist_item_id: Symbol("id") }, 0, 1); } catch (error) { symbolRefused = error instanceof TypeError; }
    const svg = globalThis.document.createElementNS("http://www.w3.org/2000/svg", "svg");
    Reflect.set(svg, "value", " ");
    let focused = 0; let receiver = false;
    Reflect.set(svg, "focus", /** @this {unknown} */ function () { focused++; receiver = this === svg; });
    await lifted.saveChecklistItemLabel({ querySelector: () => svg }, "unused");
    return { id: row.dataset.taskChecklistItem, value: row.children[1].value, checked: row.children[0].checked, nullId: nullId.dataset.taskChecklistItem, falsyLabel: nullId.children[1].value, symbolRefused, focused, receiver };
  }, code);
  expect(result).toEqual({ id: "undefined", value: "42", checked: true, nullId: "null", falsyLabel: "", symbolRefused: true, focused: 1, receiver: true });
});
