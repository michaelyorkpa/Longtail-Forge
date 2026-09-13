/* global document, window */
import { expect, test } from "./support/isolated-workspace.mjs";
import { usesManagedServer } from "./support/e2e-env.mjs";

const managedTest = usesManagedServer ? test : test.skip;
managedTest("Notes Markdown commands and preview retain layout and the user's external-link preference", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api } = isolatedWorkspace;
  const settingsResponse = await api.get("/api/user/settings"); expect(settingsResponse.status()).toBe(200);
  const originalPreference = (await settingsResponse.json()).openExternalLinksNewTab; expect(typeof originalPreference).toBe("boolean");
  /** @type {string[]} */ const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let previewRequests = 0;
  page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/notes/preview") previewRequests += 1; });
  try {
    for (const newTab of [true, false]) {
      const saved = await api.put("/api/user/settings", { data: { openExternalLinksNewTab: newTab } });
      expect(saved.status(), await saved.text()).toBe(200); expect((await saved.json()).openExternalLinksNewTab).toBe(newTab);
      await page.goto("/notes.html");
      await expect.poll(() => page.evaluate(() => window.localStorage.getItem("lf_open_external_links_new_tab"))).toBe(String(newTab));
      await page.locator("[data-note-create]").click();
      const dialog = page.locator("[data-note-dialog]"); await expect(dialog).toBeVisible();
      const body = dialog.locator("[data-note-body]"), preview = dialog.locator("[data-note-preview]"), toggle = dialog.locator("[data-note-preview-toggle]");
      const toolbar = dialog.locator("[data-note-editor-toolbar]");
      await expect(toolbar.locator("button")).toHaveCount(10); await expect(toggle).toHaveAttribute("aria-pressed", "false");
      await expect(preview).toBeHidden();
      const beforeHidden = previewRequests;
      if (newTab) {
        // Observe real browser events without implementing any formatting in the fixture.
        await body.evaluate((element) => element.addEventListener("input", () => {
          if (element instanceof window.HTMLTextAreaElement) element.dataset.commandInputs = String(Number(element.dataset.commandInputs || 0) + 1);
        }));
        await toolbar.evaluate((element) => element.addEventListener("click", (event) => {
          if (!(element instanceof window.HTMLElement)) throw new Error("Missing toolbar");
          element.dataset.lastClickTag = event.target instanceof window.Element ? event.target.tagName.toLowerCase() : "";
          element.dataset.lastClickTrusted = String(event.isTrusted);
        }, true));
        const commands = [["bold", "**Sample**"], ["italic", "*Sample*"], ["underline", "++Sample++"], ["heading", "## Sample"],
          ["unorderedList", "- Sample"], ["orderedList", "1. Sample"], ["checklist", "- [ ] Sample"], ["link", "[Sample](https://example.com)"], ["wikiLink", "[[Sample]]"]];
        for (const [command, expected] of commands) {
          await body.fill("Sample"); await body.evaluate((element) => { if (!(element instanceof window.HTMLTextAreaElement)) throw new Error("Missing textarea"); element.setSelectionRange(0, 6); element.dataset.commandInputs = "0"; });
          const button = toolbar.locator(`[data-note-command="${command}"]`); await expect(button).toHaveAttribute("aria-label", /.+/);
          await button.click(); await expect(body).toHaveValue(expected); await expect(body).toBeFocused();
          await expect(body).toHaveAttribute("data-command-inputs", "1");
        }
        // Find a painted point on the shipped icon, then use an actual pointer click.
        await body.fill("Sample"); await body.evaluate((element) => { if (!(element instanceof window.HTMLTextAreaElement)) throw new Error("Missing textarea"); element.setSelectionRange(0, 6); element.dataset.commandInputs = "0"; });
        const listButton = toolbar.locator('[data-note-command="unorderedList"]'); await listButton.scrollIntoViewIfNeeded();
        const iconPoint = await listButton.evaluate((button) => {
          for (const path of button.querySelectorAll("svg path")) {
            const bounds = path.getBoundingClientRect();
            for (let y = bounds.top; y <= bounds.bottom; y += 0.5) for (let x = bounds.left; x <= bounds.right; x += 0.5) {
              if (document.elementFromPoint(x, y) === path) return { x, y };
            }
          }
          throw new Error("The shipped list icon has no hittable path");
        });
        await page.mouse.click(iconPoint.x, iconPoint.y);
        await expect(toolbar).toHaveAttribute("data-last-click-tag", "path"); await expect(toolbar).toHaveAttribute("data-last-click-trusted", "true");
        await expect(body).toHaveValue("- Sample"); await expect(body).toBeFocused(); await expect(body).toHaveAttribute("data-command-inputs", "1");

        const bold = toolbar.locator('[data-note-command="bold"]');
        for (const key of ["Enter", "Space"]) {
          await body.fill("Before word after");
          await body.evaluate((element) => { if (!(element instanceof window.HTMLTextAreaElement)) throw new Error("Missing textarea"); element.setSelectionRange(7, 11); element.dataset.commandInputs = "0"; });
          await bold.focus(); await bold.press(key);
          await expect(body).toHaveValue("Before **word** after"); await expect(body).toBeFocused(); await expect(body).toHaveAttribute("data-command-inputs", "1");
          expect(await body.evaluate((element) => { if (!(element instanceof window.HTMLTextAreaElement)) throw new Error("Missing textarea"); return [element.selectionStart, element.selectionEnd]; })).toEqual([9, 13]);
        }
        await body.fill("Start ");
        await body.evaluate((element) => { if (!(element instanceof window.HTMLTextAreaElement)) throw new Error("Missing textarea"); element.setSelectionRange(6, 6); element.dataset.commandInputs = "0"; });
        await bold.click(); await expect(body).toHaveValue("Start **bold text**"); await expect(body).toBeFocused(); await expect(body).toHaveAttribute("data-command-inputs", "1");
        expect(await body.evaluate((element) => { if (!(element instanceof window.HTMLTextAreaElement)) throw new Error("Missing textarea"); return [element.selectionStart, element.selectionEnd]; })).toEqual([8, 17]);

        await body.fill("Unformatted"); await body.evaluate((element) => { if (!(element instanceof window.HTMLTextAreaElement)) throw new Error("Missing textarea"); element.setSelectionRange(0, 11); element.dataset.commandInputs = "0"; });
        await toolbar.scrollIntoViewIfNeeded();
        const background = await toolbar.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          for (let y = bounds.top + 1; y < bounds.bottom; y += 2) for (let x = bounds.left + 1; x < bounds.right; x += 2) {
            if (document.elementFromPoint(x, y) === element) return { x, y };
          }
          throw new Error("No exposed toolbar background");
        });
        await page.mouse.click(background.x, background.y);
        await expect(body).toHaveValue("Unformatted"); await expect(body).toHaveAttribute("data-command-inputs", "0");
        await bold.evaluate((element) => { if (!(element instanceof window.HTMLButtonElement)) throw new Error("Missing button"); element.disabled = true; });
        try {
          const bounds = await bold.boundingBox(); expect(bounds).not.toBeNull(); if (!bounds) throw new Error("Missing button bounds");
          await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
          await expect(body).toHaveValue("Unformatted"); await expect(body).toHaveAttribute("data-command-inputs", "0");
        } finally {
          await bold.evaluate((element) => { if (!(element instanceof window.HTMLButtonElement)) throw new Error("Missing button"); element.disabled = false; });
        }
        for (const command of ["unorderedList", "checklist", "link"]) await expect(toolbar.locator(`[data-note-command="${command}"] svg`)).toHaveCount(1);
        await expect(toggle.locator("svg")).toHaveCount(1);
      }
      const markdown = "# Preview heading\n\n**Preserved body**\n\n[External](https://example.test/path) and [Internal](/notes.html)";
      await body.fill(markdown); expect(previewRequests).toBe(beforeHidden);
      await toggle.click(); await expect(toggle).toHaveAttribute("aria-pressed", "true");
      await expect(preview).toBeVisible(); await expect(preview.locator("h1")).toHaveText("Preview heading");
      await expect(preview.locator("strong")).toHaveText("Preserved body"); await expect(body).toHaveValue(markdown);
      await expect(dialog.locator("[data-note-markdown-editor]")).toHaveClass(/is-preview-visible/);
      const external = preview.getByRole("link", { name: "External", exact: true });
      expect(await external.getAttribute("target")).toBe(newTab ? "_blank" : null);
      expect(await external.getAttribute("rel")).toBe(newTab ? "noopener noreferrer" : null);
      expect(await preview.getByRole("link", { name: "Internal", exact: true }).getAttribute("target")).toBeNull();
      const positions = await dialog.locator("[data-note-markdown-editor]").evaluate((section) => {
        const toolbar = section.querySelector("[data-note-editor-toolbar]"), body = section.querySelector("[data-note-markdown-editor-body]");
        if (!toolbar || !body) throw new Error("Missing editor layout");
        return { toolbarBottom: toolbar.getBoundingClientRect().bottom, bodyTop: body.getBoundingClientRect().top, toolbarFirst: section.firstElementChild === toolbar };
      });
      expect(positions.toolbarFirst).toBe(true); expect(positions.toolbarBottom).toBeLessThanOrEqual(positions.bodyTop + 1);
      await preview.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath(`markdown-preview-${newTab}.png`), fullPage: true });
      await toggle.click(); await expect(preview).toBeHidden(); await expect(toggle).toHaveAttribute("aria-pressed", "false");
      await expect(dialog.locator("[data-note-markdown-editor]")).not.toHaveClass(/is-preview-visible/);
      await expect(body).toHaveValue(markdown); await expect(toolbar.locator("button")).toHaveCount(10);
      const closedRequests = previewRequests; await body.fill("Hidden draft"); expect(previewRequests).toBe(closedRequests);
      await dialog.locator("[data-note-cancel]").click(); await expect(dialog).toBeHidden();
    }
    expect(errors).toEqual([]); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    const restored = await api.put("/api/user/settings", { data: { openExternalLinksNewTab: originalPreference } });
    expect(restored.status(), await restored.text()).toBe(200); expect((await restored.json()).openExternalLinksNewTab).toBe(originalPreference);
  }
});
