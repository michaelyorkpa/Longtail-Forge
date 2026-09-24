import { test, expect } from "./support/isolated-workspace.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/workbench.js");

test("corrupt cached routes silently fall back to bootstrap and are replaced", async ({ isolatedWorkspace }, testInfo) => {
  const { page, workspaceId } = isolatedWorkspace;
  /** @type {string[]} */ const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/dashboard.html");
  await expect.poll(() => page.evaluate(() => JSON.parse(globalThis.localStorage.getItem("lf_workspace_context") || "null")?.workspaceId)).toBe(workspaceId);
  await page.goto("/workbench.html");
  const key = `lf_cached_fetch:${workspaceId}:workbench:registry`;
  await expect.poll(() => page.evaluate(key => Boolean(globalThis.sessionStorage.getItem(key)), key)).toBe(true);
  const original = await page.evaluate(key => globalThis.sessionStorage.getItem(key), key);
  /** @type {string[]} */ const requests = [];
  page.on("request", request => requests.push(new URL(request.url()).pathname));
  for (const listRoute of [null, 0, false, 7]) {
    await test.step(`stored listRoute ${String(listRoute)} is a cache miss`, async () => {
      await page.evaluate(({ key, original, listRoute }) => {
        const entry = JSON.parse(original || "null");
        const card = entry.data.workbenchCards.find((/** @type {{renderer: unknown}} */ card) => card.renderer === "active-work-timers");
        if (!card) throw new Error("real timer contribution required");
        card.listRoute = listRoute;
        globalThis.sessionStorage.setItem(key, JSON.stringify(entry));
      }, { key, original, listRoute });
      requests.length = 0;
      const bootstrap = page.waitForResponse(response => new URL(response.url()).pathname === "/api/workbench/bootstrap" && response.request().method() === "GET");
      await page.reload();
      expect((await bootstrap).status()).toBe(200);
      await expect.poll(() => page.evaluate(key => {
        const entry = JSON.parse(globalThis.sessionStorage.getItem(key) || "null");
        return entry?.data?.workbenchCards?.find((/** @type {{renderer: unknown}} */ card) => card.renderer === "active-work-timers")?.listRoute;
      }, key)).toBe("/api/active-timers/all");
      await expect(page.locator("[data-workbench-focus-mode]").first()).toBeVisible();
      await expect(page.getByText("Workbench card configuration: listRoute must be a string.", { exact: true })).toHaveCount(0);
      expect(requests).not.toContain(`/` + String(listRoute));
      expect(requests).toContain("/api/active-timers/all");
    });
  }
  await page.screenshot({ path: testInfo.outputPath("recovered-cache-route.png"), fullPage: true });
  // Reload the server-repaired copy without a test-side restore.
  await page.reload();
  await expect(page.locator("[data-workbench-focus-mode]").first()).toBeVisible();
  await expect(page.getByText("Workbench card configuration: listRoute must be a string.", { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("missing and empty route refreshes stop the former request and error without changing timers", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  await page.goto("/workbench.html");
  await expect(page.locator("[data-workbench-focus-mode]").first()).toBeVisible();
  const loader = extractFunctionBlock(source, "loadTimerCardData");
  const refresh = extractFunctionBlock(source, "refreshWorkbenchTimers");
  const readiness = '    const route = readWorkbenchCardRoute(card);\n    if (route === undefined) return;\n';
  expect(loader).toContain(readiness);
  expect(refresh).toContain('      if (sourceData === undefined) return;\n');
  // Reverse only the authorized refresh policy. These are the exact executable
  // bodies at f36dc731, verified when this before/after probe was introduced.
  const beforeLoader = loader.replace(readiness, "").replace("api.getJson(route,", "api.getJson(card.listRoute,");
  const beforeRefresh = refresh.replace('      if (sourceData === undefined) return;\n', "");
  const helpers = ["workbenchCardField", "workbenchSourceField", "workbenchSourceFields", "readWorkbenchCardRoute"].map(name => extractFunctionBlock(source, name)).join("\n");
  // Playwright evaluates the lifted code directly through its browser protocol;
  // no in-page eval or relaxation of the application's CSP is needed.
  const answers = await page.evaluate(`(async () => {
    const versions = [
      (state, requireApi, requireErrors, setStatus, renderTimers) => { ${helpers}\n${beforeLoader}\n${beforeRefresh}\nreturn refreshWorkbenchTimers; },
      (state, requireApi, requireErrors, setStatus, renderTimers) => { ${helpers}\n${loader}\n${refresh}\nreturn refreshWorkbenchTimers; },
    ];
    const api = globalThis.LongtailForge?.api;
    const errors = globalThis.LongtailForge?.errors;
    if (!api || !errors) throw new Error("real API and error contracts required");
    const answers = [];
    for (const listRoute of [undefined, ""]) {
      for (const before of [true, false]) {
        const timers = [{ timer_status: "paused", accumulated_elapsed_seconds: 12 }];
        const state = { registry: { workbenchCards: [{ renderer: "active-work-timers", listRoute }] }, timers };
        /** @type {unknown[][]} */ const statuses = [];
        /** @type {string[]} */ const requests = [];
        let renders = 0;
        // Observe calls while retaining the real API parser, fetch and responses.
        const observedApi = { getJson(/** @type {string} */ url, /** @type {import("../../src/types/browser-contracts.js").BrowserJsonRequestOptions} */ options) { requests.push(String(url)); return api.getJson(url, options); } };
        const run = versions[before ? 0 : 1](state, () => observedApi, () => errors, (...args) => statuses.push(args), () => { renders++; });
        await run();
        answers.push({ missing: listRoute === undefined, before, sameTimers: state.timers === timers, statuses, renders, requests });
      }
    }
    return answers;
  })()`);
  for (const answer of answers) {
    expect(answer.sameTimers).toBe(true);
    expect(answer.renders).toBe(0);
    if (answer.before) {
      expect(answer.requests).toEqual([answer.missing ? "undefined" : ""]);
      expect(answer.statuses).toHaveLength(1);
      expect(answer.statuses[0][1]).toEqual({ isError: true });
      expect(String(answer.statuses[0][0])).not.toBe("");
      if (!answer.missing) expect(String(answer.statuses[0][0])).toContain("Expected JSON response");
    } else {
      expect(answer.requests).toEqual([]);
      expect(answer.statuses).toEqual([]);
    }
  }
});
