import { extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
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

/** @type {Record<string, string>} */
const nativeMarkupTypes = {
  "assignees": "HTMLSelectElement",
  "block": "HTMLButtonElement",
  "cancel": "HTMLButtonElement",
  "client": "HTMLSelectElement",
  "checklistAdd": "HTMLButtonElement",
  "checklistField": "HTMLDetailsElement",
  "checklistInput": "HTMLInputElement",
  "checklistList": "HTMLElement",
  "checklistStatus": "HTMLElement",
  "complete": "HTMLButtonElement",
  "copyLink": "HTMLButtonElement",
  "description": "HTMLTextAreaElement",
  "dueDate": "HTMLInputElement",
  "dueTime": "HTMLInputElement",
  "estimate": "HTMLInputElement",
  "effectiveReminders": "HTMLElement",
  "fileContainer": "HTMLElement",
  "fileDialogClose": "HTMLElement",
  "fileToggle": "HTMLButtonElement",
  "notesContainer": "HTMLElement",
  "notesPanel": "HTMLDetailsElement",
  "priority": "HTMLSelectElement",
  "project": "HTMLSelectElement",
  "parentTask": "HTMLSelectElement",
  "recurrenceDetails": "HTMLButtonElement",
  "recurrenceContinuity": "HTMLElement",
  "recurrenceSkipCurrent": "HTMLButtonElement",
  "recurrenceField": "HTMLElement",
  "recurrenceSummary": "HTMLElement",
  "recurring": "HTMLInputElement",
  "reminderDateOnlyDays1": "HTMLInputElement",
  "reminderDateOnlyDays2": "HTMLInputElement",
  "reminderDateOnlyDays2Enabled": "HTMLInputElement",
  "reminderDateTimeHours1": "HTMLInputElement",
  "reminderDateTimeHours2": "HTMLInputElement",
  "reminderDateTimeHours2Enabled": "HTMLInputElement",
  "reminderOverride": "HTMLInputElement",
  "reminderOverrideFields": "HTMLElement",
  "status": "HTMLSelectElement",
  "tagContainer": "HTMLElement",
  "tagDialogClose": "HTMLElement",
  "tagToggle": "HTMLButtonElement",
  "taskDetailsPanel": "HTMLDetailsElement",
  "notificationToggle": "HTMLButtonElement",
  "blockedReason": "HTMLTextAreaElement",
  "blockedReasonField": "HTMLElement",
  "continuityRow": "HTMLElement",
  "metadataRibbon": "HTMLElement",
  "nextAction": "HTMLTextAreaElement",
  "resumeNote": "HTMLTextAreaElement",
  "save": "HTMLButtonElement",
  "saveClose": "HTMLButtonElement",
  "timerDisplay": "HTMLElement",
  "timerField": "HTMLElement",
  "timerFinalize": "HTMLButtonElement",
  "timerPause": "HTMLButtonElement",
  "timerReset": "HTMLButtonElement",
  "timerStart": "HTMLButtonElement",
  "timerStatus": "HTMLElement",
  "title": "HTMLElement",
  "titleInput": "HTMLInputElement",
  "workbenchOpen": "HTMLButtonElement",
  "recurrence.cancel": "HTMLElement",
  "recurrence.endDate": "HTMLInputElement",
  "recurrence.form": "HTMLElement",
  "recurrence.frequency": "HTMLSelectElement",
  "recurrence.interval": "HTMLInputElement"
};

test("the real Task Dialog markup preserves native controls without declaring unchecked subtypes", async ({ isolatedWorkspace }, testInfo) => {
  expect(selectors).toHaveLength(67);
  expect(Object.keys(declared)).toHaveLength(67);
  expect(Object.values(declared).every((type) => type === "HTMLElement")).toBe(true);
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
    if (nativeMarkupTypes[control.name] !== "HTMLElement") expect(control.constructor, control.name).toBe(nativeMarkupTypes[control.name]);
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


test("foreign-realm icon buttons and alternate host value controls retain their behavior", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  await page.goto("/tasks.html");
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.window.LongtailForge?.tasksDialog))).toBe(true);
  const helper = extractFunctionBlock(source, "requireTaskIconButton");
  const proof = await page.evaluate((helperSource) => {
    const readButton = new Function("return (" + helperSource + ")")();
    const frame = globalThis.document.createElement("iframe");
    globalThis.document.body.append(frame);
    try {
      const document = frame.contentDocument;
      const icons = globalThis.window.LongtailForge?.icons;
      if (!document || !icons) throw new Error("Icon proof unavailable");
      const foreign = document.createElement("button");
      const foreignIdentity = readButton(foreign) === foreign;
      const decorated = icons.decorateButton(readButton(foreign), { icon: "save", label: "Foreign", text: "Foreign" });
      const errors = [];
      for (const input of [null, globalThis.document.createElement("input"), globalThis.document.createElementNS("http://www.w3.org/2000/svg", "svg")]) {
        try { readButton(input); errors.push("accepted"); } catch (error) { if (!(error instanceof Error)) throw error; errors.push(error.message); }
      }
      return { foreignIdentity, sameRealm: foreign instanceof globalThis.HTMLButtonElement, decoratedIdentity: decorated === foreign, errors };
    } finally { frame.remove(); }
  }, helper);
  expect(proof).toEqual({ foreignIdentity: true, sameRealm: false, decoratedIdentity: true, errors: Array(3).fill("decorateButton requires a button element.") });
  await expect(page.locator("[data-task-title]")).toHaveCount(1);
  await page.evaluate(() => {
    const input = globalThis.document.querySelector("[data-task-title]");
    if (!input) throw new Error("Task title unavailable");
    const alternate = globalThis.document.createElement("textarea");
    for (const attr of input.attributes) alternate.setAttribute(attr.name, attr.value);
    input.replaceWith(alternate);
  });
  const opened = page.evaluate(() => {
    const editor = globalThis.window.LongtailForge?.tasksDialog;
    if (!editor) throw new Error("Task editor unavailable");
    return editor.openTaskEditor({ mode: "add" });
  });
  const dialog = page.locator("dialog[data-task-dialog][open]");
  await expect(dialog).toBeVisible();
  const title = "Alternate host " + randomUUID();
  await dialog.locator("textarea[data-task-title]").fill(title);
  const saved = page.waitForResponse((response) => response.url().endsWith("/api/tasks") && response.request().method() === "POST");
  await dialog.getByRole("button", { name: "Save & Close", exact: true }).click();
  const response = await saved;
  expect(response.status()).toBe(201);
  expect((await response.json()).task.title).toBe(title);
  expect(await opened).toBe("complete");
});
