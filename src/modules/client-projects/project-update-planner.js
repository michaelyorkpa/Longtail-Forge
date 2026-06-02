import { readClientScope, readProjectScope } from "../../core/record-scope.js";

async function planProjectUpdate({ workspaceId, projectId, payload = {}, usesProjectRoundingOnly = false }) {
  const previousProject = await readProjectScope(workspaceId, projectId, {
    allowArchived: true,
    notFoundMessage: "Project not found",
  });
  const targetClientId = usesProjectRoundingOnly
    ? ""
    : Object.hasOwn(payload || {}, "client_id")
      ? String(payload.client_id || "").trim()
      : previousProject.client_id;
  const targetClient = await readClientScope(workspaceId, targetClientId, {
    archivedMessage: "Projects cannot be moved into archived clients.",
    notFoundMessage: "Client not found",
  });
  const move = {
    fromClientId: previousProject.client_id || "",
    toClientId: targetClient?.id || "",
    isMove: (previousProject.client_id || "") !== (targetClient?.id || ""),
    isWorkspaceProject: !targetClient,
  };

  return {
    move,
    previousProject,
    targetClient,
    downstreamRecords: {
      historicalTimeEntries: "preserve_existing_client_and_project_labels",
      activeTimers: "resolve_scope_on_next_save_or_finalize",
    },
  };
}

export { planProjectUpdate };
