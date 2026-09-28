import { expect } from "@playwright/test";
import { test } from "./support/isolated-workspace.mjs";

test("native debounce cancellation treats absent handles equally and cancels real handles", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  await page.goto("/lists.html");
  await expect(page.locator("main[data-lists-host]")).toBeVisible();
  const loaded = page.waitForResponse((response) => response.url().includes("/api/lists/link-targets?") && response.request().method() === "GET");
  await page.locator("[data-list-create]").click();
  const response = await loaded;
  expect(response.ok()).toBe(true);
  const body = await response.json();
  const offered = body.providers.map(/** @param {{ targetType: string }} provider */ (provider) => provider.targetType);
  const expected = ["task", "note", "project", "client"].filter((type) => offered.includes(type) && (type !== "client" || isolatedWorkspace.workspaceType === "business"));
  await expect.poll(() => page.locator("[data-list-link-target-type] option")
    .evaluateAll((options) => options.map((option) => option.getAttribute("value")))).toEqual(expected);
  const result = await page.evaluate(async () => {
    // The baseline passes null; the annotation-safe spelling passes undefined.
    // Reflect here invokes the native baseline with its original argument; production uses neither.
    const outcomes = [];
    for (const initial of [null, undefined]) {
      /** @type {string[]} */
      const called = [];
      Reflect.apply(globalThis.clearTimeout, globalThis, [initial]);
      const previous = globalThis.setTimeout(() => called.push("stale"), 0);
      globalThis.clearTimeout(previous);
      await new Promise((resolve) => globalThis.setTimeout(() => { called.push("current"); resolve(undefined); }, 0));
      outcomes.push(called);
    }
    return outcomes;
  });
  expect(result).toEqual([["current"], ["current"]]);
});
