/* global document, innerWidth */

import { expect, test } from "@playwright/test";

test("Calendar subscriptions support Workspace, Client, and Project lifecycle", async ({ page }) => {
  const subscriptions = [
    subscription({
      id: "sub-own",
      name: "Workspace overview",
      owner: "Current Administrator",
      ownedByCurrentUser: true,
      scope: "Workspace",
    }),
    subscription({
      id: "sub-other",
      name: "Shared delivery",
      owner: "Another Owner",
      ownedByCurrentUser: false,
      scope: "Alpha Client",
    }),
    subscription({
      id: "sub-revoked",
      name: "Old calendar",
      owner: "Current Administrator",
      ownedByCurrentUser: true,
      scope: "Beta Client / Beta Project",
      status: "revoked",
    }),
  ];
  let issueNumber = 0;

  await page.route("**/api/client-projects?view=options", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      clients: [
        {
          id: "client-alpha",
          name: "Alpha Client",
          projects: [
            { id: "project-alpha", name: "Alpha Project" },
            { id: "project-alpha-child", name: "Alpha Child Project" },
          ],
        },
        {
          id: "client-beta",
          name: "Beta Client",
          projects: [{ id: "project-beta", name: "Beta Project" }],
        },
      ],
      view: "options",
      workspaceProjects: [{ id: "project-workspace", name: "Workspace Project" }],
    }),
  }));
  await page.route("**/api/private-feeds/calendar-subscriptions**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (request.method() === "GET" && pathname.endsWith("/calendar-subscriptions")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ subscriptions }),
      });
      return;
    }
    if (request.method() === "POST" && pathname.endsWith("/calendar-subscriptions")) {
      const payload = request.postDataJSON();
      issueNumber += 1;
      const created = subscription({
        id: `sub-created-${issueNumber}`,
        name: payload.name,
        owner: "Current Administrator",
        ownedByCurrentUser: true,
        scope: payload.scopeType === "project" ? "Alpha Client / Alpha Project" : "Workspace",
      });
      subscriptions.unshift(created);
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({
          feedUrl: `https://example.test/feeds/calendar/ltf_feed_created_${issueNumber}.ics`,
          subscription: created,
        }),
      });
      return;
    }
    if (request.method() === "POST" && pathname.endsWith("/rotate")) {
      const id = pathname.split("/").at(-2);
      const item = subscriptions.find((entry) => entry.subscriptionId === id);
      item.rotatedAt = "2026-07-25T15:00:00.000Z";
      issueNumber += 1;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          feedUrl: `https://example.test/feeds/calendar/ltf_feed_rotated_${issueNumber}.ics`,
          subscription: item,
        }),
      });
      return;
    }
    if (request.method() === "DELETE") {
      const id = pathname.split("/").at(-1);
      const item = subscriptions.find((entry) => entry.subscriptionId === id);
      item.status = "revoked";
      item.revokedAt = "2026-07-25T16:00:00.000Z";
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ subscription: item }),
      });
      return;
    }
    await route.continue();
  });

  const response = await page.goto("/calendar-settings.html");
  expect(response.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Calendar", exact: true })).toBeVisible();
  await expect(page.locator('a[href="calendar-settings.html"]')).toHaveCount(1);

  const createForm = page.locator("[data-calendar-subscription-create-form]");
  const scope = page.locator("[data-calendar-subscription-scope]");
  const client = page.locator("[data-calendar-subscription-client]");
  const project = page.locator("[data-calendar-subscription-project]");
  await expect(scope).toHaveValue("workspace");
  await expect(client).toBeHidden();
  await expect(project).toBeHidden();

  await scope.focus();
  await page.keyboard.press("End");
  await expect(scope).toHaveValue("project");
  await expect(client).toBeVisible();
  await expect(project).toBeVisible();
  await client.selectOption("client-alpha");
  await expect(project.locator("option")).toHaveText([
    "Choose a project",
    "Alpha Project",
    "Alpha Child Project",
  ]);
  await expect(project.locator('option[value="project-beta"]')).toHaveCount(0);

  await createForm.locator("[data-calendar-subscription-name]").fill("Project delivery");
  await project.selectOption("project-alpha");
  await createForm.getByRole("button", { name: "Create Subscription" }).click();

  const secretInput = page.locator("[data-calendar-subscription-url]");
  await expect(secretInput).toBeVisible();
  await expect(secretInput).toHaveAttribute("type", "password");
  await expect(secretInput).toHaveValue("https://example.test/feeds/calendar/ltf_feed_created_1.ics");
  await page.getByRole("button", { name: "Reveal URL" }).click();
  await expect(secretInput).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Copy URL" }).click();
  await expect(page.locator("[data-calendar-subscription-secret-status]")).toContainText("copied");

  const rows = page.locator("[data-calendar-subscription-list] tr");
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText("Project delivery");
  await expect(rows.nth(0)).toContainText("Alpha Client / Alpha Project");
  const anotherOwner = rows.filter({ hasText: "Another Owner" });
  await expect(anotherOwner.getByRole("button", { name: "Rotate" })).toHaveCount(0);
  await expect(anotherOwner.getByRole("button", { name: "Revoke" })).toHaveCount(1);
  await expect(page.locator("body")).not.toContainText("sub-other");
  await expect(page.locator("body")).not.toContainText("client-alpha");
  await expect(page.locator("body")).not.toContainText("project-alpha");

  const ownRow = rows.filter({ hasText: "Workspace overview" });
  await ownRow.getByRole("button", { name: "Rotate" }).click();
  const rotateDialog = page.getByRole("dialog").filter({ hasText: "Rotate calendar subscription URL?" });
  await expect(rotateDialog).toBeVisible();
  await rotateDialog.getByRole("button", { name: "Rotate URL", exact: true }).click();
  await expect(secretInput).toHaveValue("https://example.test/feeds/calendar/ltf_feed_rotated_2.ics");
  await expect(secretInput).toHaveAttribute("type", "password");
  await expect(ownRow.getByRole("button", { name: "Rotate" })).toBeFocused();

  await anotherOwner.getByRole("button", { name: "Revoke" }).click();
  const revokeDialog = page.getByRole("dialog").filter({ hasText: "Revoke calendar subscription?" });
  await expect(revokeDialog).toBeVisible();
  await revokeDialog.getByRole("button", { name: "Revoke", exact: true }).click();
  await expect(anotherOwner).toContainText("Revoked");
  await expect(anotherOwner.getByRole("button", { name: "Revoke" })).toHaveCount(0);
  await expect(anotherOwner).toBeFocused();

  for (const [name, href] of [
    ["Google Calendar", "https://support.google.com/calendar/answer/37100"],
    ["Apple Calendar", "https://support.apple.com/guide/calendar/subscribe-to-calendars-icl1022/mac"],
    ["Thunderbird", "https://support.mozilla.org/en-US/kb/creating-new-calendars"],
  ]) {
    await expect(page.getByRole("link", { name })).toHaveAttribute("href", href);
  }

  const overflow = await page.evaluate(() => ({
    innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth + 1);
  const tableOverflow = await page.locator(".calendar-subscription-table-wrap").evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(tableOverflow.scrollWidth).toBeGreaterThanOrEqual(tableOverflow.clientWidth);

  await page.goto("/user-settings.html");
  await expect(page.getByText("Calendar Subscription", { exact: true })).toHaveCount(0);
  await page.goto("/calendar-settings.html");
  await expect(page.locator("[data-calendar-subscription-secret-panel]")).toBeHidden();
  await expect(secretInput).toHaveValue("");
});

test("disabled Tasks keeps Calendar metadata and revocation available", async ({ page }) => {
  await page.route("**/api/app-shell/bootstrap", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.enabledModules = (body.enabledModules || []).filter((moduleId) => moduleId !== "tasks");
    body.workspaceContext.enabledModules = (body.workspaceContext?.enabledModules || [])
      .filter((moduleId) => moduleId !== "tasks");
    await route.fulfill({ response, json: body });
  });
  await page.route("**/api/client-projects?view=options", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ clients: [], view: "options", workspaceProjects: [] }),
  }));
  await page.route("**/api/private-feeds/calendar-subscriptions", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      subscriptions: [
        subscription({
          id: "sub-disabled-tasks",
          name: "Recovery calendar",
          owner: "Current Administrator",
          ownedByCurrentUser: true,
          scope: "Workspace",
        }),
      ],
    }),
  }));

  const response = await page.goto("/calendar-settings.html");
  expect(response.status()).toBe(200);
  await expect(page.locator("[data-calendar-subscription-availability]")).toContainText("Tasks is disabled");
  await expect(page.getByRole("button", { name: "Create Subscription" })).toBeDisabled();
  const row = page.locator("[data-calendar-subscription-list] tr").filter({ hasText: "Recovery calendar" });
  await expect(row.getByRole("button", { name: "Rotate" })).toBeDisabled();
  await expect(row.getByRole("button", { name: "Revoke" })).toBeEnabled();
  await expect(page.locator('a[href="calendar-settings.html"]')).toHaveCount(1);
});

function subscription({
  id,
  name,
  owner,
  ownedByCurrentUser,
  scope,
  status = "active",
}) {
  return {
    createdAt: "2026-07-25T12:00:00.000Z",
    name,
    ownedByCurrentUser,
    owner: { displayName: owner, username: `${owner.toLowerCase().replaceAll(" ", ".")}@example.test` },
    revokedAt: status === "revoked" ? "2026-07-25T13:00:00.000Z" : null,
    rotatedAt: null,
    scope: { label: scope, type: scope === "Workspace" ? "workspace" : "project" },
    status,
    subscriptionId: id,
  };
}
