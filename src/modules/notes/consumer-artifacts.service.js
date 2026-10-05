import { notificationsService } from "../../services/notifications.service.js";
import { workResumeStateService } from "../../services/work-resume-state.service.js";

/** @typedef {import("../../types/notes-domain-contracts.js").NotesDomainSupportService} NotesDomainSupportService */

/** @param {string} workspaceId @param {string | string[]} [noteIds] @returns {Promise<void>} */
async function removeExcludedConsumerArtifacts(workspaceId, noteIds = []) {
  const ids = [...new Set((Array.isArray(noteIds) ? noteIds : [noteIds])
    .map((noteId) => String(noteId || "").trim())
    .filter(Boolean))];
  if (ids.length === 0) {
    return;
  }

  await notificationsService.removeTargetArtifacts(workspaceId, "notes", "note", ids);
  for (const noteId of ids) {
    await workResumeStateService.removeResumeStateForRecord(workspaceId, "notes", "note", noteId);
  }
}

/** @type {NotesDomainSupportService} */
export const noteConsumerArtifactsService = {
  removeExcludedConsumerArtifacts,
};
