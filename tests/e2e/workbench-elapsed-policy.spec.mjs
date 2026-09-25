import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test, expect } from "./support/isolated-workspace.mjs";
import { E2E_DATA_DIR, usesManagedServer } from "./support/e2e-env.mjs";

// Storage access is limited to this harness's disposable database and the exact
// UUID workspace/user/record created by each case, never an external host.
function testDatabase() {
  if (!usesManagedServer) throw new Error("Elapsed persistence proof requires the managed disposable E2E database.");
  const db = new DatabaseSync(path.join(E2E_DATA_DIR, "longtail-forge.db"));
  db.exec("PRAGMA busy_timeout = 5000");
  return db;
}

for (const kind of ["manual", "task"]) {
  for (const scenario of ["pause-browser", "finalize-browser", "finalize-stored"]) {
    test(`${kind} ${scenario}: malformed start retains accumulated time through real persistence`, async ({ isolatedWorkspace }, testInfo) => {
      const { page, api, workspaceId, account } = isolatedWorkspace;
      const client = await api.post("/api/clients", { data: { name: "Elapsed policy client" } });
      expect(client.status()).toBe(201);
      const clientId = (await client.json()).client.id;
      const project = await api.post(`/api/clients/${clientId}/projects`, { data: { name: "Elapsed policy project" } });
      expect(project.status()).toBe(201);
      const projectId = (await project.json()).project.id;
      let taskId = "";
      if (kind === "task") {
        const task = await api.post("/api/tasks", { data: { title: "Elapsed policy task", resume_note: "Continue here", client_id: clientId, project_id: projectId } });
        expect(task.status()).toBe(201);
        taskId = (await task.json()).task.task_id;
      }
      const timerSlot = kind === "task" ? `source:tasks:task:${taskId}` : "1";
      const serverStart = new Date(Date.now() - 120000).toISOString();
      const started = await api.put(kind === "task" ? `/api/tasks/${taskId}/timer` : "/api/active-timers/1", { data: {
        timer_status: "running", accumulated_elapsed_seconds: 72, last_active_start_time: serverStart,
        client_id: clientId, project_id: projectId, description: "Elapsed manual", billable: "no",
      } });
      expect(started.status(), await started.text()).toBe(200);
      if (scenario === "finalize-stored") {
        const db = testDatabase();
        try {
          const result = db.prepare("UPDATE active_work_timers SET last_active_start_time = ? WHERE workspace_id = ? AND user_id = ? AND timer_slot = ?")
            .run("invalid", workspaceId, account.userId, timerSlot);
          expect(Number(result.changes)).toBe(1);
        } finally { db.close(); }
      } else {
        // Only the browser copy is malformed. Writes/storage are never mocked.
        await page.route("**/api/active-timers/all", async route => {
          const response = await route.fetch();
          const body = await response.json();
          const timer = body.timers.find((/** @type {{timer_slot: string}} */ timer) => timer.timer_slot === timerSlot);
          if (timer) timer.last_active_start_time = "invalid";
          await route.fulfill({ response, json: body });
        });
      }
      await page.goto(kind === "task" ? `/workbench.html?taskId=${taskId}` : "/workbench.html");
      const card = kind === "task" ? page.locator("[data-workbench-task-focus-timer]") : page.locator(".workbench-timer-card");
      const duration = card.locator(".workbench-duration");
      await expect(duration).toHaveText("00:01:12");
      await page.screenshot({ path: testInfo.outputPath("malformed-start-duration.png") });
      const pause = scenario === "pause-browser";
      const routePath = kind === "task" ? `/api/tasks/${taskId}/timer${pause ? "" : "/finalize"}`
        : pause ? "/api/workbench/timers/1/status" : "/api/active-timers/1/finalize";
      const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === routePath && response.request().method() === (pause ? "PUT" : "POST"));
      const beforeWrite = Date.now();
      await card.getByRole("button", { name: pause ? "Pause" : kind === "task" ? "Save Time" : "Save & End", exact: true }).click();
      const response = await responsePromise;
      const afterWrite = Date.now();
      expect(response.status(), await response.text()).toBe(pause ? 200 : 201);
      const body = response.request().postDataJSON();
      expect(body[pause ? "accumulated_elapsed_seconds" : "duration_seconds"]).toBe(72);
      if (!pause && kind === "manual") {
        expect(Date.parse(body.end_time) - Date.parse(body.start_time)).toBe(72000);
        expect(body.duration_hours).toBe("0.0200");
        expect(body).toMatchObject({ client_id: clientId, project_id: projectId, description: "Elapsed manual", billable: "no", invoice_status: "unbilled" });
      }
      const db = testDatabase();
      try {
        if (pause) {
          const stored = db.prepare("SELECT accumulated_elapsed_seconds, timer_status, last_active_start_time FROM active_work_timers WHERE workspace_id = ? AND user_id = ? AND timer_slot = ?")
            .get(workspaceId, account.userId, timerSlot);
          expect(stored).toMatchObject({ accumulated_elapsed_seconds: 72, timer_status: "paused", last_active_start_time: null });
        } else {
          const saved = await response.json();
          const entry = db.prepare("SELECT duration_seconds, start_time, end_time FROM time_entries WHERE workspace_id = ? AND user_id = ? AND entry_id = ?")
            .get(workspaceId, account.userId, saved.entry_id);
          expect(entry).toBeDefined();
          if (scenario === "finalize-stored") expect(entry?.duration_seconds).toBe(72);
          else {
            // The canonical timer wins over the browser's accumulated-only value.
            expect(Number(entry?.duration_seconds)).toBeGreaterThanOrEqual(72 + Math.floor((beforeWrite - Date.parse(serverStart)) / 1000));
            expect(Number(entry?.duration_seconds)).toBeLessThanOrEqual(72 + Math.floor((afterWrite - Date.parse(serverStart)) / 1000));
          }
          expect(Number.isFinite(Date.parse(String(entry?.start_time)))).toBe(true);
          expect(Number.isFinite(Date.parse(String(entry?.end_time)))).toBe(true);
        }
      } finally { db.close(); }
      if (kind === "manual") {
        if (pause) await expect(card.getByText("Paused", { exact: true })).toBeVisible();
        else await expect(card).toHaveCount(0);
      } else {
        await expect(card.locator("[data-workbench-task-focus-timer-status]")).toContainText(pause ? "Paused" : "No active timer");
      }
      await page.unrouteAll({ behavior: "wait" });
    });
  }
}
