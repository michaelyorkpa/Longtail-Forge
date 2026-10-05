import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("public footer links expose neutral Terms, Privacy, and exact Corresponding Source", async ({ page }) => {
  const loginResponse = await page.goto("/login.html");
  if (!loginResponse) {
    throw new Error("page.goto(\"/login.html\") returned no response");
  }
  expect(loginResponse.status()).toBe(200);

  const footer = page.locator(".site-footer");
  await expect(footer.getByRole("link", { name: "Terms" })).toBeVisible();
  await expect(footer.getByRole("link", { name: "Privacy" })).toBeVisible();
  const sourceLink = footer.getByRole("link", { name: "Corresponding Source for this running version" });
  await expect(sourceLink).toBeVisible();

  const appInfo = await page.request.get("/api/app-info");
  expect(appInfo.ok()).toBeTruthy();
  const runtimeIdentity = await appInfo.json();
  await expect(sourceLink).toHaveAttribute("href", runtimeIdentity.correspondingSourceUrl);

  await footer.getByRole("link", { name: "Terms" }).click();
  await expect(page).toHaveURL(/\/terms\.html$/);
  await expect(page.getByRole("heading", { name: "Operator Terms Template" })).toBeVisible();
  await expect(page.getByText("not a contract offered by Raymond Tec", { exact: false })).toBeVisible();
  await expect(page.locator(".site-footer").getByRole("link", { name: "Privacy" })).toBeVisible();

  await page.locator(".site-footer").getByRole("link", { name: "Privacy" }).click();
  await expect(page).toHaveURL(/\/privacy\.html$/);
  await expect(page.getByRole("heading", { name: "Operator Privacy Notice Template" })).toBeVisible();
  await expect(page.getByText("does not make Raymond Tec the data controller", { exact: false })).toBeVisible();
});
