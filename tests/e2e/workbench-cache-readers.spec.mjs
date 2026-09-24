import { test, expect } from "./support/isolated-workspace.mjs";

test("warm focus choices render from the scoped cache before real revalidation completes", async ({ isolatedWorkspace }, testInfo) => {
  const { page } = isolatedWorkspace;
  /** @type {string[]} */ const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/workbench.html");
  const choices = page.locator("[data-workbench-focus-mode]");
  await expect.poll(() => choices.count()).toBeGreaterThan(1);
  await expect.poll(() => page.evaluate(() => Object.keys(globalThis.sessionStorage).some(key => key.endsWith(":workbench:registry")))).toBe(true);
  const originalCount = await choices.count();
  const visibleId = await choices.first().getAttribute("data-workbench-focus-mode");
  const cachedId = await page.evaluate(visibleId => {
    const key = Object.keys(globalThis.sessionStorage).find(key => key.endsWith(":workbench:focus-modes"));
    if (!key) throw new Error("scoped modes cache required");
    const entry = JSON.parse(globalThis.sessionStorage.getItem(key) || "null");
    if (!entry?.data?.modes?.length) throw new Error("real cached modes required");
    entry.data.modes = entry.data.modes.filter((/** @type {{id: unknown}} */ mode) => mode.id === visibleId);
    if (entry.data.modes.length !== 1) throw new Error("one real rendered mode required");
    globalThis.sessionStorage.setItem(key, JSON.stringify(entry));
    return entry.data.modes[0].id;
  }, visibleId);
  let release = () => {};
  const gate = new Promise(resolve => { release = () => resolve(undefined); });
  let requested = () => {};
  const started = new Promise(resolve => { requested = () => resolve(undefined); });
  for (const path of ["**/api/workbench/bootstrap", "**/api/workbench/focus-modes"]) {
    await page.route(path, async route => {
      requested();
      const response = await route.fetch();
      await gate;
      await route.fulfill({ response });
    });
  }
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await started;
    await expect(choices).toHaveCount(1);
    await expect(choices).toHaveAttribute("data-workbench-focus-mode", cachedId);
    await page.screenshot({ path: testInfo.outputPath("warm-cache.png"), fullPage: true });
  } finally { release(); }
  await expect(choices).toHaveCount(originalCount);
  expect(errors).toEqual([]);
});
