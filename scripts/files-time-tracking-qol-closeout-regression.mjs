import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-files-time-tracking-closeout-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-files-time-tracking-closeout.db");
process.env.SUPER_ADMIN_PASSWORD = "Files-Time-Tracking-Closeout-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql } = await import("../src/db/index.js");
const { helpService } = await import("../src/services/help.service.js");
const { modulesService } = await import("../src/core/modules/modules.service.js");

try {
  await initializeDatabase();
  const session = await readProtectedSession();

  await assertHelpDocumentsShippedFileBehavior(session);
  await assertHelpDocumentsTimeTrackingBehavior(session);
  await assertDeveloperDocsDocumentCloseoutContracts();
  await assertTimerLifecycleEventsRemainRegistered();

  console.log("Files and Time Tracking QoL closeout regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertHelpDocumentsShippedFileBehavior(session) {
  const { article } = await helpService.readArticle(session, "framework.files-attachments");

  for (const phrase of [
    "Workspace file settings include the active file type policy",
    "aggregate storage accounting",
    "server-side file type checks",
    "accepted files stay attached",
    "staged deletion",
    "restorable during the retention window",
  ]) {
    assert.match(article.body, new RegExp(escapeRegExp(phrase), "i"), `Files Help should mention ${phrase}`);
  }
}

async function assertHelpDocumentsTimeTrackingBehavior(session) {
  const frameworkArticle = (await helpService.readArticle(session, "framework.time-tracking")).article;
  const timerArticle = (await helpService.readArticle(session, "time-tracking.timers")).article;
  const correctionsArticle = (await helpService.readArticle(session, "time-tracking.entries-corrections")).article;

  assert.match(frameworkArticle.body, /paused time does not inflate billing or reporting totals/i);
  assert.match(frameworkArticle.body, /Workspace administrators with time-entry edit access can correct workspace entries/i);
  assert.match(timerArticle.body, /first timer start and final save time as factual timestamps/i);
  assert.match(timerArticle.body, /Duration is stored from accumulated active seconds only/i);
  assert.match(timerArticle.body, /Active and paused timer payloads include safe source context/i);
  assert.match(timerArticle.body, /Source labels and URLs are hidden/i);
  assert.match(correctionsArticle.body, /preserve the original entry owner/i);
  assert.match(correctionsArticle.body, /changed project or client destination scope/i);
  assert.doesNotMatch(timerArticle.body, /\bwill be\b/i, "Timer Help should not promise future behavior as shipped");
}

async function assertDeveloperDocsDocumentCloseoutContracts() {
  const timeTrackingDoc = await fs.readFile(path.join(process.cwd(), "docs/time-tracking-module.md"), "utf8");
  const fileCloseoutDoc = await fs.readFile(path.join(process.cwd(), "docs/0.32-module-file-closeout.md"), "utf8");

  for (const phrase of [
    "Timer timestamp and duration semantics",
    "Resume-safe timer metadata",
    "Time-entry corrections",
    "Paused wall-clock time",
    "future global resume feed",
    "Workspace administrators with `time_entries.edit_all`",
  ]) {
    assert.match(timeTrackingDoc, new RegExp(escapeRegExp(phrase), "i"), `Time Tracking docs should mention ${phrase}`);
  }

  for (const phrase of [
    "0.33.5.4 File QoL Closeout",
    "Files deletion is staged",
    "Multi-file uploads return per-file success/failure results",
    "Files workspace settings own file type policy",
    "Storage accounting is aggregate-only",
  ]) {
    assert.match(fileCloseoutDoc, new RegExp(escapeRegExp(phrase), "i"), `File closeout docs should mention ${phrase}`);
  }
}

async function assertTimerLifecycleEventsRemainRegistered() {
  const eventTypes = modulesService.listModuleEventTypes()
    .filter((eventType) => eventType.moduleId === "time-tracking")
    .map((eventType) => eventType.event)
    .sort();

  assert.deepEqual(eventTypes, [
    "timer.discarded",
    "timer.finalized",
    "timer.paused",
    "timer.started",
    "timer.still_running",
  ]);
}

async function readProtectedSession() {
  const user = (await querySql(`
SELECT user_id, username, home_workspace_id, active_workspace_id, timezone
FROM users
WHERE protected_user = 'yes'
ORDER BY username
LIMIT 1;
`))[0];

  assert.ok(user, "protected user fixture is required");

  return {
    active_workspace_id: user.active_workspace_id || user.home_workspace_id,
    home_workspace_id: user.home_workspace_id,
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: user.active_workspace_id || user.home_workspace_id,
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
