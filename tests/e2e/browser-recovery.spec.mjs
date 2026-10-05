/* global document, window */

import { expect, test } from "@playwright/test";

test("unknown browser routes render one resilient action and preserve history recovery", async ({ page }) => {
  await page.goto("/dashboard.html");
  await expect(page.locator("[data-dashboard-host]")).toBeVisible();
  await page.evaluate(() => {
    document.cookie = "lf_theme=light; Path=/; SameSite=Lax";
  });
  await page.emulateMedia({ colorScheme: "dark" });

  const response = await page.goto("/unknown-browser-recovery.html");

  expect(response?.status()).toBe(404);
  const surface = page.locator("[data-recovery-kind='unavailable']");
  await expect(page.locator("html")).toHaveAttribute("data-theme-mode", "light");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(245, 247, 251)");
  await expect(surface).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(surface).toHaveAttribute("role", "alert");
  await expect(surface).toHaveAttribute("aria-live", "assertive");
  await expect(surface.getByRole("heading", { name: "Page unavailable" })).toBeVisible();
  await expect(surface.getByRole("link", { name: "Return to Dashboard" })).toHaveCount(1);
  await expect(page.locator("script, link[rel='stylesheet']")).toHaveCount(0);

  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard\.html$/);
  await expect(page.locator("[data-dashboard-host]")).toBeVisible();
});

test("expired direct navigation renders the login-required recovery surface", async ({ page }) => {
  await page.context().clearCookies();
  const response = await page.goto("/tasks.html");

  expect(response?.status()).toBe(401);
  const surface = page.locator("[data-recovery-kind='login-required']");
  await expect(surface.getByRole("heading", { name: "Sign in required" })).toBeVisible();
  await expect(surface.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login.html");
});

test("permission-denied actions use one announced dialog and return focus", async ({ page }) => {
  await page.route("**/api/browser-recovery-permission-test", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        error: {
          code: "forbidden",
          message: "You do not have permission to perform that action.",
          requestId: "permission-request-id",
        },
      }),
      contentType: "application/json",
      status: 403,
    });
  });
  await page.goto("/dashboard.html");
  await expect(page.locator("[data-dashboard-host]")).toBeVisible();
  await page.waitForFunction(() => typeof window.LongtailForge?.api?.getJson === "function");

  await page.evaluate(() => {
    const trigger = document.createElement("button");
    trigger.dataset.permissionTestTrigger = "";
    trigger.textContent = "Attempt protected action";
    trigger.addEventListener("click", () => {
      void window.fetch("/api/browser-recovery-permission-test", {
        method: "POST",
      });
    });
    document.body.appendChild(trigger);
  });

  const trigger = page.locator("[data-permission-test-trigger]");
  await trigger.click();
  const dialog = page.locator("dialog[data-framework-permission-denied]");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("role", "alertdialog");
  await expect(dialog.getByText("You do not have permission to complete that action.")).toBeVisible();
  await expect(dialog.locator("[aria-live='assertive']")).toHaveText("The action was not completed.");
  await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
  await expect(page.locator("dialog[data-framework-permission-denied]")).toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("a thrown rendering failure replaces broken content with one focused recovery action", async ({ page }) => {
  await page.goto("/dashboard.html");
  await expect(page.locator("[data-dashboard-host]")).toBeVisible();

  await page.evaluate(() => {
    window.setTimeout(() => {
      throw new Error("failed dynamic rendering");
    }, 0);
  });

  const surface = page.locator("[data-framework-recovery][data-recovery-kind='unexpected']");
  await expect(surface).toBeVisible();
  await expect(surface.getByRole("heading", { name: "Something went wrong" })).toBeFocused();
  await expect(surface.getByRole("link", { name: "Return to Dashboard" })).toHaveCount(1);
  await expect(page.locator("[data-dashboard-host]")).toHaveCount(0);
});

test("unhandled conflict and dependency reads select manual recovery without replay", async ({ page }) => {
  let dependencyRequests = 0;
  await page.route("**/api/browser-recovery-dependency-test", async (route) => {
    dependencyRequests += 1;
    await route.fulfill({
      body: JSON.stringify({
        error: {
          code: "service_unavailable",
          message: "The service is temporarily unavailable.",
          requestId: "dependency-request-id",
        },
      }),
      contentType: "application/json",
      status: 503,
    });
  });
  await page.goto("/dashboard.html");
  await expect(page.locator("[data-dashboard-host]")).toBeVisible();
  await page.waitForFunction(() => typeof window.LongtailForge?.api?.getJson === "function");

  await page.evaluate(() => {
    void window.LongtailForge?.api?.getJson("/api/browser-recovery-dependency-test");
  });

  const surface = page.locator("[data-framework-recovery][data-recovery-kind='dependency-unavailable']");
  await expect(surface.getByRole("heading", { name: "Temporarily unavailable" })).toBeVisible();
  await expect(surface.getByRole("link", { name: "Try again" })).toHaveCount(1);
  await page.waitForTimeout(250);
  expect(dependencyRequests, "the recovery boundary must not automatically replay a failed read").toBe(1);

  await page.goto("/dashboard.html");
  await page.waitForFunction(() => typeof window.LongtailForge?.api?.getJson === "function");
  await page.route("**/api/browser-recovery-conflict-test", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        error: {
          code: "conflict",
          message: "The record changed.",
          requestId: "conflict-request-id",
        },
      }),
      contentType: "application/json",
      status: 409,
    });
  });
  await page.evaluate(() => {
    void window.LongtailForge?.api?.getJson("/api/browser-recovery-conflict-test");
  });
  await expect(page.locator("[data-framework-recovery][data-recovery-kind='conflict']")).toBeVisible();
  await expect(page.getByRole("link", { name: "Reload page" })).toHaveCount(1);
});
