import { test, expect } from "./support/isolated-workspace.mjs";

test("focus-mode clicks use the real DOM listener and preserve selection", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  /** @type {string[]} */ const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/workbench.html");
  const buttons = page.locator("[data-workbench-focus-mode]");
  await expect(buttons.first()).toBeVisible();
  const ids = await buttons.evaluateAll(elements => elements.map(element => element.getAttribute("data-workbench-focus-mode")));
  expect(ids.length).toBeGreaterThan(1);
  for (const id of ids.slice(0, 2)) {
    const button = page.locator(`[data-workbench-focus-mode="${id}"]`);
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }
  expect(errors).toEqual([]);
});

test("synthetic target failures reach fixed browser recovery without exposing their wording", async ({ isolatedWorkspace }, testInfo) => {
  const { page } = isolatedWorkspace;
  for (const malformed of ["null", "noncallable"]) {
    await page.goto("/workbench.html");
    await expect(page.locator("[data-workbench-focus-mode]").first()).toBeVisible();
    await page.evaluate(malformed => {
      const button = globalThis.document.querySelector("[data-workbench-focus-mode]");
      if (!button) throw new Error("Expected the real focus-mode control.");
      // Native dispatch reaches the production listener; only its target is
      // deliberately malformed. The returned promise is left to real recovery.
      const event = new globalThis.MouseEvent("click", { bubbles: true });
      Object.defineProperty(event, "target", { value: malformed === "null" ? null : { closest: 7 } });
      button.dispatchEvent(event);
    }, malformed);
    await expect(page.getByRole("heading", { name: "Temporarily unavailable", exact: true })).toBeVisible();
    await expect(page.getByText("A required service is temporarily unavailable. Wait a moment, then try again.", { exact: true })).toBeVisible();
    await expect(page.getByText(/The Workbench (source data|focus target)/)).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`recovery-${malformed}.png`), fullPage: true });
  }
});
