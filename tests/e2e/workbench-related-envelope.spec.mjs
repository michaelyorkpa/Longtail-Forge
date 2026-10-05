import { test, expect } from "./support/isolated-workspace.mjs";

/** @type {[string, unknown, string][]} */
const cases = [
  ["null response", null, "Related task context could not be loaded."],
  ["null group", { groups: [null] }, "Related task context could not be loaded."],
  ["absent groups", {}, "No related task context is available yet."],
  ["empty groups", { groups: [] }, "No related task context is available yet."],
];
for (const [label, payload, message] of cases) {
  test(`Task Focus Inspector handles ${label}`, async ({ isolatedWorkspace }, testInfo) => {
    const { page, api } = isolatedWorkspace;
    const created = await api.post("/api/tasks", { data: { title: "Envelope task" } });
    expect(created.status()).toBe(201);
    const taskId = (await created.json()).task.task_id;
    /** @type {string[]} */ const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route(`**/api/workbench/task-focus/${taskId}/related-context`, async route => {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await route.fulfill({ response, json: payload });
    });
    await page.goto(`/workbench.html?taskId=${taskId}`);
    if (testInfo.project.name === "mobile") await page.getByRole("button", { name: "Open Inspector", exact: true }).click();
    const inspector = page.locator("#workbench-inspector-related-context-list");
    await expect(inspector).toHaveText(message);
    await expect(inspector).not.toContainText("Loading");
    await expect(inspector).not.toContainText("TypeError");
    await expect(inspector).not.toContainText("Cannot read properties");
    expect(errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("envelope.png") });
    await page.unrouteAll({ behavior: "wait" });
  });
}

for (const fails of [false, true]) {
  test(`late related-context ${fails ? "failure" : "success"} cannot replace the new task Inspector`, async ({ isolatedWorkspace }, testInfo) => {
    const { page, api } = isolatedWorkspace;
    /** @type {string[]} */ const ids = [];
    for (const title of ["First envelope task", "Second envelope task"]) {
      const created = await api.post("/api/tasks", { data: { title } });
      expect(created.status()).toBe(201);
      ids.push((await created.json()).task.task_id);
    }
    /** @type {() => void} */ let release = () => { throw new Error("latch not ready"); };
    const held = new Promise(resolve => { release = () => resolve(undefined); });
    await page.route(`**/api/workbench/task-focus/${ids[0]}/related-context`, async route => {
      const response = await route.fetch();
      await held;
      await route.fulfill({ response, status: fails ? 503 : 200, json: fails
        ? { error: "Obsolete context failure" }
        : { groups: [{ label: "Obsolete context", items: [{ title: "Obsolete item" }] }] } });
    });
    await page.goto(`/workbench.html?taskId=${ids[0]}`);
    await expect(page.locator("#workbench-inspector-related-context-list")).toContainText("Loading related task context...");
    await page.getByRole("button", { name: "Change Focus", exact: true }).click();
    await page.getByRole("dialog", { name: "Add resume note?" }).getByRole("button", { name: "No", exact: true }).click();
    const card = page.locator("[data-workbench-recommended-card]");
    await expect(card).toBeVisible();
    if (!(await card.textContent() || "").includes("Second envelope task")) {
      await page.locator("[data-workbench-recommended-cycle-controls]").getByRole("button", { name: "Next", exact: true }).click();
    }
    await expect(card).toContainText("Second envelope task");
    await card.getByRole("button", { name: "Focus task", exact: true }).click();
    if (testInfo.project.name === "mobile") await page.getByRole("button", { name: "Open Inspector", exact: true }).click();
    const inspector = page.locator("#workbench-inspector-related-context-list");
    await expect(inspector).toHaveText("No related task context is available yet.");
    const finished = page.waitForEvent("requestfinished", request => request.url().includes(`/task-focus/${ids[0]}/related-context`));
    release();
    await finished;
    await page.evaluate(() => new Promise(resolve => globalThis.requestAnimationFrame(resolve)));
    await expect(inspector).toHaveText("No related task context is available yet.");
    await expect(page.locator("[data-workbench-task-focus-summary]")).toContainText("Second envelope task");
    await page.unrouteAll({ behavior: "wait" });
  });
}
