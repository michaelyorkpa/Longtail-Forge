import { registerSearchIndexer } from "../../core/search/indexer-registry.js";
import { readSearchTagsText } from "../../core/search/tag-text.js";
import { listsRepository } from "./lists.repo.js";

const LISTS_SEARCH_INDEXER_ID = "lists.records";

function registerListsSearchIndexers() {
  return registerSearchIndexer(LISTS_SEARCH_INDEXER_ID, indexListRecord);
}

async function indexListRecord({ workspaceId, recordId }) {
  if (!recordId) {
    const lists = await listsRepository.list(workspaceId, { includeDeleted: false });
    const documents = [];

    for (const list of lists) {
      documents.push(await listToSearchDocument(list));
    }

    return { documents };
  }

  const list = await listsRepository.readById(workspaceId, recordId);

  if (!list || list.status === "deleted") {
    return null;
  }

  return listToSearchDocument(list);
}

async function listToSearchDocument(list = {}) {
  const [items, links, tagsText] = await Promise.all([
    listsRepository.listItems(list.workspace_id, list.list_id),
    listsRepository.listLinks(list.workspace_id, list.list_id),
    readSearchTagsText({
      workspaceId: list.workspace_id,
      targetType: "list",
      targetId: list.list_id,
    }),
  ]);
  const itemText = items
    .map((item) => [
      item.item_name,
      item.unit,
      item.vendor_name,
      item.notes,
      item.purchase_status,
    ].filter(Boolean).join(" "))
    .filter(Boolean)
    .join("\n");
  const linkedContext = links
    .map((link) => [link.module_id, link.target_type, link.target_id, link.link_role].filter(Boolean).join(" "))
    .filter(Boolean)
    .join("\n");

  return {
    workspace_id: list.workspace_id,
    list_id: list.list_id,
    title: list.title,
    summary: list.description || list.list_type || "",
    body: [
      list.description,
      list.list_type,
      list.status,
      list.is_reusable ? "reusable list template" : "",
      itemText,
      linkedContext,
    ].filter(Boolean).join("\n"),
    tags_text: tagsText,
    client_id: list.client_id,
    project_id: list.project_id,
    search_status: list.status,
    source: "Lists",
    record_created_at: list.created_at,
    record_updated_at: list.updated_at,
  };
}

export {
  LISTS_SEARCH_INDEXER_ID,
  indexListRecord,
  listToSearchDocument,
  registerListsSearchIndexers,
};
