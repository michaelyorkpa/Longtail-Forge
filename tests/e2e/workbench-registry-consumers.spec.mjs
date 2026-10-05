import { test, expect } from "./support/isolated-workspace.mjs";

test("cached cards without moduleId dispatch real loads before bootstrap and reconcile afterward", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api, workspaceId } = isolatedWorkspace;
  const client = await api.post("/api/clients", { data: { name: "Registry timer client" } });
  expect(client.status(), await client.text()).toBe(201);
  const clientId = (await client.json()).client.id;
  const project = await api.post(`/api/clients/${clientId}/projects`, { data: { name: "Registry timer project" } });
  expect(project.status(), await project.text()).toBe(201);
  const projectId = (await project.json()).project.id;
  const task = await api.post("/api/tasks", { data: { title: "Cached registry timer", client_id: clientId, project_id: projectId } });
  expect(task.status(), await task.text()).toBe(201);
  const id = (await task.json()).task.task_id;
  const timer = await api.put(`/api/tasks/${id}/timer`, { data: { timer_status: "paused", accumulated_elapsed_seconds: 12 } });
  expect(timer.status(), await timer.text()).toBe(200);
  /** @type {string[]} */ const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/dashboard.html");
  await expect.poll(() => page.evaluate(() => JSON.parse(globalThis.localStorage.getItem("lf_workspace_context") || "null")?.workspaceId)).toBe(workspaceId);
  await page.goto("/workbench.html");
  await expect(page.locator(".workbench-timer-card")).toContainText("Cached registry timer");
  const listRoute = await page.evaluate(() => {
    const key = Object.keys(globalThis.sessionStorage).find(key => key.endsWith(":workbench:registry"));
    if (!key) throw new Error("scoped registry required");
    const entry = JSON.parse(globalThis.sessionStorage.getItem(key) || "null");
    const card = entry.data.workbenchCards.find((/** @type {{renderer: unknown}} */ card) => card.renderer === "active-work-timers");
    if (!card || typeof card.listRoute !== "string") throw new Error("real timer contribution required");
    delete card.moduleId;
    globalThis.sessionStorage.setItem(key, JSON.stringify(entry));
    return card.listRoute;
  });
  let release = () => {};
  const gate = new Promise(resolve => { release = () => resolve(undefined); });
  let bootstrapReleased = false;
  await page.route("**/api/workbench/bootstrap", async route => {
    const response = await route.fetch();
    await gate;
    bootstrapReleased = true;
    await route.fulfill({ response });
  });
  const sourceResponse = page.waitForResponse(response => new URL(response.url()).pathname === listRoute && response.request().method() === "GET");
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    const response = await sourceResponse;
    expect(response.status()).toBe(200);
    expect(bootstrapReleased).toBe(false);
    expect((await response.json()).timers.some((/** @type {{source_id: unknown}} */ timer) => timer.source_id === id)).toBe(true);
  } finally { release(); }
  await expect(page.locator(".workbench-timer-card")).toHaveCount(1);
  await expect(page.locator(".workbench-timer-card")).toContainText("Cached registry timer");
  await expect(page.locator(".workbench-duration")).toHaveText("00:00:12");
  await expect.poll(() => page.evaluate(() => {
    const key = Object.keys(globalThis.sessionStorage).find(key => key.endsWith(":workbench:registry"));
    const data = JSON.parse(globalThis.sessionStorage.getItem(key || "") || "null");
    return data?.data?.workbenchCards?.some((/** @type {{renderer: unknown, moduleId: unknown}} */ card) => card.renderer === "active-work-timers" && typeof card.moduleId === "string");
  })).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("reconciled-cache.png"), fullPage: true });
});
