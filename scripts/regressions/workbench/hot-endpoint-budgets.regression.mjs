/* global fetch */

export const regressionMeta = Object.freeze({
  id: "workbench.hot-endpoint-budgets",
  area: "workbench",
  tier: "focused",
  tags: ["budgets", "payload", "performance", "query-count"],
  description: "Pins statement-count and payload budgets for the hot workbench-path endpoints over HTTP so N+1 reintroductions and payload bloat fail loudly.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { workspaceSessionFixture } from "../../test-support/session-fixtures.mjs";

/** @typedef {import("../../../src/types/http-contracts.js").WorkspaceRequestSession} TasksSession */

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-hot-endpoint-budgets-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "hot-endpoint-budgets.db");
process.env.SUPER_ADMIN_PASSWORD = "Hot-Endpoint-Budgets-Test-123!";

const { createApp } = await import("../../../src/core/app.js");
const { closeSqlite, initializeDatabase, querySql } = await import("../../../src/db/index.js");
const { readSqliteStatementCount } = await import("../../../src/db/sqlite.js");
const { createSession } = await import("../../../src/security/sessions.js");
const { tasksService } = await import("../../../src/modules/tasks/tasks.service.js");

/** @type {import("node:http").Server | null} */
let server = null;

try {
  await initializeDatabase();
  const user = (await querySql(`
SELECT user_id, username, timezone, home_workspace_id, active_workspace_id
FROM users
WHERE protected_user = 'yes'
LIMIT 1;
`))[0];
  const session = workspaceSessionFixture(user);

  for (let index = 0; index < 30; index += 1) {
    await tasksService.create({
      title: `Budget task ${index}`,
      due_date: index % 3 === 0 ? "2026-08-01" : "",
      description: "Budget regression description that should only ship as an excerpt on list rows. ".repeat(3),
    }, session);
  }

  const httpSession = await createSession({
    active_workspace_id: session.workspace_id,
    home_workspace_id: session.home_workspace_id,
    timezone: session.timezone,
    user_id: session.user_id,
    username: session.username,
  });
  server = await new Promise((resolve) => {
    const instance = http.createServer(createApp());
    instance.listen(0, "127.0.0.1", () => resolve(instance));
  });
  assert.ok(server, "the budget fixture server should be listening");
  const address = server.address();
  assert.ok(address && typeof address === "object", "the budget fixture server should bind a TCP port");
  const base = `http://127.0.0.1:${address.port}`;
  const headers = { cookie: `longtail_forge_session=${httpSession.sessionId}` };

  /** @param {string} url */
  async function measure(url) {
    const before = readSqliteStatementCount();
    const response = await fetch(base + url, { headers });
    const text = await response.text();
    assert.equal(response.status, 200, `${url} should return 200`);
    return {
      body: JSON.parse(text),
      bytes: text.length,
      statements: readSqliteStatementCount() - before,
    };
  }

  // Warm per-process caches once (module context, statement cache, memos) so
  // the budgets pin steady-state request costs.
  for (const url of ["/api/workbench/bootstrap", "/api/tasks/workbench-items", "/api/tasks/options", "/api/workbench/focus-modes"]) {
    await measure(url);
  }

  const bootstrap = await measure("/api/workbench/bootstrap");
  assert.ok(bootstrap.statements <= 25, `bootstrap issued ${bootstrap.statements} statements; budget is 25`);
  assert.ok(bootstrap.bytes <= 10000, `bootstrap payload was ${bootstrap.bytes} bytes; budget is 10000`);
  assert.deepEqual(bootstrap.body.workCandidates, [], "bootstrap must not compute focus candidates");

  const focusModes = await measure("/api/workbench/focus-modes");
  assert.ok(focusModes.statements <= 5, `focus-modes issued ${focusModes.statements} statements; budget is 5`);

  const workbenchItems = await measure("/api/tasks/workbench-items");
  assert.ok(workbenchItems.statements <= 40, `workbench-items issued ${workbenchItems.statements} statements; budget is 40`);
  assert.equal(Object.hasOwn(workbenchItems.body, "options"), false, "workbench-items must not compute the options payload");
  const itemCount = workbenchItems.body.items.length;
  assert.ok(itemCount >= 30, "seeded tasks should appear as work items");
  assert.ok(
    workbenchItems.body.items.every((/** @type {object} */ item) => !Object.hasOwn(item, "description")),
    "work items must not ship the full description",
  );
  assert.ok(
    workbenchItems.bytes <= itemCount * 3500 + 4000,
    `workbench-items payload was ${workbenchItems.bytes} bytes for ${itemCount} items; budget is ${itemCount * 3500 + 4000}`,
  );

  const taskOptions = await measure("/api/tasks/options");
  assert.ok(taskOptions.statements <= 30, `tasks/options issued ${taskOptions.statements} statements; budget is 30`);
  assert.ok(Array.isArray(taskOptions.body.options?.tasks), "the options endpoint should return the task picker");

  // Query counts stay near-constant as the task list grows: forty more tasks
  // may add at most a handful of statements (batched enrichment, no N+1).
  for (let index = 0; index < 40; index += 1) {
    await tasksService.create({ title: `Budget growth task ${index}` }, session);
  }
  await measure("/api/tasks/workbench-items");
  const grownWorkbenchItems = await measure("/api/tasks/workbench-items");
  assert.ok(
    grownWorkbenchItems.statements - workbenchItems.statements <= 6,
    `workbench-items grew by ${grownWorkbenchItems.statements - workbenchItems.statements} statements for 40 extra tasks; the batched budget allows 6`,
  );

  const integrity = await querySql("PRAGMA integrity_check;");
  assert.equal(integrity[0]?.integrity_check, "ok");

  console.log("hot endpoint budgets regression passed.");
} finally {
  if (server) {
    const listening = server;
    await new Promise((resolve) => listening.close(() => resolve(undefined)));
  }
  await closeSqlite();
  await fs.rm(tempDir, { force: true, recursive: true });
}
