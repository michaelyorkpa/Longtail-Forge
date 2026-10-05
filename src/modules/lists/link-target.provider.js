import { listsRepository } from "./lists.repo.js";
import { LIST_PERMISSIONS, listResource } from "./access-policy.js";
import { permissionsService } from "../../core/permissions.js";
import {
  readableTargetLabel,
  sortText,
  targetSourceUrl,
  textValue,
} from "../../core/linked-context/link-target-shape.js";

/** @typedef {import("../../types/link-target-directory-contracts.js").LinkTargetSession} WorkspaceRequestSession */
/** @typedef {import("../../types/link-target-directory-contracts.js").LinkTargetAccessState} LinkTargetAccessState */
/** @typedef {import("../../types/link-target-directory-contracts.js").LinkTargetCandidate} LinkTargetCandidate */
/** @typedef {import("../../types/link-target-directory-contracts.js").LinkTargetDirectoryContext} LinkTargetDirectoryContext */
/** @typedef {import("../../types/link-target-directory-contracts.js").LinkTargetProviderOptions} LinkTargetProviderOptions */
/** @typedef {import("../../types/link-target-directory-contracts.js").LinkTargetType} LinkTargetType */

/** @typedef {{ list_id?: string; title?: string; label?: string; list_type?: string; listType?: string; status?: string; deleted_at?: string|null; client_id?: string; clientId?: string; project_id?: string; projectId?: string; is_reusable?: boolean; metadata_json?: object|null }} ListTargetRow */

const LIST_TARGET_TITLE_MAX_LENGTH = 20;
const LIST_TARGET_TYPE_LABELS = Object.freeze({
  bill_of_materials: "Bill of Materials",
  checklist: "Checklist",
  packing: "Packing",
  parts: "Parts",
  procurement: "Procurement",
  shopping: "Shopping",
  supplies: "Supplies",
});
/** @type {readonly LinkTargetType[]} */
const targetTypes = Object.freeze(["list"]);

/** @param {WorkspaceRequestSession} session @param {LinkTargetType} targetType @param {LinkTargetProviderOptions} options */
async function list(session, targetType, options) {
  if (targetType !== "list") return [];
  const records = /** @type {ListTargetRow[]} */ (await listsRepository.list(session.workspace_id, {}));
  const readable = [];
  for (const record of records) {
    if (record.list_id && await canReadList(session, record)) readable.push(listCandidate(record, options.context, true));
  }
  return readable;
}

/** @param {WorkspaceRequestSession} session @param {LinkTargetType} targetType @param {string} targetId @param {LinkTargetProviderOptions} options */
async function read(session, targetType, targetId, options) {
  if (targetType !== "list") return null;
  const record = /** @type {ListTargetRow | null} */ (await listsRepository.readById(session.workspace_id, targetId));
  return record?.list_id && await canReadList(session, record) ? listCandidate(record, options.context, false) : null;
}

/** @param {WorkspaceRequestSession} session @param {LinkTargetType} targetType @param {readonly string[]} targetIds */
async function readAccess(session, targetType, targetIds) {
  /** @type {Map<string, LinkTargetAccessState>} */
  const states = new Map(targetIds.map((targetId) => [targetId, "unavailable"]));
  if (targetType !== "list" || targetIds.length === 0) return states;
  const records = /** @type {ListTargetRow[]} */ (await listsRepository.readByIds(session.workspace_id, [...targetIds]));
  for (const record of records) {
    if (!record.list_id || record.status === "deleted" || record.deleted_at) continue;
    states.set(record.list_id, (await canReadList(session, record)) ? "readable" : "forbidden");
  }
  return states;
}

/** @param {ListTargetRow} record @param {LinkTargetDirectoryContext} context @param {boolean} picker */
function listCandidate(record, context, picker) {
  const listId = textValue(record.list_id);
  const title = readableTargetLabel(record.title || record.label, "list");
  const contextLabel = recordContextLabel(record, context);
  const secondaryLabel = contextLabel || listTypeLabel(record);
  return {
    moduleId: "lists",
    targetType: /** @type {const} */ ("list"),
    targetId: listId,
    label: title,
    displayLabel: picker ? (contextLabel ? `${truncateTitle(title)} - ${contextLabel}` : truncateTitle(title)) : title,
    secondaryLabel,
    sortKey: [sortText(contextLabel), sortText(listTypeLabel(record)), sortText(title), sortText(listId)].join("|"),
    subtitle: secondaryLabel,
    sourceUrl: targetSourceUrl("list", listId),
    clientId: textValue(record.client_id || record.clientId),
    clientName: recordClientName(record, context),
    projectId: textValue(record.project_id || record.projectId),
    projectName: recordProjectName(record, context),
    listId,
    title,
    fullLabel: title,
    ariaLabel: secondaryLabel ? `${title} - ${secondaryLabel}` : title,
    workspaceId: context.workspaceId,
    workspaceName: context.workspaceName,
  };
}

/** @param {WorkspaceRequestSession} session @param {ListTargetRow} record */
async function canReadList(session, record) {
  if (record.status === "deleted" || record.deleted_at) return false;
  return permissionsService.can(session, LIST_PERMISSIONS.VIEW_ALL, listResource(record)) ||
    permissionsService.can(session, LIST_PERMISSIONS.VIEW, listResource(record));
}

/** @param {ListTargetRow} record @param {LinkTargetDirectoryContext} context */
function recordContextLabel(record, context) {
  const projectName = recordProjectName(record, context);
  if (projectName) return context.isBusinessWorkspace ? `${recordBusinessContextName(record, context)} | ${projectName}` : projectName;
  return context.isBusinessWorkspace ? recordBusinessContextName(record, context) : "";
}

/** @param {ListTargetRow} record @param {LinkTargetDirectoryContext} context */
function recordBusinessContextName(record, context) {
  const clientId = textValue(record.client_id || record.clientId);
  return clientId ? recordClientName(record, context) : context.workspaceName;
}

/** @param {ListTargetRow} record @param {LinkTargetDirectoryContext} context */
function recordClientName(record, context) {
  return context.clientsById.get(textValue(record.client_id || record.clientId))?.label || "";
}

/** @param {ListTargetRow} record @param {LinkTargetDirectoryContext} context */
function recordProjectName(record, context) {
  return context.projectsById.get(textValue(record.project_id || record.projectId))?.label || "";
}

/** @param {ListTargetRow} record */
function listTypeLabel(record) {
  const listType = textValue(record.list_type || record.listType);
  return /** @type {Readonly<Record<string, string>>} */ (LIST_TARGET_TYPE_LABELS)[listType] || formatLabelToken(listType);
}

/** @param {string} value */
function formatLabelToken(value) {
  return value.split(/[_-]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

/** @param {string} title */
function truncateTitle(title) {
  return title.length <= LIST_TARGET_TITLE_MAX_LENGTH ? title : `${title.slice(0, LIST_TARGET_TITLE_MAX_LENGTH - 3).trimEnd()}...`;
}

const listsLinkTargetProvider = Object.freeze({ targetTypes, list, read, readAccess });

export { listsLinkTargetProvider };
