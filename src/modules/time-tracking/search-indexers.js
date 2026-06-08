import { registerSearchIndexer } from "../../core/search/indexer-registry.js";
import { readSearchTagsText } from "../../core/search/tag-text.js";
import { timeEntriesRepository } from "./time-entries.repo.js";

const TIME_ENTRIES_SEARCH_INDEXER_ID = "time-tracking.time-entries";

function registerTimeTrackingSearchIndexers() {
  return registerSearchIndexer(TIME_ENTRIES_SEARCH_INDEXER_ID, indexTimeEntryRecord);
}

async function indexTimeEntryRecord({ workspaceId, recordId }) {
  if (!recordId) {
    const entries = await timeEntriesRepository.readAll(workspaceId);
    const documents = [];

    for (const entry of entries) {
      documents.push(await timeEntryToSearchDocument(entry));
    }

    return { documents };
  }

  const entry = await timeEntriesRepository.readById(workspaceId, recordId);

  if (!entry) {
    return null;
  }

  return timeEntryToSearchDocument(entry);
}

async function timeEntryToSearchDocument(entry) {
  const tagsText = await readSearchTagsText({
    workspaceId: entry.workspace_id,
    targetType: "time_entry",
    targetId: entry.entry_id,
  });
  const title = entry.description || entry.project_name || "Time Entry";
  const summary = [
    entry.project_name,
    entry.client_name,
    entry.duration_hours ? `${entry.duration_hours} hours` : "",
    entry.invoice_status,
  ].filter(Boolean).join(" - ");
  const body = [
    entry.description,
    entry.client_name,
    entry.project_name,
    entry.user_id,
    entry.task_id,
    entry.start_time,
    entry.end_time,
  ].filter(Boolean).join("\n");

  return {
    workspace_id: entry.workspace_id,
    entry_id: entry.entry_id,
    search_title: title,
    description: summary,
    body,
    tags_text: tagsText,
    client_id: entry.client_id,
    project_id: entry.project_id,
    search_status: "active",
    record_created_at: entry.created_at,
    record_updated_at: entry.updated_at,
  };
}

export {
  TIME_ENTRIES_SEARCH_INDEXER_ID,
  indexTimeEntryRecord,
  registerTimeTrackingSearchIndexers,
};
