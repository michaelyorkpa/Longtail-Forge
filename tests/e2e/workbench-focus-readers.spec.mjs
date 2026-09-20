import { test, expect } from "./support/isolated-workspace.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

test("Task Focus reads real task summary, context, due and tag records", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api } = isolatedWorkspace;
  const clientResponse = await api.post("/api/clients", { data: { name: "Focus Client" } });
  expect(clientResponse.status(), await clientResponse.text()).toBe(201);
  const clientId = (await clientResponse.json()).client.id;
  const projectResponse = await api.post(`/api/clients/${clientId}/projects`, { data: { name: "Focus Project" } });
  expect(projectResponse.status(), await projectResponse.text()).toBe(201);
  const projectId = (await projectResponse.json()).project.id;
  const tagResponse = await api.post("/api/tags", { data: { name: "Focus Tag" } });
  expect(tagResponse.status(), await tagResponse.text()).toBe(201);
  const tagId = (await tagResponse.json()).tag.tag_id;
  expect(tagId).toBeTruthy();
  const taskResponse = await api.post("/api/tasks", { data: {
    title: "Focus reader proof", client_id: clientId, project_id: projectId,
    priority: "high", due_date: "2026-12-20", due_time: "10:30", tagIds: [tagId],
  } });
  expect(taskResponse.status(), await taskResponse.text()).toBe(201);
  const taskId = (await taskResponse.json()).task.task_id;
  /** @type {string[]} */ const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/workbench.html?taskId=${encodeURIComponent(taskId)}`);
  const summary = page.locator("[data-workbench-task-focus-summary]");
  await expect(summary.getByRole("heading", { name: "Focus reader proof" })).toBeVisible();
  await expect(summary.getByText("Focus Client / Focus Project", { exact: true })).toBeVisible();
  await expect(summary.locator(".workbench-badge")).toHaveText(["Open", "High", "Due 2026-12-20 10:30", "Focus Tag"]);
  await expect(summary).not.toContainText(taskId);
  await expect(summary).not.toContainText(clientId);
  await expect(summary).not.toContainText(projectId);
  await expect(page.getByRole("button", { name: "Change Focus", exact: true })).toBeVisible();
  const badgeFunction = extractFunctionBlock(createProjectTextReader().readText("public/js/workbench.js"), "badge");
  const native = await page.evaluate(code => {
    const badge = new Function(code + ";return badge;")();
    /** @type {string[]} */ const calls = [];
    const type = { toString() { calls.push("type"); return ""; } };
    const label = { toString() { calls.push("label"); return "Converted"; } };
    const element = badge(label, type);
    const withoutType = badge(null, false);
    let symbolRefused = false;
    try { badge("text", Symbol("type")); } catch (error) { symbolRefused = error instanceof TypeError; }
    return { calls, text: element.textContent, type: element.getAttribute("data-badge-type"), noType: withoutType.hasAttribute("data-badge-type"), empty: withoutType.textContent, symbolRefused };
  }, badgeFunction);
  expect(native).toEqual({ calls: ["type", "label"], text: "Converted", type: "", noType: false, empty: "", symbolRefused: true });
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("workbench-focus-summary.png"), fullPage: true });
});
