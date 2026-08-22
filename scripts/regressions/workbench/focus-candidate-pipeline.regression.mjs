export const regressionMeta = Object.freeze({
  id: "workbench.focus-candidate-pipeline",
  area: "workbench",
  tier: "focused",
  tags: ["bootstrap", "candidates", "performance", "resume-state"],
  description: "Proves batched resume-state read checks return results identical to the per-row resolvers, the workbench bootstrap computes no focus candidates, and focus-candidate query counts stay near-constant as resume rows grow.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { workspaceSessionFixture } from "../../test-support/session-fixtures.mjs";

const root = process.cwd();
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-focus-candidate-pipeline-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "focus-candidate-pipeline.db");
process.env.SUPER_ADMIN_PASSWORD = "Focus-Candidate-Pipeline-Test-123!";

const workbenchSource = readFileSync(path.join(root, "src/services/workbench.service.js"), "utf8");
const producersSource = readFileSync(path.join(root, "src/services/work-resume-state-initial-producers.js"), "utf8");
const candidateSource = readFileSync(path.join(root, "src/services/work-candidate.service.js"), "utf8");

const { closeSqlite, initializeDatabase, querySql } = await import("../../../src/db/index.js");
const { readSqliteStatementCount } = await import("../../../src/db/sqlite.js");
const { tasksService } = await import("../../../src/modules/tasks/tasks.service.js");
const { workbenchService } = await import("../../../src/services/workbench.service.js");
const { workCandidateService } = await import("../../../src/services/work-candidate.service.js");
const { workResumeStateService } = await import("../../../src/services/work-resume-state.service.js");
const { registerResumeStateReadResolver, resetResumeStateReadResolvers } = await import("../../../src/services/work-resume-state-read-checks.js");
const {
  registerInitialResumeStateProducers,
  resetInitialResumeStateProducersForTests,
} = await import("../../../src/services/work-resume-state-initial-producers.js");

try {
  // Source guards: bootstrap owns no candidate computation, the batch
  // resolvers are registered, and the updated-boost scan is bounded.
  assert.doesNotMatch(workbenchSource, /workCandidateService/, "workbench bootstrap must not compute focus candidates");
  assert.match(producersSource, /registerResumeStateBatchReadResolver\("tasks", "task", taskBatchReadResolver\)/);
  assert.match(producersSource, /registerResumeStateBatchReadResolver\("lists", "list", listBatchReadResolver\)/);
  assert.match(producersSource, /registerResumeStateBatchReadResolver\("notes", "note", noteBatchReadResolver\)/);
  assert.match(producersSource, /registerResumeStateBatchReadResolver\("time-tracking", "active_work_timer", activeTimerBatchReadResolver\)/);
  assert.match(candidateSource, /limit: SECOND_UPDATED_TASK_SCAN_LIMIT/, "the second-updated boost should use the bounded scan");

  await initializeDatabase();
  resetResumeStateReadResolvers();
  resetInitialResumeStateProducersForTests();
  registerInitialResumeStateProducers();
  const session = await readSeedSession();

  const seededTasks = [];
  for (let index = 0; index < 12; index += 1) {
    const task = (await tasksService.create({
      title: `Pipeline resume task ${index}`,
      due_date: index % 3 === 0 ? "2026-07-30" : "",
    }, session)).task;
    seededTasks.push(task);
    await workResumeStateService.upsertResumeState(session, {
      lastActionLabel: "Updated task",
      lastActionType: "task.updated",
      lastWorkedAt: `2026-07-1${(index % 9) + 1}T0${index % 10}:00:00.000Z`,
      moduleId: "tasks",
      recordId: task.task_id,
      recordType: "task",
      statusSnapshot: "open",
      title: task.title,
    });
  }

  // Batched read checks return results identical to the per-row resolvers.
  const batchedCandidates = await workCandidateService.listWorkCandidates(session, { limit: 50 });
  const batchedResume = await workResumeStateService.listResumeState(session, { limit: 50, mode: "left_off" });

  // Re-registering the per-row production resolver supersedes the batch
  // shortcut, so the same reads run through the per-row path.
  /** @type {import("../../../src/types/framework-contracts.js").ResumeStateReadResolver} */
  const perRowTaskResolver = async ({ recordId, session: resolverSession }) => {
    try {
      const result = await tasksService.readCore(recordId, workspaceScopedSession(resolverSession));
      const task = result.task || {};
      return {
        archived: task.status === "archived",
        completed: task.status === "complete",
        readable: true,
        status: task.status || "open",
      };
    } catch {
      return { readable: false };
    }
  };
  registerResumeStateReadResolver("tasks", "task", perRowTaskResolver);

  const perRowCandidates = await workCandidateService.listWorkCandidates(session, { limit: 50 });
  const perRowResume = await workResumeStateService.listResumeState(session, { limit: 50, mode: "left_off" });

  assert.deepEqual(
    batchedCandidates.items.map((item) => item.candidateId),
    perRowCandidates.items.map((item) => item.candidateId),
    "candidate identity and ranking must match between batched and per-row read checks",
  );
  assert.deepEqual(batchedResume.items, perRowResume.items, "resume rows must be identical between batched and per-row read checks");

  // Restore the batched production wiring for the query-count proof.
  resetResumeStateReadResolvers();
  resetInitialResumeStateProducersForTests();
  registerInitialResumeStateProducers();

  // Bootstrap computes no candidates and stays within a small query budget.
  const bootstrapStart = readSqliteStatementCount();
  const bootstrap = await workbenchService.bootstrap(session);
  const bootstrapStatements = readSqliteStatementCount() - bootstrapStart;
  assert.deepEqual(bootstrap.workCandidates, [], "bootstrap must not compute focus candidates");
  assert.equal(bootstrap.workCandidateMode, "");
  assert.ok(Array.isArray(bootstrap.registry.workbenchCards) && bootstrap.registry.workbenchCards.length > 0);
  assert.ok(bootstrapStatements <= 25, `bootstrap issued ${bootstrapStatements} statements; budget is 25`);

  // Focus-candidate query counts stay near-constant as resume rows grow.
  const beforeSmall = readSqliteStatementCount();
  await workCandidateService.listWorkCandidates(session, { limit: 50 });
  const smallScanStatements = readSqliteStatementCount() - beforeSmall;

  for (let index = 0; index < 40; index += 1) {
    const task = (await tasksService.create({ title: `Pipeline growth task ${index}` }, session)).task;
    await workResumeStateService.upsertResumeState(session, {
      lastActionLabel: "Updated task",
      lastActionType: "task.updated",
      moduleId: "tasks",
      recordId: task.task_id,
      recordType: "task",
      statusSnapshot: "open",
      title: task.title,
    });
  }

  const beforeLarge = readSqliteStatementCount();
  await workCandidateService.listWorkCandidates(session, { limit: 50 });
  const largeScanStatements = readSqliteStatementCount() - beforeLarge;
  assert.ok(
    largeScanStatements - smallScanStatements <= 6,
    `candidate scan grew by ${largeScanStatements - smallScanStatements} statements for 40 extra resume rows; the batched budget allows 6`,
  );

  const integrity = await querySql("PRAGMA integrity_check;");
  assert.equal(integrity[0]?.integrity_check, "ok");

  console.log("focus candidate pipeline regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { force: true, recursive: true });
}

async function readSeedSession() {
  const rows = await querySql(`
SELECT users.user_id, users.username, users.timezone, users.home_workspace_id, users.active_workspace_id
FROM users
WHERE users.protected_user = 'yes'
LIMIT 1;
`);
  const user = rows[0];
  assert.ok(user, "fresh database should seed a protected super admin");

  return workspaceSessionFixture(user);
}

/**
 * The read-resolver context publishes a `RequestSession`, which does not
 * guarantee the workspace scope the Tasks read requires. This proves the scope
 * and carries the rest of the session through unchanged, so a resolver invoked
 * without one fails here instead of reading across workspaces.
 * @param {import("../../../src/types/http-contracts.js").RequestSession} session
 * @returns {import("../../../src/types/task-server-contracts.js").TaskServerSession}
 */
function workspaceScopedSession(session) {
  const workspaceId = session.workspace_id;
  assert.ok(workspaceId, "a task read resolver should receive a workspace-scoped session");
  return { ...session, workspace_id: workspaceId };
}
