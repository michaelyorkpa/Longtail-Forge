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
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");
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
  await assertPickUpWhereLeftOffBoostsSecondUpdatedTask(session);
  await assertClientFocusWorkspaceGating(session);
  await assertDocumentedOverdueFocusContracts();

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

async function assertDocumentedOverdueFocusContracts() {
  const [moduleContract, uiSurfaceContract, viewBuildingContract, tasksModule] = await Promise.all([
    fs.readFile("docs/module-contract.md", "utf8"),
    fs.readFile("docs/ui-surface-contract.md", "utf8"),
    fs.readFile("docs/view-building-contract.md", "utf8"),
    fs.readFile("docs/tasks-module.md", "utf8"),
  ]);

  assert.match(
    moduleContract,
    /As of 0\.33\.6\.12o,[\s\S]*"Start with what's due" and "Work this week" include overdue active tasks first/,
    "module contract should document due-focused modes including overdue work first",
  );
  assert.match(
    moduleContract,
    /Project and Client focus modes use the same Tasks-owned candidate source inside the current exact-match scope/,
    "module contract should document overdue-aware project/client focus sourcing",
  );
  assert.match(
    moduleContract,
    /Focus Selection recommendation cycling and right-side Inspector overflow both render the one service-owned overdue-aware candidate order/,
    "module contract should document the canonical shared recommendation/overflow ordering",
  );
  assert.match(
    uiSurfaceContract,
    /Due-focused modes include overdue active task work before due-today and upcoming work/,
    "UI surface contract should document due-focused overdue ordering",
  );
  assert.match(
    uiSurfaceContract,
    /recommended-action top-five plus right-side Inspector overflow must stay slices of the same ordered list/,
    "UI surface contract should document shared top-five and overflow ordering",
  );
  assert.match(
    viewBuildingContract,
    /Focus Selection due\/project\/client\/blocked modes include Tasks-owned active task candidates where needed so overdue scoped work is visible first/,
    "view-building contract should document active-task candidates in overdue-aware focus modes",
  );
  assert.match(
    viewBuildingContract,
    /browser code still renders the service-owned candidate list/,
    "view-building contract should document that the browser does not rebuild overdue logic",
  );
  assert.match(
    tasksModule,
    /Tasks-owned Workbench item payload includes recurrence identifiers and created timestamps/,
    "Tasks module guide should document Workbench item fields used for passive recurring-created suppression",
  );
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
  assert.equal(startMyDay.candidateQuery.includeTaskCandidates, true);
  assert.equal(startMyDay.candidateQuery.excludePassiveRecurringCreated, true);
  assert.deepEqual(pickUp.resumeStrategy, {
    fallback: "ranked-candidates",
    fallbackRankBuckets: ["running_timer", "paused_timer", "overdue_assigned_work", "recently_touched"],
    primary: "work-resume",
  });
  assert.deepEqual(pickUp.candidateQuery.rankBuckets, [
    "running_timer",
    "paused_timer",
    "overdue_assigned_work",
    "recently_touched",
  ]);
  assert.equal(dueNext.modeId, FOCUS_MODE_IDS.whatsDueNext);
  assert.equal(dueNext.filters.date.dueTo, "2026-07-14");
  assert.equal(dueNext.candidateQuery.dueTo, "2026-07-14");
  assert.equal(dueNext.candidateQuery.rankBuckets, undefined);
  assert.equal(dueNext.filters.sort, WORK_CANDIDATE_SORTS.dueDatetime);
  assert.equal(dueNext.candidateQuery.sort, WORK_CANDIDATE_SORTS.dueDatetime);
  assert.equal(dueNext.candidateQuery.includeTaskCandidates, true);
  assert.equal(dueNext.candidateQuery.excludePassiveRecurringCreated, true);
  assert.equal(week.filters.date.dueFrom, "");
  assert.equal(week.filters.date.dueTo, "2026-07-14");
  assert.equal(week.candidateQuery.dueFrom, undefined);
  assert.equal(week.candidateQuery.dueTo, "2026-07-14");
  assert.equal(week.filters.sort, WORK_CANDIDATE_SORTS.dueDatetime);
  assert.equal(week.candidateQuery.sort, WORK_CANDIDATE_SORTS.dueDatetime);
  assert.equal(week.candidateQuery.includeTaskCandidates, true);
  assert.equal(week.candidateQuery.excludePassiveRecurringCreated, true);
  assert.deepEqual(blocked.filters.status, ["blocked"]);
  assert.equal(blocked.candidateQuery.includeTaskCandidates, true);
  assert.equal(blocked.candidateQuery.excludePassiveRecurringCreated, true);
  assert.deepEqual(inProgress.filters.status, ["running", "paused", "active", "in_progress"]);
  assert.deepEqual(project.scope, {
    clientId: "",
    projectId: "project-alpha",
    type: "project",
  });
  assert.equal(project.candidateQuery.projectId, "project-alpha");
  assert.equal(project.candidateQuery.includeTaskCandidates, true);
  assert.equal(project.candidateQuery.excludePassiveRecurringCreated, true);
  assert.deepEqual(client.scope, {
    clientId: "client-alpha",
    projectId: "",
    type: "client",
  });
  assert.equal(client.candidateQuery.clientId, "client-alpha");
  assert.equal(client.candidateQuery.includeTaskCandidates, true);
  assert.equal(client.candidateQuery.excludePassiveRecurringCreated, true);
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
  await createProject(session.workspace_id, projectAlpha, "Focus Alpha", clientAlpha);
  await createProject(session.workspace_id, projectBeta, "Focus Beta", clientBeta);

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
  const taskSourceBlockedOverdueId = await createTaskSourceCandidate(session, {
    blockedReason: "Waiting on a blocked overdue fixture.",
    dueDate: "2026-07-03",
    projectId: projectAlpha,
    status: "blocked",
    title: "Task source blocked overdue",
  });
  const passiveRecurringOverdueId = await createTaskSourceCandidate(session, {
    dueDate: "2026-07-04",
    projectId: projectAlpha,
    recurrence: true,
    title: "Task source passive recurring overdue",
  });
  const taskSourceOverdueId = await createTaskSourceCandidate(session, {
    dueDate: "2026-07-05",
    projectId: projectAlpha,
    title: "Task source overdue without resume state",
  });
  const taskSourceLaterId = await createTaskSourceCandidate(session, {
    dueDate: "2026-08-01",
    projectId: projectAlpha,
    title: "Task source future out of due window",
  });
  const taskSourceNoDueId = await createTaskSourceCandidate(session, {
    projectId: projectAlpha,
    title: "Task source no due project work",
  });
  const passiveRecurringFutureId = await createTaskSourceCandidate(session, {
    dueDate: "2026-08-02",
    projectId: projectAlpha,
    recurrence: true,
    title: "Task source passive recurring future",
  });
  const completedOverdueId = await createTaskSourceCandidate(session, {
    dueDate: "2026-07-02",
    projectId: projectAlpha,
    status: "complete",
    title: "Task source completed overdue decoy",
  });
  const archivedOverdueId = await createTaskSourceCandidate(session, {
    dueDate: "2026-07-02",
    projectId: projectAlpha,
    status: "archived",
    title: "Task source archived overdue decoy",
  });
  const otherProjectOverdueId = await createTaskSourceCandidate(session, {
    dueDate: "2026-07-02",
    projectId: projectBeta,
    title: "Task source other project overdue",
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
    otherProjectOverdueId,
    taskSourceBlockedOverdueId,
    passiveRecurringOverdueId,
    taskSourceOverdueId,
    newerOverdueId,
    dueTodayId,
    dueWeekId,
    dueWeekLaterId,
  ]), [
    oldestOverdueId,
    otherProjectOverdueId,
    taskSourceBlockedOverdueId,
    passiveRecurringOverdueId,
    taskSourceOverdueId,
    newerOverdueId,
    dueTodayId,
    dueWeekId,
    dueWeekLaterId,
  ]);
  assert.equal(dueNext.items.some((candidate) => candidate.recordId === laterId), false);
  assert.equal(dueNext.items.some((candidate) => candidate.recordId === taskSourceLaterId), false);
  assert.equal(dueNext.items.some((candidate) => candidate.recordId === passiveRecurringFutureId), false);
  assert.equal(dueNext.items.some((candidate) => candidate.recordId === completedOverdueId), false);
  assert.equal(dueNext.items.some((candidate) => candidate.recordId === archivedOverdueId), false);
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
    otherProjectOverdueId,
    taskSourceBlockedOverdueId,
    passiveRecurringOverdueId,
    taskSourceOverdueId,
    newerOverdueId,
    dueTodayId,
    dueWeekId,
    dueWeekLaterId,
  ]), [
    oldestOverdueId,
    taskSourceBlockedOverdueId,
    passiveRecurringOverdueId,
    taskSourceOverdueId,
    newerOverdueId,
    dueTodayId,
  ]);
  assert.equal(clientScopedDueNext.items.some((candidate) => candidate.recordId === dueWeekId), false);
  assert.equal(clientScopedDueNext.items.some((candidate) => candidate.recordId === otherProjectOverdueId), false);

  const weekFocus = await workFocusModesService.listFocusCandidates(session, {
    limit: 100,
    modeId: FOCUS_MODE_IDS.workThisWeek,
    today,
  });

  assert.deepEqual(intersectCandidateIds(weekFocus.items, [
    oldestOverdueId,
    otherProjectOverdueId,
    taskSourceBlockedOverdueId,
    passiveRecurringOverdueId,
    taskSourceOverdueId,
    newerOverdueId,
    dueTodayId,
    dueWeekId,
    dueWeekLaterId,
  ]), [
    oldestOverdueId,
    otherProjectOverdueId,
    taskSourceBlockedOverdueId,
    passiveRecurringOverdueId,
    taskSourceOverdueId,
    newerOverdueId,
    dueTodayId,
    dueWeekId,
    dueWeekLaterId,
  ]);
  assert.equal(weekFocus.items.some((candidate) => candidate.recordId === laterId), false);
  assert.equal(weekFocus.items.some((candidate) => candidate.recordId === taskSourceLaterId), false);
  assert.equal(weekFocus.items.some((candidate) => candidate.recordId === passiveRecurringFutureId), false);

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
    otherProjectOverdueId,
    dueWeekId,
    dueWeekLaterId,
  ]), [
    otherProjectOverdueId,
    dueWeekId,
    dueWeekLaterId,
  ]);
  assert.equal(projectScopedWeek.items.some((candidate) => candidate.recordId === dueTodayId), false);
  assert.equal(projectScopedWeek.items.some((candidate) => candidate.recordId === taskSourceOverdueId), false);

  const scopedStart = await workFocusModesService.listFocusCandidates(session, {
    clientId: clientAlpha,
    limit: 100,
    modeId: FOCUS_MODE_IDS.startMyDay,
    projectId: projectAlpha,
    today,
  });

  assert.equal(scopedStart.focusContext.scope.clientId, clientAlpha);
  assert.equal(scopedStart.focusContext.scope.projectId, projectAlpha);
  assert.ok(scopedStart.items.some((candidate) => candidate.recordId === taskSourceOverdueId));
  assert.ok(scopedStart.items.some((candidate) => candidate.recordId === dueTodayId));
  assert.ok(scopedStart.items.some((candidate) => candidate.recordId === blockedId));
  assert.ok(scopedStart.items.some((candidate) => candidate.recordId === taskSourceBlockedOverdueId));
  assert.ok(scopedStart.items.some((candidate) => candidate.recordId === activeId));
  assert.equal(scopedStart.items.some((candidate) => candidate.recordId === dueWeekId), false);
  assert.equal(scopedStart.items.some((candidate) => candidate.recordId === otherProjectOverdueId), false);

  const projectFocus = await workFocusModesService.listFocusCandidates(session, {
    limit: 100,
    modeId: FOCUS_MODE_IDS.projectFocus,
    projectId: projectAlpha,
    today,
  });

  assert.equal(projectFocus.focusContext.scope.projectId, projectAlpha);
  assert.deepEqual(intersectCandidateIds(projectFocus.items, [
    oldestOverdueId,
    taskSourceBlockedOverdueId,
    passiveRecurringOverdueId,
    taskSourceOverdueId,
    newerOverdueId,
    dueTodayId,
    taskSourceLaterId,
    laterId,
    taskSourceNoDueId,
  ]), [
    oldestOverdueId,
    taskSourceBlockedOverdueId,
    passiveRecurringOverdueId,
    taskSourceOverdueId,
    newerOverdueId,
    dueTodayId,
    taskSourceLaterId,
    laterId,
    taskSourceNoDueId,
  ], "project focus should rank overdue work before today, future, and no-due project work");
  assert.ok(projectFocus.items.some((candidate) => candidate.recordId === dueTodayId));
  assert.ok(projectFocus.items.some((candidate) => candidate.recordId === laterId));
  assert.ok(projectFocus.items.some((candidate) => candidate.recordId === taskSourceLaterId));
  assert.ok(projectFocus.items.some((candidate) => candidate.recordId === taskSourceNoDueId));
  assert.ok(projectFocus.items.some((candidate) => candidate.recordId === blockedId));
  assert.ok(projectFocus.items.some((candidate) => candidate.recordId === staleId));
  assert.ok(projectFocus.items.some((candidate) => candidate.recordId === activeId));
  assert.equal(projectFocus.items.some((candidate) => candidate.recordId === dueWeekId), false);
  assert.equal(projectFocus.items.some((candidate) => candidate.recordId === otherProjectOverdueId), false);
  assert.equal(projectFocus.items.some((candidate) => candidate.recordId === passiveRecurringFutureId), false);
  assert.equal(projectFocus.items.some((candidate) => candidate.recordId === completedOverdueId), false);
  assert.equal(projectFocus.items.some((candidate) => candidate.recordId === archivedOverdueId), false);

  const blockedContext = await workFocusModesService.resolveFocusMode(session, {
    modeId: FOCUS_MODE_IDS.reviewBlockedWork,
    today,
  });
  const blocked = await workCandidateService.listWorkCandidates(session, {
    ...blockedContext.candidateQuery,
    limit: 100,
  });

  assert.deepEqual(intersectCandidateIds(blocked.items, [
    taskSourceBlockedOverdueId,
    blockedId,
    activeId,
  ]), [
    taskSourceBlockedOverdueId,
    blockedId,
  ], "blocked focus should keep blocked-overdue work ahead of less urgent blocked work");
  assert.ok(blocked.items.some((candidate) => candidate.recordId === blockedId));
  assert.ok(blocked.items.some((candidate) => candidate.recordId === taskSourceBlockedOverdueId));
  assert.equal(blocked.items.some((candidate) => candidate.recordId === activeId), false);
  assert.equal(blocked.items.some((candidate) => candidate.recordId === staleId), false);
  assert.equal(blocked.items.some((candidate) => candidate.recordId === taskSourceOverdueId), false);

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
    intersectCandidateIds(emptyBlocked.items, [taskSourceBlockedOverdueId, staleId, activeId]),
    [taskSourceBlockedOverdueId],
    "blocked focus should include task-source blocked work without treating stale or active candidates as blocked",
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

