// @ts-check
import { clientProjectsLinkTargetProvider } from "../client-projects/index.js";
import { listsLinkTargetProvider } from "../lists/index.js";
import { tasksLinkTargetProvider } from "../tasks/index.js";
import { usersLinkTargetProvider } from "../users/index.js";
import { modulesService } from "../../core/modules/modules.service.js";
import { resolveClientProjectFilterScope } from "../../core/client-project-filter-scope.js";
import {
  safeUnavailableLinkTarget,
  shapeLinkTarget,
} from "../../core/linked-context/link-target-shape.js";

/** @typedef {import("../../types/http-contracts.js").WorkspaceRequestSession} WorkspaceRequestSession */
/** @typedef {import("../../types/link-target-directory-contracts.js").LinkTargetSession} LinkTargetSession */
/** @typedef {import("../../types/link-target-directory-contracts.js").LinkTarget} LinkTarget */
/** @typedef {import("../../types/link-target-directory-contracts.js").LinkTargetAccessCache} LinkTargetAccessCache */
/** @typedef {import("../../types/link-target-directory-contracts.js").LinkTargetAccessState} LinkTargetAccessState */
/** @typedef {import("../../types/link-target-directory-contracts.js").LinkTargetClientContext} LinkTargetClientContext */
/** @typedef {import("../../types/link-target-directory-contracts.js").LinkTargetProvider} LinkTargetProvider */
/** @typedef {import("../../types/link-target-directory-contracts.js").LinkTargetType} LinkTargetType */

/** @type {readonly LinkTargetType[]} */
const EXTERNAL_TARGET_TYPES = Object.freeze(["client", "project", "task", "list", "user"]);
const CLIENT_SCOPED_TYPES = new Set(["client", "project", "task", "list"]);
/** @type {Readonly<Record<string, string>>} */
const MODULE_BY_TARGET_TYPE = Object.freeze({
  client: "client-projects",
  project: "client-projects",
  task: "tasks",
  list: "lists",
});

/** @type {readonly LinkTargetProvider[]} */
const providers = Object.freeze([
  clientProjectsLinkTargetProvider,
  tasksLinkTargetProvider,
  listsLinkTargetProvider,
  usersLinkTargetProvider,
]);

/** @param {LinkTargetType} targetType */
function providerFor(targetType) {
  return providers.find((provider) => provider.targetTypes.includes(targetType)) || null;
}

/** @param {LinkTargetSession} session @param {LinkTargetType} targetType @param {LinkTargetClientContext} clientContext */
async function list(session, targetType, clientContext) {
  const provider = providerFor(targetType);
  if (!provider || !(await canListType(session, targetType))) return [];
  const context = await readContext(session);
  const targets = (await provider.list(session, targetType, { clientContext, context })).map(shapeLinkTarget);
  const scope = await resolveClientScope(session, clientContext);
  return targets.filter((target) => targetMatchesClientContext(target, scope));
}

/** @param {LinkTargetSession} session */
async function readContext(session) {
  const context = await clientProjectsLinkTargetProvider.readContext(session);
  if (await modulesService.canReadModule(session.workspace_id, "client-projects")) return context;
  return { ...context, clientsById: new Map(), projectsById: new Map() };
}

/** @param {LinkTargetSession} session @param {LinkTargetType} targetType @param {string} targetId */
async function readSummary(session, targetType, targetId) {
  const provider = providerFor(targetType);
  if (!provider) return unavailableSummary(targetType, targetId);
  try {
    const context = await readContext(session);
    const target = await provider.read(session, targetType, targetId, { context });
    return target ? legacySummary(shapeLinkTarget(target)) : unavailableSummary(targetType, targetId);
  } catch {
    return unavailableSummary(targetType, targetId);
  }
}

/** @param {LinkTargetSession} session @param {LinkTargetType} targetType @param {string} targetId */
async function canAccess(session, targetType, targetId) {
  if (targetType === "list" && !(await modulesService.canReadModule(session.workspace_id, "lists"))) return false;
  const provider = providerFor(targetType);
  if (!provider) return false;
  const states = await provider.readAccess(session, targetType, [targetId]);
  return states.get(targetId) === "readable";
}

