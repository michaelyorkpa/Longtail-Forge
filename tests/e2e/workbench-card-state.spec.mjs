import { test, expect } from "./support/isolated-workspace.mjs";

test("registered card disclosure persists while timer disclosure follows its own policy", async ({ isolatedWorkspace }, testInfo) => {
  const { page } = isolatedWorkspace;
  await page.route("**/workbench.html", async route => {
    const response = await route.fetch();
    const html = await response.text();
    // A non-timer host card exercises the same page acquisition and toggle listener.
    const fixture = '<details data-workbench-card="fixture-card" data-workbench-renderer="active-work-timers"><summary>Persisted fixture card</summary><p>Card body</p></details><details data-workbench-card="unknown-card" data-workbench-renderer="missing-renderer"><summary>Unknown card</summary></details>';
    await route.fulfill({ response, body: html.replace("</body>", fixture + "</body>") });
  });
  await page.addInitScript(() => {
    if (!globalThis.localStorage.getItem("lf_workbench_cards_v1")) globalThis.localStorage.setItem("lf_workbench_cards_v1", JSON.stringify({ "fixture-card": false, "active-work-timers": true }));
  });
  /** @type {string[]} */ const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/workbench.html");
  const card = page.locator('[data-workbench-card="fixture-card"]');
  const timer = page.locator('[data-workbench-card="active-work-timers"]');
  await expect(card).toBeVisible();
  await expect(card).not.toHaveAttribute("open", "");
  await expect(timer).not.toHaveAttribute("open", "");
  await expect(page.locator('[data-workbench-card="unknown-card"]')).toBeHidden();
  await card.locator("summary").click();
  await expect(card).toHaveAttribute("open", "");
  await expect(card.locator("summary")).toHaveAttribute("aria-expanded", "true");
  await expect.poll(() => page.evaluate(() => globalThis.localStorage.getItem("lf_workbench_cards_v1"))).toBe('{"fixture-card":true,"unknown-card":false}');
  await timer.locator("summary").click();
  await expect(timer).toHaveAttribute("open", "");
  await expect.poll(() => page.evaluate(() => globalThis.localStorage.getItem("lf_workbench_cards_v1"))).toBe('{"fixture-card":true,"unknown-card":false}');
  await page.reload();
  await expect(card).toHaveAttribute("open", "");
  await expect(card.locator("summary")).toHaveAttribute("aria-expanded", "true");
  await expect(timer).not.toHaveAttribute("open", "");
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("card-state.png"), fullPage: true });
});
