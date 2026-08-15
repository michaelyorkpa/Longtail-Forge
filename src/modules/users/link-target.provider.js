// @ts-check
import { usersRepository } from "../../repositories/users.repo.js";
import { permissionsService } from "../../core/permissions.js";
import { readableTargetLabel } from "../../core/linked-context/link-target-shape.js";

/** @typedef {import("../../types/link-target-directory-contracts.js").LinkTargetSession} WorkspaceRequestSession */
/** @typedef {import("../../types/link-target-directory-contracts.js").LinkTargetAccessState} LinkTargetAccessState */
/** @typedef {import("../../types/link-target-directory-contracts.js").LinkTargetCandidate} LinkTargetCandidate */
/** @typedef {import("../../types/link-target-directory-contracts.js").LinkTargetProviderOptions} LinkTargetProviderOptions */
/** @typedef {import("../../types/link-target-directory-contracts.js").LinkTargetType} LinkTargetType */

/** @typedef {{ user_id: string; display_name?: string|null; displayName?: string|null; username?: string }} UserTargetRow */
/** @type {readonly LinkTargetType[]} */
const targetTypes = Object.freeze(["user"]);

/** @param {WorkspaceRequestSession} session @param {LinkTargetType} targetType @param {LinkTargetProviderOptions} _options */
async function list(session, targetType, _options) {
  if (targetType !== "user") return [];
  const canManage = await canManageUsers(session);
  /** @type {UserTargetRow[]} */
  const users = await usersRepository.readAll(session.workspace_id);
  return users.filter((user) => canManage || user.user_id === session.user_id).map(userCandidate);
}

/** @param {WorkspaceRequestSession} session @param {LinkTargetType} targetType @param {string} targetId @param {LinkTargetProviderOptions} _options */
async function read(session, targetType, targetId, _options) {
  if (targetType !== "user") return null;
  /** @type {UserTargetRow | null} */
  const user = await usersRepository.readById(session.workspace_id, targetId);
  return user && (targetId === session.user_id || await canManageUsers(session)) ? userCandidate(user) : null;
}

/** @param {WorkspaceRequestSession} session @param {LinkTargetType} targetType @param {readonly string[]} targetIds */
async function readAccess(session, targetType, targetIds) {
  /** @type {Map<string, LinkTargetAccessState>} */
  const states = new Map(targetIds.map((targetId) => [targetId, "unavailable"]));
  if (targetType !== "user" || targetIds.length === 0) return states;
  const canManage = await canManageUsers(session);
  for (const targetId of targetIds) {
    /** @type {UserTargetRow | null} */
    const user = await usersRepository.readById(session.workspace_id, targetId);
    if (user) states.set(targetId, canManage || targetId === session.user_id ? "readable" : "forbidden");
  }
  return states;
}

/** @param {UserTargetRow} user @returns {LinkTargetCandidate} */
function userCandidate(user) {
  return {
    moduleId: "users",
    targetType: "user",
    targetId: user.user_id,
    label: readableTargetLabel(user.display_name || user.displayName || user.username, "user"),
    subtitle: user.username || "User",
    sourceUrl: "settings.html",
    userId: user.user_id,
    suggestedLibraryBucket: "ongoing_area",
  };
}

/** @param {WorkspaceRequestSession} session */
function canManageUsers(session) {
  return permissionsService.can(session, "users.manage", { workspace_id: session.workspace_id, operation: "read" });
}

const usersLinkTargetProvider = Object.freeze({ targetTypes, list, read, readAccess });

export { usersLinkTargetProvider };
