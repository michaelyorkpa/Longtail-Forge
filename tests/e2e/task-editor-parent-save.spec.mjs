import { expect, test } from "@playwright/test";

async function createTask(request, title) {
  const response = await request.post("/api/tasks", { data: { title } });
  expect(response.status()).toBe(201);
  return (await response.json()).task;
}

test("Task editor orders Parent Task hierarchy and keeps Edit Save open", async ({ page, request }, testInfo) => {
  const suffix = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const parent = await createTask(request, `Parent ${suffix}`);
  const child = await createTask(request, `Child ${suffix}`);
  const relationship = await request.post(`/api/tasks/${encodeURIComponent(parent.task_id)}/children`, {
    data: { child_task_id: child.task_id },
  });
  expect(relationship.status()).toBe(201);
  const grandchild = await createTask(request, `Grandchild ${suffix}`);
  const grandchildRelationship = await request.post(`/api/tasks/${encodeURIComponent(child.task_id)}/children`, {
    data: { child_task_id: grandchild.task_id },
  });
  expect(grandchildRelationship.status()).toBe(201);
  await createTask(request, `Sibling ${suffix}`);

  await page.goto(`/tasks.html?task=${encodeURIComponent(grandchild.task_id)}`);
  const dialog = page.locator("dialog[data-task-dialog][open]");
  await expect(dialog).toBeVisible();

  const labels = await dialog.locator("select[data-task-parent-task] option").allTextContents();
  expect(labels.indexOf(`Parent ${suffix}`)).toBeLessThan(labels.indexOf(`  - Child ${suffix}`));
  expect(labels).toContain(`  - Child ${suffix}`);
  expect(labels).toContain(`Sibling ${suffix}`);

  await dialog.locator("input[data-task-title]").fill(`Grandchild updated ${suffix}`);
  await dialog.locator("button[data-save-task]").click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("input[data-task-title]")).toHaveValue(`Grandchild updated ${suffix}`);

  const savedResponse = await request.get(`/api/tasks/${encodeURIComponent(grandchild.task_id)}`);
  expect(savedResponse.status()).toBe(200);
  expect((await savedResponse.json()).task.title).toBe(`Grandchild updated ${suffix}`);
  await dialog.locator("button[data-cancel-task]").click();
  await expect(dialog).toBeHidden();
});
