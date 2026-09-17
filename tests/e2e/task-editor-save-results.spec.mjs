import { randomUUID } from "node:crypto";
import { expect, test } from "./support/isolated-workspace.mjs";

for (const action of ["complete", "save-close"]) {
  test(`raw completion lifecycle: ${action} writes once and closes after its host callback`, async ({ isolatedWorkspace }, testInfo) => {
    const { page, api } = isolatedWorkspace;
    const title = `Completion ${randomUUID()}`;
    const created = await api.post("/api/tasks", { data: { title } });
    expect(created.status(), await created.text()).toBe(201);
    const id = (await created.json()).task.task_id;
    await page.goto("/tasks.html");
    await expect.poll(() => page.evaluate(() => Boolean(globalThis.window.LongtailForge?.tasksDialog))).toBe(true);
    const opened = page.evaluate(async (taskId) => {
      const surface = globalThis.window.LongtailForge?.tasksDialog;
      if (!surface) throw new Error("Task editor unavailable");
      globalThis.sessionStorage.setItem("completion-host", "[]");
      /** @type {unknown[]} */ const calls = [];
      const host = { complete(/** @type {unknown} */ detail) { calls.push({ receiver: this === host, detail }); globalThis.sessionStorage.setItem("completion-host", JSON.stringify(calls)); } };
      return surface.openTaskEditor({ mode: "edit", taskId }, host);
    }, id);
    const dialog = page.locator("dialog[data-task-dialog][open]");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("[data-task-title]")).toHaveValue(title);
    /** @type {string[]} */ const writes = [];
    page.on("request", (request) => {
      if (["PUT", "POST"].includes(request.method()) && new URL(request.url()).pathname.startsWith(`/api/tasks/${id}`)) writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
    });
    const route = action === "complete" ? `/api/tasks/${id}/complete` : `/api/tasks/${id}`;
    const responseWait = page.waitForResponse((response) => new URL(response.url()).pathname === route && response.request().method() === (action === "complete" ? "POST" : "PUT"));
    if (action === "complete") {
      await dialog.getByRole("button", { name: "Complete task", exact: true }).click();
    } else {
      await dialog.locator("[data-task-details-panel] > summary").click();
      await dialog.locator("[data-task-form-status]").selectOption("complete");
      await dialog.getByRole("button", { name: "Save & Close", exact: true }).click();
    }
    const response = await responseWait;
    expect(response.status(), await response.text()).toBe(200);
    const body = await response.json();
    await expect(dialog).toHaveCount(0);
    expect(await opened).toBe("complete");
    expect(writes).toEqual([`${action === "complete" ? "POST" : "PUT"} ${route}`]);
    const calls = JSON.parse(await page.evaluate(() => globalThis.sessionStorage.getItem("completion-host")) || "[]");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ receiver: true, detail: { actionId: "tasks.complete", recordId: id, title, taskLifecycleAction: "complete", recurrenceContinuity: body.recurrenceContinuity || null } });
    const persisted = await api.get(`/api/tasks/${id}`);
    expect(persisted.status()).toBe(200);
    expect((await persisted.json()).task.status).toBe("complete");
    await page.screenshot({ path: testInfo.outputPath(`completion-${action}.png`), fullPage: true });
  });
}
