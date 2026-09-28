import { expect } from "@playwright/test";
import { test } from "./support/isolated-workspace.mjs";

test("missing action record reports the approved error without writing or refreshing", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  await page.goto("/lists.html");
  await expect(page.locator("[data-list-detail]")).toContainText("Create a list or adjust filters to resume one.");
  /** @type {string[]} */
  const requests = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/lists")) requests.push(`${request.method()} ${request.url()}`);
  });
  await page.locator("[data-list-detail]").evaluate((detail) => {
    const button = globalThis.document.createElement("button");
    button.dataset.listAction = "complete-list";
    button.dataset.listId = "unmatched-record";
    button.textContent = "Exercise missing record";
    detail.append(button);
  });
  await page.getByRole("button", { name: "Exercise missing record" }).click();
  await expect(page.locator("[data-lists-status]")).toHaveText("The list action no longer has a record to read.");
  await expect(page.locator("[data-lists-status]")).toHaveClass(/is-error/);
  expect(requests).toEqual([]);
});

test("native URI, key and metadata text sinks preserve the explicit conversions", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  await page.goto("/lists.html");
  const result = await page.evaluate(() => {
    const values = [undefined, "", "active", "completed", "own/id", "__proto__"];
    const labels = { active: "Active", completed: "Completed" };
    const keys = values.map((value) => Reflect.get(labels, `${value}`) === Reflect.get(labels, value === undefined ? "undefined" : value));
    const routes = values.map((value) => Reflect.apply(encodeURIComponent, undefined, [value]) === encodeURIComponent(`${value}`));
    // detailMetaItems' preceding filter drops all falsy values before the textContent write.
    const text = [undefined, "", 0, "label", 7, new Date("2026-01-01")].filter(Boolean).map((value) => {
      const before = globalThis.document.createElement("span");
      const after = globalThis.document.createElement("span");
      Reflect.set(before, "textContent", value);
      after.textContent = `${value}`;
      return before.textContent === after.textContent;
    });
    return { keys, routes, text };
  });
  expect(result.keys.every(Boolean)).toBe(true);
  expect(result.routes.every(Boolean)).toBe(true);
  expect(result.text).toEqual([true, true, true]);
});
