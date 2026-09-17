import { randomUUID } from "node:crypto";
import { expect, test } from "./support/isolated-workspace.mjs";

test("continuity polling keeps real response identity and rendering supports a foreign-realm container", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api } = isolatedWorkspace;
  const created = await api.post("/api/tasks", { data: { title: `Continuity ${randomUUID()}`, due_date: "2050-04-01", recurrence: { enabled: true, frequency: "WEEKLY", interval: 1 } } });
  expect(created.status(), await created.text()).toBe(201);
  const taskId = (await created.json()).task.task_id;
  await page.goto("/tasks.html");
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.window.LongtailForge?.tasksDialog))).toBe(true);
  const responseWait = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/tasks/${taskId}/recurrence-continuity` && response.request().method() === "GET");
  const polling = page.evaluate(async (id) => {
    const surface = globalThis.window.LongtailForge?.tasksDialog;
    if (!surface) throw new Error("Task dialog unavailable");
    /** @type {{receiver: boolean, attempt: number}[]} */
    const calls = [];
    let seen;
    const options = { attempts: 1, onUpdate(/** @type {unknown} */ value, /** @type {number} */ attempt) { seen = value; calls.push({ receiver: this === options, attempt }); } };
    const token = await surface.pollRecurrenceContinuity(id, options);
    return { token, same: seen === token, calls };
  }, taskId);
  const response = await responseWait;
  expect(response.status(), await response.text()).toBe(200);
  const body = await response.json();
  const result = await polling;
  expect(result.token).toEqual(body.recurrenceContinuity);
  expect(result.same).toBe(true);
  expect(result.calls).toEqual([{ receiver: true, attempt: 0 }]);

  await page.evaluate(() => { const frame = globalThis.document.createElement("iframe"); frame.dataset.continuityProof = ""; frame.title = "Continuity proof"; globalThis.document.body.append(frame); });
  await page.evaluate((id) => {
    const surface = globalThis.window.LongtailForge?.tasksDialog;
    const frame = globalThis.document.querySelector("iframe[data-continuity-proof]");
    if (!surface || !(frame instanceof globalThis.HTMLIFrameElement) || !frame.contentDocument) throw new Error("Proof frame unavailable");
    const container = frame.contentDocument.createElement("section");
    frame.contentDocument.body.append(container);
    surface.renderRecurrenceContinuity(container, { isRecurring: true, status: "available", nextScheduledDate: "2050-04-08", nextTask: { url: { toString: () => `/tasks.html?task=${id}` } } });
  }, taskId);
  const panel = page.frameLocator("iframe[data-continuity-proof]").locator("section");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Task completed. Next scheduled 2050-04-08.");
  await expect(panel.getByRole("link", { name: "Open next task" })).toHaveAttribute("href", `/tasks.html?task=${taskId}`);
  await page.screenshot({ path: testInfo.outputPath("continuity-foreign-container.png"), fullPage: true });
  await page.evaluate(() => {
    const frame = globalThis.document.querySelector("iframe[data-continuity-proof]");
    if (!(frame instanceof globalThis.HTMLIFrameElement)) throw new Error("Proof frame unavailable");
    globalThis.window.LongtailForge?.tasksDialog?.renderRecurrenceContinuity(frame.contentDocument?.querySelector("section"), null);
  });
  await expect(panel).toBeHidden();
  await expect(panel).toHaveText("");
  await expect(panel.getByRole("link")).toHaveCount(0);
});
