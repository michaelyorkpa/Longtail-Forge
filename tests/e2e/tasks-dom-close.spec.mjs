import { randomUUID } from "node:crypto";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
import { test, expect } from "./support/isolated-workspace.mjs";

test("Tasks DOM reads retain native, foreign, detached and alternate host capabilities", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  await page.goto("/tasks.html");
  const source = createProjectTextReader().readText("public/js/tasks.js");
  const functions = ["taskControlValue", "taskOptionalControlField", "taskWorkspaceSelectionText", "requireTaskElement", "renderTaskPagination", "setClientScopeControlsVisible"].map(name => extractFunctionBlock(source, name)).join("\n");
  const result = await page.evaluate(functions => {
    const doc = globalThis.document;
    const frame = doc.createElement("iframe"); doc.body.append(frame);
    try {
      if (!frame.contentDocument) throw new Error("Foreign document missing");
      const answers = [doc, frame.contentDocument, doc.implementation.createHTMLDocument("")].map(owner => {
        const input = owner.createElement("input"), select = owner.createElement("select"), option = owner.createElement("option"), textarea = owner.createElement("textarea");
        input.value = "input"; textarea.value = "textarea"; option.value = "select"; option.textContent = " Workspace "; select.append(option);
        const panel = owner.createElement("div"), button = owner.createElement("button"), summary = owner.createElement("span");
        const state = { tasks: [1, 2], pagination: { hasMore: true, nextCursor: "cursor" } };
        const f = new Function("state", "taskPagination", "loadMoreTasksButton", "taskPageSummary", functions + ";return {taskControlValue, taskWorkspaceSelectionText, renderTaskPagination};")(state, panel, button, summary);
        const values = [input, select, textarea, null, owner.createElement("div")].map(control => f.taskControlValue(control) ?? "absent");
        f.renderTaskPagination(); const available = { hidden: panel.hidden, disabled: button.disabled, text: summary.textContent };
        state.pagination.nextCursor = ""; f.renderTaskPagination();
        const exhausted = { hidden: panel.hidden, disabled: button.disabled, text: summary.textContent };
        const alternate = owner.createElementNS("urn:task-dom", "control");
        let reads = 0;
        Object.defineProperty(alternate, "value", { get() { reads++; if (this !== alternate) throw new Error("wrong receiver"); return input; } });
        return { values, label: f.taskWorkspaceSelectionText(select), available, exhausted, alternateIdentity: f.taskControlValue(alternate) === input, reads };
      });
      // The visibility assignment was never HTML-only; preserve expandos on SVG too.
      const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("data-client-workspace-control", "");
      const host = doc.createElement("section"); host.append(svg);
      const f = new Function("document", functions + "; return {setClientScopeControlsVisible};")(host);
      f.setClientScopeControlsVisible(false); const hidden = Reflect.get(svg, "hidden");
      f.setClientScopeControlsVisible(true);
      return { answers, svg: [hidden, Reflect.get(svg, "hidden")] };
    } finally { frame.remove(); }
  }, functions);
  expect(result.answers).toEqual(Array.from({ length: 3 }, () => ({
    values: ["input", "select", "textarea", "absent", "absent"], label: "Workspace",
    available: { hidden: false, disabled: false, text: "2 shown" },
    exhausted: { hidden: true, disabled: true, text: "" }, alternateIdentity: true, reads: 1,
  })));
  expect(result.svg).toEqual([true, false]);
});

test("Tasks real cursor pages retain row order, pagination controls and status completion", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api } = isolatedWorkspace;
  const suffix = randomUUID();
  const titles = [0, 1, 2].map(i => "DOM page " + suffix + " " + i);
  for (const title of titles) {
    const created = await api.post("/api/tasks", { data: { title } });
    expect(created.status(), await created.text()).toBe(201);
  }
  const firstResponse = await api.get("/api/tasks?task_view=all&status=active&sort=due_at&limit=1");
  expect(firstResponse.status()).toBe(200);
  const firstPage = await firstResponse.json();
  await page.goto("/tasks.html");
  await expect(page.locator("[data-task-view-selector]")).toBeAttached();
  await expect(page.locator("[data-task-list] > tr")).toHaveCount(3);
  const source = createProjectTextReader().readText("public/js/tasks.js");
  const boot = "  initializeTasksPage();";
  expect(source.split(boot)).toHaveLength(2);
  const registration = source.lastIndexOf('  requirePageController().register("tasks",');
  expect(registration).toBeGreaterThan(0);
  const program = source.slice(0, registration).replace(boot, "") + "return {state, cacheTasksElements, renderTasks, loadMoreTasks}; })();";
  const firstTitle = await page.evaluate(({ program, firstPage }) => {
    const namespace = globalThis.window.LongtailForge;
    if (!namespace?.taskRecords) throw new Error("Task records unavailable");
    const records = namespace.taskRecords.readTaskList(firstPage);
    const f = new Function("return " + program)();
    f.cacheTasksElements();
    Object.assign(f.state, { tasks: records.tasks, options: records.options, pagination: records.pagination, currentUserId: records.currentUserId, quickFilter: "all" });
    f.renderTasks();
    Reflect.set(globalThis.window, "taskDomCloseProof", f);
    return records.tasks[0].title;
  }, { program, firstPage });
  await expect(page.locator("tr.task-density-row")).toHaveCount(1);
  await expect(page.locator("[data-task-page-summary]")).toHaveText("1 shown");
  await expect(page.locator("[data-task-load-more]")).toBeVisible();
  await expect(page.locator("[data-task-load-more]")).toBeEnabled();
  const nextPage = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === "/api/tasks" && response.request().method() === "GET" && Boolean(url.searchParams.get("cursor"));
  });
  // Invoke the actual load-more listener body on the isolated lifted controller; all reads are real.
  await page.evaluate(() => Reflect.get(globalThis.window, "taskDomCloseProof").loadMoreTasks());
  expect((await nextPage).status()).toBe(200);
  await expect(page.locator("tr.task-density-row")).toHaveCount(3);
  await expect(page.locator("tr.task-density-row").first()).toContainText(firstTitle);
  for (const title of titles) await expect(page.locator("[data-task-list]")).toContainText(title);
  await expect(page.locator("[data-task-pagination]")).toBeHidden();
  await expect(page.locator("[data-task-load-more]")).toBeHidden();
  await expect(page.locator("[data-task-load-more]")).toBeDisabled();
  await expect(page.locator("[data-task-page-summary]")).toHaveText("");
  await expect(page.locator("[data-task-status][role=status]")).toHaveText("");
  await page.evaluate(() => Reflect.deleteProperty(globalThis.window, "taskDomCloseProof"));
  await page.screenshot({ path: testInfo.outputPath("task-dom-pagination.png"), fullPage: true });
});
