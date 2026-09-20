import { test, expect } from "./support/isolated-workspace.mjs";

test("Task Focus groups real linked notes and opens the read-only Notes action", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api } = isolatedWorkspace;
  const taskResponse = await api.post("/api/tasks", { data: { title: "Related context task" } });
  expect(taskResponse.status(), await taskResponse.text()).toBe(201);
  const taskId = (await taskResponse.json()).task.task_id;
  for (const title of ["Context note Alpha", "Context note Beta"]) {
    const noteResponse = await api.post("/api/notes", { data: { title, bodyMarkdown: "Related **working context**" } });
    expect(noteResponse.status(), await noteResponse.text()).toBe(201);
    const noteId = (await noteResponse.json()).note.note_id;
    const linked = await api.post(`/api/notes/${noteId}/links`, { data: { moduleId: "tasks", targetType: "task", targetId: taskId } });
    expect(linked.ok(), await linked.text()).toBe(true);
  }
  const read = await api.get(`/api/workbench/task-focus/${taskId}/related-context`);
  expect(read.status(), await read.text()).toBe(200);
  const payload = await read.json();
  const linkedGroup = payload.groups.find((/** @type {{id: string}} */ group) => group.id === "linked-notes");
  expect(linkedGroup.count).toBe(2);
  const titles = linkedGroup.items.map((/** @type {{title: string}} */ item) => item.title);
  /** @type {string[]} */ const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/workbench.html?taskId=${encodeURIComponent(taskId)}`);
  const inspectorButton = page.getByRole("button", { name: "Open Inspector", exact: true });
  if (testInfo.project.name === "mobile") await inspectorButton.click();
  const group = page.locator('[data-workbench-related-context-group="linked-notes"]');
  await expect(group).toBeVisible();
  await expect(group.locator(".workbench-count")).toHaveText("2");
  await expect(group.locator(".workbench-inspector-title")).toHaveText(titles);
  await expect(group).not.toContainText(taskId);
  const first = group.locator(".workbench-inspector-title").first();
  await expect(first).toHaveAttribute("data-workbench-related-context-action", "notes.view");
  await first.click();
  const viewer = page.locator("[data-note-view-dialog]");
  await expect(viewer).toBeVisible();
  await expect(viewer.locator(".notes-view-rendered-body strong")).toHaveText("working context");
  await expect(page.locator("[data-note-dialog]")).not.toBeVisible();
  await viewer.locator('[data-note-view-action="close"]').click();
  await expect(viewer).not.toBeVisible();
  await expect(first).toBeFocused();
  // Task Focus consumes its deep-link parameter before loading the task.
  await expect(page).toHaveURL(/\/workbench\.html$/);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("related-context.png"), fullPage: true });
});
