/* global document, window */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "./support/isolated-workspace.mjs";
import { usesManagedServer } from "./support/e2e-env.mjs";

const managedTest = usesManagedServer ? test : test.skip;
managedTest("Notes Files utility preserves mounting, stacking, focus and archived attachment display", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api, workspaceId } = isolatedWorkspace;
  const title = `Files utility ${randomUUID()}`, filename = `context-${randomUUID()}.txt`;
  let noteId = "";
  /** @type {string[]} */ const fileIds = [];
  /** @type {string[]} */ const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto("/notes.html"); await page.locator("[data-note-create]").click();
    const editor = page.locator("[data-note-dialog]"), files = page.locator("[data-note-files-dialog]");
    const toggle = editor.locator("[data-note-files-toggle]"), done = files.locator("[data-note-files-dialog-close]");
    const warning = files.locator("[data-note-files-save-first-warning]"), input = files.locator("[data-file-attachment-input]");
    await expect(editor).toBeVisible(); await expect(toggle).toBeVisible();
    await toggle.click(); await expect(files).toBeVisible(); await expect(editor).toBeVisible();
    await expect(warning).toHaveText("Save the note before adding files."); await expect(warning).toBeFocused();
    await expect(input).toHaveCount(0); await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await page.screenshot({ path: testInfo.outputPath("files-unsaved.png") });
    await done.click(); await expect(files).toBeHidden(); await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await editor.locator("[data-note-security]").selectOption("secure"); await expect(toggle).toBeHidden();
    await editor.locator("[data-note-security]").selectOption("normal"); await expect(toggle).toBeVisible();
    await editor.locator("[data-note-title]").fill(title);
    const creation = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/notes" && response.request().method() === "POST");
    await editor.locator("[data-note-save]").click(); const created = await creation;
    expect(created.status(), await created.text()).toBe(201);
    const note = (await created.json()).note; noteId = note.note_id;
    expect(typeof noteId).toBe("string"); expect(noteId).not.toBe(""); expect(note.workspace_id).toBe(workspaceId);
    // Mount refreshes asynchronously and replaces its input. Wait for the real
    // component's finished empty state before proving the Notes focus handoff.
    await expect(files.locator("[data-file-attachments-list]")).toContainText("No attachments yet.");
    await expect(editor.locator("[data-note-save]")).toBeEnabled();
    await toggle.click(); await expect(files).toBeVisible(); await expect(editor).toBeVisible();
    await expect(warning).toBeHidden(); await expect(input).toBeVisible(); await expect(input).toBeFocused();
    await input.setInputFiles({ name: filename, mimeType: "text/plain", buffer: Buffer.from("Working context fixture\n") });
    const uploading = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/files/upload/batch" && response.request().method() === "POST");
    await files.getByRole("button", { name: "Upload", exact: true }).click(); const uploaded = await uploading;
    expect(uploaded.status(), await uploaded.text()).toBe(201);
    const upload = await uploaded.json(); expect(upload.succeeded).toBe(1); expect(upload.failed).toBe(0);
    const fileId = upload.results[0].file.fileId; expect(typeof fileId).toBe("string"); expect(fileId).not.toBe(""); fileIds.push(fileId);
    await expect(files.locator("[data-file-attachment-item]")).toContainText(filename);
    await page.screenshot({ path: testInfo.outputPath("files-saved.png") });
    await done.click(); await expect(files).toBeHidden(); await expect(toggle).toBeFocused();
    await editor.locator("[data-note-cancel]").click(); await expect(editor).toBeHidden();
    await page.goto(`/notes.html?note=${noteId}`);
    const detail = page.locator("[data-note-detail]"), panel = detail.locator("details").filter({ has: page.locator("[data-note-files-mount]") });
    await expect(detail.locator("h2")).toHaveText(title); await expect(panel).toBeVisible();
    await panel.locator(":scope > summary").click();
    await expect(panel.locator("[data-file-attachment-item]")).toContainText(filename);
    await expect(panel.locator(".file-attachment-upload")).toBeVisible();
    await expect(panel.locator("[data-file-attachment-input]")).toBeEnabled();
    const menu = detail.locator(".view-detail-action-menu");
    const archivedAttachments = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/files/attachments" && url.searchParams.get("targetId") === noteId;
    });
    await menu.locator("summary").click(); await page.locator('[data-note-action="archive-note"]').click();
    await expect(page.locator('[data-note-action="restore-note"]')).toHaveCount(1);
    await panel.locator(":scope > summary").click();
    await expect(panel.locator("[data-file-attachment-item]")).toContainText(filename);
    await expect(panel.locator(".file-attachment-upload")).toHaveJSProperty("hidden", true);
    await expect(panel.locator(".file-attachment-upload")).toBeHidden();
    await expect(panel.locator("[data-file-attachment-item]")).toBeVisible();
    const attachmentRead = await archivedAttachments; expect(attachmentRead.status(), await attachmentRead.text()).toBe(200);
    const attachmentPage = await attachmentRead.json(); expect(attachmentPage.attachments).toHaveLength(1);
    const attachment = attachmentPage.attachments[0]; expect(attachment.fileId).toBe(fileId); expect(attachment.targetId).toBe(noteId);
    const metadata = await api.get(`/api/files/${fileId}`); expect(metadata.status(), await metadata.text()).toBe(200);
    expect((await metadata.json()).file.originalFilename).toBe(filename);
    const downloadLink = panel.locator('[data-surface-action="files.download"]');
    await expect(downloadLink).toHaveCount(1); await expect(downloadLink).toHaveAttribute("href", `/api/files/${fileId}/download`);
    // The real list response is the rendered snapshot. A newly uploaded file can
    // still await the queued scan: the worker claims one job per poll, and other
    // tests' higher-priority notifications can precede it. Do not turn arbitrary
    // queue latency into a fixture assumption or manufacture scan availability.
    const downloadable = attachment.file.status === "available" && ["not_required", "passed"].includes(attachment.file.scanStatus);
    if (downloadable) {
      await expect(downloadLink).toBeVisible();
      const downloading = page.waitForEvent("download"); await downloadLink.click(); const downloaded = await downloading;
      expect(downloaded.suggestedFilename()).toBe(filename);
      const downloadedPath = await downloaded.path(); if (!downloadedPath) throw new Error("Attachment download did not produce a file.");
      expect(await readFile(downloadedPath, "utf8")).toBe("Working context fixture\n");
    } else {
      expect(attachment.file.status).toBe("pending"); expect(attachment.file.scanStatus).toBe("pending");
      await expect(downloadLink).toBeHidden(); await expect(panel).toContainText("Download will be available when review completes.");
    }
    await testInfo.attach("archived-attachment-access", { contentType: "application/json", body: JSON.stringify({ status: attachment.file.status, scanStatus: attachment.file.scanStatus, downloadable }) });
    await page.screenshot({ path: testInfo.outputPath("files-archived.png") });
    await menu.locator("summary").click(); await page.locator('[data-note-action="restore-note"]').click();
    await expect(page.locator('[data-note-action="archive-note"]')).toHaveCount(1);
    await panel.locator(":scope > summary").click();
    await expect(panel.locator("[data-file-attachment-item]")).toContainText(filename);
    await expect(panel.locator(".file-attachment-upload")).toBeVisible();
    await expect(panel.locator("[data-file-attachment-input]")).toBeEnabled();
    // Use the restored panel's real input and submit action, rather than proving
    // usability by changing hidden or merely inspecting an enabled attribute.
    const restoredName = `restored-${randomUUID()}.txt`;
    await panel.locator("[data-file-attachment-input]").setInputFiles({ name: restoredName, mimeType: "text/plain", buffer: Buffer.from("Restored working context\n") });
    const uploadingAgain = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/files/upload/batch" && response.request().method() === "POST");
    await panel.getByRole("button", { name: "Upload", exact: true }).click(); const uploadedAgain = await uploadingAgain;
    expect(uploadedAgain.status(), await uploadedAgain.text()).toBe(201);
    const secondUpload = await uploadedAgain.json(); expect(secondUpload.succeeded).toBe(1); expect(secondUpload.failed).toBe(0);
    const secondFileId = secondUpload.results[0].file.fileId; expect(typeof secondFileId).toBe("string"); expect(secondFileId).not.toBe(""); fileIds.push(secondFileId);
    await expect(panel.locator("[data-file-attachment-item]")).toHaveCount(2);
    await expect(panel.locator("[data-file-attachments-list]")).toContainText(filename);
    await expect(panel.locator("[data-file-attachments-list]")).toContainText(restoredName);
    await expect(panel.locator(".file-attachment-upload")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("files-restored.png") });

    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    for (const fileId of fileIds.reverse()) { const removed = await api.post(`/api/files/${fileId}/delete`, { data: {} }); expect(removed.status(), await removed.text()).toBe(200); }
    if (noteId) {
      const current = await api.get(`/api/notes/${noteId}`); expect(current.status()).toBe(200);
      if ((await current.json()).note.status === "archived") { const restored = await api.post(`/api/notes/${noteId}/restore`, { data: {} }); expect(restored.status()).toBe(200); }
      const removed = await api.post(`/api/notes/${noteId}/delete`); expect(removed.status(), await removed.text()).toBe(200);
      const note = (await removed.json()).note; expect(note.note_id).toBe(noteId); expect(note.status).toBe("deleted"); expect(note.deleted_at).toBeTruthy();
    }
  }
});

