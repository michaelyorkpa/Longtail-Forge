// @ts-check

/** @typedef {import("../../../src/types/browser-contracts.js").BrowserRecord} SharedRecord */

(function () {
  const namespace = window.LongtailForge || {};

  /** @param {unknown} value */
  function normalizeKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  /**
   * @param {SharedRecord | null | undefined} entry
   * @param {SharedRecord | null | undefined} client
   */
  function matchesClient(entry, client) {
    if (client?.isWorkspaceScope) {
      return !normalizeKey(entry?.clientId) && !normalizeKey(entry?.clientName);
    }

    return normalizeKey(entry?.clientId) === normalizeKey(client?.id) ||
      normalizeKey(entry?.clientName) === normalizeKey(client?.name);
  }

  /**
   * @param {SharedRecord | null | undefined} entry
   * @param {SharedRecord | null | undefined} project
   */
  function matchesProject(entry, project) {
    return normalizeKey(entry?.projectId) === normalizeKey(project?.id) ||
      normalizeKey(entry?.projectName) === normalizeKey(project?.name);
  }

  /** @param {SharedRecord | null | undefined} project */
  function getProjectMatchKey(project) {
    return normalizeKey(project?.id) || normalizeKey(project?.name);
  }

  /**
   * @template {SharedRecord} Item
   * @param {Item[]} items
   * @returns {Item[]}
   */
  function sortByName(items) {
    return [...items].sort((firstItem, secondItem) =>
      String(firstItem.name || "").localeCompare(String(secondItem.name || ""), undefined, {
        sensitivity: "base",
      }),
    );
  }

  namespace.records = {
    getProjectMatchKey,
    matchesClient,
    matchesProject,
    normalizeKey,
    sortByName,
  };
  window.LongtailForge = namespace;
}());
