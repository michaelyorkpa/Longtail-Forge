import { randomUUID } from "node:crypto";
import { expect, test } from "./support/isolated-workspace.mjs";

test("native Task controls retain inherited datasets, child dialogs and SVG focus", async ({ isolatedWorkspace }, testInfo) => {
  const { page } = isolatedWorkspace;
  await page.goto("/tasks.html");
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.window.LongtailForge?.tasksDialog))).toBe(true);
  const opened = page.evaluate(async (title) => {
    const editor = globalThis.window.LongtailForge?.tasksDialog;
    if (!editor) throw new Error("Task editor unavailable");
    return editor.openTaskEditor({ mode: "add", title });
  }, `DOM controls ${randomUUID().slice(0, 8)}`);
  const dialog = page.locator("dialog[data-task-dialog][open]");
  await expect(dialog).toBeVisible();
  expect(await dialog.locator("[data-task-form]").evaluate((form) => ({
    inherited: !Object.hasOwn(form, "dataset") && "dataset" in form,
    bound: form.getAttribute("data-task-dialog-bound"),
  }))).toEqual({ inherited: true, bound: "true" });

  await dialog.locator("[data-task-recurrence-panel] > summary").click();
  await dialog.locator("[data-task-recurring]").check();
  await dialog.locator("[data-task-recurrence-details]").click();
  const recurrence = page.locator("[data-task-recurrence-dialog]");
  await expect(recurrence).toBeVisible();
  await recurrence.locator("[data-task-recurrence-frequency]").selectOption("DAILY");
  await recurrence.locator("[data-task-recurrence-cancel]").click();
  await expect(recurrence).toBeHidden();

  await page.evaluate(() => {
    const tags = globalThis.document.querySelector("[data-task-tags-dialog]");
    if (!tags) throw new Error("Tags dialog unavailable");
    const svg = globalThis.document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("data-tag-picker-input", "");
    svg.setAttribute("data-task-svg-focus-probe", "");
    svg.setAttribute("tabindex", "0"); svg.setAttribute("width", "16"); svg.setAttribute("height", "16");
    const nativeFocus = svg.focus;
    svg.focus = function () { this.setAttribute("data-focused", "true"); nativeFocus.call(this); };
    tags.prepend(svg);
  });
  await dialog.locator("[data-task-tags-toggle]").click();
  const tags = page.locator("[data-task-tags-dialog]");
  await expect(tags).toBeVisible();
  const svg = tags.locator("[data-task-svg-focus-probe]");
  await expect(svg).toHaveAttribute("data-focused", "true");
  await expect(svg).toBeFocused();
  expect(await svg.evaluate((element) => element instanceof globalThis.SVGElement && !(element instanceof globalThis.HTMLElement))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("task-svg-focus.png"), fullPage: true });
  await svg.evaluate((element) => element.remove());
  await tags.locator("[data-task-tags-dialog-close]").click();
  await expect(tags).toBeHidden();
  await dialog.locator("[data-task-files-toggle]").click();
  const files = page.locator("[data-task-files-dialog]");
  await expect(files).toBeVisible();
  await expect(files.locator("[data-task-files-dialog-close]")).toBeFocused();
  await files.locator("[data-task-files-dialog-close]").click();
  await expect(files).toBeHidden();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await opened).toBe("cancel");
  await expect(dialog).toHaveCount(0);
});
