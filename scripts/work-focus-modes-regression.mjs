import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-work-focus-modes-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-work-focus-modes.db");
process.env.SUPER_ADMIN_PASSWORD = "Work-Focus-Modes-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const {
  registerResumeStateReadResolver,
  resetResumeStateReadResolvers,
} = await import("../src/services/work-resume-state-read-checks.js");
const {
  FOCUS_MODE_IDS,
  workFocusModesService,
} = await import("../src/services/work-focus-modes.service.js");
const { projectsRepository } = await import("../src/modules/client-projects/projects.repo.js");
const {
  WORK_CANDIDATE_SORTS,
  workCandidateService,
} = await import("../src/services/work-candidate.service.js");
const { workResumeStateService } = await import("../src/services/work-resume-state.service.js");

try {
  await initializeDatabase();
  const session = await readSeedSession();

  resetResumeStateReadResolvers();
  registerResumeStateReadResolver("tasks", "task", async () => ({ readable: true, status: "active" }));

  await assertCanonicalBusinessFocusModes(session);
  await assertModeResolutionContracts(session);
  await assertResolvedContextsDriveCandidates(session);
  await assertClientFocusWorkspaceGating(session);

  console.log("Work focus modes regression passed.");
} finally {
  resetResumeStateReadResolvers();
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertCanonicalBusinessFocusModes(session) {
  const modes = await workFocusModesService.listFocusModes(session);

  assert.deepEqual(modes.map((mode) => mode.id), [
    FOCUS_MODE_IDS.startMyDay,
    FOCUS_MODE_IDS.pickUpWhereLeftOff,
    FOCUS_MODE_IDS.whatsDueNext,
    FOCUS_MODE_IDS.workThisWeek,
    FOCUS_MODE_IDS.reviewBlockedWork,
    FOCUS_MODE_IDS.inProgress,
    FOCUS_MODE_IDS.projectFocus,
    FOCUS_MODE_IDS.clientFocus,
  ]);
  assert.deepEqual(modes.map((mode) => mode.label), [
    "Start my day",
    "Pick up where I left off",
    "What's due next",
    "Work this week",
    "Review blocked work",
    "In progress",
    "Project focus",
    "Client focus",
  ]);
}

async function assertModeResolutionContracts(session) {
  const today = "2026-07-07";
  const startMyDay = await workFocusModesService.resolveFocusMode(session, {
    modeId: FOCUS_MODE_IDS.startMyDay,
    today,
  });
  const pickUp = await workFocusModesService.resolveFocusMode(session, {
    modeId: FOCUS_MODE_IDS.pickUpWhereLeftOff,
    today,
  });
  const dueNext = await workFocusModesService.resolveFocusMode(session, {
    modeId: "What's due next",
    today,
  });
  const week = await workFocusModesService.resolveFocusMode(session, {
    modeId: FOCUS_MODE_IDS.workThisWeek,
    today,
  });
  const blocked = await workFocusModesService.resolveFocusMode(session, {
    modeId: FOCUS_MODE_IDS.reviewBlockedWork,
    today,
  });
  const inProgress = await workFocusModesService.resolveFocusMode(session, {
    modeId: FOCUS_MODE_IDS.inProgress,
    today,
  });
  const project = await workFocusModesService.resolveFocusMode(session, {
    modeId: FOCUS_MODE_IDS.projectFocus,
    projectId: "project-alpha",
    today,
  });
  const client = await workFocusModesService.resolveFocusMode(session, {
    clientId: "client-alpha",
    modeId: FOCUS_MODE_IDS.clientFocus,
    today,
  });

  assert.equal(startMyDay.scope.type, "workspace");
  assert.ok(startMyDay.filters.rankBuckets.includes("running_timer"));
  assert.ok(startMyDay.filters.rankBuckets.includes("due_today"));
  assert.equal(startMyDay.candidateQuery.mode, FOCUS_MODE_IDS.startMyDay);
  assert.deepEqual(pickUp.resumeStrategy, {
    fallback: "ranked-candidates",
    fallbackRankBuckets: ["recently_touched"],
    primary: "work-resume",
  });
  assert.deepEqual(pickUp.candidateQuery.rankBuckets, ["recently_touched"]);
  assert.equal(dueNext.modeId, FOCUS_MODE_IDS.whatsDueNext);
  assert.equal(dueNext.filters.date.dueTo, "2026-07-14");
  assert.equal(dueNext.candidateQuery.dueTo, "2026-07-14");
  assert.equal(dueNext.candidateQuery.rankBuckets, undefined);
  assert.equal(dueNext.filters.sort, WORK_CANDIDATE_SORTS.dueDatetime);
  assert.equal(dueNext.candidateQuery.sort, WORK_CANDIDATE_SORTS.dueDatetime);
  assert.equal(week.filters.date.dueFrom, today);
  assert.equal(week.filters.date.dueTo, "2026-07-14");
  assert.equal(week.candidateQuery.dueFrom, today);
  assert.equal(week.candidateQuery.dueTo, "2026-07-14");
  assert.equal(week.filters.sort, WORK_CANDIDATE_SORTS.dueDatetime);
  assert.equal(week.candidateQuery.sort, WORK_CANDIDATE_SORTS.dueDatetime);
  assert.deepEqual(blocked.filters.status, ["blocked"]);
  assert.deepEqual(inProgress.filters.status, ["running", "paused", "active", "in_progress"]);
  assert.deepEqual(project.scope, {
    clientId: "",
    projectId: "project-alpha",
    type: "project",
  });
  assert.equal(project.candidateQuery.projectId, "project-alpha");
  assert.deepEqual(client.scope, {
    clientId: "client-alpha",
    projectId: "",
    type: "client",
  });
  assert.equal(client.candidateQuery.clientId, "client-alpha");
}

async function assertResolvedContextsDriveCandidates(session) {
  const today = "2026-07-07";
  const projectAlpha = `project-alpha-${randomUUID()}`;
  const projectBeta = `project-beta-${randomUUID()}`;

  await createProject(session.workspace_id, projectAlpha, "Focus Alpha");
  await createProject(session.workspace_id, projectBeta, "Focus Beta");

  const oldestOverdueId = await upsertTaskCandidate(session, {
    dueAtSnapshot: "2026-07-01T17:00:00.000Z",
    projectId: projectAlpha,
    title: "Z Oldest Overdue",
  });
  const newerOverdueId = await upsertTaskCandidate(session, {
    dueAtSnapshot: "2026-07-06T17:00:00.000Z",
    projectId: projectAlpha,
    title: "A Newer Overdue",
  });
  const dueTodayId = await upsertTaskCandidate(session, {
    dueAtSnapshot: "2026-07-07T14:00:00.000Z",
    projectId: projectAlpha,
    resumeRankHint: 1,
    title: "Focus Due Today",
  });
  const dueWeekId = await upsertTaskCandidate(session, {
    dueAtSnapshot: "2026-07-10T14:00:00.000Z",
    projectId: projectBeta,
    resumeRankHint: 1000,
    title: "Focus Due This Week",
  });
  const dueWeekLaterId = await upsertTaskCandidate(session, {
    dueAtSnapshot: "2026-07-12T14:00:00.000Z",
    projectId: projectBeta,
    title: "Focus Due Later This Week",
  });
  const laterId = await upsertTaskCandidate(session, {
    dueAtSnapshot: "2026-08-01",
    projectId: projectAlpha,
    title: "Focus Later",
  });
  const blockedId = await upsertTaskCandidate(session, {
    blockedReason: "Waiting on a recovery decision.",
    projectId: projectAlpha,
    statusSnapshot: "blocked",
    title: "Focus Blocked",
  });
  const staleId = await upsertTaskCandidate(session, {
    lastWorkedAt: "2026-06-20T12:00:00.000Z",
    projectId: projectAlpha,
    statusSnapshot: "active",
    title: "Focus Stale",
  });
  const activeId = await upsertTaskCandidate(session, {
    projectId: projectAlpha,
    statusSnapshot: "active",
    title: "Focus Active",
  });

  const dueNextContext = await workFocusModesService.resolveFocusMode(session, {
    modeId: FOCUS_MODE_IDS.whatsDueNext,
    today,
  });
  const dueNext = await workCandidateService.listWorkCandidates(session, {
    ...dueNextContext.candidateQuery,
    limit: 100,
  });

  assert.deepEqual(intersectCandidateIds(dueNext.items, [
    oldestOverdueId,
    newerOverdueId,
    dueTodayId,
    dueWeekId,
    dueWeekLaterId,
  ]), [
    oldestOverdueId,
    newerOverdueId,
    dueTodayId,
    dueWeekId,
    dueWeekLaterId,
  ]);
  assert.equal(dueNext.items.some((candidate) => candidate.recordId === laterId), false);
  assert.equal(dueNext.items.some((candidate) => candidate.recordId === blockedId), false);

  const weekFocus = await workFocusModesService.listFocusCandidates(session, {
    limit: 100,
    modeId: FOCUS_MODE_IDS.workThisWeek,
    today,
  });

  assert.deepEqual(intersectCandidateIds(weekFocus.items, [
    dueTodayId,
    dueWeekId,
    dueWeekLaterId,
  ]), [
    dueTodayId,
    dueWeekId,
    dueWeekLaterId,
  ]);
  assert.equal(weekFocus.items.some((candidate) => candidate.recordId === oldestOverdueId), false);
  assert.equal(weekFocus.items.some((candidate) => candidate.recordId === newerOverdueId), false);
  assert.equal(weekFocus.items.some((candidate) => candidate.recordId === laterId), false);

  const projectFocus = await workFocusModesService.listFocusCandidates(session, {
    limit: 100,
    modeId: FOCUS_MODE_IDS.projectFocus,
    projectId: projectAlpha,
    today,
  });

  assert.equal(projectFocus.focusContext.scope.projectId, projectAlpha);
  assert.ok(projectFocus.items.some((candidate) => candidate.recordId === dueTodayId));
  assert.ok(projectFocus.items.some((candidate) => candidate.recordId === laterId));
  assert.ok(projectFocus.items.some((candidate) => candidate.recordId === blockedId));
  assert.ok(projectFocus.items.some((candidate) => candidate.recordId === staleId));
  assert.ok(projectFocus.items.some((candidate) => candidate.recordId === activeId));
  assert.equal(projectFocus.items.some((candidate) => candidate.recordId === dueWeekId), false);

  const blockedContext = await workFocusModesService.resolveFocusMode(session, {
    modeId: FOCUS_MODE_IDS.reviewBlockedWork,
    today,
  });
  const blocked = await workCandidateService.listWorkCandidates(session, {
    ...blockedContext.candidateQuery,
    limit: 100,
  });

  assert.ok(blocked.items.some((candidate) => candidate.recordId === blockedId));
  assert.equal(blocked.items.some((candidate) => candidate.recordId === activeId), false);
  assert.equal(blocked.items.some((candidate) => candidate.recordId === staleId), false);

  await workResumeStateService.removeResumeStateForRecord(
    session.workspace_id,
    "tasks",
    "task",
    blockedId,
  );

  const emptyBlocked = await workFocusModesService.listFocusCandidates(session, {
    limit: 100,
    modeId: FOCUS_MODE_IDS.reviewBlockedWork,
    today,
  });

  assert.deepEqual(
    intersectCandidateIds(emptyBlocked.items, [staleId, activeId]),
    [],
    "blocked focus should stay empty when only stale or active candidates remain",
  );
}

async function assertClientFocusWorkspaceGating(session) {
  await setWorkspaceType(session.workspace_id, "personal");

  const personalModes = await workFocusModesService.listFocusModes(session);

  assert.equal(personalModes.some((mode) => mode.id === FOCUS_MODE_IDS.clientFocus), false);
  assert.equal(personalModes.some((mode) => mode.scope === "client"), false);
  assert.equal(personalModes.some((mode) => /client/i.test(mode.label)), false);

  await assert.rejects(
    () => workFocusModesService.resolveFocusMode(session, {
      clientId: "client-alpha",
      modeId: FOCUS_MODE_IDS.clientFocus,
    }),
    /not available in personal workspaces/,
  );

  await setWorkspaceType(session.workspace_id, "family");

  const familyModes = await workFocusModesService.listFocusModes(session);

  assert.equal(familyModes.some((mode) => mode.id === FOCUS_MODE_IDS.clientFocus), false);
  assert.equal(familyModes.some((mode) => mode.scope === "client"), false);
  assert.equal(familyModes.some((mode) => /client/i.test(mode.label)), false);

  await setWorkspaceType(session.workspace_id, "business");
}

async function upsertTaskCandidate(session, overrides = {}) {
  const taskId = `focus-task-${randomUUID()}`;

  await workResumeStateService.upsertResumeState(session, {
    moduleId: "tasks",
    nextAction: "Review the focus candidate.",
    recordId: taskId,
    recordType: "task",
    sourceUrl: `tasks.html?task=${encodeURIComponent(taskId)}`,
    statusSnapshot: "active",
    title: "Focus Candidate",
    ...overrides,
  });

  return taskId;
}

function intersectCandidateIds(items, expectedIds) {
  const expected = new Set(expectedIds);
  return items
    .map((candidate) => candidate.recordId)
    .filter((recordId) => expected.has(recordId));
}

async function setWorkspaceType(workspaceId, workspaceType) {
  await runSql(`
UPDATE workspaces
SET workspace_type = ${sqlText(workspaceType)}
WHERE workspace_id = ${sqlText(workspaceId)};
`);
}

async function createProject(workspaceId, projectId, name) {
  await projectsRepository.create(workspaceId, "", {
    billable: "no",
    id: projectId,
    name,
    status: "Active",
  });
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

  return {
    home_workspace_id: user.home_workspace_id,
    ip: "127.0.0.1",
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: user.active_workspace_id || user.home_workspace_id,
  };
}
