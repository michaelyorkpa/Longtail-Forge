import { randomUUID } from "node:crypto";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
import { test, expect } from "./support/isolated-workspace.mjs";

test("Tasks surface datasets and existing status writes retain native SVG and opaque message behavior", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  await page.goto("/tasks.html");
  const reader = createProjectTextReader();
  const source = reader.readText("public/js/tasks.js");
  const surfaceFunctions = ["taskRowField", "writeTaskSurfaceData", "decorateTasksDeclarativeSurface"].map((name) => extractFunctionBlock(source, name)).join("\n");
  const statusSource = reader.readText("public/js/shared/page-controller.js");
  const statusFunction = ["writeStatusTone", "setStatus"].map((name) => extractFunctionBlock(statusSource, name)).join("\n");
  const taskStatusFunction = extractFunctionBlock(source, "setStatus");
  const result = await page.evaluate(({ surfaceFunctions, statusFunction, taskStatusFunction }) => {
    const { document } = globalThis;
    const decorate = new Function(`${surfaceFunctions}; return decorateTasksDeclarativeSurface;`)();
    const setStatus = new Function(`${statusFunction}; return setStatus;`)();
    const surface = document.createElement("section");
    const action = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    action.setAttribute("data-surface-action", "tasks.create");
    const main = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    main.classList.add("view-slideout-sidebar-main");
    surface.append(action, main);
    decorate(surface);
    const status = document.createElementNS("http://www.w3.org/2000/svg", "text");
    let conversions = 0;
    const message = { toString() { conversions += 1; return "opaque status"; } };
    setStatus(status, message, { isError: true });
    const first = { text: status.textContent, tone: status.dataset.statusTone, conversions };
    setStatus(status, 42); const numeric = status.textContent;
    setStatus(status, false); const falsy = status.textContent;
    setStatus(null, { toString() { throw new Error("absent status must not convert"); } });
    // Exercise the real Tasks forwarder, not only the shared writer. An alternate
    // Element can expose the same dataset capability without the focus mixin.
    /** @param {unknown} recipient */
    const forward = (recipient) => new Function("pageController", "taskStatus", "return (" + taskStatusFunction + ");")({ setStatus }, recipient);
    const alternate = Object.assign(document.createElementNS("urn:tasks-status", "status"), { dataset: document.createElement("p").dataset });
    forward(alternate)("alternate status", { isError: true });
    const alternateResult = { text: alternate.textContent, tone: alternate.dataset.statusTone, focus: "focus" in alternate };
    const bare = document.createElementNS("urn:tasks-status", "status");
    let bareFailure = "";
    try { forward(bare)("written before dataset failure"); }
    catch (error) { bareFailure = error instanceof Error ? error.name : typeof error; }
    forward(null)({ toString() { throw new Error("absent status must not convert"); } });
    return { action: action.dataset.addTask, main: main.dataset.tasksMainPanel, classAdded: main.classList.contains("tasks-main-list-panel"), first, numeric, falsy, alternateResult, bareResult: { text: bare.textContent, failure: bareFailure } };
  }, { surfaceFunctions, statusFunction, taskStatusFunction });
  expect(result).toEqual({ action: "", main: "", classAdded: true, first: { text: "opaque status", tone: "error", conversions: 1 }, numeric: "42", falsy: "", alternateResult: { text: "alternate status", tone: "error", focus: false }, bareResult: { text: "written before dataset failure", failure: "TypeError" } });
});


