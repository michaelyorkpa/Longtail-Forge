import { modulesService } from "../core/modules/modules.service.js";
import { normalizeUserLandingPage } from "../utils/normalizers.js";

const DEFAULT_LANDING_PATH = "/dashboard.html";
const LANDING_TARGETS = Object.freeze({
  dashboard: Object.freeze({ path: DEFAULT_LANDING_PATH }),
  workbench: Object.freeze({ path: "/workbench.html" }),
  tasks: Object.freeze({ moduleId: "tasks", path: "/tasks.html" }),
  notes: Object.freeze({ moduleId: "notes", path: "/notes.html" }),
  lists: Object.freeze({ moduleId: "lists", path: "/lists.html" }),
});

/** @typedef {import("../types/http-contracts.js").WorkspaceRequestSession} WorkspaceRequestSession */

/** @param {WorkspaceRequestSession} session @param {unknown} preference */
async function resolvePreferredLanding(session, preference) {
  const target = LANDING_TARGETS[normalizeUserLandingPage(preference)];

  if (!("moduleId" in target)) {
    return target.path;
  }

  try {
    const enabledModuleIds = new Set(await modulesService.readEnabledModuleIds(session.workspace_id));

    if (!enabledModuleIds.has(target.moduleId)) {
      return DEFAULT_LANDING_PATH;
    }

    const resolution = await modulesService.resolveProtectedModuleView(
      session.workspace_id,
      session,
      target.path,
    );

    return resolution?.status === "ok" ? target.path : DEFAULT_LANDING_PATH;
  } catch {
    return DEFAULT_LANDING_PATH;
  }
}

export const userLandingService = {
  resolvePreferredLanding,
};
