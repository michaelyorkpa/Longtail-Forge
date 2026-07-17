// Public-login visibility smoke: the forced password-change form must not
// render until the authenticated login response or session state requires it.

import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("login shows only the form appropriate to the authentication state", async ({ page }) => {
  const response = await page.goto("/login.html");

  expect(response.status(), "the public login view must be served without a session").toBe(200);
  await expect(page.locator("[data-login-form]")).toBeVisible();
  await expect(page.locator("[data-required-password-form]")).toBeHidden();

  await page.evaluate(() => globalThis.showRequiredPasswordChange("temporary-password"));

  await expect(page.locator("[data-login-form]")).toBeHidden();
  await expect(page.locator("[data-required-password-form]")).toBeVisible();
  await expect(page.locator('[name="rememberMe"]')).toBeHidden();
  await expect(page.locator("[data-required-current-password]")).toHaveValue("temporary-password");
});

test("remembered-login action row is aligned, operable, and submits an explicit boolean", async ({ page }) => {
  let loginPayload;
  await page.route("**/api/session", (route) => route.fulfill({
    status: 401,
    contentType: "application/json",
    body: JSON.stringify({ error: "Not logged in." }),
  }));
  await page.route("**/api/login", (route) => {
    loginPayload = route.request().postDataJSON();
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          loginLandingPath: "/dashboard.html",
          passwordChangeRequired: false,
          themeAutoSource: "system",
          themeMode: "light",
          timezone: "America/New_York",
        },
      }),
    });
  });
  await page.route("**/dashboard.html", (route) => route.fulfill({
    contentType: "text/html",
    body: "<!doctype html><title>Dashboard</title>",
  }));

  await page.goto("/login.html");
  const usernameInput = page.locator('[name="username"]');
  const passwordInput = page.locator('[name="password"]');
  const checkbox = page.locator('[name="rememberMe"]');
  const label = page.locator(".login-remember-option");
  const button = page.locator('[data-login-form] button[type="submit"]');

  await expect(label).toHaveText("Remember me for 30 days");
  await expect(checkbox).not.toBeChecked();
  await label.click();
  await expect(checkbox).toBeChecked();
  await checkbox.focus();
  await page.keyboard.press("Space");
  await expect(checkbox).not.toBeChecked();
  await page.keyboard.press("Space");
  await expect(checkbox).toBeChecked();
  await expect(label).toHaveCSS("white-space", "nowrap");

  const [usernameBox, passwordBox, labelBox, buttonBox] = await Promise.all([
    usernameInput.boundingBox(),
    passwordInput.boundingBox(),
    label.boundingBox(),
    button.boundingBox(),
  ]);
  expect(usernameBox).not.toBeNull();
  expect(passwordBox).not.toBeNull();
  expect(labelBox).not.toBeNull();
  expect(buttonBox).not.toBeNull();
  expect(Math.abs(labelBox.x - usernameBox.x), "remembered-login label should share the field's left edge").toBeLessThanOrEqual(1);
  expect(
    Math.abs((buttonBox.x + buttonBox.width) - (passwordBox.x + passwordBox.width)),
    "Log In should share the field's right edge",
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs((labelBox.y + labelBox.height / 2) - (buttonBox.y + buttonBox.height / 2)),
    "checkbox and button should be vertically centered",
  ).toBeLessThanOrEqual(1);

  await usernameInput.fill("remembered@example.test");
  await passwordInput.fill("password");
  await button.click();
  await expect(page).toHaveURL(/\/dashboard\.html$/);
  expect(loginPayload).toMatchObject({
    password: "password",
    rememberMe: true,
    username: "remembered@example.test",
  });
});

test("login follows the safe server-resolved preferred landing page", async ({ page }) => {
  let loginPayload;
  await page.route("**/api/session", (route) => route.fulfill({
    status: 401,
    contentType: "application/json",
    body: JSON.stringify({ error: "Not logged in." }),
  }));
  await page.route("**/api/login", (route) => {
    loginPayload = route.request().postDataJSON();
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          loginLandingPath: "/workbench.html",
          passwordChangeRequired: false,
          themeAutoSource: "system",
          themeMode: "light",
          timezone: "America/New_York",
        },
      }),
    });
  });
  await page.route("**/workbench.html", (route) => route.fulfill({
    contentType: "text/html",
    body: "<!doctype html><title>Preferred landing</title>",
  }));

  await page.goto("/login.html");
  await page.locator('[name="username"]').fill("landing@example.test");
  await page.locator('[name="password"]').fill("password");
  await page.locator('[data-login-form] button[type="submit"]').click();
  await expect(page).toHaveURL(/\/workbench\.html$/);
  expect(loginPayload.rememberMe).toBe(false);
});
