(function () {
  const namespace = window.LongtailForge || {};

  function normalizeKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function matchesClient(entry, client) {
    if (client?.isWorkspaceScope) {
      return !normalizeKey(entry?.clientId) && !normalizeKey(entry?.clientName);
    }

    return normalizeKey(entry?.clientId) === normalizeKey(client?.id) ||
      normalizeKey(entry?.clientName) === normalizeKey(client?.name);
  }

  function matchesProject(entry, project) {
    return normalizeKey(entry?.projectId) === normalizeKey(project?.id) ||
      normalizeKey(entry?.projectName) === normalizeKey(project?.name);
  }

  function getProjectMatchKey(project) {
    return normalizeKey(project?.id) || normalizeKey(project?.name);
  }

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
