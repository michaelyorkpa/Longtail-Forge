const WORKSPACE_TYPES = new Set(["business", "personal", "family"]);
const DEFAULT_WORKSPACE_TYPE = "business";

/** @typedef {"business" | "personal" | "family"} WorkspaceType */
/** @typedef {{ defaultName: string | null, availableTools: string[], canAddUsers: boolean, maxUsers: number | null, permissionModel: string, accountTypes?: string[] }} WorkspaceCapabilityDefinition */
/** @typedef {WorkspaceCapabilityDefinition & { workspaceType: WorkspaceType, accountTypes: string[] }} WorkspaceCapabilities */
/** @type {Record<WorkspaceType, WorkspaceCapabilityDefinition>} */
const WORKSPACE_CAPABILITIES = {
  business: {
    defaultName: null,
    availableTools: [
      "tasks",
      "notes",
      "time_tracking",
      "clients_projects",
      "billing_invoicing_reporting",
      "team_members",
      "permissions",
    ],
    canAddUsers: true,
    maxUsers: null,
    permissionModel: "business",
  },
  personal: {
    defaultName: "Personal",
    availableTools: [
      "tasks",
      "notes",
      "time_tracking_optional",
      "projects",
    ],
    canAddUsers: false,
    maxUsers: 1,
    permissionModel: "owner_only",
  },
  family: {
    defaultName: "Family",
    availableTools: [
      "tasks",
      "notes",
      "time_tracking_optional",
      "projects",
      "team_members",
      "family_permissions",
    ],
    accountTypes: ["adult", "child"],
    canAddUsers: true,
    maxUsers: 20,
    permissionModel: "family",
  },
};

/** @param {unknown} value @returns {WorkspaceType} */
function normalizeWorkspaceType(value) {
  const type = String(value || "").trim().toLowerCase();
  return WORKSPACE_TYPES.has(type) ? /** @type {WorkspaceType} */ (type) : DEFAULT_WORKSPACE_TYPE;
}

/** @param {unknown} type @returns {WorkspaceCapabilities} */
function getWorkspaceCapabilities(type) {
  const workspaceType = normalizeWorkspaceType(type);
  const capabilities = WORKSPACE_CAPABILITIES[workspaceType];

  return {
    ...capabilities,
    workspaceType,
    availableTools: [...capabilities.availableTools],
    accountTypes: capabilities.accountTypes ? [...capabilities.accountTypes] : [],
  };
}

/** @param {unknown} type @returns {boolean} */
function workspaceSupportsBillable(type) {
  return normalizeWorkspaceType(type) === "business";
}

export {
  DEFAULT_WORKSPACE_TYPE,
  getWorkspaceCapabilities,
  normalizeWorkspaceType,
  workspaceSupportsBillable,
};
