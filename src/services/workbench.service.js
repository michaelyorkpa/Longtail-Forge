import { modulesService } from "../core/modules/modules.service.js";
import { workCandidateService } from "./work-candidate.service.js";

async function bootstrap(session) {
  const [moduleContext, workbenchCards, timerSources, workItemSources, workCandidates] = await Promise.all([
    modulesService.readWorkspaceModuleContext(session.workspace_id),
    modulesService.listWorkbenchCards(session.workspace_id, session),
    modulesService.listTimerSources(session.workspace_id, session),
    modulesService.listWorkItemSources(session.workspace_id, session),
    workCandidateService.listWorkCandidates(session, { limit: 50 }),
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
    taskItems: [],
    taskOptions: null,
    workCandidates: workCandidates.items || [],
    workCandidateMode: workCandidates.mode || "",
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
