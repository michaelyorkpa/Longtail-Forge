/* global document, window */
import { randomUUID } from "node:crypto";
import { expect, test } from "./support/isolated-workspace.mjs";
import { usesManagedServer } from "./support/e2e-env.mjs";
const managedTest = usesManagedServer ? test : test.skip;
for (const workspaceType of ["business", "personal"]) {
  managedTest(`Notes target picker retains ${workspaceType} scope, readable options and recoverable selection`, async ({ isolatedWorkspace }, testInfo) => {
    const { api, page } = isolatedWorkspace;
    expect(isolatedWorkspace.workspaceType).toBe("business");
    const identity = randomUUID();
    // The shared fixture does not yet read createWorkspace's workspace.workspaceId.
    // Use the real session identity; leave that shared fixture correction to its owner.
    const session = await api.get("/api/session"); expect(session.status()).toBe(200);
    const businessWorkspaceId = (await session.json()).user.active_workspace_id;
    expect(typeof businessWorkspaceId).toBe("string"); expect(businessWorkspaceId).not.toBe("");
    let noteWorkspaceId = businessWorkspaceId;
    if (workspaceType === "personal") {
      const created = await api.post("/api/workspaces", { data: { workspaceName: `Picker personal ${identity}`, workspaceType } });
      expect(created.status(), await created.text()).toBe(201);
      noteWorkspaceId = (await created.json()).workspace.workspaceId;
      expect(typeof noteWorkspaceId).toBe("string"); expect(noteWorkspaceId).not.toBe("");
    }
    /** @type {string[]} */ const noteIds = [];
    /** @type {string[]} */ const errors = [];
    /** @type {URL[]} */ const queries = [];
    let release = () => {};
    const gate = new Promise((done) => { release = () => done(undefined); });
    try {
      for (const label of ["One", "Two"]) {
        const created = await api.post("/api/notes", { data: { title: `Picker ${label} ${identity}`, bodyMarkdown: "Picker target" } });
        expect(created.status(), await created.text()).toBe(201);
        const body = await created.json(); expect(typeof body.note.note_id).toBe("string"); noteIds.push(body.note.note_id);
      }
      const directory = await api.get("/api/notes/link-targets?targetType=note&limit=40"); expect(directory.status()).toBe(200);
      const targets = (await directory.json()).targets.filter((/** @type {{targetId:string}} */ target) => noteIds.includes(target.targetId));
      expect(targets).toHaveLength(2);
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/api/notes/link-targets?*", async (route) => {
        const query = new URL(route.request().url()); queries.push(query);
        if (query.searchParams.get("targetType") !== "note") return route.continue();
        const search = query.searchParams.get("q");
        if (search === "pending") await gate;
        if (search === "unreadable") return route.fulfill({ json: { targets: [targets[0], {}] } });
        if (search === "empty") return route.fulfill({ json: { targets: [] } });
        return route.fulfill({ json: { targets: [
          { ...targets[0], targetId: "unavailable", label: "Unavailable fixture", displayLabel: "Unavailable fixture", isAvailable: false }, ...targets,
        ] } });
      });
      await page.goto("/notes.html"); await page.locator("[data-note-create]").click();
      const dialog = page.locator("[data-note-dialog]"); await expect(dialog).toBeVisible();
      const panel = dialog.locator(".notes-context-panel");
      const types = dialog.locator("[data-note-context-target-type]"), clients = dialog.locator("[data-note-context-client]");
      const records = dialog.locator("[data-note-context-results]"), search = dialog.locator("[data-note-context-search]"), apply = dialog.locator("[data-note-context-apply]");
      const rows = dialog.locator("[data-note-context-list]");
      if (!await records.isVisible()) await panel.locator(":scope > summary").click();
      await expect(types.locator("option")).toHaveCount(workspaceType === "business" ? 6 : 5);
      expect(await types.locator("option").evaluateAll((options) => options.map((option) => option.getAttribute("value")))).toEqual(
        workspaceType === "business" ? ["project", "task", "note", "list", "client", "user"] : ["project", "task", "note", "list", "user"]);
      if (workspaceType === "business") await expect(clients).toBeVisible(); else await expect(clients).toBeHidden();
      const clientField = panel.locator(".view-linked-context-picker-field:has([data-note-context-client])");
      await expect(clientField).toHaveCSS("display", workspaceType === "business" ? "grid" : "none");
      await types.selectOption("note");
      await expect(records.locator("option")).toHaveCount(3); await expect(records).toBeEnabled();
      for (const control of [types, search, records, apply]) { await expect(control).toBeVisible(); await expect(control).toBeEnabled(); }
      expect(await records.locator("option").evaluateAll((options) => options.map((option) => option.getAttribute("value")))).toEqual(["unavailable", ...targets.map((/** @type {{targetId:string}} */ target) => target.targetId)]);
      await expect(records.locator('option[value="unavailable"]')).toHaveJSProperty("disabled", true);
      const first = targets[0];
      await expect(records.locator(`option[value="${first.targetId}"]`)).toHaveText(first.displayLabel);
      await records.selectOption(first.targetId);
      // Malformed stored data must refuse only this selection, without staging or closing.
      await records.locator(`option[value="${first.targetId}"]`).evaluate((option) => option.setAttribute("data-target", JSON.stringify({ targetType: "note", targetId: "unreadable" })));
      await apply.click(); await expect(rows.getByRole("button", { name: /remove/i })).toHaveCount(0); await expect(dialog).toBeVisible();
      await search.fill("recover"); await expect(records.locator(`option[value="${first.targetId}"]`)).toHaveAttribute("data-target", /suggestedLibraryBucket/);
      await records.selectOption(first.targetId); await apply.click();
      const stagedLabel = rows.locator(`[data-target-id="${first.targetId}"] .view-linked-context-picker-row-label`);
      await expect(stagedLabel).toHaveText(first.displayLabel); await expect(stagedLabel).toHaveAttribute("title", first.title);
      await expect(rows.getByRole("button", { name: /remove/i })).toHaveCount(1);
      await rows.getByRole("button", { name: /remove/i }).click(); await expect(rows.getByRole("button", { name: /remove/i })).toHaveCount(0);
      await search.fill("  pending  "); await expect.poll(() => queries.some((query) => query.searchParams.get("q") === "pending")).toBe(true);
      await expect(records).toBeDisabled(); await expect(records.locator("option")).toHaveText(["Loading records..."]);
      const pending = queries.find((query) => query.searchParams.get("q") === "pending"); expect(pending?.searchParams.get("limit")).toBe("40");
      release(); await expect(records).toBeEnabled(); await expect(records.locator("option")).toHaveCount(3);
      await search.fill("unreadable"); await expect(records.locator("option")).toHaveText(["Link targets could not be loaded."]); await expect(records).toBeEnabled();
      await search.fill("empty"); await expect(records.locator("option")).toHaveText(["No records found"]);
      if (workspaceType === "business") {
        await search.fill("scoped"); await clients.selectOption("workspace");
        await expect.poll(() => queries.some((query) => query.searchParams.get("q") === "scoped" && query.searchParams.get("clientScope") === "workspace")).toBe(true);
        await clients.selectOption("all");
      } else {
        expect(queries.every((query) => !query.searchParams.has("clientScope") && !query.searchParams.has("clientId"))).toBe(true);
      }
      await search.fill("final"); await expect(records.locator("option")).toHaveCount(3); await expect(types).toHaveValue("note");
      await page.screenshot({ path: testInfo.outputPath(`target-picker-${workspaceType}.png`), fullPage: true });
      await dialog.locator("[data-note-cancel]").click(); await expect(dialog).toBeHidden();
      if (workspaceType === "personal") {
        // The real workspace switch navigates and constructs a fresh editor. Do not
        // remove hidden or patch workspace state to manufacture the visible state.
        await page.unrouteAll({ behavior: "wait" });
        const workspaceSelect = page.locator("[data-workspace-selector]");
        let landingPath = "";
        // Observe the real response before allowing its navigation. Reading a
        // browser response body after navigation loses it in the DevTools protocol.
        await page.route("**/api/session/workspace", async (route) => {
          const switched = await route.fetch();
          expect(switched.status(), await switched.text()).toBe(200);
          landingPath = (await switched.json()).landingPath;
          expect(typeof landingPath).toBe("string"); expect(landingPath).not.toBe("");
          await route.fulfill({ response: switched });
        }, { times: 1 });
        await Promise.all([
          page.waitForEvent("domcontentloaded"),
          workspaceSelect.selectOption(businessWorkspaceId),
        ]);
        expect(new URL(page.url()).pathname).toBe(landingPath);
        await page.goto("/notes.html"); await expect(workspaceSelect).toHaveValue(businessWorkspaceId);
        await page.locator("[data-note-create]").click(); await expect(dialog).toBeVisible();
        if (!await records.isVisible()) await panel.locator(":scope > summary").click();
        await expect(clients).toBeVisible(); await expect(clients).toBeEnabled();
        await expect(clientField).toHaveCSS("display", "grid");
        await expect(types.locator("option")).toHaveCount(6);
        for (const control of [types, search, records, apply]) { await expect(control).toBeVisible(); await expect(control).toBeEnabled(); }
        const scoped = page.waitForResponse((response) => {
          const url = new URL(response.url());
          return url.pathname === "/api/notes/link-targets" && url.searchParams.get("clientScope") === "workspace";
        });
        await clients.selectOption("workspace"); expect((await scoped).status()).toBe(200);
        await expect(clients).toHaveValue("workspace");
        await clients.selectOption("all"); await expect(clients).toHaveValue("all");
        await search.fill("restored"); await expect(search).toHaveValue("restored");
        await page.screenshot({ path: testInfo.outputPath("target-picker-restored-business.png"), fullPage: true });
        await dialog.locator("[data-note-cancel]").click(); await expect(dialog).toBeHidden();
      }
      expect(errors).toEqual([]); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    } finally {
      release(); await page.unrouteAll({ behavior: "wait" });
      if (workspaceType === "personal") {
        // Cleanup uses this test's original workspace even after the real switch.
        const restored = await api.post("/api/session/workspace", { data: { workspaceId: noteWorkspaceId } });
        expect(restored.status(), await restored.text()).toBe(200);
      }
      for (const id of noteIds.reverse()) {
        const removed = await api.post(`/api/notes/${id}/delete`); expect(removed.status(), await removed.text()).toBe(200);
        const body = await removed.json(); expect(body.note.note_id).toBe(id); expect(body.note.status).toBe("deleted"); expect(body.note.deleted_at).toBeTruthy();
      }
    }
  });
}
