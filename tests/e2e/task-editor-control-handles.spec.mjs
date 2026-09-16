import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, test } from "./support/isolated-workspace.mjs";

const source = readFileSync(new URL("../../public/js/task-dialog.js", import.meta.url), "utf8");
const writer = source.slice(source.indexOf("    fields = {"), source.indexOf("    decorateTaskDialogControls();"));
const selectors = [...writer.matchAll(/(\w+): (dialog|recurrenceDialog|tagsDialog|filesDialog)\??\.querySelector\("([^"]+)"\)/g)]
  .map(([, name, scope, selector]) => ({ name: scope === "recurrenceDialog" ? `recurrence.${name}` : name, scope, selector }));
const declaration = source.slice(source.indexOf("@typedef {Object} TaskDialogFields"), source.indexOf("  let fields = {};"));
const declared = Object.fromEntries([...declaration.matchAll(/@property \{(HTML\w+) \| null\} \[(\w+)\]/g)].map(([, type, name]) => [name, type]));
for (const [, name, type] of declaration.matchAll(/(cancel|endDate|form|frequency|interval): (HTML\w+) \| null/g)) declared[`recurrence.${name}`] = type;

test("the real Task Dialog markup establishes all declared handle subtypes and native value coercion", async ({ isolatedWorkspace }, testInfo) => {
  expect(selectors).toHaveLength(67);
  expect(Object.keys(declared)).toHaveLength(67);
  const { page } = isolatedWorkspace;
  await page.goto("/tasks.html");
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.window.LongtailForge?.tasksDialog))).toBe(true);
  const opened = page.evaluate(async (title) => {
    const editor = globalThis.window.LongtailForge?.tasksDialog;
    if (!editor) throw new Error("Task editor unavailable");
    return editor.openTaskEditor({ mode: "add", title, defaults: { description: 42, nextAction: false, resumeNote: ["carried", "context"] } });
  }, `Handles ${randomUUID()}`);
  const dialog = page.locator("dialog[data-task-dialog][open]");
  await expect(dialog).toBeVisible();
  const controls = await page.evaluate((queries) => queries.map(({ name, scope, selector }) => {
    const shells = {
      dialog: "[data-task-dialog]", recurrenceDialog: "[data-task-recurrence-dialog]",
      tagsDialog: "[data-task-tags-dialog]", filesDialog: "[data-task-files-dialog]",
    };
    const shell = Object.entries(shells).find(([key]) => key === scope)?.[1];
    const element = shell ? globalThis.document.querySelector(shell)?.querySelector(selector) : null;
    return { name, constructor: element?.constructor.name, namespace: element?.namespaceURI };
  }), selectors);
  for (const control of controls) {
    expect(control.namespace, control.name).toBe("http://www.w3.org/1999/xhtml");
    if (declared[control.name] !== "HTMLElement") expect(control.constructor, control.name).toBe(declared[control.name]);
  }
  await expect(dialog.locator("[data-task-description]")).toHaveValue("42");
  await expect(dialog.locator("[data-task-next-action]")).toHaveValue("");
  await expect(dialog.locator("[data-task-resume-note]")).toHaveValue("carried,context");
  await dialog.locator("[data-task-recurrence-panel] > summary").click();
  await dialog.locator("[data-task-recurring]").check();
  await dialog.locator("[data-task-recurrence-details]").click();
  const recurrence = page.locator("[data-task-recurrence-dialog]");
  await expect(recurrence).toBeVisible();
  await recurrence.locator("[data-task-recurrence-frequency]").selectOption("DAILY");
  await recurrence.locator("[data-task-recurrence-interval]").fill("3");
  await recurrence.getByRole("button", { name: "Save Recurrence", exact: true }).click();
  await expect(recurrence).toBeHidden();
  await expect(dialog.locator("[data-task-recurrence-summary]")).toContainText("3");
  await page.screenshot({ path: testInfo.outputPath("typed-handles.png"), fullPage: true });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await opened).toBe("cancel");
});
