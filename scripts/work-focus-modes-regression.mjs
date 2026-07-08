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
const { activeTimersRepository } = await import("../src/modules/time-tracking/active-timers.repo.js");
const { clientsRepository } = await import("../src/modules/client-projects/clients.repo.js");
const { projectsRepository } = await import("../src/modules/client-projects/projects.repo.js");
const {
  WORK_CANDIDATE_SORTS,
  workCandidateService,
} = await import("../src/services/work-candidate.service.js");
const { workResumeStateService } = await import("../src/services/work-resume-state.service.js");

const unreadableTaskIds = new Set();

try {
  await initializeDatabase();
  const session = await readSeedSession();

  resetResumeStateReadResolvers();
  registerFocusReadResolvers();

  await assertCanonicalBusinessFocusModes(session);
  await assertModeResolutionContracts(session);
  await assertResolvedContextsDriveCandidates(session);
  await assertPickUpWhereLeftOffExecutesResumeStrategy(session);
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
  const scopedStart = await workFocusModesService.resolveFocusMode(session, {
    clientId: "client-alpha",
    modeId: FOCUS_MODE_IDS.startMyDay,
    projectId: "project-alpha",
    today,
  });

  assert.equal(startMyDay.scope.type, "workspace");
  assert.ok(startMyDay.filters.rankBuckets.includes("running_timer"));
  assert.ok(startMyDay.filters.rankBuckets.includes("due_today"));
  assert.equal(startMyDay.candidateQuery.mode, FOCUS_MODE_IDS.startMyDay);
  assert.deepEqual(pickUp.resumeStrategy, {
    fallback: "ranked-candidates",
    fallbackRankBuckets: ["running_timer", "paused_timer", "recently_touched"],
    primary: "work-resume",
  });
  assert.deepEqual(pickUp.candidateQuery.rankBuckets, ["running_timer", "paused_timer", "recently_touched"]);
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
  assert.deepEqual(scopedStart.scope, {
    clientId: "client-alpha",
    projectId: "project-alpha",
    type: "workspace",
  });
  assert.equal(scopedStart.filters.clientId, "client-alpha");
  assert.equal(scopedStart.filters.projectId, "project-alpha");
  assert.equal(scopedStart.candidateQuery.clientId, "client-alpha");
  assert.equal(scopedStart.candidateQuery.projectId, "project-alpha");
}