managedTest("Notes Files utility tolerates an unreadable focus field and an absent shared surface", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  const editor = page.locator("[data-note-dialog]"), files = page.locator("[data-note-files-dialog]");
  const toggle = editor.locator("[data-note-files-toggle]"), done = files.locator("[data-note-files-dialog-close]");
  const warning = files.locator("[data-note-files-save-first-warning]");
  /** @type {string[]} */ const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/notes.html"); await page.locator("[data-note-create]").click(); await expect(editor).toBeVisible();
  // A real SVG element is not an HTMLElement. Observe native focus calls on an
  // unreadable replacement field; the utility must still open. No tabindex is
  // added, so the shared dialog's ordinary autofocus does not select the SVG.
  await warning.evaluate((node) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("data-note-files-save-first-warning", ""); svg.dataset.focusCalls = "0";
    const focus = svg.focus.bind(svg);
    svg.focus = (...args) => { svg.dataset.focusCalls = String(Number(svg.dataset.focusCalls) + 1); focus(...args); };
    node.replaceWith(svg);
  });
  await toggle.click(); await expect(files).toBeVisible(); await expect(editor).toBeVisible();
  await expect(warning).toHaveAttribute("data-focus-calls", "0"); await expect(warning).not.toBeFocused();
  await expect(done).toBeFocused(); await done.click(); await expect(toggle).toBeFocused();
  await editor.locator("[data-note-cancel]").click();
  await page.evaluate(() => { const root = window.LongtailForge; if (!root) throw new Error("Missing Notes namespace"); delete root.fileAttachments; });
  await page.locator("[data-note-create]").click(); await expect(editor).toBeVisible(); await expect(toggle).toBeHidden();
  await editor.locator("[data-note-cancel]").click();
  expect(errors).toEqual([]);
});
