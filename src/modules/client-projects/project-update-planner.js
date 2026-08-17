import { readClientScope, readProjectScope } from "../../core/record-scope.js";
import { AppError } from "../../core/errors.js";
import { projectsRepository } from "./projects.repo.js";

/** @typedef {import("../../types/client-project-contracts.js").ClientRecord} ClientRecord */
/** @typedef {import("../../types/client-project-contracts.js").ProjectRecord} ProjectRecord */
/** @typedef {import("../../types/client-project-contracts.js").ProjectUpdatePlan} ProjectUpdatePlan */
/** @typedef {import("../../types/client-project-contracts.js").ProjectUpdatePlanInput} ProjectUpdatePlanInput */

/** @param {ProjectUpdatePlanInput} input @returns {Promise<ProjectUpdatePlan>} */
async function planProjectUpdate({ workspaceId, projectId, payload = {}, usesProjectRoundingOnly = false }) {
  const previousProject = await readProjectScope(workspaceId, projectId, {
    allowArchived: true,
    notFoundMessage: "Project not found",
  });
  if (!previousProject) {
    throw new AppError("Project not found", 404);
  }
  const targetClientId = usesProjectRoundingOnly
    ? ""
    : Object.hasOwn(payload || {}, "client_id")
      ? String(payload.client_id || "").trim()
      : previousProject.client_id;
  const targetClient = await readClientScope(workspaceId, targetClientId, {
    archivedMessage: "Projects cannot be moved into archived clients.",
    notFoundMessage: "Client not found",
  });
  const targetParentProjectId = Object.hasOwn(payload || {}, "parent_project_id")
    ? String(payload.parent_project_id || "").trim()
    : Object.hasOwn(payload || {}, "parentProjectId")
      ? String(payload.parentProjectId || "").trim()
      : previousProject.parent_project_id || "";
  const targetParentProject = await resolveTargetParentProject(
    workspaceId,
    projectId,
    targetParentProjectId,
    targetClient?.id || "",
  );
  const move = {
    fromClientId: previousProject.client_id || "",
    toClientId: targetClient?.id || "",
    isMove: (previousProject.client_id || "") !== (targetClient?.id || ""),
    isWorkspaceProject: !targetClient,
  };
  const parentMove = {
    fromParentProjectId: previousProject.parent_project_id || "",
    toParentProjectId: targetParentProject?.id || "",
    isMove: (previousProject.parent_project_id || "") !== (targetParentProject?.id || ""),
  };

  return {
    move,
    parentMove,
    previousProject,
    targetClient,
    targetParentProject,
    downstreamRecords: {
      historicalTimeEntries: "preserve_existing_client_and_project_labels",
      projectHierarchy: "future_rollups_follow_parent_ids_without_rewriting_historical_records",
      activeTimers: "resolve_scope_on_next_save_or_finalize",
    },
  };
}

/** @param {string} workspaceId @param {string} projectId @param {string} parentProjectId @param {string} clientId @returns {Promise<ProjectRecord | null>} */
async function resolveTargetParentProject(workspaceId, projectId, parentProjectId, clientId) {
  const normalizedParentId = String(parentProjectId || "").trim();
  const normalizedProjectId = String(projectId || "").trim();
  const normalizedClientId = String(clientId || "").trim();

  if (!normalizedParentId) {
    return null;
  }

  if (normalizedParentId === normalizedProjectId) {
    throw new AppError("A project cannot be its own parent.", 400);
  }

  const projects = await projectsRepository.readAll(workspaceId);
  const parentProject = projects.find((project) => project.id === normalizedParentId);

  if (!parentProject) {
    throw new AppError("Parent project not found.", 404);
  }

  if (isArchivedProject(parentProject)) {
    throw new AppError("Archived projects cannot be used as parent projects.", 400);
  }

  if ((parentProject.client_id || "") !== normalizedClientId) {
    throw new AppError("Parent project must belong to the same client or workspace project scope.", 400);
  }

  const descendants = collectDescendantIds(projects, normalizedProjectId);
  if (descendants.has(normalizedParentId)) {
    throw new AppError("A project cannot be nested below one of its descendants.", 400);
  }

  return parentProject;
}

/** @param {ProjectRecord[]} projects @param {string} projectId @returns {Set<string>} */
function collectDescendantIds(projects, projectId) {
  /** @type {Set<string>} */
  const descendants = new Set();
  const pending = [projectId];

  while (pending.length > 0) {
    const currentId = pending.pop();
    projects
      .filter((project) => (project.parent_project_id || "") === currentId)
      .forEach((project) => {
        if (!descendants.has(project.id)) {
          descendants.add(project.id);
          pending.push(project.id);
        }
      });
  }

  return descendants;
}

/** @param {ProjectRecord} project @returns {boolean} */
function isArchivedProject(project) {
  const status = String(project?.status || "").trim().toLowerCase();
  return status === "inactive" || status === "archived" || status === "completed";
}

export { planProjectUpdate };