async function assertResolvedContextsDriveCandidates(session) {
  const today = "2026-07-07";
  const clientAlpha = `client-alpha-${randomUUID()}`;
  const clientBeta = `client-beta-${randomUUID()}`;
  const projectAlpha = `project-alpha-${randomUUID()}`;
  const projectBeta = `project-beta-${randomUUID()}`;

  await createClient(session.workspace_id, clientAlpha, "Focus Client Alpha");
  await createClient(session.workspace_id, clientBeta, "Focus Client Beta");
  await createProject(session.workspace_id, projectAlpha, "Focus Alpha");
  await createProject(session.workspace_id, projectBeta, "Focus Beta");

  const oldestOverdueId = await upsertTaskCandidate(session, {
    clientId: clientAlpha,
    dueAtSnapshot: "2026-07-01T17:00:00.000Z",
    projectId: projectAlpha,
    title: "Z Oldest Overdue",
  });
  const newerOverdueId = await upsertTaskCandidate(session, {
    clientId: clientAlpha,
    dueAtSnapshot: "2026-07-06T17:00:00.000Z",
    projectId: projectAlpha,
    title: "A Newer Overdue",
  });
  const dueTodayId = await upsertTaskCandidate(session, {
    clientId: clientAlpha,
    dueAtSnapshot: "2026-07-07T14:00:00.000Z",
    projectId: projectAlpha,
    resumeRankHint: 1,
    title: "Focus Due Today",
  });
  const dueWeekId = await upsertTaskCandidate(session, {
    clientId: clientBeta,
    dueAtSnapshot: "2026-07-10T14:00:00.000Z",
    projectId: projectBeta,
    resumeRankHint: 1000,
    title: "Focus Due This Week",
  });
  const dueWeekLaterId = await upsertTaskCandidate(session, {
    clientId: clientBeta,
    dueAtSnapshot: "2026-07-12T14:00:00.000Z",
    projectId: projectBeta,
    title: "Focus Due Later This Week",
  });
  const laterId = await upsertTaskCandidate(session, {
    clientId: clientAlpha,
    dueAtSnapshot: "2026-08-01",
    projectId: projectAlpha,
    title: "Focus Later",
  });
  const blockedId = await upsertTaskCandidate(session, {
    blockedReason: "Waiting on a recovery decision.",
    clientId: clientAlpha,
    projectId: projectAlpha,
    statusSnapshot: "blocked",
    title: "Focus Blocked",
  });
  const staleId = await upsertTaskCandidate(session, {
    clientId: clientAlpha,
    lastWorkedAt: "2026-06-20T12:00:00.000Z",
    projectId: projectAlpha,
    statusSnapshot: "active",
    title: "Focus Stale",
  });
  const activeId = await upsertTaskCandidate(session, {
    clientId: clientAlpha,
    lastWorkedAt: "2026-07-08T00:30:00.000Z",
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

  const clientScopedDueNext = await workFocusModesService.listFocusCandidates(session, {
    clientId: clientAlpha,
    limit: 100,
    modeId: FOCUS_MODE_IDS.whatsDueNext,
    today,
  });

  assert.equal(clientScopedDueNext.focusContext.scope.clientId, clientAlpha);
  assert.equal(clientScopedDueNext.focusContext.scope.type, "workspace");
  assert.deepEqual(intersectCandidateIds(clientScopedDueNext.items, [
    oldestOverdueId,
    newerOverdueId,
    dueTodayId,
    dueWeekId,
    dueWeekLaterId,
  ]), [
    oldestOverdueId,
    newerOverdueId,
    dueTodayId,
  ]);
  assert.equal(clientScopedDueNext.items.some((candidate) => candidate.recordId === dueWeekId), false);

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

  const projectScopedWeek = await workFocusModesService.listFocusCandidates(session, {
    limit: 100,
    modeId: FOCUS_MODE_IDS.workThisWeek,
    projectId: projectBeta,
    today,
  });

  assert.equal(projectScopedWeek.focusContext.scope.projectId, projectBeta);
  assert.equal(projectScopedWeek.focusContext.scope.type, "workspace");
  assert.deepEqual(intersectCandidateIds(projectScopedWeek.items, [
    dueTodayId,
    dueWeekId,
    dueWeekLaterId,
  ]), [
    dueWeekId,
    dueWeekLaterId,
  ]);
  assert.equal(projectScopedWeek.items.some((candidate) => candidate.recordId === dueTodayId), false);

  const scopedStart = await workFocusModesService.listFocusCandidates(session, {
    clientId: clientAlpha,
    limit: 100,
    modeId: FOCUS_MODE_IDS.startMyDay,
    projectId: projectAlpha,
    today,
  });

  assert.equal(scopedStart.focusContext.scope.clientId, clientAlpha);
  assert.equal(scopedStart.focusContext.scope.projectId, projectAlpha);
  assert.ok(scopedStart.items.some((candidate) => candidate.recordId === dueTodayId));
  assert.ok(scopedStart.items.some((candidate) => candidate.recordId === blockedId));
  assert.ok(scopedStart.items.some((candidate) => candidate.recordId === activeId));
  assert.equal(scopedStart.items.some((candidate) => candidate.recordId === dueWeekId), false);

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

async function assertPickUpWhereLeftOffExecutesResumeStrategy(session) {
  const today = "2026-07-07";
  const projectId = `resume-focus-${randomUUID()}`;
  const fallbackProjectId = `resume-fallback-${randomUUID()}`;

  await createProject(session.workspace_id, projectId, "Resume Focus Project");
  await createProject(session.workspace_id, fallbackProjectId, "Resume Fallback Project");

  const runningId = await upsertTaskCandidate(session, {
    lastActionLabel: "Timer Running",
    lastActionType: "timer.running",
    lastWorkedAt: "2026-07-07T16:00:00.000Z",
    metadata: { timer_status: "running" },
    nextAction: "",
    prioritySnapshot: "low",
    projectId,
    statusSnapshot: "active",
    title: "Resume Running Timer",
  });
  const pausedId = await upsertTaskCandidate(session, {
    lastActionLabel: "Timer Paused",
    lastActionType: "timer.paused",
    lastWorkedAt: "2026-07-07T15:00:00.000Z",
    metadata: { timer_status: "paused" },
    nextAction: "",
    prioritySnapshot: "urgent",
    projectId,
    statusSnapshot: "paused",
    title: "Resume Paused Timer",
  });
  const oldResumeNoteId = await upsertTaskCandidate(session, {
    handoffNote: "Resume this older handoff.",
    lastActionLabel: "Task Updated",
    lastActionType: "task.updated",
    lastWorkedAt: "2026-06-15T12:00:00.000Z",
    nextAction: "",
    prioritySnapshot: "low",
    projectId,
    statusSnapshot: "open",
    title: "Old Resume Note",
  });
  const highInProgressId = await upsertTaskCandidate(session, {
    lastActionLabel: "Task Updated",
    lastActionType: "task.updated",
    lastWorkedAt: "2026-07-07T13:00:00.000Z",
    nextAction: "",
    prioritySnapshot: "high",
    projectId,
    statusSnapshot: "in_progress",
    title: "High In Progress",
  });
  const lowInProgressId = await upsertTaskCandidate(session, {
    lastActionLabel: "Task Updated",
    lastActionType: "task.updated",
    lastWorkedAt: "2026-07-07T14:00:00.000Z",
    nextAction: "",
    prioritySnapshot: "low",
    projectId,
    statusSnapshot: "in_progress",
    title: "Low In Progress",
  });
  const farRecurringId = await upsertTaskCandidate(session, {
    dueAtSnapshot: "2026-07-20",
    lastActionLabel: "Task Created",
    lastActionType: "task.created",
    lastWorkedAt: "2026-07-07T12:00:00.000Z",
    metadata: {
      recurrence_instance_date: "2026-07-20",
      recurrence_template_id: `recurrence-template-${randomUUID()}`,
    },
    nextAction: "",
    projectId,
    statusSnapshot: "open",
    title: "Far Future Recurring Created",
  });
  const nearRecurringId = await upsertTaskCandidate(session, {
    dueAtSnapshot: "2026-07-08",
    lastActionLabel: "Task Created",
    lastActionType: "task.created",
    lastWorkedAt: "2026-07-07T12:30:00.000Z",
    metadata: {
      recurrence_instance_date: "2026-07-08",
      recurrence_template_id: `recurrence-template-${randomUUID()}`,
    },
    nextAction: "",
    projectId,
    statusSnapshot: "open",
    title: "Near Due Recurring Created",
  });
  const unreadableId = await upsertTaskCandidate(session, {
    lastActionLabel: "Task Updated",
    lastActionType: "task.updated",
    lastWorkedAt: "2026-07-07T17:00:00.000Z",
    projectId,
    statusSnapshot: "in_progress",
    title: "Unreadable Resume Candidate",
  });
  unreadableTaskIds.add(unreadableId);

  const resumeFocus = await workFocusModesService.listFocusCandidates(session, {
    limit: 100,
    modeId: FOCUS_MODE_IDS.pickUpWhereLeftOff,
    projectId,
    today,
  });
  const orderedResumeIds = intersectCandidateIds(resumeFocus.items, [
    runningId,
    pausedId,
    oldResumeNoteId,
    highInProgressId,
    lowInProgressId,
    nearRecurringId,
  ]);

  assert.deepEqual(orderedResumeIds, [
    runningId,
    pausedId,
    oldResumeNoteId,
    highInProgressId,
    lowInProgressId,
    nearRecurringId,
  ], "Pick up focus should rank resume rows before falling back to recent work buckets");
  assert.equal(resumeFocus.items[0]?.recordId, runningId, "the recommended candidate should be the strongest resume match");
  assert.equal(resumeFocus.items.some((candidate) => candidate.recordId === farRecurringId), false);
  assert.equal(resumeFocus.items.some((candidate) => candidate.recordId === unreadableId), false);

  const dismissedCandidate = resumeFocus.items.find((candidate) => candidate.recordId === oldResumeNoteId);
  assert.ok(dismissedCandidate?.resumeStateId, "resume candidates should carry a dismissable resume state ID");
  await workResumeStateService.dismissResumeState(session, dismissedCandidate.resumeStateId);

  const afterDismiss = await workFocusModesService.listFocusCandidates(session, {
    limit: 100,
    modeId: FOCUS_MODE_IDS.pickUpWhereLeftOff,
    projectId,
    today,
  });

  assert.equal(afterDismiss.items.some((candidate) => candidate.recordId === oldResumeNoteId), false);

  const fallbackTimerId = `resume-fallback-timer-${randomUUID()}`;
  await activeTimersRepository.upsert({
    accumulated_elapsed_seconds: 120,
    active_timer_id: fallbackTimerId,
    client_id: "",
    client_name: "",
    description: "Fallback timer candidate",
    last_active_start_time: "2026-07-07T18:00:00.000Z",
    project_id: fallbackProjectId,
    project_name: "Resume Fallback Project",
    source_label: "Fallback running timer",
    source_url: "time-tracker.html",
    timer_slot: "88",
    timer_status: "running",
    user_id: session.user_id,
    workspace_id: session.workspace_id,
  });

  const fallbackFocus = await workFocusModesService.listFocusCandidates(session, {
    limit: 100,
    modeId: FOCUS_MODE_IDS.pickUpWhereLeftOff,
    projectId: fallbackProjectId,
    today,
  });

  assert.equal(fallbackFocus.items[0]?.recordId, fallbackTimerId);
  assert.equal(fallbackFocus.items[0]?.sourceKind, "live_timer");
}

async function assertClientFocusWorkspaceGating(session) {
  await setWorkspaceType(session.workspace_id, "personal");

  const personalModes = await workFocusModesService.listFocusModes(session);

  assert.equal(personalModes.some((mode) => mode.id === FOCUS_MODE_IDS.clientFocus), false);
  assert.equal(personalModes.some((mode) => mode.scope === "client"), false);
  assert.equal(personalModes.some((mode) => /client/i.test(mode.label)), false);

  const personalScopedStart = await workFocusModesService.resolveFocusMode(session, {
    clientId: "client-alpha",
    modeId: FOCUS_MODE_IDS.startMyDay,
    projectId: "project-alpha",
  });

  assert.equal(personalScopedStart.filters.clientId, "");
  assert.equal(personalScopedStart.candidateQuery.clientId, undefined);
  assert.equal(personalScopedStart.filters.projectId, "project-alpha");
  assert.equal(personalScopedStart.candidateQuery.projectId, "project-alpha");

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

function registerFocusReadResolvers() {
  registerResumeStateReadResolver("tasks", "task", async ({ recordId, row }) => {
    if (unreadableTaskIds.has(recordId)) {
      return { deleted: true, readable: false, status: "deleted" };
    }

    return { readable: true, status: row.status_snapshot || "active" };
  });
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

async function createClient(workspaceId, clientId, name) {
  await clientsRepository.create(workspaceId, {
    billable: "yes",
    id: clientId,
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
