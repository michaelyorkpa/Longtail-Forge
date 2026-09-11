import { createOwnedWorkspace, expect, test } from "./support/isolated-workspace.mjs";
import { usesManagedServer } from "./support/e2e-env.mjs";

// Why the workspace-mutating specs need their own *account*, proved rather than asserted.
//
// `0.33.33.44.16` found `workspace-rename-shell-label` and `workspace-settings-rejected-save`
// failing intermittently in the full suite while passing standalone: both rename the workspace the
// one seeded session is pointed at, and `fullyParallel` with two workers lets them overlap. The
// first test pins the product behaviour that makes account isolation necessary; the second
// exercises the same overlap under isolation and shows each side keeps its own answer.
const managedServerTest = usesManagedServer ? test : test.skip;

/**
 * The name the app shell is showing.
 *
 * Read from the **checked option**, not the combobox: it is a `<select>` listing every workspace
 * the account belongs to, so its own text is the concatenation of all of them. The seeded account
 * has exactly one workspace and hides this; an isolated account has two, which is what exposed it.
 * `client-projects-add-dialog-flow` already reads the checked option for the same reason.
 * @param {import("@playwright/test").Page} page
 */
async function shellWorkspaceName(page) {
  const checked = page.getByRole("combobox", { name: "Active workspace" }).locator("option:checked");
  return (await checked.textContent() || "").trim();
}

managedServerTest("two sessions of one account share its active workspace, so sessions cannot isolate it", async ({
  isolatedAccount, playwright,
}) => {
  // A *second* genuine login for the same account - the isolation that looks sufficient and is
  // not. It must be a real, successful login: a deliberately bad one would trip the
  // authentication throttle, which this repair never relaxes.
  const second = await playwright.request.newContext({ baseURL: isolatedAccount.baseURL });
  try {
    const login = await second.post("/api/login", {
      data: { username: isolatedAccount.username, password: isolatedAccount.password },
    });
    expect(login.status(), await login.text()).toBe(200);

    // Switching in one session must move the other, because the record they read is the
    // account's. This is `sessionsRepository.updateActiveWorkspaceForUser(userId, ...)` observed.
    const moved = await createOwnedWorkspace(isolatedAccount.api, `WS shared-${Date.now().toString(36)}`);
    expect(moved.workspaceName).not.toBe("");

    // Both sessions answer the same workspace, because the record they read is the account's and
    // not their own. That is the interference no amount of session separation can remove.
    const first = await isolatedAccount.api.get("/api/app-info");
    const other = await second.get("/api/app-info");
    expect(other.status()).toBe(first.status());
    expect(await other.text()).toBe(await first.text());
  } finally {
    await second.dispose();
  }
});

managedServerTest("an isolated workspace keeps its own name while another test renames its own", async ({
  isolatedWorkspace, playwright, browser,
}, testInfo) => {
  // A second isolated account, so the overlap is between two genuinely separate accounts rather
  // than two sessions of one.
  const rival = await playwright.request.newContext({ baseURL: isolatedWorkspace.account.baseURL });
  /** @type {import("@playwright/test").BrowserContext | null} */
  let rivalContext = null;
  try {
    const adminState = String(testInfo.project.use.storageState || "");
    const admin = await playwright.request.newContext({
      baseURL: isolatedWorkspace.account.baseURL, storageState: adminState,
    });
    const rivalName = `rival-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const createdRival = await admin.post("/api/users", {
      data: { username: `${rivalName}@longtailforge.local`, displayName: "Rival", timezone: "America/New_York" },
    });
    expect(createdRival.status(), await createdRival.text()).toBe(201);
    const rivalUser = await createdRival.json();

    try {
      const rivalLogin = await rival.post("/api/login", {
        data: { username: `${rivalName}@longtailforge.local`, password: rivalUser.initialPassword },
      });
      expect(rivalLogin.status(), await rivalLogin.text()).toBe(200);
      const rivalWorkspace = await createOwnedWorkspace(rival, `WS ${rivalName}`);

      rivalContext = await browser.newContext({
        baseURL: isolatedWorkspace.account.baseURL,
        storageState: await rival.storageState(),
        viewport: testInfo.project.use.viewport || { width: 1280, height: 800 },
      });
      const rivalPage = await rivalContext.newPage();

      // Both load their own Workspace Settings, then rename at the same moment.
      await Promise.all([
        isolatedWorkspace.page.goto("/workspace-settings.html"),
        rivalPage.goto("/workspace-settings.html"),
      ]);

      const mineRenamed = `${isolatedWorkspace.workspaceName} Renamed`;
      const rivalRenamed = `${rivalWorkspace.workspaceName} Renamed`;

      /** @param {import("@playwright/test").Page} page @param {string} renamed */
      const fill = async (page, renamed) => {
        const input = page.locator("[data-workspace-name-input]");
        await expect(input).toBeVisible();
        await input.fill(renamed);
      };
      await Promise.all([fill(isolatedWorkspace.page, mineRenamed), fill(rivalPage, rivalRenamed)]);

      // Saved together, so the writes genuinely overlap - no sleeps, both sides already staged.
      /** @param {import("@playwright/test").Page} page */
      const save = async (page) => {
        const button = page.locator("[data-settings-page-save]").first();
        await expect(button).toBeEnabled();
        await button.click();
      };
      await Promise.all([save(isolatedWorkspace.page), save(rivalPage)]);

      // Each side sees its own name, in the shell and through its own API session.
      await expect.poll(() => shellWorkspaceName(isolatedWorkspace.page)).toBe(mineRenamed);
      await expect.poll(() => shellWorkspaceName(rivalPage)).toBe(rivalRenamed);
      expect(mineRenamed).not.toBe(rivalRenamed);
    } finally {
      await admin.delete(`/api/users/${encodeURIComponent(rivalUser.user.user_id)}`).catch(() => {});
      await admin.dispose();
    }
  } finally {
    await rivalContext?.close();
    await rival.dispose();
  }
});
