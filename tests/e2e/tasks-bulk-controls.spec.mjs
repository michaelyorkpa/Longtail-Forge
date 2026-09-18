import { randomUUID } from "node:crypto";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
import { test, expect } from "./support/isolated-workspace.mjs";

test("bulk selection retains order, review cancels, and confirmed writes remain serial", async ({ isolatedWorkspace }) => {
  const { page, api } = isolatedWorkspace;
  const suffix = randomUUID();
  /** @type {{task_id:string,title:string}[]} */ const tasks = [];
  for (const [index, due_date] of ["2026-11-01", "2026-11-02"].entries()) {
    const created = await api.post("/api/tasks", { data: { title: `Bulk controls ${index} ${suffix}`, due_date } });
    expect(created.status()).toBe(201);
    tasks.push((await created.json()).task);
  }
  /** @type {{action:string,task_ids:string[]}[]} */ const writes = [];
  /** @type {string[]} */ const sequence = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/tasks/bulk") {
      const payload = request.postDataJSON();
      writes.push(payload);
      sequence.push(`start:${payload.action}`);
    }
  });
  page.on("response", (response) => {
    if (response.request().method() === "POST" && new URL(response.url()).pathname === "/api/tasks/bulk")
      sequence.push(`finish:${response.request().postDataJSON().action}`);
  });
  await page.goto("/tasks.html");
  for (const task of [...tasks].reverse())
    await page.getByRole("checkbox", { name: `Select ${task.title}`, exact: true }).check();
  const toolbar = page.locator("[data-task-bulk-toolbar]");
  await expect(toolbar).toHaveAttribute("open", "");
  await toolbar.locator("[data-task-bulk-priority]").selectOption("high");
  await toolbar.locator("[data-task-bulk-due-date]").fill("2026-11-03");
  await toolbar.locator("[data-task-bulk-lifecycle]").selectOption("archive");
  await toolbar.locator("[data-task-bulk-apply]").click();
  const confirmation = page.getByRole("dialog", { name: "Archive selected tasks?" });
  await expect(confirmation).toContainText("Selected tasks currently have different due dates. Archive 2 selected tasks? Archived tasks move to the Archived view and can be restored later.");
  await confirmation.getByRole("button", { name: "Review First", exact: true }).click();
  await expect(confirmation).not.toBeVisible();
  expect(writes).toEqual([]);
  for (const task of tasks)
    await expect(page.getByRole("checkbox", { name: `Select ${task.title}`, exact: true })).toBeChecked();
  await expect(toolbar.locator("[data-task-bulk-priority]")).toHaveValue("high");
  await toolbar.locator("[data-task-bulk-apply]").click();
  await confirmation.getByRole("button", { name: "Archive Tasks", exact: true }).click();
  await expect(page.locator(".view-list-shell-status[data-task-status]")).toContainText("Updated 6 task changes.");
  expect(writes.map((payload) => payload.action)).toEqual(["priority", "due_date", "archive"]);
  expect(writes[0].task_ids).toEqual(tasks.map((task) => task.task_id).reverse());
  expect(writes[1].task_ids).toEqual(writes[0].task_ids);
  expect(new Set(writes[2].task_ids)).toEqual(new Set(writes[0].task_ids));
  expect(sequence).toEqual(["start:priority", "finish:priority", "start:due_date", "finish:due_date", "start:archive", "finish:archive"]);
  await expect(toolbar.locator("[data-task-bulk-apply]")).toBeDisabled();
  for (const task of tasks) {
    const saved = await api.get(`/api/tasks/${task.task_id}`);
    expect(saved.status()).toBe(200);
    expect((await saved.json()).task).toMatchObject({ status: "archived", priority: "high", due_date: "2026-11-03" });
  }
});

test("bulk accessors establish real native controls across documents and refuse impostors", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  await page.goto("/tasks.html");
  const source = createProjectTextReader().readText("public/js/tasks.js");
  const names = ["requireBulkInput", "requireBulkSelect", "requireBulkButton", "requireBulkDetails", "requireBulkElement", "optionalBulkInput", "optionalBulkSelect"];
  const functions = names.map((name) => [name, extractFunctionBlock(source, name)]);
  const result = await page.evaluate((entries) => {
    const { document } = globalThis;
    const frame = document.createElement("iframe");
    document.body.append(frame);
    const foreign = frame.contentDocument;
    if (!foreign) throw new Error("iframe document missing");
    const detached = document.implementation.createHTMLDocument();
    const readers = Object.fromEntries(entries.map(([name, body]) => [name, new Function(`return (${body});`)()]));
    /** @type {string[]} */ const accepted = [];
    /** @type {string[]} */ const refused = [];
    for (const [name, tag] of [["requireBulkInput", "input"], ["requireBulkSelect", "select"], ["requireBulkButton", "button"], ["requireBulkDetails", "details"], ["requireBulkElement", "span"]]) {
      for (const [label, doc] of [["page", document], ["foreign", foreign], ["detached", detached]]) {
        if (typeof doc === "string") throw new Error("unexpected document label");
        const control = doc.createElement(tag);
        if (readers[name](control) === control) accepted.push(`${name}:${label}`);
      }
      for (const [label, control] of [["null", null], ["svg", document.createElementNS("http://www.w3.org/2000/svg", tag)], ["xml", document.createElementNS("urn:bulk-test", tag)]]) {
        try { readers[name](control); } catch (error) {
          if (!(error instanceof TypeError)) throw error;
          refused.push(`${name}:${label}`);
        }
      }
    }
    frame.remove();
    return { accepted, refused };
  }, functions);
  const required = names.slice(0, 5);
  expect(result.accepted).toEqual(required.flatMap((name) => ["page", "foreign", "detached"].map((label) => `${name}:${label}`)));
  expect(result.refused).toEqual(required.flatMap((name) => ["null", "svg", "xml"].map((label) => `${name}:${label}`)));
});
