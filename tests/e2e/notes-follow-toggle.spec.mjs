/* global document, window */
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { resolveNoteEffectiveSecurity } from "../../src/modules/notes/effective-security.js";

test("Notes follows and unfollows saved plain notes while preserving hidden and checking states", async ({ page, request }, testInfo) => {
  // Each attempt owns its slug, even after a failed run leaves a fixture behind.
  const suffix = `${testInfo.project.name}-${testInfo.retry}-${randomUUID()}`;
  let noteId = "";
  let release = () => {};
  try {
    /** @type {string[]} */
    const errors = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/notes.html"); await page.locator("[data-note-create]").click();
    const editor = page.locator("[data-note-dialog]"); const toggle = editor.locator("[data-note-notification-toggle]");
    await expect(editor).toBeVisible(); await expect(toggle).toBeHidden(); await expect(toggle).toBeDisabled();
    await expect(toggle).toHaveAttribute("title", "Save the note before following notifications");
    await editor.locator("[data-note-title]").fill(`Follow fixture ${suffix}`);
    const waiting = new Promise((done) => { release = () => done(undefined); });
    await page.route("**/api/notifications/subscriptions?**", async (route) => {
      if (route.request().method() === "GET") await waiting;
      await route.continue();
    });
    const creation = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/notes" && response.request().method() === "POST");
    await editor.locator("[data-note-save]").click(); const created = await creation; expect(created.status(), await created.text()).toBe(201);
    const note = (await created.json()).note;
    noteId = note.note_id;
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
    // Valid browser read model for a decrypted secure note: preserve the real detail
    // shape, remove plaintext indexes, and provide only the fields the route exposes.
    // No server key is changed: other specs must retain real missing-key coverage.
    const detail = await request.get(`/api/notes/${noteId}`);
    expect(detail.status(), await detail.text()).toBe(200);
    const secure = { ...(await detail.json()).note, title: `Secure fixture ${suffix}`,
      security_mode: "secure",
      body_markdown: "Decrypted fixture body", body_html: "<p>Decrypted fixture body</p>",
      body_excerpt: null, body_plaintext_index: null,
      secure_title_warning: "Secure note titles are visible to users who can view note metadata. Do not put secrets in the title." };
    Object.assign(secure, resolveNoteEffectiveSecurity(secure));
    expect(secure.security_source).toBe("explicit_note");
    expect(secure.security_inherited).toBe(false);
    let secureStatusReads = 0;
    await page.route("**/api/notifications/subscriptions?**", async (route) => {
      secureStatusReads += 1; await route.continue();
    });
    // Both outcomes always execute. A missing key is an asserted failed read, never
    // a condition for skipping the hidden/disabled assertions or accepting a 201.
    for (const keyAvailable of [true, false]) {
      await page.route(`**/api/notes/${noteId}`, (route) => route.fulfill(keyAvailable
        ? { status: 200, json: { note: secure } }
        : { status: 503, json: { error: { code: "service_unavailable", message: "The service is temporarily unavailable." } } }));
      const hydration = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/notes/${noteId}` && response.request().method() === "GET");
      await page.evaluate(({ noteId, title }) => {
        const dialog = window.LongtailForge?.notesDialog; if (!dialog) throw new Error("Notes editor unavailable.");
        // Metadata survives unavailable decryption; do not seed decrypted content.
        void dialog.openNoteEditor({ mode: "edit", note: { note_id: noteId, title, security_mode: "secure" } });
      }, { noteId, title: secure.title });
      const hydrated = await hydration; expect(hydrated.status()).toBe(keyAvailable ? 200 : 503);
      if (!keyAvailable) expect((await hydrated.json()).error.code).toBe("service_unavailable");
      await expect(editor).toBeVisible(); await expect(toggle).toBeHidden(); await expect(toggle).toBeDisabled();
      await expect(toggle).toHaveAttribute("title", "Note notifications unavailable");
      await expect(toggle).toHaveAttribute("aria-label", "Note notifications unavailable");
      await expect(toggle).toHaveAttribute("aria-pressed", "false");
      await expect(editor.locator("[data-note-title]")).toHaveValue(secure.title);
      await expect(editor.locator("[data-note-security]")).toHaveValue("secure");
      await expect(editor.locator("[data-note-body]")).toHaveValue(keyAvailable ? "Decrypted fixture body" : "");
      await page.screenshot({ path: testInfo.outputPath(keyAvailable ? "secure-key-present.png" : "secure-key-absent.png") });
      await editor.locator("[data-note-cancel]").click();
      await page.unroute(`**/api/notes/${noteId}`);
    }
    expect(secureStatusReads).toBe(0);
    await page.unroute("**/api/notifications/subscriptions?**");
    await page.evaluate((noteId) => {
      const root = window.LongtailForge; if (!root?.notesDialog) throw new Error("Notes editor unavailable.");
      delete root.notificationSubscriptions; void root.notesDialog.openNoteEditor({ mode: "edit", noteId });
    }, note.note_id);
    await expect(editor).toBeVisible(); await expect(toggle).toBeHidden(); await expect(toggle).toBeDisabled();
    await expect(toggle).toHaveAttribute("title", "Note notifications unavailable");
    expect(errors).toEqual([]); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
    if (noteId) {
      const deleted = await request.post(`/api/notes/${noteId}/delete`);
      expect(deleted.status(), await deleted.text()).toBe(200);
      const removed = (await deleted.json()).note;
      expect(removed.note_id).toBe(noteId); expect(removed.status).toBe("deleted");
      expect(typeof removed.deleted_at).toBe("string"); expect(removed.deleted_at.length).toBeGreaterThan(0);
    }
  }
});
