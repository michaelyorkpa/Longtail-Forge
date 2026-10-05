import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
import { test, expect } from "./support/isolated-workspace.mjs";

test("Tasks filters send real queries, preserve option order and restore persisted view and sort", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api } = isolatedWorkspace;
  const suffix = randomUUID();
  const clientReply = await api.post("/api/clients", { data: { name: `Filter client ${suffix}` } });
  expect(clientReply.status()).toBe(201);
  const clientId = (await clientReply.json()).client.id;
  const projectReply = await api.post(`/api/clients/${clientId}/projects`, { data: { name: `Filter project ${suffix}` } });
  expect(projectReply.status()).toBe(201);
  const projectId = (await projectReply.json()).project.id;
  await page.goto("/tasks.html");
  await page.locator("[data-view-slideout-sidebar-trigger]").first().click();
  await page.getByText("Sorting and Filters", { exact: true }).click();
  const view = page.locator("[data-task-view-selector]"), sort = page.locator("[data-task-sort]");
  const client = page.locator("[data-task-client-filter]"), project = page.locator("[data-task-project-filter]");
  await expect(project.locator("option")).toHaveCount(3);
  expect(await project.locator("option").evaluateAll((options) => options.map((o) => o.getAttribute("value")))).toEqual(["all", "", projectId]);
  /** @param {import("@playwright/test").Locator} control @param {string} value @param {string} key @param {string} answer */
  async function selectAndRead(control, value, key, answer) {
    const reading = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/tasks" && response.request().method() === "GET" && url.searchParams.get(key) === answer;
    });
    await control.selectOption(value);
    const response = await reading;
    expect(response.status()).toBe(200);
    return new URL(response.url()).searchParams;
  }
  await selectAndRead(client, clientId, "client_id", clientId);
  await selectAndRead(project, projectId, "project_id", projectId);
  await selectAndRead(sort, "priority_desc", "sort", "priority");
  const complete = await selectAndRead(view, "complete", "task_view", "completed");
  expect(complete.get("status")).toBe("complete");
  expect(complete.get("client_id")).toBe(clientId); expect(complete.get("project_id")).toBe(projectId);
  await page.reload();
  await expect(view).toHaveValue("complete"); await expect(sort).toHaveValue("priority_desc");
  await page.locator("[data-view-slideout-sidebar-trigger]").first().click();
  await page.getByText("Sorting and Filters", { exact: true }).click();
  const resetRead = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/tasks" && url.searchParams.get("task_view") === "completed" && url.searchParams.get("sort") === "due_at";
  });
  await page.locator("[data-task-reset-filters]").click();
  const reset = await resetRead; expect(reset.status()).toBe(200);
  await expect(view).toHaveValue("complete"); await expect(sort).toHaveValue("due_asc");
  expect(new URL(reset.url()).searchParams.get("status")).toBe("complete");
  expect(await page.evaluate(() => JSON.parse(globalThis.localStorage.getItem("lf_tasks_filters_v1") || "{}"))).toEqual({ sort: "due_asc", quickFilter: "complete" });
  await page.screenshot({ path: testInfo.outputPath("filters.png"), fullPage: true });
});

test("Lifted select helpers retain native, foreign and detached control selection and null paths", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  await page.goto("/tasks.html");
  const source = await readFile(new URL("../../public/js/tasks.js", import.meta.url), "utf8");
  const functions = ["requireBulkSelect", "setSelectValue", "replaceOptions", "taskFilterLabelField", "optionLabel"].map((name) => extractFunctionBlock(source, name)).join("\n");
  const result = await page.evaluate((functions) => {
    const helpers = new Function(`${functions}; return {setSelectValue, replaceOptions, optionLabel};`)();
    const frame = globalThis.document.createElement("iframe"); globalThis.document.body.append(frame);
    try {
      if (!frame.contentDocument) throw new Error("Foreign document missing");
      const results = [globalThis.document, frame.contentDocument, globalThis.document.implementation.createHTMLDocument("")].map((doc) => {
        const select = doc.createElement("select"), a = doc.createElement("option"), b = doc.createElement("option");
        a.value = "a"; b.value = "b"; select.append(a, b);
        helpers.setSelectValue(select, "b"); helpers.setSelectValue(select, "missing");
        const retained = select.value;
        helpers.replaceOptions(select, [b, a]);
        const single = select.value;
        select.multiple = true; a.selected = true;
        helpers.replaceOptions(select, [a, b]);
        return { retained, single, order: [...select.options].map((o) => o.value), selected: [...select.selectedOptions].map((o) => o.value), identity: select.options[0] === a };
      });
      helpers.setSelectValue(null, "a"); helpers.replaceOptions(undefined, []);
      let refused = "";
      try { helpers.setSelectValue(globalThis.document.createElement("input"), "a"); } catch (error) { refused = error instanceof Error ? error.message : String(error); }
      // globalThis.document.all compares loosely equal to null, but optional property access still reads it.
      const marker = globalThis.document.createElement("div"); marker.id = "displayName"; globalThis.document.body.append(marker);
      const labelIdentity = helpers.optionLabel(globalThis.document.all) === marker;
      marker.remove();
      return { results, refused, labelIdentity };
    } finally { frame.remove(); }
  }, functions);
  expect(result.results).toEqual(Array.from({ length: 3 }, () => ({ retained: "b", single: "b", order: ["a", "b"], selected: ["a", "b"], identity: true })));
  expect(result.refused).toBe("Tasks bulk select control is unavailable.");
  expect(result.labelIdentity).toBe(true);
});