test("Tasks collection keeps real list/base/detail records and raw inserts through rendered consumers", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api } = isolatedWorkspace;
  const title = "Owned task " + testInfo.testId + " " + randomUUID();
  const clientReply = await api.post("/api/clients", { data: { name: title + " client" } });
  expect(clientReply.status()).toBe(201);
  const clientId = (await clientReply.json()).client.id;
  const projectReply = await api.post("/api/clients/" + clientId + "/projects", { data: { name: title + " project" } });
  expect(projectReply.status()).toBe(201);
  const projectId = (await projectReply.json()).project.id;
  const created = await api.post("/api/tasks", { data: { title, project_id: projectId, client_id: clientId } });
  expect(created.status()).toBe(201);
  const detail = await created.json();
  const taskId = detail.task.task_id;
  const timerReply = await api.put("/api/tasks/" + taskId + "/timer", { data: { timer_status: "paused", accumulated_elapsed_seconds: 5, last_active_start_time: new Date().toISOString() } });
  expect(timerReply.status(), await timerReply.text()).toBe(200);
  const base = await timerReply.json();
  const listReply = await api.get("/api/tasks?taskView=all&status=all");
  expect(listReply.status()).toBe(200);
  const list = await listReply.json();
  await page.goto("/tasks.html");
  await expect(page.locator("tr.task-density-row")).toContainText(title);
  const source = createProjectTextReader().readText("public/js/tasks.js");
  const boot = "  initializeTasksPage();";
  expect(source.split(boot)).toHaveLength(2);
  const registration = source.lastIndexOf('  requirePageController().register("tasks",');
  expect(registration).toBeGreaterThan(0);
  // Real controller declarations and consumers, without a second boot or registry mutation.
  const program = source.slice(0, registration).replace(boot, "") +
    "return { state, upsertTask, cacheTasksElements, renderTasks, formatDue, isTaskNestingKey }; })();";
  const result = await page.evaluate(({ program, detail, base, list, taskId }) => {
    const { document, window, HTMLInputElement } = globalThis;
    const f = new Function("return " + program)();
    const namespace = window.LongtailForge;
    if (!namespace?.taskRecords || !namespace.notificationSubscriptions) throw new Error("Task shared surfaces unavailable");
    const records = namespace.taskRecords;
    const row = () => {
      const element = document.querySelector("tr.task-density-row");
      if (!element) throw new Error("Task row missing");
      return element;
    };
    const readList = records.readTaskList(list);
    const listTask = readList.tasks.find((task) => task.task_id === taskId);
    const baseTask = records.readTask(base), detailTask = records.readTaskDetail(detail);
    if (!listTask || !baseTask || !detailTask || !readList.options) throw new Error("real producer records unavailable");
    f.state.options = readList.options;
    f.state.currentUserId = readList.currentUserId;
    f.state.selectedTaskIds.add(taskId);
    f.cacheTasksElements();
    const collection = f.state.tasks;
    const rendered = [];
    for (const task of [listTask, baseTask, detailTask]) {
      f.upsertTask(task); f.renderTasks();
      const titleButton = row().querySelector(".task-title-wrap button");
      const checkbox = row().querySelector("input[type=checkbox]");
      if (!titleButton || !(checkbox instanceof HTMLInputElement)) throw new Error("Task controls missing");
      rendered.push({ sameCollection: f.state.tasks === collection, sameTask: collection[0] === task, length: collection.length,
        title: titleButton.textContent,
        selected: checkbox.checked });
    }
    const raw = { task_id: taskId, title: "Raw callback seed" };
    f.upsertTask(raw); f.renderTasks();
    const rawRow = row().textContent;
    f.upsertTask(7); f.renderTasks();
    const primitive = { retained: collection[0] === 7, seedSame: collection[1] === raw, rows: document.querySelectorAll("tr.task-density-row").length };
    f.state.tasks = []; f.upsertTask(null);
    let refused = false;
    try { f.renderTasks(); } catch (error) { refused = error instanceof TypeError; }
    const nullCase = { retained: f.state.tasks[0] === null, refused, unchanged: row().textContent === rawRow };
    // Actual shared producers demonstrate the additional opaque-argument contract seams.
    const targetId = {};
    const targetIdentity = new Function("surface", "id", "return surface.taskTarget(id);")(namespace.notificationSubscriptions, targetId).targetId === targetId;
    /** @type {string[]} */ const conversions = [];
    const dateValue = { valueOf() { conversions.push("date"); return 0; } };
    const zone = { toString() { conversions.push("zone"); return "UTC"; } };
    const formatted = f.formatDue({ due_date: "date", due_time: "time", due_at_utc: dateValue, due_timezone: zone });
    return { rendered, primitive, nullCase, rawRow, targetIdentity, formatted, conversions, legacyObject: f.isTaskNestingKey(document.all) && new WeakMap().set(document.all, 1).has(document.all) };
  }, { program, detail, base, list, taskId });
  expect(result.rendered).toEqual(Array.from({ length: 3 }, () => ({ sameCollection: true, sameTask: true, length: 1, title, selected: true })));
  expect(result.rawRow).toContain("Raw callback seed");
  expect(result.rawRow).toContain("Unassigned");
  expect(result.primitive).toEqual({ retained: true, seedSame: true, rows: 1 });
  expect(result.nullCase).toEqual({ retained: true, refused: true, unchanged: true });
  expect(result.targetIdentity).toBe(true);
  expect(result.legacyObject).toBe(true);
  expect(result.formatted).toBe("1/1/70, 12:00:00 AM");
  expect(result.conversions).toEqual(["date", "zone"]);
  await page.screenshot({ path: testInfo.outputPath("raw-task-collection.png"), fullPage: true });
});
