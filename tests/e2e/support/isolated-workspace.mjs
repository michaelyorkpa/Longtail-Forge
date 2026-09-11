// Isolated accounts, sessions and owned workspaces for the specs that mutate workspace state.
//
// **Isolating workspaces alone is not enough, and that is a property of the product.**
// `usersService.switchActiveWorkspace` writes through `usersRepository.updateActiveWorkspace(userId, ...)`
// *and* `sessionsRepository.updateActiveWorkspaceForUser(userId, ...)`. The second is keyed by
// **user**, not session, so every session an account holds moves together. Two logins to one
// account therefore interfere exactly as one session would, and the unit of isolation has to be
// the account.
//
// **The account is worker-scoped and the workspace is test-scoped, and that split is deliberate.**
// Provisioning an account costs a login, and `LONGTAIL_AUTH_THROTTLE_*` limits login attempts per
// window - a real security control this repair must not relax. One account per worker per project
// is four logins for a two-worker run instead of one per test. It is safe because a Playwright
// worker runs exactly one test at a time, so worker-scoped state is never *concurrently* shared;
// that is the execution model, not an assumption. Sequential reuse is reset by giving each test a
// freshly created workspace of its own, which also moves the account onto it.
import { test as base, expect } from "@playwright/test";
import { usesManagedServer } from "./e2e-env.mjs";

/**
 * @typedef {{
 *   api: import("@playwright/test").APIRequestContext,
 *   baseURL: string, identity: string, username: string, userId: string, password: string,
 * }} IsolatedAccount
 *
 * @typedef {{
 *   workspaceName: string, workspaceType: string, workspaceId: string,
 *   api: import("@playwright/test").APIRequestContext,
 *   context: import("@playwright/test").BrowserContext,
 *   page: import("@playwright/test").Page,
 *   account: IsolatedAccount,
 * }} IsolatedWorkspace
 */

/**
 * A name no other project, worker, test, retry or run can collide with.
 * @param {string} label
 * @param {{ project: { name: string }, workerIndex: number }} info
 */
function uniqueLabel(label, info) {
  const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${label}-${info.project.name}-w${info.workerIndex}-${unique}`;
}

/**
 * Create a workspace owned by the calling session and switch that account onto it.
 *
 * `GET /api/workspaces` is deliberately not used to discover a type: it requires the
 * administrative `users.manage` read permission, which a disposable account does not have and must
 * not be granted merely to satisfy a test. The self-service types are tried in turn instead.
 * @param {import("@playwright/test").APIRequestContext} api
 * @param {string} workspaceName
 */
export async function createOwnedWorkspace(api, workspaceName) {
  const refusals = [];
  for (const workspaceType of ["business", "personal"]) {
    const attempt = await api.post("/api/workspaces", { data: { workspaceName, workspaceType } });
    if (attempt.status() === 201) {
      const body = await attempt.json();
      return {
        workspaceName,
        workspaceType,
        workspaceId: body.workspace?.workspace_id || body.workspaceId || "",
      };
    }
    refusals.push(`${workspaceType}: ${attempt.status()} ${await attempt.text()}`);
  }
  throw new Error(`no workspace type could be created (${refusals.join(" | ")})`);
}

/**
 * The fixtures, typed here rather than left to inference: `base.extend` cannot infer worker-scoped
 * tuples from a JSDoc object literal, and an untyped literal would put every callback parameter
 * back to implicit `any`.
 * @type {import("@playwright/test").Fixtures<
 *   { isolatedWorkspace: IsolatedWorkspace },
 *   { isolatedAccount: IsolatedAccount },
 *   import("@playwright/test").PlaywrightTestArgs & import("@playwright/test").PlaywrightTestOptions,
 *   import("@playwright/test").PlaywrightWorkerArgs & import("@playwright/test").PlaywrightWorkerOptions
 * >}
 */
const isolationFixtures = ({
  /**
   * One disposable account, logged in once, for the lifetime of this worker and project.
   *
   * Teardown deletes only the account it created. The shared seeded account's active workspace is
   * never moved and `E2E_STORAGE_STATE_PATH` is never rewritten - the admin session is read to
   * create and delete the account, and storage state is passed in memory everywhere else.
   */
  isolatedAccount: [async ({ playwright }, use, workerInfo) => {
    // Fails loudly rather than handing back a null fixture: the specs that request it are gated
    // on the managed server, so reaching here without one is a harness error, not a skip.
    if (!usesManagedServer) {
      throw new Error("isolated account fixtures require the managed e2e server");
    }

    const baseURL = String(workerInfo.project.use.baseURL || "");
    const admin = await playwright.request.newContext({
      baseURL,
      storageState: String(workerInfo.project.use.storageState || ""),
    });
    const identity = uniqueLabel("iso", workerInfo);
    const username = `${identity}@longtailforge.local`;

    const createdResponse = await admin.post("/api/users", {
      data: { username, displayName: `Isolated ${identity}`, timezone: "America/New_York" },
    });
    expect(createdResponse.status(), await createdResponse.text()).toBe(201);
    const created = await createdResponse.json();
    const userId = created.user.user_id;

    /** @type {import("@playwright/test").APIRequestContext | null} */
    let api = null;
    try {
      const session = await playwright.request.newContext({ baseURL });
      api = session;
      const login = await session.post("/api/login", {
        data: { username, password: created.initialPassword },
      });
      expect(login.status(), await login.text()).toBe(200);

      await use({ api: session, baseURL, identity, username, userId, password: created.initialPassword });
    } finally {
      // Cleanup never replaces a real failure with a tidying one: each step is attempted and the
      // first error is reported only after all of them have run.
      /** @type {Error | null} */
      let failure = null;
      for (const step of [
        async () => { await api?.dispose(); },
        async () => {
          const deleted = await admin.delete(`/api/users/${encodeURIComponent(userId)}`);
          if (!deleted.ok()) throw new Error(`could not delete ${username}: ${deleted.status()}`);
        },
        async () => { await admin.dispose(); },
      ]) {
        try {
          await step();
        } catch (error) {
          failure = failure || (error instanceof Error ? error : new Error(String(error)));
        }
      }
      if (failure) throw failure;
    }
  }, { scope: "worker" }],

  /**
   * A workspace this test alone owns, plus a page and an API context already on it.
   *
   * Test-scoped, so sequential reuse of the worker's account is reset: every test creates its own
   * workspace and the account is switched onto it as a side effect of creating it.
   */
  isolatedWorkspace: async ({ isolatedAccount, browser }, use, testInfo) => {
    const workspaceName = `WS ${uniqueLabel("t", testInfo)}-r${testInfo.retry}`;
    const workspace = await createOwnedWorkspace(isolatedAccount.api, workspaceName);

    const context = await browser.newContext({
      baseURL: isolatedAccount.baseURL,
      storageState: await isolatedAccount.api.storageState(),
      viewport: testInfo.project.use.viewport || { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    try {
      await use({ ...workspace, api: isolatedAccount.api, context, page, account: isolatedAccount });
    } finally {
      await context.close();
    }
  },
});

export const test = base.extend(isolationFixtures);

export { expect };