/** @param {LinkTargetSession} session @param {LinkTargetType} targetType @param {string} targetId @param {LinkTargetAccessCache | null} cache */
async function canAccessSaved(session, targetType, targetId, cache = null) {
  const moduleId = MODULE_BY_TARGET_TYPE[targetType];
  if (moduleId && !(await modulesService.canReadModule(session.workspace_id, moduleId))) return true;
  const state = cache?.byType.get(targetType)?.get(targetId) ||
    (await providerFor(targetType)?.readAccess(session, targetType, [targetId]))?.get(targetId) ||
    "unavailable";
  return state !== "forbidden";
}

/** @param {LinkTargetSession} session @param {Map<LinkTargetType, Set<string>>} idsByType */
async function createAccessCache(session, idsByType) {
  /** @type {Map<LinkTargetType, Map<string, LinkTargetAccessState>>} */
  const byType = new Map();
  await Promise.all(EXTERNAL_TARGET_TYPES.map(async (targetType) => {
    const ids = [...(idsByType.get(targetType) || [])];
    const provider = providerFor(targetType);
    if (provider && ids.length > 0) byType.set(targetType, await provider.readAccess(session, targetType, ids));
  }));
  return { byType };
}

/** @param {LinkTargetSession} session @param {LinkTargetType} targetType */
async function canListType(session, targetType) {
  const moduleId = MODULE_BY_TARGET_TYPE[targetType];
  return moduleId ? modulesService.canWriteModule(session.workspace_id, moduleId) : true;
}

/** @param {LinkTargetSession} session @param {LinkTargetClientContext} clientContext */
async function resolveClientScope(session, clientContext) {
  if (!isScopedClientContext(clientContext)) return { hasClientFilter: false };
  return resolveClientProjectFilterScope(session, {
    clientId: clientContext.mode === "workspace" ? "" : clientContext.clientId,
    hasClientFilter: true,
    hasProjectFilter: false,
  });
}

/** @param {LinkTargetClientContext} clientContext */
function isScopedClientContext(clientContext) {
  return clientContext.mode === "client" || clientContext.mode === "workspace";
}

/** @param {LinkTarget} target @param {{ hasClientFilter?: boolean; clientFilterMode?: string; clientIds?: readonly string[]; clientProjectIds?: readonly string[] }} scope */
function targetMatchesClientContext(target, scope) {
  if (!scope.hasClientFilter || !CLIENT_SCOPED_TYPES.has(target.targetType)) return true;
  const clientId = target.clientId || (target.targetType === "client" ? target.targetId : "");
  if (scope.clientFilterMode === "blank") return target.targetType !== "client" && !clientId;
  if (scope.clientFilterMode !== "ids") return true;
  return Boolean(
    (clientId && new Set(scope.clientIds || []).has(clientId)) ||
    (target.projectId && new Set(scope.clientProjectIds || []).has(target.projectId)),
  );
}

/** @param {LinkTarget} target */
function legacySummary(target) {
  return {
    label: target.label,
    display_label: target.displayLabel,
    secondary_label: target.secondaryLabel,
    sort_key: target.sortKey,
    subtitle: target.subtitle,
    source_url: target.sourceUrl,
    client_id: target.clientId,
    client_name: target.clientName,
    list_id: target.listId,
    project_id: target.projectId,
    project_name: target.projectName,
    task_id: target.taskId,
    user_id: target.userId,
    title: target.title,
    full_label: target.fullLabel,
    aria_label: target.ariaLabel,
    workspace_id: target.workspaceId,
    workspace_name: target.workspaceName,
    status: target.status,
    is_available: target.isAvailable,
    ...(target.unavailable ? { unavailable: true } : {}),
  };
}

/** @param {LinkTargetType} targetType @param {string} targetId */
function unavailableSummary(targetType, targetId) {
  return legacySummary(safeUnavailableLinkTarget(targetType, targetId));
}

const linkTargetDirectory = Object.freeze({
  externalTargetTypes: EXTERNAL_TARGET_TYPES,
  readContext,
  list,
  readSummary,
  canAccess,
  canAccessSaved,
  createAccessCache,
});

export { linkTargetDirectory };
