import { randomUUID } from "node:crypto";
import { expect, test } from "./support/isolated-workspace.mjs";

test("real Task Focus consumes, dismisses and recaptures resume context", async ({ isolatedWorkspace }) => {
  const { page, api } = isolatedWorkspace;
  const title = `Resume capture ${randomUUID().slice(0, 8)}`;
  const created = await api.post("/api/tasks", { data: { title, resume_note: "Saved working context" } });
  expect(created.status(), await created.text()).toBe(201);
  const taskId = (await created.json()).task.task_id;
  const taskPath = `/api/tasks/${encodeURIComponent(taskId)}`;
  /** @type {unknown[]} */
  const writes = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === taskPath && request.method() === "PUT") writes.push(request.postDataJSON());
  });
  const readTask = async () => {
    const response = await api.get(taskPath);
    expect(response.status()).toBe(200);
    return (await response.json()).task;
  };
  await page.goto(`/workbench.html?taskId=${encodeURIComponent(taskId)}`);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect.poll(async () => (await readTask()).resume_note).toBe("");
  expect(writes).toEqual([{ resume_note_action: "consume" }]);
  expect((await readTask()).status).toBe("open");

  await page.getByRole("button", { name: "Change Focus" }).click();
  const prompt = page.getByRole("dialog", { name: "Add resume note?" });
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: "No", exact: true }).click();
  await expect(page.locator("[data-workbench-host]")).toHaveAttribute("data-workbench-view-state", "focus-selection");
  expect(writes).toHaveLength(1);

  await page.getByRole("button", { name: "Focus task", exact: true }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("button", { name: "Change Focus" }).click();
  await expect(prompt).toBeVisible();
  await prompt.getByRole("textbox", { name: "Resume note" }).fill("Continue with the real saved context");
  await prompt.getByRole("button", { name: "Yes", exact: true }).click();
  await expect(page.locator("[data-workbench-host]")).toHaveAttribute("data-workbench-view-state", "focus-selection");
  await expect(page.getByText("Resume note: Continue with the real saved context")).toBeVisible();
  expect((await readTask()).resume_note).toBe("Continue with the real saved context");
  expect((await readTask()).status).toBe("in_progress");
  expect(writes).toEqual([
    { resume_note_action: "consume" },
    { resume_note: "Continue with the real saved context", resume_note_action: "capture" },
  ]);

  await page.getByRole("button", { name: "Focus task", exact: true }).click();
  await expect.poll(async () => (await readTask()).resume_note).toBe("");
  expect((await readTask()).status).toBe("in_progress");
  expect(writes).toEqual([
    { resume_note_action: "consume" },
    { resume_note: "Continue with the real saved context", resume_note_action: "capture" },
    { resume_note_action: "consume" },
  ]);
  await page.getByRole("button", { name: "Change Focus" }).click();
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: "No", exact: true }).click();
  await expect(page.locator("[data-workbench-host]")).toHaveAttribute("data-workbench-view-state", "focus-selection");
  expect(writes).toHaveLength(3);
});

test("a fresh real blocked-task read refuses capture without a write", async ({ isolatedWorkspace }) => {
  const { page, api } = isolatedWorkspace;
  const title = `Blocked capture ${randomUUID().slice(0, 8)}`;
  const created = await api.post("/api/tasks", { data: { title } });
  expect(created.status(), await created.text()).toBe(201);
  const taskId = (await created.json()).task.task_id;
  const taskPath = `/api/tasks/${encodeURIComponent(taskId)}`;
  await page.goto(`/workbench.html?taskId=${encodeURIComponent(taskId)}`);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const blocked = await api.put(taskPath, { data: { status: "blocked", blocked_reason: "Waiting for the next input" } });
  expect(blocked.status(), await blocked.text()).toBe(200);
  /** @type {unknown[]} */
  const writes = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === taskPath && request.method() === "PUT") writes.push(request.postDataJSON());
  });
  await page.getByRole("button", { name: "Change Focus" }).click();
  await expect(page.locator("[data-workbench-host]")).toHaveAttribute("data-workbench-view-state", "focus-selection");
  await expect(page.getByRole("dialog", { name: "Add resume note?" })).not.toBeVisible();
  expect(writes).toEqual([]);
  const saved = await api.get(taskPath);
  expect(saved.status()).toBe(200);
  expect((await saved.json()).task).toMatchObject({ status: "blocked", resume_note: "", blocked_reason: "Waiting for the next input" });
});
