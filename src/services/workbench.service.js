import { modulesService } from "../core/modules/modules.service.js";

async function bootstrap(session) {
  const [moduleContext, workbenchCards, timerSources, workItemSources] = await Promise.all([
    modulesService.readWorkspaceModuleContext(session.workspace_id),
    modulesService.listWorkbenchCards(session.workspace_id, session),
    modulesService.listTimerSources(session.workspace_id, session),
    modulesService.listWorkItemSources(session.workspace_id, session),
  ]);

  return {
    currentUserId: session.user_id,
    modules: buildModuleStateMap(moduleContext.modules),
    registry: {
      workbenchCards,
      timerSources,
      workItemSources,
    },
    timers: [],
    taskOptions: null,
    // Focus candidates load through /api/workbench/focus-candidates; the
    // former 50-candidate bootstrap computation only ever fed the ?taskId
    // deep-link fallback, which the browser resolves from focus candidates
    // and the task detail read.
    workCandidates: [],
    workCandidateMode: "",
  };
}

function buildModuleStateMap(modules = []) {
  return Object.fromEntries((modules || []).map((moduleDefinition) => [
    moduleDefinition.id,
    {
      displayName: moduleDefinition.displayName || moduleDefinition.name || moduleDefinition.id,
      enabled: moduleDefinition.status === "enabled",
      status: moduleDefinition.status === "enabled" ? "enabled" : "disabled",
    },
  ]));
}

export const workbenchService = {
  bootstrap,
};
