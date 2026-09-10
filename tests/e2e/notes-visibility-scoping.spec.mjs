/* global document, window, HTMLOptionElement */
import { expect, test } from "@playwright/test";

test("Notes projects visibility by workspace and restricts editor and bulk options by current context", async ({ page, request }, testInfo) => {
  const titles = [];
  for (const index of [1, 2]) {
    const title = `Visibility ${testInfo.project.name}-${testInfo.workerIndex}-${index}`;
    const created = await request.post("/api/notes", { data: { title, bodyMarkdown: "Visibility fixture", noteType: "general" } });
    expect(created.status(), await created.text()).toBe(201); titles.push(title);
  }
  let workspaceType = "business";
  let hasClientTools = true;
  await page.route("**/api/app-shell/bootstrap", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const context = body.workspaceContext;
    expect(context).toBeTruthy();
    context.workspaceType = workspaceType;
    if (!hasClientTools) context.workspaceCapabilities.availableTools = context.workspaceCapabilities.availableTools.filter((/** @type {string} */ tool) => tool !== "clients_projects");
    await route.fulfill({ response, json: body });
  });
  /** @type {string[]} */
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const scenario of ["business", "family", "personal", "business-no-client-tools"]) {
    workspaceType = scenario === "business-no-client-tools" ? "business" : scenario;
    hasClientTools = scenario !== "business-no-client-tools";
    await page.goto("/notes.html");
    await expect(page.locator("[data-note-create]")).toBeVisible();
    const expected = workspaceType === "business" ? ["internal", "private", "workspace", "client_visible", "public"] : ["internal", "private", "workspace", "public"];
    const current = hasClientTools ? expected : expected.filter((value) => value !== "client_visible");
    const filter = page.locator("[data-note-filter-visibility]");
    if (workspaceType === "personal") await expect(filter).toHaveCount(0);
    else expect(await filter.locator("option").evaluateAll((options) => options.map((option) => {
      if (!(option instanceof HTMLOptionElement)) throw new Error("Expected visibility option.");
      return option.value;
    }))).toEqual(["all", ...expected]);

    await page.locator("[data-view-slideout-sidebar-trigger]").first().click();
    for (const title of titles) await page.getByRole("checkbox", { name: `Select ${title} for bulk editing` }).check();
    await page.locator("[data-note-bulk-edit]").click();
    const bulk = page.locator("[data-note-bulk-dialog]");
    await expect(bulk).toBeVisible();
    const bulkVisibility = bulk.locator("[data-note-bulk-visibility]");
    if (workspaceType === "personal") await expect(bulkVisibility).toHaveCount(0);
    else expect(await bulkVisibility.locator("option").evaluateAll((options) => options.map((option) => {
      if (!(option instanceof HTMLOptionElement)) throw new Error("Expected visibility option.");
      return option.value;
    }))).toEqual(["", ...current]);
    await bulk.locator("[data-note-bulk-cancel]").click();
    await expect(bulk).toBeHidden();

    await page.evaluate(() => {
      const dialog = window.LongtailForge?.notesDialog;
      if (!dialog) throw new Error("Notes dialog unavailable.");
      void dialog.openNoteEditor({ mode: "add", title: "Scope draft", visibility: "client_visible", securityMode: "normal" });
    });
    const editor = page.locator("[data-note-dialog]");
    await expect(editor).toBeVisible();
    const visibility = editor.locator("[data-note-visibility]");
    if (workspaceType === "personal") await expect(visibility).toHaveCount(0);
    else {
      expect(await visibility.locator("option").evaluateAll((options) => options.map((option) => {
      if (!(option instanceof HTMLOptionElement)) throw new Error("Expected visibility option.");
      return option.value;
    }))).toEqual(current);
      await expect(visibility).toHaveValue(current.includes("client_visible") ? "client_visible" : "internal");
    }
    await editor.locator("[data-note-security]").selectOption("secure");
    await expect(editor.locator("[data-note-secure-warning]")).toBeVisible();
    if (workspaceType !== "personal") await expect(visibility).toHaveValue("internal");
    if (workspaceType === "business" && hasClientTools) {
      const client = visibility.locator('option[value="client_visible"]');
      await expect(client).toHaveJSProperty("disabled", true); await expect(client).toHaveJSProperty("hidden", true);
      await editor.locator("[data-note-security]").selectOption("normal");
      await expect(client).toHaveJSProperty("disabled", false); await expect(client).toHaveJSProperty("hidden", false);
      await expect(visibility).toHaveValue("internal");
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await editor.locator("[data-note-cancel]").click();
    await expect(editor).toBeHidden();
  }
  expect(errors).toEqual([]);
});
