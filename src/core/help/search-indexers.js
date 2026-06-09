import { registerSearchIndexer } from "../search/indexer-registry.js";
import { helpService, HELP_SEARCH_INDEXER_ID } from "../../services/help.service.js";

function registerFrameworkHelpSearchIndexers() {
  return registerSearchIndexer(HELP_SEARCH_INDEXER_ID, indexHelpArticle);
}

async function indexHelpArticle({ workspaceId, recordId, declaration }) {
  const documents = await helpService.listSearchIndexDocuments(workspaceId, {
    moduleId: declaration?.moduleId,
    recordId,
  });

  if (recordId) {
    return documents[0] || null;
  }

  return { documents };
}

export {
  indexHelpArticle,
  registerFrameworkHelpSearchIndexers,
};
