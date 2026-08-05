import { expect, test } from "@playwright/test";
import { expectNoWcagViolations } from "./support/axe.mjs";
import { E2E_PASSWORD, E2E_USERNAME, usesManagedServer } from "./support/e2e-env.mjs";

const managedServerTest = usesManagedServer ? test : test.skip;

managedServerTest("administrator can enter, inspect, end, and log out of an unmistakable read-only Support View", { tag: "@desktop" }, async ({ browser, playwright, request }, testInfo) => {
  const baseURL = String(testInfo.project.use.baseURL || "");
  const username = `support-view-target-${Date.now()}@longtailforge.local`;
  const reasonReference = `E2E support review ${Date.now()}`;
  const createResponse = await request.post("/api/users", {
    data: {
      displayName: "Disposable Support View Target",
      timezone: "America/New_York",
      username,
    },
  });
  expect(createResponse.status()).toBe(201);
  const created = await createResponse.json();
  let isolatedContext = null;
  let loginRequest = null;
  let page = null;

  try {
    loginRequest = await playwright.request.newContext({ baseURL });
    const loginResponse = await loginRequest.post("/api/login", {
      data: {
        username: E2E_USERNAME,
        password: E2E_PASSWORD,
      },
    });
    expect(loginResponse.status()).toBe(200);
    isolatedContext = await browser.newContext({
      baseURL,
      storageState: await loginRequest.storageState(),
      viewport: { width: 1920, height: 1080 },
    });
    page = await isolatedContext.newPage();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/dashboard.html");
    await page.goto("/support-view.html");
    await expect(page.getByRole("heading", { name: "Support View", exact: true })).toBeVisible();
    await page.locator("[data-support-view-target]").selectOption({ label: `Disposable Support View Target (${username})` });
    await expect(page.locator("[data-support-view-workspace] option")).toHaveCount(1);
    await page.locator("[data-support-view-password]").fill(E2E_PASSWORD);
    await page.locator("[data-support-view-reason]").fill(reasonReference);
    await page.locator("[data-support-view-confirm]").check();
    await page.getByRole("button", { name: "Start Support View" }).click();

    await expect(page).toHaveURL(/dashboard\.html$/);
    const banner = page.locator("[data-support-view-banner]");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Support View — read only");
    await expect(banner).toContainText("Disposable Support View Target");
    await expect(banner).toContainText("Remaining:");
    const endSupportViewButton = page.getByRole("button", { name: "End Support View" });
    await expect(endSupportViewButton).toBeVisible();
    const endButtonBounds = await endSupportViewButton.boundingBox();
    expect(endButtonBounds).not.toBeNull();
    expect(endButtonBounds.x + endButtonBounds.width).toBeLessThanOrEqual(1920);
    await expectNoWcagViolations(page, testInfo, "support-view-active");

    await page.evaluate(() => {
      const button = globalThis.document.createElement("button");
      button.type = "button";
      button.textContent = "Save test change";
      button.dataset.e2eSupportMutation = "";
      globalThis.document.querySelector("main").appendChild(button);
    });
    await expect(page.locator("[data-e2e-support-mutation]"), "dynamic mutation controls must be disabled").toBeDisabled();

    const mutation = await page.evaluate(() => new Promise((resolve) => {
      const xhr = new globalThis.XMLHttpRequest();
      xhr.open("POST", "/api/tasks");
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.onload = () => resolve({ status: xhr.status, body: JSON.parse(xhr.responseText) });
      xhr.send(JSON.stringify({ title: "Must not be created" }));
    }));
    expect(mutation.status).toBe(403);
    expect(mutation.body.error.code).toBe("support_view_read_only");

    const hiddenAuditStatus = await page.evaluate(() => new Promise((resolve) => {
      const xhr = new globalThis.XMLHttpRequest();
      xhr.open("GET", "/api/support-view/audit");
      xhr.onload = () => resolve(xhr.status);
      xhr.send();
    }));
    expect(hiddenAuditStatus).toBe(404);

    await page.getByRole("button", { name: "End Support View" }).click();
    await expect(page).toHaveURL(/dashboard\.html$/);
    await expect(page.locator("[data-support-view-banner]")).toHaveCount(0);
    await expect(page.locator("main h1")).toBeFocused();

    await page.goto("/support-view-audit.html");
    await expect(page.getByRole("heading", { name: "Support View Audit" })).toBeVisible();
    await expect(page.locator("[data-support-view-audit-body]")).toContainText(reasonReference);
    await expect(page.locator("[data-support-view-audit-policy]")).toContainText("retained for 365 days");
    await expectNoWcagViolations(page, testInfo, "support-view-audit");

    await page.goto("/support-view.html");
    await page.locator("[data-support-view-target]").selectOption({ label: `Disposable Support View Target (${username})` });
    await page.locator("[data-support-view-password]").fill(E2E_PASSWORD);
    await page.locator("[data-support-view-reason]").fill(`${reasonReference} logout`);
    await page.locator("[data-support-view-confirm]").check();
    await page.getByRole("button", { name: "Start Support View" }).click();
    await expect(page.getByRole("button", { name: "End Support View" })).toBeVisible();

    await page.evaluate(() => {
      globalThis.sessionStorage.removeItem("e2e-support-permission-denied");
      new globalThis.MutationObserver(() => {
        if (globalThis.document.querySelector("dialog[data-framework-permission-denied]")) {
          globalThis.sessionStorage.setItem("e2e-support-permission-denied", "true");
        }
      }).observe(globalThis.document.body, { childList: true, subtree: true });
    });
    await page.locator('details[data-nav-menu="Settings"] > summary').click();
    const logoutResponsePromise = page.waitForResponse((response) => (
      response.url().endsWith("/api/logout") && response.request().method() === "POST"
    ));
    await page.getByRole("button", { name: "Log Out" }).click();
    const logoutResponse = await logoutResponsePromise;
    expect(logoutResponse.status()).toBe(200);
    await expect(page).toHaveURL(/login\.html$/);
    await expect(page.locator("[data-login-form]")).toBeVisible();
    await expect(page.locator("dialog[data-framework-permission-denied]")).toHaveCount(0);
    expect(await page.evaluate(() => globalThis.sessionStorage.getItem("e2e-support-permission-denied"))).toBeNull();
    await page.goto("/dashboard.html");
    await expect(page.getByRole("heading", { name: "Sign in required" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login.html");
    await expect(page.locator("[data-support-view-banner]")).toHaveCount(0);
  } finally {
    if (page) {
      const exitButton = page.getByRole("button", { name: "End Support View" });
      if (await exitButton.count()) {
        await exitButton.click();
        await expect(page.locator("[data-support-view-banner]")).toHaveCount(0);
      }
    }
    await request.delete(`/api/users/${created.user.user_id}`);
    await isolatedContext?.close();
    await loginRequest?.dispose();
  }
});