async function assertPickUpWhereLeftOffBoostsSecondUpdatedTask(session) {
  const today = "2026-07-09";
  const clientId = `updated-boost-client-${randomUUID()}`;
  const otherClientId = `updated-boost-other-client-${randomUUID()}`;
  const projectId = `updated-boost-project-${randomUUID()}`;
  const sameClientOtherProjectId = `updated-boost-same-client-project-${randomUUID()}`;
  const otherClientProjectId = `updated-boost-other-client-project-${randomUUID()}`;
  const singleProjectId = `updated-boost-single-${randomUUID()}`;

  await createClient(session.workspace_id, clientId, "Updated Boost Client");
  await createClient(session.workspace_id, otherClientId, "Updated Boost Other Client");
  await createProject(session.workspace_id, projectId, "Updated Boost Project", clientId);
  await createProject(session.workspace_id, sameClientOtherProjectId, "Updated Boost Same Client Project", clientId);
  await createProject(session.workspace_id, otherClientProjectId, "Updated Boost Other Client Project", otherClientId);
  await createProject(session.workspace_id, singleProjectId, "Updated Boost Single Project", clientId);

  const newestId = await createUpdatedTask(session, {
    projectId,
    title: "Latest interruption task",
    updatedAt: "2026-07-09T18:00:00.000Z",
  });
  const boostedId = await createUpdatedTask(session, {
    projectId,
    title: "Second updated recovery task",
    updatedAt: "2026-07-09T17:00:00.000Z",
  });
  const olderId = await createUpdatedTask(session, {
    projectId,
    title: "Older recovery task",
    updatedAt: "2026-07-09T16:00:00.000Z",
  });
  const completedId = await createUpdatedTask(session, {
    projectId,
    status: "complete",
    title: "Completed high-update decoy",
    updatedAt: "2026-07-09T21:00:00.000Z",
  });
  const archivedId = await createUpdatedTask(session, {
    projectId,
    status: "archived",
    title: "Archived high-update decoy",
    updatedAt: "2026-07-09T20:00:00.000Z",
  });
  const sameClientOtherProjectIdTask = await createUpdatedTask(session, {
    projectId: sameClientOtherProjectId,
    title: "Same client other project decoy",
    updatedAt: "2026-07-09T19:00:00.000Z",
  });
  const otherClientNewestId = await createUpdatedTask(session, {
    projectId: otherClientProjectId,
    title: "Other client newest decoy",
    updatedAt: "2026-07-09T23:00:00.000Z",
  });
  const otherClientSecondId = await createUpdatedTask(session, {
    projectId: otherClientProjectId,
    title: "Other client second decoy",
    updatedAt: "2026-07-09T22:00:00.000Z",
  });
  const singleTaskId = await createUpdatedTask(session, {
    projectId: singleProjectId,
    title: "Only active task in scope",
    updatedAt: "2026-07-09T15:00:00.000Z",
  });
  const runningResumeId = await upsertTaskCandidate(session, {
    lastActionLabel: "Timer Running",
    lastActionType: "timer.running",
    lastWorkedAt: "2026-07-09T19:10:00.000Z",
    metadata: { timer_status: "running" },
    nextAction: "",
    projectId,
    statusSnapshot: "active",
    title: "Running timer resume row",
  });
  const pausedResumeId = await upsertTaskCandidate(session, {
    lastActionLabel: "Timer Paused",
    lastActionType: "timer.paused",
    lastWorkedAt: "2026-07-09T19:00:00.000Z",
    metadata: { timer_status: "paused" },
    nextAction: "",
    projectId,
    statusSnapshot: "paused",
    title: "Paused timer resume row",
  });

  await upsertResumeTaskCandidate(session, newestId, {
    clientId,
    lastWorkedAt: "2026-07-09T18:00:00.000Z",
    projectId,
    title: "Latest interruption task",
  });
  await upsertResumeTaskCandidate(session, boostedId, {
    clientId,
    lastWorkedAt: "2026-07-09T17:00:00.000Z",
    projectId,
    title: "Second updated recovery task",
  });
  await upsertResumeTaskCandidate(session, olderId, {
    clientId,
    lastWorkedAt: "2026-07-09T16:00:00.000Z",
    projectId,
    title: "Older recovery task",
  });

  const projectScoped = await workFocusModesService.listFocusCandidates(session, {
    limit: 100,
    modeId: FOCUS_MODE_IDS.pickUpWhereLeftOff,
    projectId,
    today,
  });
  const orderedProjectIds = intersectCandidateIds(projectScoped.items, [
    runningResumeId,
    pausedResumeId,
    boostedId,
    newestId,
    olderId,
  ]);

  assert.deepEqual(orderedProjectIds, [
    runningResumeId,
    pausedResumeId,
    boostedId,
    newestId,
    olderId,
  ], "Pick up focus should keep timer resume rows before the second-updated task boost");
  assert.equal(projectScoped.items[2]?.recordId, boostedId, "second-most-recent updated active task should be boosted");
  assert.equal(projectScoped.items[2]?.sourceKind, "task_updated_boost");
  assert.notEqual(projectScoped.items[2]?.recordId, newestId, "newest updated task should not be the boost target");
  assert.equal(projectScoped.items.filter((candidate) => candidate.recordId === boostedId).length, 1, "boosted task should dedupe with its resume row");
  assert.equal(projectScoped.items.some((candidate) => candidate.recordId === completedId), false);
  assert.equal(projectScoped.items.some((candidate) => candidate.recordId === archivedId), false);
  assert.equal(projectScoped.items.some((candidate) => candidate.recordId === sameClientOtherProjectIdTask), false);

  const clientScoped = await workFocusModesService.listFocusCandidates(session, {
    clientId,
    limit: 100,
    modeId: FOCUS_MODE_IDS.pickUpWhereLeftOff,
    today,
  });

  assert.equal(clientScoped.items.some((candidate) => candidate.recordId === otherClientNewestId), false);
  assert.equal(clientScoped.items.some((candidate) => candidate.recordId === otherClientSecondId), false);

  const singleTaskFocus = await workFocusModesService.listFocusCandidates(session, {
    limit: 100,
    modeId: FOCUS_MODE_IDS.pickUpWhereLeftOff,
    projectId: singleProjectId,
    today,
  });

  assert.equal(singleTaskFocus.items.some((candidate) => candidate.sourceKind === "task_updated_boost"), false);
  assert.equal(singleTaskFocus.items.some((candidate) => candidate.recordId === singleTaskId), false);

  await runSql(`
UPDATE workspace_modules
SET status = 'disabled',
    disabled_at = '2026-07-09T20:10:00.000Z'
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND module_id = 'tasks';
`);

  const disabledTasksFocus = await workFocusModesService.listFocusCandidates(session, {
    limit: 100,
    modeId: FOCUS_MODE_IDS.pickUpWhereLeftOff,
    projectId,
    today,
  });

  assert.equal(disabledTasksFocus.items.some((candidate) => candidate.recordId === boostedId), false);

  await runSql(`
UPDATE workspace_modules
SET status = 'enabled',
    disabled_at = NULL
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND module_id = 'tasks';
`);

  const limitedSession = await createLimitedSession(session.workspace_id);
  const unreadableFocus = await workFocusModesService.listFocusCandidates(limitedSession, {
    limit: 100,
    modeId: FOCUS_MODE_IDS.pickUpWhereLeftOff,
    projectId,
    today,
  });

  assert.equal(unreadableFocus.items.some((candidate) => candidate.recordId === boostedId), false);
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

async function createProject(workspaceId, projectId, name, clientId = "") {
  await projectsRepository.create(workspaceId, clientId, {
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

async function createUpdatedTask(session, { projectId, status = "open", title, updatedAt }) {
  const created = (await tasksService.create({
    project_id: projectId,
    status,
    title,
  }, session)).task;

  await runSql(`
UPDATE tasks
SET status = ${sqlText(status)},
    updated_at = ${sqlText(updatedAt)},
    last_worked_at = ${sqlText(updatedAt)},
    completed_at = CASE WHEN ${sqlText(status)} = 'complete' THEN ${sqlText(updatedAt)} ELSE completed_at END,
    completed_by_user_id = CASE WHEN ${sqlText(status)} = 'complete' THEN ${sqlText(session.user_id)} ELSE completed_by_user_id END,
    archived_at = CASE WHEN ${sqlText(status)} = 'archived' THEN ${sqlText(updatedAt)} ELSE archived_at END,
    archived_by_user_id = CASE WHEN ${sqlText(status)} = 'archived' THEN ${sqlText(session.user_id)} ELSE archived_by_user_id END
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND task_id = ${sqlText(created.task_id)};
`);

  return created.task_id;
}

async function createTaskSourceCandidate(session, {
  blockedReason = "",
  dueDate = "",
  projectId,
  recurrence = false,
  status = "open",
  title,
} = {}) {
  const created = (await tasksService.create({
    blocked_reason: blockedReason,
    due_date: dueDate,
    project_id: projectId,
    status,
    title,
  }, session)).task;

  if (recurrence) {
    await runSql(`
UPDATE tasks
SET recurrence_template_id = ${sqlText(`template-${created.task_id}`)},
    recurrence_instance_date = ${sqlText(dueDate)}
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND task_id = ${sqlText(created.task_id)};
`);
  }

  await workResumeStateService.removeResumeStateForRecord(
    session.workspace_id,
    "tasks",
    "task",
    created.task_id,
  );

  return created.task_id;
}

async function upsertResumeTaskCandidate(session, taskId, overrides = {}) {
  await workResumeStateService.upsertResumeState(session, {
    moduleId: "tasks",
    nextAction: "Resume the task.",
    recordId: taskId,
    recordType: "task",
    sourceUrl: `tasks.html?task=${encodeURIComponent(taskId)}`,
    statusSnapshot: "active",
    title: "Resume task",
    ...overrides,
  });
}

async function createLimitedSession(workspaceId) {
  const userId = randomUUID();
  const now = new Date().toISOString();

  await runSql(`
INSERT INTO users (user_id, home_workspace_id, username, display_name, password, protected_user, active_workspace_id)
VALUES (${sqlText(userId)}, ${sqlText(workspaceId)}, ${sqlText(`${userId}@example.test`)}, 'Limited Focus User', 'x', 'no', ${sqlText(workspaceId)});

INSERT INTO user_workspaces (user_workspace_id, user_id, workspace_id, status, created_at, updated_at)
VALUES (${sqlText(randomUUID())}, ${sqlText(userId)}, ${sqlText(workspaceId)}, 'active', ${sqlText(now)}, ${sqlText(now)});
`);

  return {
    home_workspace_id: workspaceId,
    ip: "127.0.0.1",
    timezone: "America/New_York",
    user_id: userId,
    username: `${userId}@example.test`,
    workspace_id: workspaceId,
  };
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
