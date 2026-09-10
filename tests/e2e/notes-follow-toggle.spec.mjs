/* global document, window */
import { expect, test } from "@playwright/test";

test("Notes follows and unfollows saved plain notes while preserving hidden and checking states", async ({ page, request }, testInfo) => {
  /** @type {string[]} */
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/notes.html"); await page.locator("[data-note-create]").click();
  const editor = page.locator("[data-note-dialog]"); const toggle = editor.locator("[data-note-notification-toggle]");
  await expect(editor).toBeVisible(); await expect(toggle).toBeHidden(); await expect(toggle).toBeDisabled();
  await expect(toggle).toHaveAttribute("title", "Save the note before following notifications");
  await editor.locator("[data-note-title]").fill(`Follow fixture ${testInfo.project.name}`);
  let release = () => {};
  const waiting = new Promise((done) => { release = () => done(undefined); });
  await page.route("**/api/notifications/subscriptions?**", async (route) => {
    if (route.request().method() === "GET") await waiting;
    await route.continue();
  });
  const creation = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/notes" && response.request().method() === "POST");
  await editor.locator("[data-note-save]").click(); const created = await creation; expect(created.status()).toBe(201);
  const note = (await created.json()).note;
  try {
    await expect(toggle).toBeVisible(); await expect(toggle).toBeDisabled();
    await expect(toggle).toHaveAttribute("title", "Checking notification follow state");
    await expect(toggle).toHaveAttribute("aria-label", "Checking notification follow state");
    await page.screenshot({ path: testInfo.outputPath("checking.png") });
  } finally { release(); }
  await expect(toggle).toBeEnabled(); await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await page.unroute("**/api/notifications/subscriptions?**");
  for (const following of [true, false]) {
    await toggle.click(); await expect(toggle).toBeEnabled();
    await expect(toggle).toHaveAttribute("aria-pressed", String(following));
    await expect(toggle).toHaveAttribute("title", following ? "Unfollow note notifications" : "Follow note notifications");
    const result = await request.get(`/api/notifications/subscriptions?moduleId=notes&targetType=note&targetId=${note.note_id}`);
    expect(result.status()).toBe(200); expect((await result.json()).isFollowing).toBe(following);
  }
  await page.screenshot({ path: testInfo.outputPath("saved-toggle.png") });
  await page.route("**/api/notifications/subscriptions", (route) => route.fulfill({ status: 503, json: { error: "Notification follow change failed." } }));
  await toggle.click(); await expect(toggle).toBeEnabled(); await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(editor.locator("[data-note-form-status]")).toContainText("Notification follow change failed.");
  await page.unroute("**/api/notifications/subscriptions");
  await editor.locator("[data-note-cancel]").click(); await expect(editor).toBeHidden();
  await page.route("**/api/notifications/subscriptions?**", (route) => route.fulfill({ status: 503, json: { error: "Unavailable" } }));
  await page.evaluate((noteId) => {
    const dialog = window.LongtailForge?.notesDialog; if (!dialog) throw new Error("Notes editor unavailable.");
    void dialog.openNoteEditor({ mode: "edit", noteId });
  }, note.note_id);
  await expect(editor).toBeVisible(); await expect(toggle).toBeVisible(); await expect(toggle).toBeDisabled();
  await expect(toggle).toHaveAttribute("aria-label", "Notification follow state unavailable");
  await editor.locator("[data-note-cancel]").click(); await page.unroute("**/api/notifications/subscriptions?**");
  // A saved secure note uses the real server's effective-security projection.
  const secureResult = await request.post("/api/notes", { data: { title: `Secure follow ${testInfo.project.name}`, bodyMarkdown: "Fixture", security_mode: "secure" } });
  expect(secureResult.status(), await secureResult.text()).toBe(201); const secure = (await secureResult.json()).note;
  await page.evaluate((noteId) => {
    const dialog = window.LongtailForge?.notesDialog; if (!dialog) throw new Error("Notes editor unavailable.");
    void dialog.openNoteEditor({ mode: "edit", noteId });
  }, secure.note_id);
  await expect(editor).toBeVisible(); await expect(toggle).toBeHidden(); await expect(toggle).toBeDisabled();
  await expect(toggle).toHaveAttribute("title", "Note notifications unavailable");
  await editor.locator("[data-note-cancel]").click();
  await page.evaluate((noteId) => {
    const root = window.LongtailForge; if (!root?.notesDialog) throw new Error("Notes editor unavailable.");
    delete root.notificationSubscriptions; void root.notesDialog.openNoteEditor({ mode: "edit", noteId });
  }, note.note_id);
  await expect(editor).toBeVisible(); await expect(toggle).toBeHidden(); await expect(toggle).toBeDisabled();
  await expect(toggle).toHaveAttribute("title", "Note notifications unavailable");
  expect(errors).toEqual([]); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
