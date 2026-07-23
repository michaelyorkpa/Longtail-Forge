import { expect, test } from "@playwright/test";

test("Reporting and Notes bulk actions use the shared typable tag picker", async ({ page, request }, testInfo) => {
  const suffix = `${testInfo.project.name}-${testInfo.workerIndex}`;
  const tagName = `Picker Proof ${suffix}`;
  const noteTitles = [`Picker Note A ${suffix}`, `Picker Note B ${suffix}`];

  const tagResponse = await request.post("/api/tags", { data: { name: tagName } });
  expect(tagResponse.status(), "the rendered proof tag should be created").toBe(201);
  const tag = (await tagResponse.json()).tag;

  const notes = [];
  for (const title of noteTitles) {
    const noteResponse = await request.post("/api/notes", { data: { title } });
    expect(noteResponse.status(), `the rendered proof note ${title} should be created`).toBe(201);
    notes.push((await noteResponse.json()).note);
  }

  const reportingResponse = await page.goto("/reporting.html");
  expect(reportingResponse.status(), "Reporting should be served to the authenticated test account").toBe(200);
  const reportingTagInput = page.locator('input[data-reporting-filter-control="tags"]');
  await expect(reportingTagInput).toBeVisible();
  await reportingTagInput.fill(tagName);
  await expect(page.locator(`[data-tag-filter-suggestion="${tag.tag_id}"]`)).toBeVisible();
  await page.locator(`[data-tag-filter-suggestion="${tag.tag_id}"]`).click();
  await expect(reportingTagInput).toHaveValue(tagName);
  await expect(reportingTagInput).toHaveAttribute("data-tag-filter-value", tag.tag_id);

  const notesResponse = await page.goto("/notes.html");
  expect(notesResponse.status(), "Notes should be served to the authenticated test account").toBe(200);
  await page.locator("[data-view-slideout-sidebar-trigger]").first().click();
  for (const title of noteTitles) {
    await page.getByRole("checkbox", { name: `Select ${title} for bulk editing` }).check();
  }
  await page.locator("[data-note-bulk-edit]").click();

  const bulkDialog = page.locator("[data-note-bulk-dialog]");
  await expect(bulkDialog).toBeVisible();
  await bulkDialog.locator("[data-note-bulk-tag-action]").selectOption("add");
  const bulkTagInput = bulkDialog.locator("[data-note-bulk-tags] [data-tag-picker-input]");
  await expect(bulkTagInput).toBeVisible();
  await bulkTagInput.fill(tagName);
  await expect(bulkDialog.locator(`[data-tag-picker-suggestion="${tag.tag_id}"]`)).toBeVisible();
  await bulkDialog.locator(`[data-tag-picker-suggestion="${tag.tag_id}"]`).click();
  await expect(bulkDialog.locator(`[data-tag-picker-selected][value="${tag.tag_id}"]`)).toHaveCount(1);
  await bulkDialog.locator("[data-note-bulk-apply]").click();
  await expect(bulkDialog).toBeHidden();
  await expect(page.locator("[data-notes-status]")).toContainText("Updated 2 notes.");

  for (const note of notes) {
    const assignmentsResponse = await request.get(`/api/tags/assignments?targetType=note&targetId=${encodeURIComponent(note.note_id)}`);
    expect(assignmentsResponse.status(), `tag assignments for ${note.title} should be readable`).toBe(200);
    const assignments = await assignmentsResponse.json();
    expect(assignments.directTags.map((entry) => entry.tag_id)).toContain(tag.tag_id);
  }
});
